/**
 * enrich-colors-deep.js
 * Busca variações de cor no ML de forma aprofundada para todos os produtos
 * em categorias de cor que ainda têm poucas variações.
 *
 * Estratégias por produto:
 *  1. /products/search?q=nome+marca&status=active → pegar todos resultados como variações
 *  2. /products/search?catalog_product_id=mlId&status=active → buscar irmãos do catálogo
 *  3. Busca por nome do produto procurando produtos com nomes similares como variações
 *
 * Uso: node scripts/enrich-colors-deep.js
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const DELAY_MS     = 110;
const MAX_COLORS   = 25;
const SAVE_EVERY   = 150;
const MIN_COLORS   = 3; // Processar produtos com menos que esse número de variações

let TOKEN      = '';
let tokenBirth = 0;

const COLOR_CATS = new Set([
  'Batom','Base','Sombra','Blush','Iluminador','Corretivo',
  'Contorno/Bronzer','Gloss','Lápis Labial','Pó Facial','Delineador',
  'Primer','Máscara de Cílios',
]);

const JUNK_COLORS = new Set([
  'único','única','unico','unica','outro','outros','multicolor','multicor',
  'não se aplica','nao se aplica','','transparente','neutra','sem cor','outro','n/a',
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

async function refreshToken() {
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

async function ensureToken() {
  if (!TOKEN || Date.now() - tokenBirth > 18000000) {
    const resp = await refreshToken();
    if (resp.access_token) { TOKEN = resp.access_token; tokenBirth = Date.now(); }
  }
}

// Extrair cor de um resultado de busca ML
function extractColorFromResult(result) {
  const attrs = result.attributes || [];
  const cAttr = attrs.find(a => a.id === 'COLOR');
  return normalizeColor(cAttr?.value_name || '');
}

function extractImageFromResult(result) {
  const pics = result.pictures || [];
  return (pics[0]?.url || pics[0]?.secure_url || '').replace('http://', 'https://');
}

// Estratégia 1: buscar variações por catalog_product_id
async function getColorsByCatalogId(mlId) {
  const colorMap = new Map();

  const search = await get(
    `https://api.mercadolibre.com/products/search?site_id=MLB&catalog_product_id=${mlId}&status=active&limit=20`
  );
  await sleep(80);
  for (const res of (search.results || [])) {
    if (colorMap.size >= MAX_COLORS) break;
    const color = extractColorFromResult(res);
    const img   = extractImageFromResult(res);
    if (color && img && !colorMap.has(color.toLowerCase())) {
      colorMap.set(color.toLowerCase(), { name: color, image: img });
    }
  }
  return colorMap;
}

// Estratégia 2: buscar variações por nome do produto (para encontrar irmãos)
async function getColorsByNameSearch(productName, brand, category) {
  const colorMap = new Map();

  // Construir query: nome principal + marca, sem tons específicos
  const nameWords = productName.split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4)
    .join(' ');
  const query = brand ? `${brand} ${nameWords}` : nameWords;

  const search = await get(
    `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(query)}&status=active&limit=20`
  );
  await sleep(80);

  for (const res of (search.results || [])) {
    if (colorMap.size >= MAX_COLORS) break;
    const color = extractColorFromResult(res);
    const img   = extractImageFromResult(res);
    if (color && img && !colorMap.has(color.toLowerCase())) {
      colorMap.set(color.toLowerCase(), { name: color, image: img });
    }
  }
  return colorMap;
}

// Estratégia 3: buscar produto no ML e pegar todas as variações que aparecem
async function getColorsFromMLProduct(mlId) {
  const colorMap = new Map();

  // Buscar produto catálogo
  const prod = await get(`https://api.mercadolibre.com/products/${mlId}`);
  await sleep(70);
  if (!prod.error) {
    const cAttr = (prod.attributes || []).find(a => a.id === 'COLOR');
    const color  = normalizeColor(cAttr?.value_name || '');
    const pics   = (prod.pictures || []);
    const img    = (pics[0]?.url || pics[0]?.secure_url || '').replace('http://', 'https://');
    if (color && img) colorMap.set(color.toLowerCase(), { name: color, image: img });

    // Children (variações do catálogo)
    for (const childId of (prod.children_ids || []).slice(0, 10)) {
      if (colorMap.size >= MAX_COLORS) break;
      try {
        const child = await get(`https://api.mercadolibre.com/products/${childId}`);
        await sleep(60);
        if (!child.error) {
          const cc = normalizeColor(((child.attributes||[]).find(a=>a.id==='COLOR'))?.value_name||'');
          const ci = (child.pictures||[])[0];
          const cImg = (ci?.url||ci?.secure_url||'').replace('http://','https://');
          if (cc && cImg && !colorMap.has(cc.toLowerCase())) {
            colorMap.set(cc.toLowerCase(), { name: cc, image: cImg });
          }
        }
      } catch { /* skip */ }
    }
  }
  return colorMap;
}

