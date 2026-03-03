/**
 * enrich-all-colors.js
 * Enriquece TODOS os produtos de categorias de cor com todas as
 * variações disponíveis no catálogo do Mercado Livre.
 *
 * Uso: node scripts/enrich-all-colors.js
 * Flags: --force  (processa mesmo produtos já com cores)
 *        --min N  (só processa se tiver menos de N cores, padrão=4)
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const TOKEN        = process.env.ML_ACCESS_TOKEN
                   || 'APP_USR-1664631224999083-030312-f10c634374533b2d59777a1ec2b5e09c-3238361303';
const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const SAVE_EVERY   = 50;    // salva progresso a cada N produtos
const DELAY_MS     = 120;   // pausa entre requests
const MAX_COLORS   = 20;    // máximo de cores por produto
const MIN_COLORS   = parseInt(process.argv.find(a => a.startsWith('--min='))?.split('=')[1] || '4');
const FORCE        = process.argv.includes('--force');

// Categorias que devem ter variações de cor
const COLOR_CATEGORIES = new Set([
  'Batom', 'Base', 'Sombra', 'Blush', 'Iluminador', 'Corretivo',
  'Contorno/Bronzer', 'Gloss', 'Lápis Labial', 'Pó Facial', 'Delineador',
]);

// Cores que não são úteis
const JUNK_COLORS = new Set([
  'sem cor', 'único', 'única', 'unica', 'unico', 'outro', 'outros',
  'multicolor', 'multicor', 'não se aplica', 'nao se aplica', '',
  'transparente', 'color', 'única cor', 'neutra', 'neutro',
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
    req.setTimeout(15000, () => { req.destroy(); resolve({}); });
    req.on('error', () => resolve({}));
  });
}

function normalizeColor(raw) {
  if (!raw) return '';
  const c = raw.trim().toLowerCase();
  if (JUNK_COLORS.has(c)) return '';
  if (c.length < 2) return '';
  // Remove prefixos "cor ", "tom " de cores
  const clean = raw.trim()
    .replace(/^(?:cor|tom|shade|color)\s+/i, '')
    .replace(/\b\w/g, l => l.toUpperCase());
  return clean.length >= 2 ? clean : '';
}

// Extrai tom a partir do título
function extractToneFromTitle(title) {
  if (!title) return '';
  // ex: "Base Cor 120 Bege" → "120 Bege"
  const m1 = title.match(/\b(?:tom|cor|shade)\s+([\w\s]{2,25})/i);
  if (m1) return m1[1].trim().replace(/\b\w/g, l => l.toUpperCase());
  // ex: "Base 120 Bege Claro"
  const m2 = title.match(/\b(\d{2,3}[a-z]?)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-Za-záéíóú]+)?)\b/);
  if (m2) return `${m2[1]} ${m2[2]}`;
  return '';
}

/**
 * Busca variações de cor para um produto via 2 estratégias principais:
 * 1. Atributos do produto catálogo
 * 2. Itens com catalog_product_id (mais rápido e confiável)
 */
