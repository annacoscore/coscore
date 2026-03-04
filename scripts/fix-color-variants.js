/**
 * fix-color-variants.js
 * Para cada produto com cor/tom no nome:
 * 1. Busca todas as variações de cor no ML (via catalog API)
 * 2. Mescla produtos duplicados (mesmo base + marca)
 * 3. Remove a cor do nome principal
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const CATALOG_PATH  = path.join(__dirname, 'output/catalog.json');
const CLIENT_ID     = '1664631224999083';
const CLIENT_SECRET = 'Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
const BASE          = 'https://api.mercadolibre.com';

// ── HTTP helpers ──────────────────────────────────────────────────────────────
let _token = ''; let _tokenAt = 0;
async function getToken() {
  if (_token && Date.now() - _tokenAt < 20 * 60 * 1000) return _token;
  const data = await postForm(`${BASE}/oauth/token`,
    `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`);
  if (data.access_token) { _token = data.access_token; _tokenAt = Date.now(); }
  return _token;
}
function postForm(url, body) {
  return new Promise(resolve => {
    const d = Buffer.from(body), u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': d.length }
    }, res => { let s=''; res.on('data',c=>s+=c); res.on('end',()=>{ try{resolve(JSON.parse(s))}catch{resolve({})} }); });
    req.setTimeout(10000,()=>{req.destroy();resolve({})});
    req.on('error',()=>resolve({})); req.write(d); req.end();
  });
}
function apiGet(url, token) {
  return new Promise(resolve => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, res => {
      let s=''; res.on('data',c=>s+=c);
      res.on('end',()=>{ try{resolve(JSON.parse(s))}catch{resolve(null)} });
    });
    req.setTimeout(10000,()=>{req.destroy();resolve(null)});
    req.on('error',()=>resolve(null));
  });
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

// ── Padrões de cor no nome ────────────────────────────────────────────────────
const COLOR_PATTERNS = [
  /\b(tom|shade|cor|color)\s+[A-Z0-9][^\s,;–\-]{0,25}/i,
  /\b\d{2,3}[A-Z]?\s+[A-ZÁÉÍÓÚ][a-záéíóúã]+/,
  /\s+[-–]\s+(bege|nude|rosa|vermelho|coral|bronze|dourado|marrom|caramelo|areia|porcelana|mel|café|terra|pêssego|natural|ocre|salmão|branco|preto|chocolate|canela|toffee|ivory|sand|golden|copper|fair|light|medium|dark|deep|warm|cool|beige|almond|chestnut|mahogany|espresso|latte|mocha|tawny|sienna|umber|amber)\b/i,
  /\s+(claro|clara|escuro|escura|médio|média|medio|media)\s*$/i,
  /^(tom\s+)?[0-9]{2,3}[A-Za-z]?\s/,
];
function hasColorInName(name) {
  if (!name) return false;
  return COLOR_PATTERNS.some(p => p.test(name));
}

// ── Extrai nome-base removendo cor ───────────────────────────────────────────
function extractBaseName(name) {
  if (!name) return '';
  let n = name
    .replace(/\s+[-–]\s+(bege|nude|rosa|vermelho|coral|bronze|dourado|marrom|caramelo|areia|porcelana|mel|café|terra|pêssego|natural|ocre|salmão|branco|preto|chocolate|canela|toffee|ivory|sand|golden|copper|fair|light|medium|dark|deep|warm|cool|beige|almond|chestnut|mahogany|espresso|latte|mocha|tawny|sienna|umber|amber)[^,;–\-]*/gi, '')
    .replace(/\b(tom|shade|cor|color)\s+[A-Z0-9][^\s,;–\-]{0,25}/gi, '')
    .replace(/\b\d{2,3}[A-Z]?\s+[A-ZÁÉÍÓÚ][a-záéíóúã]+/g, '')
    .replace(/^(tom\s+)?[0-9]{2,3}[A-Za-z]?\s+/i, '')
    .replace(/\s+(claro|clara|escuro|escura|médio|média|medio|media)\s*$/i, '')
    .replace(/\s+[-–,;:]\s*$/, '')
    .replace(/^\s*[-–,;:]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return n || name; // se ficou vazio, usa o original
}

