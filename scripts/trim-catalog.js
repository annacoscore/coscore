/**
 * trim-catalog.js
 * Filtra o catalog.json para manter apenas os melhores produtos por categoria,
 * remove nÃ£o-cosmÃ©ticos (calculadora Casio, etc.) e salva uma versÃ£o limpa.
 *
 * Uso: node scripts/trim-catalog.js
 */

const fs   = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const OUTPUT_PATH  = path.join(__dirname, 'output', 'catalog.json');

// MÃ¡ximo de produtos por categoria
const MAX_PER_CATEGORY = {
  // Maquiagem
  'Batom':                 250,
  'Base':                  250,
  'MÃ¡scara de CÃ­lios':     200,
  'Sombra':                200,
  'Blush':                 200,
  'Iluminador':            200,
  'Corretivo':             200,
  'Contorno/Bronzer':      200,
  'Primer':                200,
  'Delineador':            200,
  'Gloss':                 200,
  'LÃ¡pis Labial':          150,
  'Fixador de Maquiagem':  150,
  'PÃ³ Facial':             200,
  'Esponjas e PincÃ©is':    200,
  // Skincare
  'SÃ©rum':                 200,
  'Hidratante':            200,
  'Protetor Solar':        150,
  'TÃ´nico Facial':         150,
  'Limpeza Facial':        150,
  'MÃ¡scara Facial':        150,
  'Esfoliante':            150,
  'Creme para Olhos':      150,
  // Perfumes
  'Perfume':               250,
  'Perfume Masculino':         200,
  // Cabelo
  'Shampoo':               200,
  'Condicionador':         200,
  'MÃ¡scara Capilar':       200,
  'Leave-in':              200,
  'Ã“leo Capilar':          150,
  'Finalizador':           200,
  'Tintura':               200,
  'Cabelo Homem':          150,
};

// Palavras que indicam que o produto NÃƒO Ã© cosmÃ©tico (filtro de lixo)
const NON_COSMETIC_NAMES = [
  'calculadora', 'casio', 'notebook', 'celular', 'smartphone', 'tablet',
  'fone', 'headphone', 'carregador', 'cabo usb', 'webcam', 'teclado', 'mouse',
  'brinquedo', 'jogo', 'game', 'console', 'cuecas', 'calÃ§a', 'camiseta',
  'tÃªnis', 'sapato', 'mochila', 'bolsa couro', 'cinto', 'relÃ³gio',
  'vibrador', 'vibe', 'sex toy', 'plug anal',
  'suplemento', 'whey protein', 'creatina', 'bcaa',
  'remÃ©dio', 'medicamento', 'vitamina comprimido',
  'pÃ¡ de jardim', 'vassoura', 'rodo',
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
  'colÃ´nia masculina', 'colonia masculina', 'deo parfum masc',
];
const MASCULINE_KEYWORDS_HAIR = [
  'masculino', 'homem', 'barba', 'for men', 'men ', 'man ',
];

function recategorize(product) {
  const name = (product.name || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const full = name + ' ' + desc;

  // Perfume Feminino â†’ Perfume Homem se for masculino
  if (product.category === 'Perfume') {
    if (MASCULINE_KEYWORDS_PERFUME.some(k => full.includes(k))) {
      return { ...product, category: 'Perfume Masculino', subcategory: 'Perfume Masculino' };
    }
  }

  // Shampoo/Condicionador/etc â†’ Cabelo Homem se masculino e nÃ£o for loÃ§Ã£o corporal
  if (['Shampoo', 'Condicionador', 'Finalizador'].includes(product.category)) {
    if (MASCULINE_KEYWORDS_HAIR.some(k => full.includes(k))) {
      return { ...product, category: 'Cabelo Homem', subcategory: 'Cabelo Homem' };
    }
  }

  return product;
}

// Normaliza nome para deduplicaÃ§Ã£o interna
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

  // Remove nÃ£o-cosmÃ©ticos
  const filtered = all.filter(p => !isNonCosmetic(p));
  console.log(`ApÃ³s remoÃ§Ã£o de nÃ£o-cosmÃ©ticos: ${filtered.length}`);

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

  // Para cada categoria, deduplicar internamente e limitar ao mÃ¡ximo
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

  // Ordena: masculino por Ãºltimo
  const maleCategories = new Set(['Cabelo Homem', 'Perfume Masculino']);
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

  // Salva catÃ¡logo trimado
  const trimmed = {
    ...catalog,
    products: kept,
    total: kept.length,
    lastTrim: new Date().toISOString(),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
  console.log(`\nâœ… Salvo em: ${OUTPUT_PATH}`);
  console.log(`âš¡ PrÃ³ximo passo: node scripts/export-catalog.js`);
}

main();

