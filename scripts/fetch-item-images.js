/**
 * fetch-item-images.js
 * Busca imagens via /products/{mlId} + children_ids para todos os produtos MLB sem imagem.
 * Usa client_credentials (não precisa de login do usuário).
 *
 * Uso: node scripts/fetch-item-images.js
 * Flags: --all  (atualiza mesmo produtos que já têm imagens)
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const CLIENT_ID     = '1664631224999083';
const CLIENT_SECRET = 'Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
const CATALOG_PATH  = path.join(__dirname, 'output', 'catalog.json');
const SAVE_EVERY    = 100;
const DELAY_MS      = 120;
const UPDATE_ALL    = process.argv.includes('--all');

// ── Token ─────────────────────────────────────────────────────────────────────
async function getAppToken() {
  return new Promise((resolve, reject) => {
    const body = `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`;
    const req  = https.request(
      {
        hostname: 'api.mercadolibre.com',
        path:     '/oauth/token',
        method:   'POST',
        headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          const r = JSON.parse(d);
          if (r.access_token) resolve(r.access_token);
          else reject(new Error('Token error: ' + JSON.stringify(r)));
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

let TOKEN = '';

function get(url) {
  return new Promise(resolve => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${TOKEN}` } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.setTimeout(12000, () => { req.destroy(); resolve({}); });
    req.on('error', () => resolve({}));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Converte URL para HTTPS e tamanho original
function normalizeUrl(url) {
  return (url || '')
    .replace('http://', 'https://')
    .replace(/-[A-Z]\.jpg$/, '-O.jpg');
}

// Extrai imagens de um produto /products/{id}
function extractPics(prod) {
  if (!prod || prod.error) return [];
  return (prod.pictures || [])
    .map(p => normalizeUrl(p.url || p.secure_url || ''))
    .filter(u => u.includes('mlstatic.com'));
}

/**
 * Estratégia para obter imagens de um produto MLB:
 * 1. /products/{mlId} → pictures
 * 2. Se vazio → /products/{childId} para cada children_id
 */
async function fetchImages(mlId) {
  const prod = await get(`https://api.mercadolibre.com/products/${mlId}`);
  await sleep(DELAY_MS);

  let images = extractPics(prod);

  // Se não tem pictures, tenta nos filhos
  if (images.length === 0 && Array.isArray(prod.children_ids) && prod.children_ids.length > 0) {
    for (const childId of prod.children_ids.slice(0, 4)) {
      const child = await get(`https://api.mercadolibre.com/products/${childId}`);
      await sleep(DELAY_MS);
      images = extractPics(child);
      if (images.length > 0) break;
    }
  }

  return images;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Fetch Item Images — CoScore ===\n');

  TOKEN = await getAppToken();
  console.log('Token obtido:', TOKEN.slice(0, 30) + '...\n');

  const catalog  = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products;

  const toProcess = products.filter(p =>
    p.mlId &&
    (UPDATE_ALL || !p.image || p.image === '' || !p.images || p.images.length === 0)
  );

  console.log(`Total produtos:   ${products.length}`);
  console.log(`Sem imagem:       ${toProcess.length}`);
  console.log(`Modo: ${UPDATE_ALL ? 'atualizar TODOS' : 'apenas sem imagem'}\n`);

  const idxMap = new Map(products.map((p, i) => [p.id, i]));
  let updated  = 0;
  let noImages = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const prod    = toProcess[i];
    const prefix  = `[${i + 1}/${toProcess.length}]`;

    const images = await fetchImages(prod.mlId);

    const idx = idxMap.get(prod.id);
    if (idx !== undefined && images.length > 0) {
      products[idx].image  = images[0];
      products[idx].images = images;

      // Atualiza imagem das variantes que não tenham
      if (Array.isArray(products[idx].colors)) {
        products[idx].colors = products[idx].colors.map((c, ci) => ({
          ...c,
          image: c.image || images[ci % images.length] || images[0],
        }));
      }
      updated++;
      process.stdout.write(`\r${prefix} ✓ ${updated} atualizados | ${noImages} sem imagem  `);
    } else {
      noImages++;
      process.stdout.write(`\r${prefix} - ${updated} atualizados | ${noImages} sem imagem  `);
    }

    // Salva progresso
    if ((i + 1) % SAVE_EVERY === 0) {
      catalog.products = products;
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
      process.stdout.write(` 💾\n`);
    }

    // Renova token a cada 500 produtos
    if ((i + 1) % 500 === 0 && (i + 1) < toProcess.length) {
      try { TOKEN = await getAppToken(); process.stdout.write(`\n🔑 Token renovado\n`); } catch { /* ignora */ }
    }
  }

  // Salva final
  catalog.products       = products;
  catalog.lastImageFetch = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

  const semImg = products.filter(p => !p.image || p.image === '').length;
  console.log(`\n\n=== Resultado ===`);
  console.log(`Atualizados:         ${updated}`);
  console.log(`Sem imagens no ML:   ${noImages}`);
  console.log(`Total sem imagem:    ${semImg} de ${products.length}`);
  console.log('\n⚡ Próximo passo: node scripts/export-catalog.js');
}

main().catch(err => { console.error('ERRO FATAL:', err); process.exit(1); });