function normKey(n, brand) {
  return (n||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s{2,}/g,' ').trim()
    +'||'+(brand||'').toLowerCase().trim();
}
function normColor(s) {
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

// ── Extrai cor de um título, removendo o nome do pai ─────────────────────────
function extractColorFromTitle(childName, parentBase) {
  if (!childName) return '';
  // Remove palavras do nome base do produto
  const baseWords = (parentBase||'').toLowerCase().split(/\s+/).filter(w=>w.length>3);
  let t = childName;
  for (const w of baseWords) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    try { t = t.replace(new RegExp('\\b'+esc+'\\b','gi'),' '); } catch{}
  }
  t = t.replace(/\s{2,}/g,' ').trim();

  // Padrão: "Tom X" / "Shade X" / "Cor X"
  const m1 = t.match(/\b(tom|shade|cor)\s+([A-Z0-9][^\n,–\-]{1,30})/i);
  if (m1) return m1[2].trim();

  // Padrão: número + cor: "120 Bege", "01 Nude"
  const m2 = t.match(/\b(\d{1,3}[A-Za-z]?)\s+([A-ZÁÉÍÓÚ][a-záéíóúã]+(?:\s+[a-záéíóúã]+)?)\b/);
  if (m2) return `${m2[1]} ${m2[2]}`.trim();

  // Padrão: cor no final: "– Bege Clara" / "- Nude"
  const m3 = t.match(/[-–]\s*([A-ZÁÉÍÓÚ][a-záéíóúã]+(?:\s+[a-záéíóúã]+)?)\s*$/);
  if (m3) return m3[1].trim();

  // Cor isolada restante
  const colorWords = /\b(bege|nude|rosa|vermelho|coral|bronze|dourado|marrom|caramelo|areia|porcelana|mel|cafe|terra|pessego|natural|ocre|branco|preto|chocolate|canela|toffee|ivory|sand|golden|copper|fair|light|medium|dark|deep|warm|cool|beige|almond|chestnut|mahogany|espresso|latte|mocha)\b/i;
  const m4 = t.match(colorWords);
  if (m4) return m4[0];

  return '';
}

