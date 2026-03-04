/**
 * reclassify-perfumes.js
 * Reclassifica produtos de perfume em "Perfume Feminino" ou "Perfume Masculino"
 */
const fs   = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output/catalog.json');
const raw      = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const products = raw.products || raw;

// Palavras que indicam perfume masculino
const MASC_KEYWORDS = [
  /\b(masculino|homem|homme|men|man|male|pour\s*homme|for\s*men|him)\b/i,
  /\bbleu\s*de\b/i,
  /\baqua\s*di\s*gio\s*(pour\s*homme)?\b/i,
  /\b(sauvage|invictus|aventus|eros|polo|azzaro|dunhill|davidoff|brut|gillette\s*perfume)\b/i,
];

// Palavras que indicam perfume feminino
const FEM_KEYWORDS = [
  /\b(feminino|femme|feminin|pour\s*femme|for\s*women|women|woman|female|her|elle|senhora)\b/i,
  /\b(miss|mademoiselle|chanel\s*n[o°]5|j['']adore|coco\s*mademoiselle|flowerbomb|mon\s*guerlain)\b/i,
];

function classifyPerfume(name, currentCategory) {
  const n = (name || '').toLowerCase();

  // Se já é "Perfume Homem" na categoria original, começa como masculino
  const startsAsHomem = currentCategory === 'Perfume Homem';

  // Detectar masculino explícito
  if (MASC_KEYWORDS.some(p => p.test(name || ''))) return 'Perfume Masculino';

  // Detectar feminino explícito
  if (FEM_KEYWORDS.some(p => p.test(name || ''))) return 'Perfume Feminino';

  // Era "Perfume Homem" sem palavra clara → mantém masculino
  if (startsAsHomem) return 'Perfume Masculino';

  // Padrão: feminino (maioria dos perfumes no catálogo é feminino)
  return 'Perfume Feminino';
}

let femCount = 0, mascCount = 0, unchanged = 0;

for (const p of products) {
  if (p.category !== 'Perfume' && p.category !== 'Perfume Homem') continue;

  const newCat = classifyPerfume(p.name, p.category);
  if (newCat !== p.category) {
    p.category = newCat;
    if (newCat === 'Perfume Feminino') femCount++;
    else mascCount++;
  } else {
    unchanged++;
  }
}

console.log(`Reclassificados:`);
console.log(`  Perfume Feminino: ${femCount}`);
console.log(`  Perfume Masculino: ${mascCount}`);
console.log(`  Já corretos: ${unchanged}`);

// Também corrigir tags que possam ter "Perfume Homem"
for (const p of products) {
  if (Array.isArray(p.tags)) {
    p.tags = p.tags.map(t => t === 'Perfume Homem' ? 'Perfume Masculino' : t === 'Perfume' ? (p.category === 'Perfume Masculino' ? 'Perfume Masculino' : 'Perfume Feminino') : t);
  }
}

// Verificação final
const fem  = products.filter(p => p.category === 'Perfume Feminino').length;
const masc = products.filter(p => p.category === 'Perfume Masculino').length;
const old  = products.filter(p => p.category === 'Perfume' || p.category === 'Perfume Homem').length;
console.log(`\nResultado final:`);
console.log(`  Perfume Feminino: ${fem}`);
console.log(`  Perfume Masculino: ${masc}`);
console.log(`  Ainda antigos: ${old}`);

const output = typeof raw.version !== 'undefined'
  ? { ...raw, products, totalProducts: products.length, lastSync: new Date().toISOString() }
  : products;

fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));
console.log('\nCatálogo salvo!');
