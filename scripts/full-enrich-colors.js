/**
 * full-enrich-colors.js
 * Passa por TODOS os produtos com mlId em categorias relevantes
 * e busca todas as variações de cor disponíveis no ML.
 * Salva progresso a cada 50 produtos para não perder trabalho.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const CATALOG_PATH = path.join(__dirname, 'output/catalog.json');
const CLIENT_ID     = '1664631224999083';
const CLIENT_SECRET = 'Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
const BASE          = 'https://api.mercadolibre.com';

// Categorias onde variações de cor fazem sentido
const COLOR_CATEGORIES = new Set([
  'Base', 'Batom', 'Lápis Labial', 'Gloss', 'Blush', 'Contorno/Bronzer',
  'Iluminador', 'Sombra', 'Corretivo', 'Pó Facial', 'Primer',
  'Delineador', 'Máscara de Cílios', 'Protetor Solar', 'Tintura',
  'Esponjas e Pincéis', 'Fixador de Maquiagem',
]);

// Padrões de kit/combo para remoção
const KIT_PATTERNS = [
  /^kit\s+/i, /\bkit\s+(com|de)\s+\d/i, /\bcombo\b/i, /\bconjunto\b/i,
  /\bkit\s+(maquiagem|beleza|skincare)\b/i, /\d+\s*(unid|un|pcs)\b/i,
  /\b\d+\s*x\s+\d/i,
];
function isKit(n) { return KIT_PATTERNS.some(p => p.test(n||'')); }

// ── Token ─────────────────────────────────────────────────────────────────────
let _token = ''; let _tokenAt = 0;
async function getToken() {
  if (_token && Date.now() - _tokenAt < 20*60*1000) return _token;
  const d = await postForm(`${BASE}/oauth/token`,
    `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`);
  if (d.access_token) { _token = d.access_token; _tokenAt = Date.now(); }
  return _token;
}
function postForm(url, body) {
  return new Promise(resolve => {
    const b=Buffer.from(body), u=new URL(url);
    const r=https.request({hostname:u.hostname,path:u.pathname,method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':b.length}
    },res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{try{resolve(JSON.parse(s))}catch{resolve({})}})});
    r.setTimeout(10000,()=>{r.destroy();resolve({})});
    r.on('error',()=>resolve({}));r.write(b);r.end();
  });
}
function apiGet(url, token) {
  return new Promise(resolve => {
    const r=https.get(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}},res=>{
      let s='';res.on('data',c=>s+=c);
      res.on('end',()=>{try{resolve(JSON.parse(s))}catch{resolve(null)}});
    });
    r.setTimeout(12000,()=>{r.destroy();resolve(null)});
    r.on('error',()=>resolve(null));
  });
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

// ── Normalização ──────────────────────────────────────────────────────────────
function normColor(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

// Extrai cor de um título, removendo o nome-base do produto
function extractColorFromTitle(childName, parentName) {
  if (!childName) return '';
  const baseWords = (parentName||'').toLowerCase().split(/\s+/).filter(w=>w.length>3);
  let t = childName;
  for (const w of baseWords) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    try{t=t.replace(new RegExp('\\b'+esc+'\\b','gi'),' ')}catch{}
  }
  t = t.replace(/\s{2,}/g,' ').trim();

  const m1=t.match(/\b(tom|shade|cor)\s+([A-Z0-9][^\n,–\-]{1,30})/i);
  if(m1) return m1[2].trim();
  const m2=t.match(/\b(\d{1,3}[A-Za-z]?)\s+([A-ZÁÉÍÓÚ][a-záéíóúã]+(?:\s+[a-záéíóúã]+)?)\b/);
  if(m2) return `${m2[1]} ${m2[2]}`.trim();
  const m3=t.match(/[-–]\s*([A-ZÁÉÍÓÚ][a-záéíóúã]+(?:\s+[a-záéíóúã]+)?)\s*$/);
  if(m3) return m3[1].trim();
  const COLOR_W=/\b(bege|nude|rosa|vermelho|coral|bronze|dourado|marrom|caramelo|areia|porcelana|mel|cafe|terra|pessego|natural|ocre|branco|preto|chocolate|canela|ivory|sand|golden|copper|fair|light|medium|dark|deep|beige|almond|chestnut|espresso|mocha)\b/i;
  const m4=t.match(COLOR_W);
  if(m4) return m4[0];
  return '';
}

// ── Busca todas as cores de um produto no ML ──────────────────────────────────
async function fetchAllColors(mlId, productName, token) {
  const colors = [];
  const seen   = new Set();

  function add(name, image) {
    const nc = normColor(name);
    if (!nc || nc.length < 2 || seen.has(nc)) return;
    if (/^(variavel|variável|unico|único|outro|default|padrao|padrão|other|n\/a|sem)$/.test(nc)) return;
    seen.add(nc);
    colors.push({ name: name.trim(), image: image||'' });
  }

  try {
    const prod = await apiGet(`${BASE}/products/${mlId}?include_attributes=all`, token);
    if (!prod) return colors;

    const mainImg = prod.pictures?.[0]?.url || '';

    // Atributo de cor do produto principal
    const colorAttr = (prod.attributes||[]).find(a=>a.id==='COLOR'||a.id==='MAIN_COLOR');
    if (colorAttr?.value_name) add(colorAttr.value_name, mainImg);

    // Filhos
    const childIds = prod.children_ids || [];
    for (const cid of childIds.slice(0, 50)) {
      await sleep(60);
      const child = await apiGet(`${BASE}/products/${cid}`, token);
      if (!child) continue;
      const cImg   = child.pictures?.[0]?.url || '';
      const cColor = (child.attributes||[]).find(a=>a.id==='COLOR'||a.id==='MAIN_COLOR');
      if (cColor?.value_name) { add(cColor.value_name, cImg); continue; }
      const fromTitle = extractColorFromTitle(child.name||'', productName);
      if (fromTitle) add(fromTitle, cImg);
    }

    // Se poucas cores, busca por nome
    if (colors.length < 3) {
      const q = encodeURIComponent(productName.slice(0,60));
      const s = await apiGet(`${BASE}/products/search?site_id=MLB&q=${q}&status=active&limit=15`, token);
      for (const r of (s?.results||[])) {
        const rImg = r.pictures?.[0]?.url||'';
        const rColor = (r.attributes||[]).find(a=>a.id==='COLOR'||a.id==='MAIN_COLOR');
        if (rColor?.value_name) { add(rColor.value_name, rImg); continue; }
        const fromTitle = extractColorFromTitle(r.name||'', productName);
        if (fromTitle) add(fromTitle, rImg);
      }
    }
  } catch{ /* ignora */ }

  return colors;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const raw      = JSON.parse(fs.readFileSync(CATALOG_PATH,'utf8'));
  let products   = raw.products || raw;
  console.log('Total inicial:', products.length);

  // ── 1. Re-limpar kits que possam ter voltado ───────────────────────────────
  const before = products.length;
  products = products.filter(p => !isKit(p.name));
  console.log(`Kits removidos: ${before - products.length} | Restantes: ${products.length}`);

  // ── 2. Obter token ─────────────────────────────────────────────────────────
  console.log('\nObtendo token ML...');
  const token = await getToken();
  console.log(token ? 'Token OK' : 'AVISO: sem token');

  // ── 3. Selecionar candidatos ao enriquecimento ─────────────────────────────
  const candidates = products.filter(p =>
    p.mlId &&
    COLOR_CATEGORIES.has(p.category) &&
    (p.colors||[]).length < 5   // produtos com menos de 5 cores (provavelmente incompletos)
  );
  console.log(`\nCandidatos a enriquecer: ${candidates.length}`);

  // ── 4. Enriquecer cores ────────────────────────────────────────────────────
  let enriched = 0;
  let saved    = 0;

  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];

    // Renovar token a cada 400 produtos
    if (i > 0 && i % 400 === 0) {
      await getToken();
      process.stdout.write('\n[token renovado] ');
    }

    const existingNames = new Set((p.colors||[]).map(c=>normColor(c.name||'')));
    const mlColors = await fetchAllColors(p.mlId, p.name, token);

    if (mlColors.length > 0) {
      const newOnes = mlColors.filter(c => !existingNames.has(normColor(c.name||'')));
      if (newOnes.length > 0 || (p.colors||[]).length === 0) {
        p.colors = [...(p.colors||[]), ...newOnes];
        enriched++;
      }
    }

    if ((i+1) % 10 === 0) {
      process.stdout.write(`\r  ${i+1}/${candidates.length} | +${enriched} enriquecidos`);
    }

    // Salva progresso a cada 50 produtos
    if ((i+1) % 50 === 0) {
      const out = typeof raw.version !== 'undefined'
        ? {...raw, products, totalProducts: products.length, lastSync: new Date().toISOString()}
        : products;
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(out, null, 2));
      saved++;
      process.stdout.write(` [salvo checkpoint #${saved}]`);
    }

    await sleep(80);
  }

  console.log(`\n\nTotal enriquecidos: ${enriched}`);

  // ── 5. Deduplicar cores dentro de cada produto ────────────────────────────
  let colorsDedupTotal = 0;
  for (const p of products) {
    if (!p.colors || p.colors.length <= 1) continue;
    const seen = new Set();
    const unique = [];
    for (const c of p.colors) {
      const k = normColor(c.name||'');
      if (!k || k==='variavel'||k==='variável'||k==='unico'||k==='único') {
        if (unique.length === 0) unique.push(c);
        continue;
      }
      if (!seen.has(k)) { seen.add(k); unique.push(c); }
      else colorsDedupTotal++;
    }
    p.colors = unique;
  }
  console.log(`Cores duplicadas removidas: ${colorsDedupTotal}`);

  // ── 6. Salvar final ───────────────────────────────────────────────────────
  const output = typeof raw.version !== 'undefined'
    ? {...raw, products, totalProducts: products.length, lastSync: new Date().toISOString()}
    : products;
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));
  console.log(`Catálogo salvo: ${products.length} produtos`);

  // Estatísticas finais por categoria
  console.log('\nCobertura de cores após enriquecimento:');
  for (const cat of [...COLOR_CATEGORIES].sort()) {
    const inCat = products.filter(p=>p.category===cat);
    const withC = inCat.filter(p=>p.colors&&p.colors.length>1);
    const pct   = inCat.length>0 ? Math.round(withC.length/inCat.length*100) : 0;
    console.log(`  ${cat.padEnd(28)} ${withC.length}/${inCat.length} (${pct}%)`);
  }
}

main().catch(console.error);
