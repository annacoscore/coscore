/**
 * quality-fix-all.js
 * Script completo de qualidade do catálogo:
 *   1. Remove variações de cor dos nomes dos produtos
 *   2. Mescla produtos duplicados, unindo cores
 *   3. Busca imagens oficiais do ML para produtos sem imagem
 *   4. Enriquece variações de cor via ML
 *
 * Uso: node scripts/quality-fix-all.js
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const CATALOG_PATH  = path.join(__dirname, 'output', 'catalog.json');
const SAVE_EVERY    = 100;
const DELAY_MS      = 120;
const MAX_COLORS    = 20;

let TOKEN = '';

// ── Categorias que suportam variações de cor ─────────────────────────────────
const COLOR_CATS = new Set([
  'Batom','Base','Sombra','Blush','Iluminador','Corretivo',
  'Contorno/Bronzer','Gloss','Lápis Labial','Pó Facial','Delineador',
  'Primer','Máscara de Cílios','Fixador de Maquiagem',
]);

// ── Palavras de cor / tom que NÃO devem estar no nome principal ──────────────
// Só remove se vierem DEPOIS de pelo menos 3 palavras do nome real
const COLOR_SUFFIXES = [
  // Cores em português
  /\s+(preto|preta|branco|branca|rosa|vermelho|vermelha|nude|bege|coral|marrom|dourado|dourada|prata|azul|verde|roxo|roxa|lilás|cinza|creme|dourado|vinho|bordô|champagne|bronze|cobre|terracota|caramelo|mel|café|chocolate|caramel|noisette|nude|transparente)\s*$/i,
  // Cores em inglês comuns em nomes de produto ML
  /\s+(black|white|red|pink|brown|gold|silver|blue|green|purple|grey|gray|ivory|sand|mocha|honey|peach|berry|plum|wine|burgundy|bronze|copper|tan|ginger|truffle|espresso|mahogany|chestnut|hazel|amber|golden|rose|blush|mauve|taupe|cocoa|cream|vanilla|toffee|cherry|fuchsia|magenta|lavender|violet|indigo|teal|olive|khaki|nude|beige|coral|terracotta|champagne|sienna|umber|bisque|almond|porcelain|warm|cool|light|deep|medium|fair|rich|dark)\s*$/i,
  // Números de tom: "01", "02 Bege", "#12", etc. só no final
  /\s+(?:#\d+|\d{2,3})\s*(?:[a-z]+)?\s*$/i,
  // Padrão "Tom X" ou "Cor X" no final
  /\s+(?:tom|cor|shade|tint|hue|n[oº°]?\s*\d+)\s+\w+\s*$/i,
];

// ── Nomes protegidos: palavras que parecem cor mas são parte do nome ──────────
const PROTECTED_BRAND_WORDS = new Set([
  'rose','rouge','gold','black','white','pink','red','blue','nude','pink',
  'coral','berry','cherry','honey','copper','bronze','matte','glossy','gloss',
  'shimmer','lustre','sheer','velvet','satin','cream','creme','ivory','opal',
  'pearl','moon','sun','sky','earth','sand','clay','ash',
]);

function removeColorFromName(name, colors) {
  let cleaned = name.trim();

  // 1. Se alguma cor da lista Colors estiver no final do nome, remova
  if (colors && colors.length > 0) {
    for (const c of colors) {
      const colorName = c.name || '';
      if (!colorName || colorName.length < 3) continue;
      // Só remove se o nome tiver mais de 3 palavras sem a cor
      const escaped = colorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\s+${escaped}\\s*$`, 'i');
      const without = cleaned.replace(pattern, '').trim();
      const wordCountWithout = without.split(/\s+/).length;
      if (pattern.test(cleaned) && wordCountWithout >= 2) {
        cleaned = without;
        break;
      }
    }
  }

  // 2. Remover sufixos de cor genéricos no final
  for (const pattern of COLOR_SUFFIXES) {
    const without = cleaned.replace(pattern, '').trim();
    const wordCount = without.split(/\s+/).length;
    if (without !== cleaned && wordCount >= 2) {
      // Verificar se a palavra removida não é uma palavra protegida no nome da marca
      cleaned = without;
      break;
    }
  }

  return cleaned.trim();
}

// ── Normalização para deduplicação ───────────────────────────────────────────
function normKey(name, brand) {
  const n = (name || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\b(cor|tom|ml|g|gr|oz|kit|de|e|a|o|para|com)\b/gi,'')
    .replace(/\b\d+\b/g,'')
    .replace(/[^a-z0-9\s]/g,'')
    .replace(/\s+/g,' ').trim().slice(0,55);
  const b = (brand || '').toLowerCase().trim().slice(0,20);
  return `${n}||${b}`;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url) {
  return new Promise(resolve => {
    const opts = TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {};
    const req = https.get(url, opts, res => {
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

const JUNK_COLORS = new Set([
  'único','única','unico','unica','outro','outros','multicolor','multicor',
  'não se aplica','nao se aplica','','transparente','cor única','neutra','sem cor','outro',
]);

function normalizeColor(raw) {
  if (!raw) return '';
  const c = raw.trim().toLowerCase();
  if (JUNK_COLORS.has(c) || c.length < 2) return '';
  return raw.trim().replace(/\b\w/g, l => l.toUpperCase());
}

// ── Buscar imagem e cores do ML ──────────────────────────────────────────────
async function fetchMLProduct(mlId) {
  const res = await get(`https://api.mercadolibre.com/products/${mlId}`);
  await sleep(80);
  if (res.error || !res.id) return null;
  return res;
}

async function fetchMLColors(mlId) {
  const colorMap = new Map();

  // Do catálogo
  try {
    const prod = await get(`https://api.mercadolibre.com/products/${mlId}`);
    await sleep(70);
    if (!prod.error) {
      const cAttr = (prod.attributes || []).find(a => a.id === 'COLOR');
      const color = normalizeColor(cAttr?.value_name || '');
      const img = (prod.pictures || [])[0];
      const imgUrl = img?.url || img?.secure_url || '';
      if (color && imgUrl) colorMap.set(color, imgUrl.replace('http://','https://'));

      // Variações do catalog
      const variations = prod.children_ids || [];
      for (const vid of variations.slice(0, MAX_COLORS)) {
        if (colorMap.size >= MAX_COLORS) break;
        try {
          const vProd = await get(`https://api.mercadolibre.com/products/${vid}`);
          await sleep(60);
          if (vProd.error) continue;
          const vc = normalizeColor(((vProd.attributes||[]).find(a=>a.id==='COLOR'))?.value_name||'');
          const vi = (vProd.pictures||[])[0];
          const vImg = vi?.url || vi?.secure_url || '';
          if (vc && vImg && !colorMap.has(vc)) colorMap.set(vc, vImg.replace('http://','https://'));
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }

  // Itens via catalog_product_id
  if (colorMap.size < MAX_COLORS) {
    try {
      const items = await get(
        `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${mlId}&limit=20`
      );
      await sleep(DELAY_MS);
      for (const item of (items.results || []).slice(0, 10)) {
        if (colorMap.size >= MAX_COLORS) break;
        try {
          const detail = await get(
            `https://api.mercadolibre.com/items/${item.id}?include_attributes=all`
          );
          await sleep(65);
          if (detail.error) continue;
          const cAttr = (detail.attributes || []).find(a => a.id === 'COLOR');
          const color = normalizeColor(cAttr?.value_name || '');
          const img = (detail.pictures || [])[0]?.url || detail.thumbnail || '';
          if (color && img && !colorMap.has(color)) {
            colorMap.set(color, img.replace('http://','https://'));
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return Array.from(colorMap.entries()).map(([name, image]) => ({ name, image }));
}

// ── ETAPA 1: Limpar nomes ────────────────────────────────────────────────────
function stage1_cleanNames(products) {
  console.log('\n=== ETAPA 1: Limpeza de nomes ===');
  let fixed = 0;
  for (const p of products) {
    const original = p.name;
    const cleaned = removeColorFromName(p.name, p.colors || []);
    if (cleaned !== original && cleaned.length >= 5) {
      // Se a cor removida não está na lista de cores, adicionar
      const diff = original.slice(cleaned.length).trim().replace(/^\s+/, '');
      if (diff && diff.length >= 2 && p.colors && COLOR_CATS.has(p.category)) {
        const alreadyHas = (p.colors || []).some(c =>
          c.name.toLowerCase() === diff.toLowerCase()
        );
        if (!alreadyHas) {
          if (!p.colors) p.colors = [];
          p.colors.unshift({ name: diff.replace(/\b\w/g, l => l.toUpperCase()), image: p.image || '' });
        }
      }
      p.name = cleaned;
      fixed++;
    }
  }
  console.log(`  Nomes corrigidos: ${fixed}`);
  return products;
}

// ── ETAPA 2: Deduplicação e mesclagem ────────────────────────────────────────
function stage2_deduplicate(products) {
  console.log('\n=== ETAPA 2: Deduplicação e mesclagem ===');
  const groups = new Map();

  for (const p of products) {
    const key = normKey(p.name, p.brand);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const merged = [];
  let mergedCount = 0;
  let keptCount   = 0;

  for (const [, group] of groups) {
    if (group.length === 1) {
      merged.push(group[0]);
      keptCount++;
      continue;
    }

    // Manter o que tem mais informação (mais cores, imagem, descrição)
    group.sort((a, b) => {
      const scoreA = (a.colors?.length || 0) * 3 + (a.image ? 2 : 0) + (a.description?.length || 0) / 100;
      const scoreB = (b.colors?.length || 0) * 3 + (b.image ? 2 : 0) + (b.description?.length || 0) / 100;
      return scoreB - scoreA;
    });

    const best = { ...group[0] };

    // Mesclar cores de todos os duplicados
    const colorMap = new Map();
    for (const dup of group) {
      for (const c of (dup.colors || [])) {
        if (c.name && !colorMap.has(c.name.toLowerCase())) {
          colorMap.set(c.name.toLowerCase(), c);
        }
      }
    }
    best.colors = Array.from(colorMap.values()).slice(0, MAX_COLORS);

    // Mesclar imagens
    const allImgs = new Set();
    for (const dup of group) {
      if (dup.image) allImgs.add(dup.image);
      for (const img of (dup.images || [])) if (img) allImgs.add(img);
    }
    best.image  = best.image || [...allImgs][0] || '';
    best.images = [...allImgs].slice(0, 6);

    // Preferir mlId se disponível
    if (!best.mlId) {
      const withMl = group.find(g => g.mlId);
      if (withMl) best.mlId = withMl.mlId;
    }

    merged.push(best);
    mergedCount += group.length - 1;
  }

  console.log(`  Grupos únicos: ${groups.size}`);
  console.log(`  Duplicatas removidas: ${mergedCount}`);
  console.log(`  Produtos finais: ${merged.length}`);
  return merged;
}

// ── ETAPA 3: Imagens e cores via ML (só produtos com mlId, sem imagem ou poucas cores) ──
async function stage3_enrichML(products) {
  console.log('\n=== ETAPA 3: Imagens e cores via ML ===');
  console.log('Obtendo token ML...');
  const tokenResp = await getToken();
  if (!tokenResp.access_token) {
    console.error('Falha ao obter token ML. Pulando etapa 3.');
    return products;
  }
  TOKEN = tokenResp.access_token;
  console.log('Token obtido.\n');

  // Candidatos: têm mlId, e ou não têm imagem OU estão em categoria de cor sem cores
  const candidates = products.filter(p => {
    if (!p.mlId) return false;
    const needsImage = !p.image;
    const needsColors = COLOR_CATS.has(p.category) && (!p.colors || p.colors.length < 2);
    return needsImage || needsColors;
  });

  console.log(`Candidatos a enriquecer: ${candidates.length}`);

  let imgFixed   = 0;
  let colorFixed = 0;
  let saved      = 0;

  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];

    if (i % 100 === 0) {
      process.stdout.write(`\r  Processado: ${i}/${candidates.length} | imagens: ${imgFixed} | cores: ${colorFixed}  `);
    }

    try {
      // Buscar produto no ML
      const mlProd = await fetchMLProduct(p.mlId);
      if (!mlProd) continue;

      // Imagem oficial
      const pics = (mlProd.pictures || [])
        .map(pic => (pic.url || pic.secure_url || '').replace('http://', 'https://'))
        .filter(Boolean);

      if (pics.length > 0) {
        if (!p.image) { p.image = pics[0]; imgFixed++; }
        if (!p.images || p.images.length === 0) p.images = pics;
      }

      // Cores se categoria aplicável e pouca cobertura
      if (COLOR_CATS.has(p.category) && (!p.colors || p.colors.length < 2)) {
        const colors = await fetchMLColors(p.mlId);
        if (colors.length > 0) {
          // Mesclar cores existentes
          const existing = new Map((p.colors || []).map(c => [c.name.toLowerCase(), c]));
          for (const c of colors) {
            if (!existing.has(c.name.toLowerCase())) existing.set(c.name.toLowerCase(), c);
          }
          p.colors = Array.from(existing.values()).slice(0, MAX_COLORS);
          colorFixed++;
        }
      }

      // Salvar checkpoint
      saved++;
      if (saved % SAVE_EVERY === 0) {
        fs.writeFileSync(CATALOG_PATH, JSON.stringify(
          { products, lastSync: new Date().toISOString() }, null, 2
        ), 'utf8');
      }

    } catch (err) {
      // Continua no próximo
    }
  }

  process.stdout.write('\n');
  console.log(`  Imagens corrigidas: ${imgFixed}`);
  console.log(`  Produtos com cores enriquecidas: ${colorFixed}`);
  return products;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Quality Fix — CoScore Catalog ===');
  console.log(`Início: ${new Date().toLocaleString('pt-BR')}\n`);

  let catalog  = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  let products = catalog.products || catalog;
  console.log(`Produtos carregados: ${products.length}`);

  // ETAPA 1: Nomes
  products = stage1_cleanNames(products);

  // ETAPA 2: Deduplicação
  products = stage2_deduplicate(products);

  // Salvar após etapas síncronas
  console.log('\nSalvando checkpoint pós-limpeza...');
  fs.writeFileSync(CATALOG_PATH, JSON.stringify({ products, lastSync: new Date().toISOString() }, null, 2), 'utf8');

  // ETAPA 3: Enriquecimento ML (async)
  products = await stage3_enrichML(products);

  // Salvar final
  const finalCatalog = {
    products,
    totalProducts: products.length,
    lastSync: new Date().toISOString(),
  };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(finalCatalog, null, 2), 'utf8');

  console.log('\n=== Resultado Final ===');
  console.log(`Produtos no catálogo: ${products.length}`);
  console.log(`Com imagem: ${products.filter(p => p.image).length}`);
  console.log(`Com cores: ${products.filter(p => p.colors?.length > 0).length}`);
  console.log(`\n⚡ Próximo: node scripts/export-catalog.js`);
}

main().catch(err => { console.error('ERRO:', err); process.exit(1); });