async function fetchColors(mlId, productName) {
  const colorMap = new Map(); // colorName → imageUrl

  // ── Estratégia 1: produto catálogo ──────────────────────────────────────
  try {
    const prod = await get(`https://api.mercadolibre.com/products/${mlId}`);
    if (!prod.error) {
      const colorAttr = (prod.attributes || []).find(a => a.id === 'COLOR');
      const color = normalizeColor(colorAttr?.value_name || '');
      const img   = prod.pictures?.[0]?.url || prod.pictures?.[0]?.secure_url || '';
      if (color && img) colorMap.set(color, img);
    }
    await sleep(DELAY_MS);
  } catch { /* ignora */ }

  // ── Estratégia 2: itens por catalog_product_id ───────────────────────────
  try {
    const items = await get(
      `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${mlId}&limit=20`
    );
    await sleep(DELAY_MS);

    const itemList = (items.results || []).slice(0, 15);
    for (const item of itemList) {
      if (colorMap.size >= MAX_COLORS) break;
      try {
        const detail = await get(
          `https://api.mercadolibre.com/items/${item.id}?include_attributes=all`
        );
        if (detail.error) { await sleep(80); continue; }

        const colorAttr = (detail.attributes || []).find(a => a.id === 'COLOR');
        let color = normalizeColor(colorAttr?.value_name || '');
        if (!color) color = extractToneFromTitle(detail.title || '');

        const img = detail.pictures?.[0]?.url || detail.thumbnail || '';

        if (color && img && !colorMap.has(color)) {
          colorMap.set(color, img.replace('http://', 'https://'));
        }
        await sleep(80);
      } catch { /* ignora */ }
    }
  } catch { /* ignora */ }

  // ── Estratégia 3 (só se ainda poucos): busca marketplace por nome ────────
  if (colorMap.size < 3) {
    try {
      const cleanName = productName
        .replace(/\b(cor|tom|shade)\s*\d+\b/gi, '')
        .replace(/\b\d{2,3}[a-z]{0,2}\b/gi, '')
        .trim()
        .slice(0, 45);
      const results = await get(
        `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(cleanName)}&limit=10`
      );
      await sleep(DELAY_MS);

      for (const r of (results.results || []).slice(0, 6)) {
        if (r.id === mlId || colorMap.size >= MAX_COLORS) continue;
        try {
          const detail = await get(`https://api.mercadolibre.com/products/${r.id}`);
          if (detail.error) { await sleep(80); continue; }
          const colorAttr = (detail.attributes || []).find(a => a.id === 'COLOR');
          const color = normalizeColor(colorAttr?.value_name || '');
          const img   = detail.pictures?.[0]?.url || detail.pictures?.[0]?.secure_url || '';
          if (color && img && !colorMap.has(color)) {
            colorMap.set(color, img.replace('http://', 'https://'));
          }
          await sleep(100);
        } catch { /* ignora */ }
      }
    } catch { /* ignora */ }
  }

  return Array.from(colorMap.entries()).map(([name, image]) => ({ name, image }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Enriquecimento de Cores — CoScore ===');
  console.log(`Mínimo de cores para processar: < ${MIN_COLORS} ${FORCE ? '(--force: processa todos)' : ''}\n`);

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products;

  // Filtra produtos que precisam de enriquecimento
  const toEnrich = products.filter(p =>
    COLOR_CATEGORIES.has(p.category) &&
    p.mlId &&
    (FORCE || (p.colors || []).length < MIN_COLORS)
  );

  console.log(`Total de produtos em categorias de cor: ${products.filter(p => COLOR_CATEGORIES.has(p.category)).length}`);
  console.log(`Produtos a enriquecer: ${toEnrich.length}\n`);

  // Estima tempo
  const estSec = Math.round(toEnrich.length * 3.5); // ~3.5s por produto
  console.log(`Tempo estimado: ~${Math.round(estSec/60)} minutos\n`);

  let processed = 0;
  let enriched  = 0;
  let failed    = 0;

  // Cria um mapa de id → índice para updates rápidos
  const idxMap = new Map(products.map((p, i) => [p.id, i]));

  for (const prod of toEnrich) {
    processed++;
    const progress = `[${processed}/${toEnrich.length}]`;
    process.stdout.write(`${progress} ${prod.category} — ${prod.name.slice(0, 50)}... `);

    try {
      const colors = await fetchColors(prod.mlId, prod.name);

      if (colors.length > 0) {
        const idx = idxMap.get(prod.id);
        if (idx !== undefined) {
          products[idx].colors = colors;
          products[idx].image  = products[idx].image || colors[0]?.image || '';
          if (!products[idx].images || products[idx].images.length === 0) {
            products[idx].images = colors.map(c => c.image).filter(Boolean);
          }
        }
        enriched++;
        console.log(`${colors.length} cores`);
      } else {
        failed++;
        console.log('sem cores');
      }
    } catch (err) {
      failed++;
      console.log(`ERRO: ${err.message}`);
    }

    // Salva progresso a cada SAVE_EVERY produtos
    if (processed % SAVE_EVERY === 0) {
      catalog.products = products;
      catalog.lastEnrich = new Date().toISOString();
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
      console.log(`\n💾 Progresso salvo (${processed}/${toEnrich.length})\n`);
    }
  }

  // Salva final
  catalog.products = products;
  catalog.lastEnrich = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

  console.log('\n=== Resultado ===');
  console.log(`Processados: ${processed}`);
  console.log(`Enriquecidos com cores: ${enriched}`);
  console.log(`Sem cores encontradas: ${failed}`);

  // Distribuição final de cores
  const colorProds = products.filter(p => COLOR_CATEGORIES.has(p.category));
  const dist = {};
  for (const p of colorProds) {
    const n = (p.colors || []).length;
    const bucket = n === 0 ? '0' : n <= 2 ? '1-2' : n <= 5 ? '3-5' : n <= 10 ? '6-10' : '10+';
    dist[bucket] = (dist[bucket] || 0) + 1;
  }
  console.log('\nDistribuição de cores:');
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k} cores: ${v} produtos`);

  console.log('\n⚡ Próximo passo: node scripts/export-catalog.js');
}

main().catch(err => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
