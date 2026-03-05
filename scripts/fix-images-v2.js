/**
 * fix-images-v2.js
 * Busca imagens para produtos sem imagem usando products/search?status=active.
 * Para cada produto sem imagem, busca pelo nome+marca e pega a imagem do produto ativo.
 * Também enriquece variações de cor via catalog_product_id de produtos ativos.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const DELAY_MS     = 120;
const MAX_COLORS   = 20;
const SAVE_EVERY   = 200;

let TOKEN      = '';
let tokenBirth = 0;

const COLOR_CATS = new Set([
  'Batom','Base','Sombra','Blush','Iluminador','Corretivo',
  'Contorno/Bronzer','Gloss','Lápis Labial','Pó Facial','Delineador',
  'Primer','Máscara de Cílios',
]);

const JUNK_COLORS = new Set([
  'único','única','unico','unica','outro','outros','multicolor','multicor',
  'não se aplica','nao se aplica','','transparente','neutra','sem cor',
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

// Limpar nome para busca: remover palavras genéricas, manter marca e produto
function buildSearchQuery(name, brand) {
  // Pegar as primeiras 5-6 palavras significativas
  const words = name.split(/\s+/).filter(w => w.length > 2).slice(0, 5);
  return words.join(' ');
}

// Buscar produto ativo com imagem pelo nome
async function findActiveProductWithImage(name, brand) {
  const query = buildSearchQuery(name, brand);
  const url = `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(query)}&status=active&limit=10`;
  const data = await get(url);
  await sleep(80);

  for (const result of (data.results || [])) {
    const pics = (result.pictures || [])
      .map(p => (p.url || p.secure_url || '').replace('http://', 'https://'))
      .filter(Boolean);
    if (pics.length > 0) {
      return { id: result.id, pics, name: result.name };
    }
  }
  return null;
}

// Buscar cores de um produto ativo via catalog_product_id
async function getColorsFromCatalogId(catalogId) {
  const colorMap = new Map();

  // Detalhes do produto ativo
  const prod = await get(`https://api.mercadolibre.com/products/${catalogId}`);
  await sleep(70);
  if (!prod.error) {
    const cAttr = (prod.attributes || []).find(a => a.id === 'COLOR');
    const color = normalizeColor(cAttr?.value_name || '');
    const pics  = (prod.pictures || []);
    const img   = (pics[0]?.url || pics[0]?.secure_url || '').replace('http://', 'https://');
    if (color && img) colorMap.set(color.toLowerCase(), { name: color, image: img });
  }

  // Buscar variações via catalog_product_id search
  const search = await get(
    `https://api.mercadolibre.com/products/search?site_id=MLB&catalog_product_id=${catalogId}&status=active&limit=20`
  );
  await sleep(DELAY_MS);
  for (const item of (search.results || []).slice(0, 15)) {
    if (colorMap.size >= MAX_COLORS) break;
    const pics = (item.pictures || [])
      .map(p => (p.url || p.secure_url || '').replace('http://', 'https://'))
      .filter(Boolean);
    const cAttr = (item.attributes || []).find(a => a.id === 'COLOR');
    const color = normalizeColor(cAttr?.value_name || '');
    if (color && pics[0] && !colorMap.has(color.toLowerCase())) {
      colorMap.set(color.toLowerCase(), { name: color, image: pics[0] });
    }
  }

  return Array.from(colorMap.values());
}

async function main() {
  console.log('=== Fix Images v2 — CoScore ===\n');
  await ensureToken();
  console.log('Token ML OK.\n');

  const catalog  = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products || catalog;
  console.log(`Total produtos: ${products.length}`);

  // Candidatos sem imagem
  const noImageIdxs = products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.image);

  // Candidatos que precisam de cores
  const needColorIdxs = products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.image && COLOR_CATS.has(p.category) && (!p.colors || p.colors.length < 2) && p.mlId);

  console.log(`Sem imagem: ${noImageIdxs.length}`);
  console.log(`Precisam cores: ${needColorIdxs.length}\n`);

  let imgFixed   = 0;
  let colorFixed = 0;
  let processed  = 0;
  const total = noImageIdxs.length + needColorIdxs.length;

  // ── FASE 1: Corrigir imagens ─────────────────────────────────────────────
  console.log('--- Fase 1: Buscando imagens ---');
  for (const { p, i } of noImageIdxs) {
    processed++;
    if (processed % 100 === 0) {
      await ensureToken();
      process.stdout.write(`\r  [${processed}/${total}] img+${imgFixed} cor+${colorFixed}   `);
    }

    try {
      const found = await findActiveProductWithImage(p.name, p.brand || '');
      if (found) {
        products[i].image  = found.pics[0];
        products[i].images = found.pics.slice(0, 6);
        // Atualizar mlId para o produto ativo (que tem imagens)
        if (found.id && found.id !== p.mlId) {
          products[i].mlId = found.id;
        }
        imgFixed++;

        // Se categoria de cor, buscar cores também
        if (COLOR_CATS.has(p.category) && (!p.colors || p.colors.length < 2)) {
          const colors = await getColorsFromCatalogId(found.id);
          if (colors.length > 0) {
            products[i].colors = colors.slice(0, MAX_COLORS);
            colorFixed++;
          }
        }
      }
    } catch { /* skip */ }

    if (processed % SAVE_EVERY === 0) {
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(
        { products, lastSync: new Date().toISOString() }, null, 2
      ), 'utf8');
    }
  }

  process.stdout.write('\n');
  console.log(`\nFase 1 concluída: ${imgFixed} imagens corrigidas`);

  // ── FASE 2: Enriquecer cores para produtos sem variações ─────────────────
  console.log('\n--- Fase 2: Enriquecendo cores ---');
  for (const { p, i } of needColorIdxs) {
    processed++;
    if (processed % 50 === 0) {
      await ensureToken();
      process.stdout.write(`\r  [${processed}/${total}] img+${imgFixed} cor+${colorFixed}   `);
    }

    try {
      if (!p.mlId) continue;
      const colors = await getColorsFromCatalogId(p.mlId);
      if (colors.length > (p.colors?.length || 0)) {
        products[i].colors = colors.slice(0, MAX_COLORS);
        colorFixed++;
      }
    } catch { /* skip */ }

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

  const finalWithImg   = products.filter(p => p.image).length;
  const finalWithColor = products.filter(p => p.colors?.length > 0).length;

  console.log('\n=== Resultado Final ===');
  console.log(`Imagens corrigidas:    ${imgFixed}`);
  console.log(`Cores enriquecidas:    ${colorFixed}`);
  console.log(`Com imagem agora:      ${finalWithImg} / ${products.length} (${Math.round(finalWithImg/products.length*100)}%)`);
  console.log(`Com cores agora:       ${finalWithColor} / ${products.length} (${Math.round(finalWithColor/products.length*100)}%)`);
  console.log('\n⚡ Próximo: node scripts/export-catalog.js');
}

main().catch(err => { console.error('ERRO:', err); process.exit(1); });