// Mesclar dois Maps de cor, preservando o maior
function mergeColorMaps(...maps) {
  const result = new Map();
  for (const m of maps) {
    for (const [k, v] of m) {
      if (!result.has(k)) result.set(k, v);
    }
    if (result.size >= MAX_COLORS) break;
  }
  return result;
}

async function main() {
  console.log('=== Enrich Colors Deep — CoScore ===\n');
  await ensureToken();
  console.log(`Token ML OK.\n`);

  const catalog  = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products || catalog;
  console.log(`Total produtos: ${products.length}`);

  // Candidatos: em categoria de cor, com menos de MIN_COLORS variações
  const candidates = products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => COLOR_CATS.has(p.category) && (!p.colors || p.colors.length < MIN_COLORS));

  console.log(`Candidatos com < ${MIN_COLORS} variações de cor: ${candidates.length}\n`);

  let enriched  = 0;
  let processed = 0;

  for (const { p, i } of candidates) {
    processed++;
    if (processed % 50 === 0) {
      await ensureToken();
      process.stdout.write(`\r  [${processed}/${candidates.length}] enriquecidos: ${enriched}   `);
    }

    // Inicializar mapa com cores existentes
    const existingMap = new Map(
      (p.colors || []).map(c => [c.name.toLowerCase(), c])
    );

    try {
      // Estratégia 1: por catalog_product_id (se tiver mlId)
      let colorMap = new Map(existingMap);
      if (p.mlId) {
        const m1 = await getColorsByCatalogId(p.mlId);
        colorMap = mergeColorMaps(colorMap, m1);

        // Estratégia 3: produto direto do catálogo (para pegar children)
        if (colorMap.size < MIN_COLORS) {
          const m3 = await getColorsFromMLProduct(p.mlId);
          colorMap = mergeColorMaps(colorMap, m3);
        }
      }

      // Estratégia 2: busca por nome (sempre tentar se ainda poucas cores)
      if (colorMap.size < MIN_COLORS) {
        const m2 = await getColorsByNameSearch(p.name, p.brand, p.category);
        colorMap = mergeColorMaps(colorMap, m2);
      }

      // Aplicar se encontrou mais cores que antes
      if (colorMap.size > existingMap.size) {
        products[i].colors = Array.from(colorMap.values()).slice(0, MAX_COLORS);
        enriched++;

        // Garantir que o produto tem imagem (pegar do primeiro tom se não tiver)
        if (!products[i].image && products[i].colors[0]?.image) {
          products[i].image = products[i].colors[0].image;
        }
      }
    } catch { /* skip */ }

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

  const finalWithColors = products.filter(p => p.colors?.length > 0).length;
  const rich = products.filter(p => p.colors?.length >= 3).length;

  console.log('\n=== Resultado ===');
  console.log(`Produtos enriquecidos: ${enriched}`);
  console.log(`Com ao menos 1 cor: ${finalWithColors} / ${products.length}`);
  console.log(`Com 3+ cores: ${rich} / ${products.length}`);
  console.log('\n⚡ Próximo: node scripts/export-catalog.js');
}

main().catch(err => { console.error('ERRO:', err); process.exit(1); });
