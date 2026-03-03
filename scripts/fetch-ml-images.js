/**
 * fetch-ml-images.js
 * Busca as imagens reais do Mercado Livre para cada produto do catálogo
 * que possui mlId, e atualiza os campos image/images.
 *
 * Usa client_credentials (sem login do usuário necessário).
 * Uso: node scripts/fetch-ml-images.js
 * Flags: --all  (atualiza mesmo produtos que já têm imagens)
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const CLIENT_ID     = '1664631224999083';
const CLIENT_SECRET = 'Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
const CATALOG_PATH  = path.join(__dirname, 'output', 'catalog.json');
const SAVE_EVERY    = 100;
const DELAY_MS      = 110;
const UPDATE_ALL    = process.argv.includes('--all');

// ── Token ──────────────────────────────────────────────────────────────────────
async function getAppToken() {
  return new Promise((resolve, reject) => {
    const body = `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`;
    const options = {
      hostname: 'api.mercadolibre.com',
      path:     '/oauth/token',
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const r = JSON.parse(d);
        if (r.access_token) resolve(r.access_token);
        else reject(new Error('Token error: ' + JSON.stringify(r)));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

let TOKEN = '';

function get(url) {
  return new Promise((resolve) => {
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

// Extrai imagens de alta qualidade do produto ML
function extractImages(mlProduct) {
  const pics = (mlProduct.pictures || [])
    .map(p => {
      const url = p.url || p.secure_url || '';
      // Converte para HTTPS e tamanho maior (substituir sufixos de tamanho)
      return url
        .replace('http://', 'https://')
        .replace(/-[A-Z]\.jpg$/, '-O.jpg')  // -O = tamanho original
        .replace(/-[A-Z]\.webp$/, '-O.webp');
    })
    .filter(url => url.includes('mlstatic.com') || url.includes('http'));

  return pics;
}

// Busca imagens de um item marketplace quando o produto catálogo não tem imagens
async function fetchItemImages(mlId) {
  try {
    const items = await get(
      `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${mlId}&limit=5`
    );
    const results = items.results || [];
    for (const item of results) {
      if (item.thumbnail) {
        const thumb = item.thumbnail.replace('http://', 'https://').replace(/-I\.jpg$/, '-O.jpg');
        return [thumb];
      }
    }
  } catch { /* ignora */ }
  return [];
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Fetch ML Images — CoScore ===\n');

  // Obtém token de app
  TOKEN = await getAppToken();
  console.log('Token obtido:', TOKEN.slice(0, 30) + '...\n');

  const catalog  = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products;

  // Produtos a processar: com mlId E (sem imagem OU --all)
  const toProcess = products.filter(p =>
    p.mlId && (UPDATE_ALL || !p.image || p.image === '' || !p.images || p.images.length === 0)
  );

  console.log(`Total produtos: ${products.length}`);
  console.log(`Com mlId: ${products.filter(p => p.mlId).length}`);
  console.log(`Sem imagem (ou --all): ${toProcess.length}`);
  console.log(`Modo: ${UPDATE_ALL ? 'atualizar TODOS' : 'apenas sem imagem'}\n`);

  let updated  = 0;
  let noImages = 0;
  let errors   = 0;

  const idxMap = new Map(products.map((p, i) => [p.id, i]));

  for (let i = 0; i < toProcess.length; i++) {
    const prod    = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;
    process.stdout.write(`${progress} ${prod.category} — ${prod.name.slice(0, 45)}... `);

    try {
      // Busca produto catálogo
      const mlProd = await get(`https://api.mercadolibre.com/products/${prod.mlId}`);
      await sleep(DELAY_MS);

      let images = [];

      if (!mlProd.error && mlProd.pictures?.length > 0) {
        images = extractImages(mlProd);
      }

      // Fallback: busca imagem via itens do marketplace
      if (images.length === 0) {
        images = await fetchItemImages(prod.mlId);
        await sleep(DELAY_MS);
      }

      if (images.length > 0) {
        const idx = idxMap.get(prod.id);
        if (idx !== undefined) {
          products[idx].image  = images[0];
          products[idx].images = images;

          // Também atualiza imagens das cores se a cor não tiver imagem
          if (Array.isArray(products[idx].colors)) {
            products[idx].colors = products[idx].colors.map((c, ci) => ({
              ...c,
              image: c.image || images[ci % images.length] || images[0],
            }));
          }
        }
        updated++;
        console.log(`${images.length} imagens`);
      } else {
        noImages++;
        console.log('sem imagens no ML');
      }
    } catch (err) {
      errors++;
      console.log(`ERRO: ${err.message}`);
    }

    // Salva progresso periodicamente
    if ((i + 1) % SAVE_EVERY === 0) {
      catalog.products = products;
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
      console.log(`\n💾 Salvo (${i + 1}/${toProcess.length})\n`);

      // Renova token a cada 500 produtos (previne expiração)
      if ((i + 1) % 500 === 0) {
        try {
          TOKEN = await getAppToken();
          console.log('🔑 Token renovado\n');
        } catch { /* ignora */ }
      }
    }
  }

  // Salva final
  catalog.products = products;
  catalog.lastImageFetch = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

  console.log('\n=== Resultado ===');
  console.log(`Atualizados com imagens: ${updated}`);
  console.log(`Sem imagens no ML:       ${noImages}`);
  console.log(`Erros:                   ${errors}`);

  // Estatísticas finais
  const semImg = products.filter(p => !p.image || p.image === '').length;
  console.log(`\nTotal sem imagem agora: ${semImg} de ${products.length}`);
  console.log('\n⚡ Próximo passo: node scripts/export-catalog.js');
}

main().catch(err => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
