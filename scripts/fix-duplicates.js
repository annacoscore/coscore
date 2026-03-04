/**
 * fix-duplicates.js
 * 1. Corrige colisões de ID (produtos diferentes com mesmo ID gerado)
 * 2. Mescla duplicatas reais dentro do ML (mesmo nome+marca, MLIDs distintos)
 */

const fs   = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
let products = catalog.products;

console.log(`📦 Total antes da limpeza: ${products.length} produtos`);

// ─── Utilitários ──────────────────────────────────────────────────────────────

function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '').trim();
}

function mergeKey(p) {
  return norm(p.brand) + '|' + norm(p.name).substring(0, 50);
}

let nextId = Date.now();
function newId() {
  return 'p' + (nextId++).toString();
}

// ─── 1. Corrigir colisões de ID ───────────────────────────────────────────────

const idMap = new Map();
let idFixed = 0;

products = products.map(p => {
  if (idMap.has(p.id)) {
    // Este produto tem ID repetido → gera novo
    const fresh = { ...p, id: newId() };
    idFixed++;
    return fresh;
  }
  idMap.set(p.id, true);
  return p;
});

console.log(`🔧 IDs corrigidos: ${idFixed}`);

// ─── 2. Mesclar duplicatas reais ML-ML ────────────────────────────────────────

function mergePrices(existing, incoming) {
  const prices = [...(existing.prices || [])];
  for (const p of (incoming.prices || [])) {
    const alreadyHas = prices.some(
      ep => ep.store === p.store && ep.url === p.url
    );
    if (!alreadyHas) prices.push(p);
  }
  return prices;
}

function mergeColors(existing, incoming) {
  const colors = [...(existing.colors || [])];
  for (const c of (incoming.colors || [])) {
    const alreadyHas = colors.some(ec => norm(ec.name) === norm(c.name));
    if (!alreadyHas) colors.push(c);
  }
  return colors.length > 0 ? colors : undefined;
}

function pickBestImage(a, b) {
  // Prefere imagem que não seja placeholder (picsum) e que seja HTTPS
  const score = img => {
    if (!img) return 0;
    if (img.includes('picsum.photos')) return 1;
    if (img.startsWith('https://')) return 3;
    return 2;
  };
  return score(a) >= score(b) ? a : b;
}

// Agrupa por chave nome+marca
const groups = new Map();
products.forEach(p => {
  const key = mergeKey(p);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
});

const merged  = [];
let dupsMerged = 0;

groups.forEach((group) => {
  if (group.length === 1) {
    merged.push(group[0]);
    return;
  }

  // Ordena: prefere o que tem mais imagens e mais preços
  group.sort((a, b) => {
    const scoreImg = p => (p.images || []).length + (p.image ? 1 : 0);
    const scorePri = p => (p.prices || []).length;
    return (scoreImg(b) + scorePri(b)) - (scoreImg(a) + scorePri(a));
  });

  const base = { ...group[0] };

  for (let i = 1; i < group.length; i++) {
    const other = group[i];
    // Mescla preços
    base.prices = mergePrices(base, other);
    // Mescla cores
    const mergedColors = mergeColors(base, other);
    if (mergedColors) base.colors = mergedColors;
    // Mescla imagens extras
    const extraImgs = (other.images || []).filter(
      img => img && !(base.images || []).includes(img)
    );
    base.images = [...(base.images || []), ...extraImgs];
    // Prefere melhor imagem principal
    base.image = pickBestImage(base.image, other.image);
    // Mescla tags
    const extraTags = (other.tags || []).filter(t => !(base.tags || []).includes(t));
    base.tags = [...(base.tags || []), ...extraTags];
    // Melhor avaliação (mantém a mais alta)
    if ((other.averageRating || 0) > (base.averageRating || 0)) {
      base.averageRating = other.averageRating;
      base.reviewCount   = other.reviewCount;
    }
  }

  dupsMerged += group.length - 1;
  merged.push(base);
});

console.log(`🔗 Duplicatas ML mescladas: ${dupsMerged} (${products.length} → ${merged.length} produtos)`);

// ─── Salva ────────────────────────────────────────────────────────────────────

catalog.products      = merged;
catalog.totalProducts = merged.length;
catalog.lastSync      = new Date().toISOString();

fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
console.log(`✅ catalog.json salvo: ${merged.length} produtos`);
console.log(`\n➡️  Próximo passo: node scripts/export-catalog.js`);
