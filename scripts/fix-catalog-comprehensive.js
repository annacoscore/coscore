/**
 * fix-catalog-comprehensive.js
 * 1. Remove produtos em kit/combo/conjunto
 * 2. Corrige imagens quebradas buscando do ML (client_credentials)
 * 3. Remove duplicações (mesmo nome+marca)
 * 4. Limpa nomes com cor/tom embutidos
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ── Configuração ──────────────────────────────────────────────────────────────
const CATALOG_PATH = path.join(__dirname, 'output/catalog.json');
const CLIENT_ID     = '1664631224999083';
const CLIENT_SECRET = 'Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
const BASE          = 'https://api.mercadolibre.com';

// ── Helpers HTTP ──────────────────────────────────────────────────────────────
function postForm(url, body) {
  return new Promise(resolve => {
    const data = Buffer.from(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({}); });
    req.on('error', () => resolve({}));
    req.write(data); req.end();
  });
}

function apiGet(url, token) {
  return new Promise(resolve => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function getToken() {
  const data = await postForm(`${BASE}/oauth/token`,
    `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`
  );
  return data.access_token || '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Padrões de kit/combo para remoção ─────────────────────────────────────────
const KIT_PATTERNS = [
  /^kit\s+/i,                                  // começa com "kit "
  /\bkit\s+(com|de)\s+\d/i,                    // "kit com 3", "kit de 2"
  /\bkit\s+\d+\s*(un|pcs|peça)/i,             // "kit 5un"
  /\d+\s*(unidades|pcs|peças)\s+(de\s+)?kit/i, // "3 unidades de kit"
  /\bcombo\b/i,                                // "combo"
  /\bconjunto\b/i,                             // "conjunto"
  /\bkit\s+(maquiagem|beleza|skincare|tratamento)\b/i,  // kits genéricos
  /\bkit\s+(lip|eye|face|skin)\b/i,            // kits em inglês
  /\d+\s*(unid|un|pcs)\b/i,                   // "3 unid", "5 pcs"
  /\bpack\s+de\s+\d/i,                         // "pack de 3"
  /\b\d+\s*x\s+\d/i,                          // "3x 5ml"
  /glosslicious kit fran\b.*\d+\s+unidades/i,  // específico
];

function isKit(name) {
  if (!name) return false;
  for (const p of KIT_PATTERNS) {
    if (p.test(name)) return true;
  }
  // Casos específicos que não são kit:
  // "Kit Fran Lipchilli" sem múltiplas unidades é produto único — mantemos
  return false;
}

// ── Limpeza de cor/tom no nome ────────────────────────────────────────────────
const COLOR_WORDS_EN = /\b(nude|beige|coral|bronze|golden|copper|ivory|sand|burgundy|mauve|plum|taupe|blush|scarlet|crimson|fuchsia|sienna|umber|amber|caramel|walnut|almond|chestnut|hazel|ebony)\b/gi;
const COLOR_PATTERNS_PT = /\s*[–\-]\s*(tom|cor|shade|color)\s+[^\-–,]+/gi;
const TOM_PATTERNS = /\s*(tom|shade)\s+[A-Z0-9][^\s,;]{0,25}/gi;

// Normalização de nome para comparação
function normalizeName(n) {
  return (n || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Buscar imagem do ML ───────────────────────────────────────────────────────
async function fetchMlImage(mlId, token) {
  if (!mlId) return null;
  try {
    const data = await apiGet(`${BASE}/products/${mlId}?include_attributes=all`, token);
    if (data && data.pictures && data.pictures.length > 0) {
      // Prioriza imagem de maior qualidade
      const pic = data.pictures.find(p => p.url?.includes('-F.jpg')) || data.pictures[0];
      return pic?.url || null;
    }
    // Tentar via children
    if (data && data.children_ids && data.children_ids.length > 0) {
      const child = await apiGet(`${BASE}/products/${data.children_ids[0]}`, token);
      if (child && child.pictures && child.pictures.length > 0) {
        return child.pictures[0].url || null;
      }
    }
  } catch { /* ignora */ }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Lendo catálogo...');
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = raw.products || raw;
  console.log('Total inicial:', products.length);

  console.log('\nObtendo token ML...');
  const token = await getToken();
  console.log(token ? 'Token OK' : 'AVISO: sem token');

  // ── PASSO 1: Remover kits/combos ──────────────────────────────────────────
  let removed = 0;
  const keepProducts = products.filter(p => {
    if (isKit(p.name)) { removed++; return false; }
    return true;
  });
  console.log(`\n[1] Kits/combos removidos: ${removed} | Restantes: ${keepProducts.length}`);

  // ── PASSO 2: Remover duplicações (mesmo nome normalizado + marca) ─────────
  const seen = new Map();
  let dupesRemoved = 0;
  const dedupedProducts = [];

  for (const p of keepProducts) {
    const key = normalizeName(p.name) + '|' + normalizeName(p.brand);
    if (seen.has(key)) {
      const existing = seen.get(key);
      // Manter o que tem mais cores, melhor imagem
      const existingColors = existing.colors?.length || 0;
      const thisColors = p.colors?.length || 0;
      if (thisColors > existingColors) {
        // Substituir pelo atual (mais cores)
        const idx = dedupedProducts.indexOf(existing);
        if (idx >= 0) {
          // Merge das cores
          const allColors = [...(existing.colors || []), ...(p.colors || [])];
          const uniqueColors = [];
          const colorNames = new Set();
          for (const c of allColors) {
            const cn = normalizeName(c.name || '');
            if (!colorNames.has(cn)) { colorNames.add(cn); uniqueColors.push(c); }
          }
          p.colors = uniqueColors;
          dedupedProducts[idx] = p;
          seen.set(key, p);
        }
      } else {
        // Merge cores do atual no existente
        const allColors = [...(existing.colors || []), ...(p.colors || [])];
        const uniqueColors = [];
        const colorNames = new Set();
        for (const c of allColors) {
          const cn = normalizeName(c.name || '');
          if (!colorNames.has(cn)) { colorNames.add(cn); uniqueColors.push(c); }
        }
        existing.colors = uniqueColors;
      }
      dupesRemoved++;
    } else {
      seen.set(key, p);
      dedupedProducts.push(p);
    }
  }
  console.log(`[2] Duplicatas removidas/merged: ${dupesRemoved} | Restantes: ${dedupedProducts.length}`);

  // ── PASSO 3: Corrigir imagens ausentes via ML API ─────────────────────────
  const withoutImage = dedupedProducts.filter(p => !p.image || p.image === '');
  console.log(`\n[3] Produtos sem imagem: ${withoutImage.length} — buscando no ML...`);

  let fixed = 0;
  let notFixed = 0;
  for (let i = 0; i < withoutImage.length; i++) {
    const p = withoutImage[i];
    if (p.mlId && token) {
      const img = await fetchMlImage(p.mlId, token);
      if (img) {
        p.image = img;
        if (!p.images || p.images.length === 0) p.images = [img];
        fixed++;
        process.stdout.write(`\r   Corrigidos: ${fixed}/${withoutImage.length}`);
      } else {
        notFixed++;
      }
    } else {
      notFixed++;
    }
    if (i % 10 === 0) await sleep(200);
  }
  console.log(`\n   OK: ${fixed} | Sem imagem ainda: ${notFixed}`);

  // ── PASSO 4: Remover produtos que ainda não têm imagem (qualidade) ────────
  const beforeFinalFilter = dedupedProducts.length;
  const finalProducts = dedupedProducts.filter(p => {
    // Manter produtos sem imagem se tiverem cores com imagem
    if (!p.image || p.image === '') {
      if (p.colors && p.colors.some(c => c.image)) {
        // Usar imagem da primeira cor como imagem principal
        p.image = p.colors.find(c => c.image)?.image || '';
      }
    }
    return p.image && p.image !== '';
  });
  const removedNoImg = beforeFinalFilter - finalProducts.length;
  console.log(`[4] Removidos sem imagem: ${removedNoImg} | Final: ${finalProducts.length}`);

  // ── PASSO 5: Deduplicar cores dentro de cada produto ─────────────────────
  let colorsDedupTotal = 0;
  for (const p of finalProducts) {
    if (!p.colors || p.colors.length <= 1) continue;
    const seen = new Set();
    const unique = [];
    for (const c of p.colors) {
      const key = normalizeName(c.name || '');
      if (!seen.has(key) && key && key !== 'variavel' && key !== 'unico') {
        seen.add(key);
        unique.push(c);
      } else if (!key || key === 'variavel' || key === 'unico') {
        // Manter cores sem nome se não há nenhuma com nome
        if (unique.length === 0) unique.push(c);
      }
    }
    if (unique.length !== p.colors.length) {
      colorsDedupTotal += p.colors.length - unique.length;
      p.colors = unique;
    }
  }
  console.log(`[5] Cores duplicadas removidas de produtos: ${colorsDedupTotal}`);

  // ── Salvar catálogo corrigido ─────────────────────────────────────────────
  const output = typeof raw.version !== 'undefined'
    ? { ...raw, products: finalProducts, totalProducts: finalProducts.length, lastSync: new Date().toISOString() }
    : finalProducts;

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nCatálogo salvo: ${finalProducts.length} produtos`);
  console.log(`  Removidos total: ${products.length - finalProducts.length}`);

  // Relatório final
  const stillNoImg = finalProducts.filter(p => !p.image).length;
  console.log(`  Ainda sem imagem: ${stillNoImg}`);
}

main().catch(console.error);
