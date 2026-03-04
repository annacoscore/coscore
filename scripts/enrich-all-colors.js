/**
 * enrich-all-colors.js
 * Enriquece produtos de categorias de cor com variações disponíveis no ML.
 *
 * Estratégias (com client_credentials token):
 * 1. /products/{mlId} → COLOR attribute ou extração do nome
 * 2. children_ids do produto → extrai cor do nome/attribute de cada filho
 * 3. /products/search por nome → encontra variantes similares
 *
 * Uso: node scripts/enrich-all-colors.js
 * Flags:
 *   --force      processa mesmo produtos que já têm cores
 *   --min=N      processa se tiver menos de N cores (padrão=1)
 *   --cat=NOME   processa apenas uma categoria específica
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const CLIENT_ID     = '1664631224999083';
const CLIENT_SECRET = 'Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
const CATALOG_PATH  = path.join(__dirname, 'output', 'catalog.json');
const SAVE_EVERY    = 50;
const DELAY_MS      = 90;
const MAX_COLORS    = 30;
const FORCE         = process.argv.includes('--force');
const MIN_COLORS    = parseInt(
  (process.argv.find(a => a.startsWith('--min=')) || '--min=1').split('=')[1]
);
const ONLY_CAT = (process.argv.find(a => a.startsWith('--cat=')) || '').split('=')[1] || '';

const COLOR_CATEGORIES = new Set([
  'Batom', 'Base', 'Sombra', 'Blush', 'Iluminador', 'Corretivo',
  'Contorno/Bronzer', 'Gloss', 'Lápis Labial', 'Pó Facial', 'Delineador',
  'Máscara de Cílios',
]);

const JUNK_COLORS = new Set([
  'sem cor','único','única','unica','unico','outro','outros',
  'multicolor','multicor','não se aplica','nao se aplica','',
  'transparente','color','única cor','neutra','neutro','variado',
  'variados','sortido','sem','n/a','na','padrão','padrao',
]);

let TOKEN = '';

async function getToken() {
  return new Promise((resolve, reject) => {
    const body = `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`;
    const req  = https.request(
      { hostname:'api.mercadolibre.com', path:'/oauth/token', method:'POST',
        headers:{ 'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body) } },
      res => {
        let d=''; res.on('data',c=>d+=c);
        res.on('end',()=>{ const r=JSON.parse(d); r.access_token?resolve(r.access_token):reject(new Error(JSON.stringify(r))); });
      }
    );
    req.on('error',reject); req.write(body); req.end();
  });
}

function get(url) {
  return new Promise(resolve => {
    const req = https.get(url,{ headers:{ Authorization:`Bearer ${TOKEN}` } }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{ resolve(JSON.parse(d)); }catch{ resolve({}); } });
    });
    req.setTimeout(12000,()=>{ req.destroy(); resolve({}); });
    req.on('error',()=>resolve({}));
  });
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function normalizeColor(raw) {
  if (!raw) return '';
  const c = raw.trim().toLowerCase();
  if (JUNK_COLORS.has(c) || c.length < 2) return '';
  return raw.trim()
    .replace(/^(?:cor|tom|shade|color|tono)\s+/i,'')
    .replace(/\b\w/g, l=>l.toUpperCase())
    .trim();
}

function normalizeUrl(url) {
  return (url||'').replace('http://','https://').replace(/-[A-Z]\.jpg$/,'-O.jpg');
}

/**
 * Extrai o nome da variante/cor a partir do título de um produto filho.
 * Ex: "Base Ricosti Tom Bege Clara" → "Bege Clara"
 *     "Batom Ruby Rose 01 - Vermelho" → "01 Vermelho"
 *     "Sombra Dailus Shade Dusty Rose" → "Dusty Rose"
 */
