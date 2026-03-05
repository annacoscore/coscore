/**
 * fix-missing-images.js
 * Busca imagens oficiais do ML para todos os produtos que têm mlId mas não têm imagem.
 * Também enriquece cores para produtos em categorias de cor com poucas variações.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const DELAY_MS     = 100;
const MAX_COLORS   = 20;
const SAVE_EVERY   = 150;

let TOKEN = '';

const COLOR_CATS = new Set([
  'Batom','Base','Sombra','Blush','Iluminador','Corretivo',
  'Contorno/Bronzer','Gloss','Lápis Labial','Pó Facial','Delineador',
  'Primer','Máscara de Cílios','Fixador de Maquiagem',
]);

const JUNK_COLORS = new Set([
  'único','única','unico','unica','outro','outros','multicolor','multicor',
  'não se aplica','nao se aplica','','transparente','cor única','neutra','sem cor',
]);

function normalizeColor(raw) {
  if (!raw) return '';
  const c = raw.trim().toLowerCase();
  if (JUNK_COLORS.has(c) || c.length < 2) return '';
  return raw.trim().replace(/\b\w/g, l => l.toUpperCase());
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url) {
  return new Promise(resolve => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${TOKEN}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.setTimeout(12000, () => { req.destroy(); resolve({}); });
    req.on('error', () => resolve({}));
  });
}

async function getToken() {
  return new Promise(resolve => {
    const body = Buffer.from(
      'grant_type=client_credentials&client_id=1664631224999083&client_secret=Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG'
    );
    const req = https.request('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', () => resolve({}));
    req.write(body); req.end();
  });
}

async function fetchProductData(mlId) {
  // Buscar via /products/{id} (catálogo oficial)
  const prod = await get(`https://api.mercadolibre.com/products/${mlId}`);
  await sleep(60);
  return prod.error ? null : prod;
}

async function fetchItemData(mlId) {
  // Buscar via /items/{id} (item de vendedor)
  const item = await get(`https://api.mercadolibre.com/items/${mlId}?include_attributes=all`);
  await sleep(60);
  return item.error ? null : item;
}

async function getColorsForProduct(mlId, existingColors) {
  const colorMap = new Map();
  // Inicializar com cores existentes
  for (const c of (existingColors || [])) {
    if (c.name) colorMap.set(c.name.toLowerCase(), c);
  }

  // Estratégia 1: produto catálogo
  try {
    const prod = await get(`https://api.mercadolibre.com/products/${mlId}`);
    await sleep(70);
    if (!prod.error) {
      const cAttr = (prod.attributes || []).find(a => a.id === 'COLOR');
      const color = normalizeColor(cAttr?.value_name || '');
      const pics  = (prod.pictures || []);
      const img   = (pics[0]?.url || pics[0]?.secure_url || '').replace('http://', 'https://');
      if (color && img && !colorMap.has(color.toLowerCase())) {
        colorMap.set(color.toLowerCase(), { name: color, image: img });
      }
    }
  } catch { /* skip */ }

  // Estratégia 2: busca por catalog_product_id
  if (colorMap.size < MAX_COLORS) {
    try {
      const search = await get(
        `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${mlId}&limit=20`
      );
      await sleep(DELAY_MS);
      for (const item of (search.results || []).slice(0, 10)) {
        if (colorMap.size >= MAX_COLORS) break;
        try {
          const detail = await get(
            `https://api.mercadolibre.com/items/${item.id}?include_attributes=all`
          );
          await sleep(65);
          if (detail.error) continue;
          const cAttr = (detail.attributes || []).find(a => a.id === 'COLOR');
          const color = normalizeColor(cAttr?.value_name || '');
          const img   = (detail.pictures || [])[0]?.url || detail.thumbnail || '';
          if (color && img && !colorMap.has(color.toLowerCase())) {
            colorMap.set(color.toLowerCase(), { name: color, image: img.replace('http://', 'https://') });
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return Array.from(colorMap.values());
}

async function main() {
  console.log('=== Fix Missing Images & Colors ===\n');

  // Renovar token
  console.log('Obtendo token ML...');
  const tokenResp = await getToken();
  if (!tokenResp.access_token) { console.error('Falha no token.'); process.exit(1); }
  TOKEN = tokenResp.access_token;
  console.log('Token OK.\n');

  const catalog  = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products || catalog;
  console.log(`Total produtos: ${products.length}`);

  // Candidatos: sem imagem OU em categoria de cor com < 2 cores
  const candidates = products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => {
      if (!p.mlId) return false;
      const noImg    = !p.image;
      const needsColors = COLOR_CATS.has(p.category) && (!p.colors || p.colors.length < 2);
      return noImg || needsColors;
    });

  console.log(`Candidatos: ${candidates.length}`);
  console.log(`  - Sem imagem: ${candidates.filter(({p}) => !p.image).length}`);
  console.log(`  - Precisam cores: ${candidates.filter(({p}) => COLOR_CATS.has(p.category) && (!p.colors||p.colors.length<2)).length}\n`);

  let imgFixed   = 0;
  let colorFixed = 0;
  let processed  = 0;
  let tokenAge   = Date.now();

  for (const { p, i } of candidates) {
    processed++;

    // Renovar token a cada 5h (18000s)
    if (Date.now() - tokenAge > 18000000) {
      const newTok = await getToken();
      if (newTok.access_token) { TOKEN = newTok.access_token; tokenAge = Date.now(); }
    }

    if (processed % 100 === 0) {
      process.stdout.write(
        `\r  [${processed}/${candidates.length}] img+${imgFixed} cor+${colorFixed}   `
      );
    }

    const needsImage  = !p.image;
    const needsColors = COLOR_CATS.has(p.category) && (!p.colors || p.colors.length < 2);

    try {
      // Primeiro tentar /products (catálogo oficial — tem imagem de alta qualidade)
      const mlProd = await fetchProductData(p.mlId);

      if (mlProd) {
        // Imagem oficial do catálogo
        const pics = (mlProd.pictures || [])
          .map(pic => (pic.url || pic.secure_url || '').replace('http://', 'https://'))
          .filter(Boolean);

        if (needsImage && pics.length > 0) {
          products[i].image  = pics[0];
          products[i].images = pics.slice(0, 6);
          imgFixed++;
        } else if (!needsImage && pics.length > 0 && (!p.images || p.images.length === 0)) {
          // Já tem imagem mas não tem array de imagens
          products[i].images = pics.slice(0, 6);
        }
      } else if (needsImage) {
        // Fallback: tentar como item de vendedor
        const mlItem = await fetchItemData(p.mlId);
        if (mlItem) {
          const pics = (mlItem.pictures || [])
            .map(pic => (pic.url || pic.secure_url || '').replace('http://', 'https://'))
            .filter(Boolean);
          if (pics.length > 0) {
            products[i].image  = pics[0];
            products[i].images = pics.slice(0, 6);
            imgFixed++;
          }
        }
      }

      // Cores
      if (needsColors) {
        const colors = await getColorsForProduct(p.mlId, p.colors || []);
        if (colors.length > (p.colors?.length || 0)) {
          products[i].colors = colors.slice(0, MAX_COLORS);
          colorFixed++;
        }
      }

    } catch { /* skip produto com erro */ }

    // Salvar checkpoint
    if (processed % SAVE_EVERY === 0) {
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(
        { products, lastSync: new Date().toISOString() }, null, 2
      ), 'utf8');
    }
  }

  process.stdout.write('\n');

  // Salvar final
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(
    { products, totalProducts: products.length, lastSync: new Date().toISOString() }, null, 2
  ), 'utf8');

  console.log('\n=== Resultado ===');
  console.log(`Imagens corrigidas: ${imgFixed}`);
  console.log(`Produtos com cores enriquecidas: ${colorFixed}`);
  console.log(`Com imagem agora: ${products.filter(p => p.image).length} / ${products.length}`);
  console.log(`Com cores agora:  ${products.filter(p => p.colors?.length > 0).length} / ${products.length}`);
  console.log('\n⚡ Próximo: node scripts/export-catalog.js');
}

main().catch(err => { console.error('ERRO:', err); process.exit(1); });
