/**
 * trim-catalog.js
 * Filtra o catalog.json para manter apenas os melhores produtos por categoria,
 * remove não-cosméticos (calculadora Casio, etc.) e salva uma versão limpa.
 *
 * Uso: node scripts/trim-catalog.js
 */

const fs   = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const OUTPUT_PATH  = path.join(__dirname, 'output', 'catalog.json');

// Máximo de produtos por categoria
const MAX_PER_CATEGORY = {
  // Maquiagem
  'Batom':                 250,
  'Base':                  250,
  'Máscara de Cílios':     200,
  'Sombra':                200,
  'Blush':                 200,
  'Iluminador':            200,
  'Corretivo':             200,
  'Contorno/Bronzer':      200,
  'Primer':                200,
  'Delineador':            200,
  'Gloss':                 200,
  'Lápis Labial':          150,
  'Fixador de Maquiagem':  150,
  'Pó Facial':             200,
  'Esponjas e Pincéis':    200,
  // Skincare
  'Sérum':                 200,
  'Hidratante':            200,
  'Protetor Solar':        150,
  'Tônico Facial':         150,
  'Limpeza Facial':        150,
  'Máscara Facial':        150,
  'Esfoliante':            150,
  'Creme para Olhos':      150,
  // Perfumes
  'Perfume':               250,
  'Perfume Homem':         200,
  // Cabelo
  'Shampoo':               200,
  'Condicionador':         200,
  'Máscara Capilar':       200,
  'Leave-in':              200,
  'Óleo Capilar':          150,
  'Finalizador':           200,
  'Tintura':               200,
  'Cabelo Homem':          150,
};

// Palavras que indicam que o produto NÃO é cosmético (filtro de lixo)
const NON_COSMETIC_NAMES = [
  'calculadora', 'casio', 'notebook', 'celular', 'smartphone', 'tablet',
  'fone', 'headphone', 'carregador', 'cabo usb', 'webcam', 'teclado', 'mouse',
  'brinquedo', 'jogo', 'game', 'console', 'cuecas', 'calça', 'camiseta',
  'tênis', 'sapato', 'mochila', 'bolsa couro', 'cinto', 'relógio',
  'vibrador', 'vibe', 'sex toy', 'plug anal',
  'suplemento', 'whey protein', 'creatina', 'bcaa',
  'remédio', 'medicamento', 'vitamina comprimido',
  'pá de jardim', 'vassoura', 'rodo',
];

function isNonCosmetic(product) {
  const name = (product.name || '').toLowerCase();
  const brand = (product.brand || '').toLowerCase();
  const full = name + ' ' + brand;
  return NON_COSMETIC_NAMES.some(w => full.includes(w));
}

// Re-categoriza produtos masculinos incorretamente classificados
const MASCULINE_KEYWORDS_PERFUME = [
  'masculino', 'homme', 'man ', 'men ', 'for men', 'for man', ' male',
  'colônia masculina', 'colonia masculina', 'deo parfum masc',
];
const MASCULINE_KEYWORDS_HAIR = [
  'masculino', 'homem', 'barba', 'for men', 'men ', 'man ',
];

function recategorize(product) {
  const name = (product.name || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const full = name + ' ' + desc;

  // Perfume Feminino → Perfume Homem se for masculino
  if (product.category === 'Perfume') {
    if (MASCULINE_KEYWORDS_PERFUME.some(k => full.includes(k))) {
      return { ...product, category: 'Perfume Homem', subcategory: 'Perfume Homem' };
    }
  }

  // Shampoo/Condicionador/etc → Cabelo Homem se masculino e não for loção corporal
  if (['Shampoo', 'Condicionador', 'Finalizador'].includes(product.category)) {
    if (MASCULINE_KEYWORDS_HAIR.some(k => full.includes(k))) {
      return { ...product, category: 'Cabelo Homem', subcategory: 'Cabelo Homem' };
    }
  }

  return product;
}

// Normaliza nome para deduplicação interna
function normKey(p) {
  const n = (p.name || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(cor|tom|original|novo|kit|de|e|a|ml|g|gr|un)\b/gi, '')
    .replace(/\b\d+\s*(?:ml|g|gr|oz|mg|un)?\b/gi, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const b = (p.brand || '').toLowerCase().trim().slice(0, 20);
  return `${n}||${b}`;
}

function main() {
  console.log('=== Trim Catalog ===\n');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const all = catalog.products || [];
  console.log(`Produtos antes do trim: ${all.length}`);

  // Remove não-cosméticos
  const filtered = all.filter(p => !isNonCosmetic(p));
  console.log(`Após remoção de não-cosméticos: ${filtered.length}`);

  // Re-categoriza produtos masculinos
  const recategorized = filtered.map(recategorize);
  const recatCount = recategorized.filter((p, i) => p.category !== filtered[i].category).length;
  console.log(`Re-categorizados: ${recatCount} produtos`);

  // Agrupa por categoria
  const byCategory = {};
  for (const p of recategorized) {
    const cat = p.category || 'Outros';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }

  // Para cada categoria, deduplicar internamente e limitar ao máximo
  const kept = [];
  const catStats = {};

  for (const [cat, products] of Object.entries(byCategory)) {
    const max = MAX_PER_CATEGORY[cat] || 100;
    const seen = new Set();
    const unique = [];

    for (const p of products) {
      const key = normKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
      if (unique.length >= max) break;
    }

    kept.push(...unique);
    catStats[cat] = unique.length;
  }

  // Ordena: masculino por último
  const maleCategories = new Set(['Cabelo Homem', 'Perfume Homem']);
  kept.sort((a, b) => {
    const aM = maleCategories.has(a.category) ? 1 : 0;
    const bM = maleCategories.has(b.category) ? 1 : 0;
    return aM - bM;
  });

  // Resultado
  console.log('\nProdutos por categoria:');
  const sortedStats = Object.entries(catStats).sort((a, b) => b[1] - a[1]);
  for (const [cat, n] of sortedStats) {
    console.log(`  ${n.toString().padStart(4)}  ${cat}`);
  }

  console.log(`\nTotal final: ${kept.length} produtos`);

  // Salva catálogo trimado
  const trimmed = {
    ...catalog,
    products: kept,
    total: kept.length,
    lastTrim: new Date().toISOString(),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
  console.log(`\n✅ Salvo em: ${OUTPUT_PATH}`);
  console.log(`⚡ Próximo passo: node scripts/export-catalog.js`);
}

main();