function extractColorFromName(childName, parentName) {
  if (!childName) return '';

  // Remove o nome do pai do início para facilitar extração
  const parentWords = (parentName||'').toLowerCase().split(/\s+/).filter(w=>w.length>3);
  let title = childName;
  for (const w of parentWords) {
    // Escapa caracteres especiais de regex antes de usar
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { title = title.replace(new RegExp('\\b'+escaped+'\\b','gi'),' '); } catch { /* ignora */ }
  }
  title = title.replace(/\s{2,}/g,' ').trim();

  // Padrão 1: "Tom Bege Clara" / "Tom Médio" / "tom 02 Bege"
  const m1 = title.match(/\btom\s+([A-Z0-9][^\n,–\-]{1,30})/i);
  if (m1) return normalizeColor(m1[1].trim());

  // Padrão 2: "Shade Dusty Rose" / "Shade 12"
  const m2 = title.match(/\bshade\s+([A-Z0-9][^\n,–\-]{1,25})/i);
  if (m2) return normalizeColor(m2[1].trim());

  // Padrão 3: "Cor 220" / "Cor Nude" / "Cor Bege"
  const m3 = title.match(/\bcor\s+([A-Z0-9][^\n,–\-]{1,25})/i);
  if (m3) return normalizeColor(m3[1].trim());

  // Padrão 4: número + nome de cor: "01 Bege" / "220W Areia"
  const m4 = title.match(/\b(\d{1,3}[a-z]?)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[a-záéíóú]+)?)\b/);
  if (m4) return normalizeColor(`${m4[1]} ${m4[2]}`);

  // Padrão 5: cor pura no final: "- Bege Clara" / "– Vermelho Intenso"
  const m5 = title.match(/[-–]\s*([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[a-záéíóú]+)?)\s*$/);
  if (m5) return normalizeColor(m5[1].trim());

  // Padrão 6: nome de cor sozinho após remoção do nome do pai
  // Encontrar palavras que são cores conhecidas
  const COLOR_WORDS = /\b(bege|nude|rosa|vermelho|coral|bronze|dourado|prateado|marrom|caramelo|areia|porcelana|mel|cafe|terracota|pêssego|pessego|clara|escura|médio|medio|claro|escuro|natural|ocre|castanho|creme|salmão|salmao|amendoa|amêndoa|tostado|caoba|almond|ivory|sand|beige|golden|bronze|copper)\b/i;
  const m6 = title.match(COLOR_WORDS);
  if (m6) return normalizeColor(m6[0]);

  return '';
}

function getPicFromProd(prod) {
  if (!prod || prod.error) return '';
  return normalizeUrl((prod.pictures||[])[0]?.url || (prod.pictures||[])[0]?.secure_url || '');
}