// ── Busca todas as variações de cor de um produto no ML ──────────────────────
async function fetchAllColors(mlId, productName, token) {
  const colors = [];
  const seenNames = new Set();

  function addColor(name, image) {
    const nc = normColor(name);
    if (!nc || nc.length < 2 || seenNames.has(nc)) return;
    if (/^(variavel|variável|unico|único|outro|other|default|padrao|padrão)$/.test(nc)) return;
    seenNames.add(nc);
    colors.push({ name: name.trim(), image: image || '' });
  }

  try {
    // 1. Produto principal
    const prod = await apiGet(`${BASE}/products/${mlId}?include_attributes=all`, token);
    if (!prod) return colors;

    // Atributos do produto principal
    const colorAttr = (prod.attributes||[]).find(a => a.id === 'COLOR' || a.id === 'MAIN_COLOR');
    if (colorAttr?.value_name) {
      const img = prod.pictures?.[0]?.url || '';
      addColor(colorAttr.value_name, img);
    }

    // Imagem principal para cor sem nome
    const mainImg = prod.pictures?.[0]?.url || '';

    // 2. Filhos (children_ids)
    const childrenIds = prod.children_ids || [];
    for (const childId of childrenIds.slice(0, 40)) {
      await sleep(50);
      const child = await apiGet(`${BASE}/products/${childId}`, token);
      if (!child) continue;
      
      const childImg = child.pictures?.[0]?.url || '';
      
      // Cor via atributo
      const cAttr = (child.attributes||[]).find(a => a.id === 'COLOR' || a.id === 'MAIN_COLOR');
      if (cAttr?.value_name) {
        addColor(cAttr.value_name, childImg);
        continue;
      }
      
      // Cor via título
      const base = extractBaseName(productName);
      const colorFromTitle = extractColorFromTitle(child.name || '', base);
      if (colorFromTitle) addColor(colorFromTitle, childImg);
    }

    // 3. Se ainda temos poucas cores, busca via /products/search
    if (colors.length < 3) {
      const q = encodeURIComponent(extractBaseName(productName).slice(0, 60));
      const search = await apiGet(`${BASE}/products/search?site_id=MLB&q=${q}&status=active&limit=20`, token);
      const results = search?.results || [];
      
      for (const r of results) {
        if (!r.catalog_product_id) continue;
        const cAttr = (r.attributes||[]).find(a => a.id === 'COLOR' || a.id === 'MAIN_COLOR');
        if (cAttr?.value_name) {
          const rImg = r.pictures?.[0]?.url || '';
          addColor(cAttr.value_name, rImg);
        }
        const colorFromTitle = extractColorFromTitle(r.name || '', extractBaseName(productName));
        if (colorFromTitle) addColor(colorFromTitle, r.pictures?.[0]?.url || '');
      }
    }

    // 4. Se ainda sem cores, extrai cor do próprio nome do produto
    if (colors.length === 0) {
      const colorFromOwnName = extractColorFromTitle(productName, extractBaseName(productName));
      if (colorFromOwnName) addColor(colorFromOwnName, mainImg);
    }

  } catch (e) { /* ignora */ }

  return colors;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const raw      = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = raw.products || raw;
  console.log('Total inicial:', products.length);

  console.log('Obtendo token ML...');
  const token = await getToken();
  console.log(token ? 'Token OK' : 'AVISO: sem token');

  // ── Passo 1: Identificar produtos com cor no nome ─────────────────────────
  const withColor = products.filter(p => hasColorInName(p.name));
  console.log('\nProdutos com cor no nome:', withColor.length);

  // ── Passo 2: Agrupar por nome-base + marca ────────────────────────────────
  const groups = {};
  for (const p of products) {
    if (!hasColorInName(p.name)) continue;
    const base = extractBaseName(p.name);
    const key  = normKey(base, p.brand);
    if (!groups[key]) groups[key] = { base, brand: p.brand, products: [] };
    groups[key].products.push(p);
  }

  // ── Passo 3: Mesclar grupos com múltiplos produtos ────────────────────────
  const idsToRemove = new Set();
  let mergedGroups = 0;

  for (const g of Object.values(groups)) {
    if (g.products.length <= 1) continue;
    // Mantém o produto com mais cores ou o primeiro
    g.products.sort((a,b) => (b.colors?.length||0) - (a.colors?.length||0));
    const primary = g.products[0];
    for (let i = 1; i < g.products.length; i++) {
      const other = g.products[i];
      // Mescla cores
      const existingNames = new Set((primary.colors||[]).map(c => normColor(c.name||'')));
      for (const c of (other.colors||[])) {
        if (!existingNames.has(normColor(c.name||''))) {
          primary.colors = primary.colors || [];
          primary.colors.push(c);
          existingNames.add(normColor(c.name||''));
        }
      }
      idsToRemove.add(other.id);
      mergedGroups++;
    }
  }
  console.log(`Grupos mesclados: ${mergedGroups} produtos absorvidos`);

  // ── Passo 4: Buscar cores do ML para produtos com mlId ────────────────────
  const toEnrich = products.filter(p => hasColorInName(p.name) && p.mlId && !idsToRemove.has(p.id));
  console.log(`\nBuscando cores para ${toEnrich.length} produtos no ML...`);

  let enriched = 0;
  for (let i = 0; i < toEnrich.length; i++) {
    const p = toEnrich[i];
    if (!token) break;

    // Renovar token a cada 300 produtos
    if (i > 0 && i % 300 === 0) {
      await getToken();
    }

    const mlColors = await fetchAllColors(p.mlId, p.name, token);

    if (mlColors.length > 0) {
      const existingNames = new Set((p.colors||[]).map(c => normColor(c.name||'')));
      const newColors = mlColors.filter(c => !existingNames.has(normColor(c.name||'')));
      
      if (newColors.length > 0 || (p.colors||[]).length === 0) {
        p.colors = [
          ...(p.colors||[]),
          ...newColors,
        ];
        enriched++;
      }
    }

    if (i % 20 === 0) {
      process.stdout.write(`\r  Processados: ${i+1}/${toEnrich.length} | Enriquecidos: ${enriched}`);
    }
    await sleep(100);
  }
  console.log(`\n  Total enriquecidos: ${enriched}`);

  // ── Passo 5: Limpar cor do nome de todos os produtos afetados ─────────────
  let namesCleaned = 0;
  const finalProducts = products.filter(p => !idsToRemove.has(p.id));
  
  for (const p of finalProducts) {
    if (!hasColorInName(p.name)) continue;
    const base = extractBaseName(p.name);
    if (base && base !== p.name && base.length >= 5) {
      p.name = base;
      namesCleaned++;
    }
  }
  console.log(`\nNomes limpos: ${namesCleaned}`);
  console.log(`Total final: ${finalProducts.length}`);

  // ── Salvar ────────────────────────────────────────────────────────────────
  const output = typeof raw.version !== 'undefined'
    ? { ...raw, products: finalProducts, totalProducts: finalProducts.length, lastSync: new Date().toISOString() }
    : finalProducts;

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log('Catálogo salvo!');

  // Relatório
  const stillHaveColor = finalProducts.filter(p => hasColorInName(p.name));
  console.log(`\nProdutos ainda com cor no nome: ${stillHaveColor.length}`);
  if (stillHaveColor.length > 0) {
    stillHaveColor.slice(0, 10).forEach(p => console.log(' -', p.name?.slice(0,60)));
  }
}

main().catch(console.error);