/** Busca todas as variações de cor para um produto */
async function fetchColors(mlId, productName) {
  const colorMap = new Map(); // name → imageUrl

  // ── Estratégia 1: produto principal ───────────────────────────────────────
  const mainProd = await get(`https://api.mercadolibre.com/products/${mlId}`);
  await sleep(DELAY_MS);

  if (!mainProd.error) {
    // 1a. Atributo COLOR direto
    const colorAttr = (mainProd.attributes||[]).find(a => a.id==='COLOR');
    const directColor = normalizeColor(colorAttr?.value_name||'');
    if (directColor) {
      colorMap.set(directColor, getPicFromProd(mainProd));
    }

    // 1b. children_ids → cada filho tem nome com cor ou atributo COLOR
    const childrenIds = mainProd.children_ids || [];
    for (const childId of childrenIds.slice(0, 20)) {
      if (colorMap.size >= MAX_COLORS) break;
      const child = await get(`https://api.mercadolibre.com/products/${childId}`);
      await sleep(DELAY_MS);

      if (!child || child.error) continue;

      // Tentar atributo COLOR primeiro
      const childColorAttr = (child.attributes||[]).find(a => a.id==='COLOR');
      let colorName = normalizeColor(childColorAttr?.value_name||'');

      // Fallback: extrair do nome do filho
      if (!colorName) {
        colorName = extractColorFromName(child.name || '', productName);
      }

      const img = getPicFromProd(child);
      if (colorName && !colorMap.has(colorName)) {
        colorMap.set(colorName, img);
      }

      // Netos (às vezes o filho também tem filhos de variantes)
      for (const gcId of (child.children_ids||[]).slice(0,5)) {
        if (colorMap.size >= MAX_COLORS) break;
        const gc = await get(`https://api.mercadolibre.com/products/${gcId}`);
        await sleep(60);
        if (!gc || gc.error) continue;
        const gcAttr = (gc.attributes||[]).find(a => a.id==='COLOR');
        let gcColor = normalizeColor(gcAttr?.value_name||'');
        if (!gcColor) gcColor = extractColorFromName(gc.name||'', productName);
        const gcImg = getPicFromProd(gc);
        if (gcColor && !colorMap.has(gcColor)) colorMap.set(gcColor, gcImg);
      }
    }
  }

  // ── Estratégia 2: busca por nome se ainda poucos resultados ───────────────
  if (colorMap.size < 2) {
    const cleanName = productName
      .replace(/\b(maquiagem|makeup|cosmétic[ao]s?|produto)\b/gi,'')
      .replace(/\s{2,}/g,' ').trim().slice(0, 50);

    const searchRes = await get(
      `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(cleanName)}&limit=8`
    );
    await sleep(DELAY_MS);

    for (const result of (searchRes.results||[]).slice(0,6)) {
      if (result.id === mlId || colorMap.size >= MAX_COLORS) continue;
      const prod = await get(`https://api.mercadolibre.com/products/${result.id}`);
      await sleep(80);
      if (!prod || prod.error) continue;

      const colorAttr = (prod.attributes||[]).find(a=>a.id==='COLOR');
      let color = normalizeColor(colorAttr?.value_name||'');
      if (!color) color = extractColorFromName(prod.name||'', productName);
      const img = getPicFromProd(prod);
      if (color && !colorMap.has(color)) colorMap.set(color, img);

      for (const childId of (prod.children_ids||[]).slice(0,8)) {
        if (colorMap.size >= MAX_COLORS) break;
        const child = await get(`https://api.mercadolibre.com/products/${childId}`);
        await sleep(60);
        if (!child || child.error) continue;
        const cAttr = (child.attributes||[]).find(a=>a.id==='COLOR');
        let cColor = normalizeColor(cAttr?.value_name||'');
        if (!cColor) cColor = extractColorFromName(child.name||'', productName);
        const cImg = getPicFromProd(child);
        if (cColor && !colorMap.has(cColor)) colorMap.set(cColor, cImg);
      }
    }
  }

  return Array.from(colorMap.entries())
    .filter(([name]) => name.length >= 2)
    .map(([name, image]) => ({ name, image: image || '' }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Enriquecimento de Cores v2 — CoScore ===');
  console.log(`Min: <${MIN_COLORS} | Force: ${FORCE} | Cat: ${ONLY_CAT||'todas'}\n`);

  TOKEN = await getToken();
  console.log('Token:', TOKEN.slice(0,25)+'...\n');

  const catalog  = JSON.parse(fs.readFileSync(CATALOG_PATH,'utf8'));
  const products = catalog.products;

  const toEnrich = products.filter(p => {
    if (!COLOR_CATEGORIES.has(p.category)) return false;
    if (!p.mlId) return false;
    if (ONLY_CAT && p.category !== ONLY_CAT) return false;
    return FORCE || (p.colors||[]).length < MIN_COLORS;
  });

  const total = products.filter(p => COLOR_CATEGORIES.has(p.category)).length;
  console.log(`Total nas categorias de cor: ${total}`);
  console.log(`A processar: ${toEnrich.length}`);
  console.log(`Estimativa: ~${Math.round(toEnrich.length * 5 / 60)} min\n`);

  const idxMap  = new Map(products.map((p,i) => [p.id,i]));
  let processed = 0, enriched = 0, noColors = 0, tokenAge = 0;

  for (const prod of toEnrich) {
    processed++; tokenAge++;

    if (tokenAge >= 400) {
      try { TOKEN = await getToken(); tokenAge=0; process.stdout.write('\n🔑 Token renovado\n'); } catch{}
    }

    const prefix = `[${processed}/${toEnrich.length}]`;
    process.stdout.write(`${prefix} ${prod.category.padEnd(16)} ${prod.name.slice(0,40).padEnd(40)}... `);

    const colors = await fetchColors(prod.mlId, prod.name);

    const idx = idxMap.get(prod.id);
    if (idx !== undefined && colors.length > 0) {
      const existing = new Map((products[idx].colors||[]).map(c=>[c.name,c.image]));
      for (const {name,image} of colors) {
        if (!existing.has(name)) existing.set(name, image);
      }
      products[idx].colors = Array.from(existing.entries()).map(([name,image])=>({name,image}));
      if (!products[idx].image && colors[0]?.image) {
        products[idx].image  = colors[0].image;
        products[idx].images = colors.map(c=>c.image).filter(Boolean);
      }
      enriched++;
      console.log(`✓ ${colors.length} cores → ${colors.slice(0,3).map(c=>c.name).join(', ')}`);
    } else {
      noColors++;
      console.log('- sem cores');
    }

    if (processed % SAVE_EVERY === 0) {
      catalog.products   = products;
      catalog.lastEnrich = new Date().toISOString();
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog,null,2),'utf8');
      console.log(`\n💾 Salvo (${processed}/${toEnrich.length}) — ${enriched} enriquecidos\n`);
    }
  }

  catalog.products   = products;
  catalog.lastEnrich = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog,null,2),'utf8');

  console.log('\n=== Resultado ===');
  console.log(`Processados: ${processed} | Enriquecidos: ${enriched} | Sem cores: ${noColors}\n`);

  console.log('Por categoria:');
  for (const cat of [...COLOR_CATEGORIES].sort()) {
    const prods     = products.filter(p=>p.category===cat);
    const withColor = prods.filter(p=>(p.colors||[]).length>0).length;
    if (!prods.length) continue;
    const pct = Math.round(withColor/prods.length*100);
    console.log(`  ${cat.padEnd(22)} ${withColor}/${prods.length} (${pct}%)`);
  }
  console.log('\n⚡ node scripts/export-catalog.js');
}

main().catch(err=>{ console.error('ERRO FATAL:',err); process.exit(1); });
