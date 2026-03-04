/**
 * analyze-color-names.js
 * Identifica produtos cujo nome contém tom/cor e os agrupa com possíveis pares
 */
const fs   = require('fs');
const path = require('path');

const raw      = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/catalog.json'), 'utf8'));
const products = raw.products || raw;
console.log('Total produtos:', products.length);

// ── Padrões de cor/tom no nome ────────────────────────────────────────────────
const COLOR_PATTERNS = [
  // Tom numérico com ou sem letra: "Tom 120", "Tom N10", "120W", "220N"
  /\b(tom|shade|cor|color)\s+[A-Z0-9][^\s,;–\-]{0,25}/i,
  // Número seguido de cor: "120 Claro", "30 Bege", "N10 Nude"
  /\b\d{2,3}[A-Z]?\s+[A-ZÁÉÍÓÚ][a-záéíóúã]+/,
  // Cores brutas no final do nome: "- Nude", "– Bege Clara", "Cor Caramelo"
  /\s+[-–]\s+(bege|nude|rosa|vermelho|coral|bronze|dourado|marrom|caramelo|areia|porcelana|mel|café|terra|pêssego|natural|ocre|salmão|branco|preto|chocolate|canela|toffee|ivory|sand|golden|copper|fair|light|medium|dark|deep|warm|cool|beige|almond|chestnut|mahogany|espresso|latte|mocha|tawny|sienna|umber|amber)\b/i,
  // Adjetivos de tom no final: "Claro", "Escuro", "Médio" sozinhos
  /\s+(claro|clara|escuro|escura|médio|média|medio|media|ultra\s*claro|super\s*claro)\s*$/i,
  // Tom no início: "01 Bege Base"
  /^(tom\s+)?[0-9]{2,3}[A-Za-z]?\s/,
];

function hasColorInName(name) {
  if (!name) return false;
  for (const p of COLOR_PATTERNS) {
    if (p.test(name)) return true;
  }
  return false;
}

// Normalização robusta para agrupar produtos com cor no nome
function extractBaseName(name) {
  if (!name) return '';
  let n = name
    .replace(/\s+[-–]\s+(bege|nude|rosa|vermelho|coral|bronze|dourado|marrom|caramelo|areia|porcelana|mel|café|terra|pêssego|natural|ocre|salmão|branco|preto|chocolate|canela|toffee|ivory|sand|golden|copper|fair|light|medium|dark|deep|warm|cool|beige|almond|chestnut|mahogany|espresso|latte|mocha|tawny|sienna|umber|amber)[^,;–\-]*/gi, '')
    .replace(/\b(tom|shade|cor|color)\s+[A-Z0-9][^\s,;–\-]{0,25}/gi, '')
    .replace(/\b\d{2,3}[A-Z]?\s+[A-ZÁÉÍÓÚ][a-záéíóúã]+/g, '')
    .replace(/^(tom\s+)?[0-9]{2,3}[A-Za-z]?\s+/i, '')
    .replace(/\s+(claro|clara|escuro|escura|médio|média|medio|media|ultra\s*claro|super\s*claro)\s*$/i, '')
    .replace(/\s+[-–,;:]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return n;
}

function normKey(n, brand) {
  return (n || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s{2,}/g, ' ').trim()
    + '||' +
    (brand || '').toLowerCase().trim();
}

// ── Mapear produtos com cor no nome ──────────────────────────────────────────
const withColor = products.filter(p => hasColorInName(p.name));
console.log('\nProdutos com cor/tom no nome:', withColor.length);

// Agrupar por nome-base + marca
const groups = {};
for (const p of products) {
  if (!hasColorInName(p.name)) continue;
  const base = extractBaseName(p.name);
  const key  = normKey(base, p.brand);
  if (!groups[key]) groups[key] = { base, brand: p.brand, products: [] };
  groups[key].products.push(p);
}

const multiGroups = Object.values(groups).filter(g => g.products.length > 1);
const singleGroups = Object.values(groups).filter(g => g.products.length === 1);

console.log('Grupos com múltiplos produtos (mesma base+marca):', multiGroups.length);
console.log('Produtos únicos com cor no nome:', singleGroups.length);

// Exibir grupos multiples
console.log('\n── TOP 30 grupos para mesclar ──');
multiGroups
  .sort((a,b) => b.products.length - a.products.length)
  .slice(0, 30)
  .forEach(g => {
    const mlIds = g.products.map(p => p.mlId).filter(Boolean);
    console.log(`\n  (${g.products.length}x) "${g.base.slice(0,50)}" | ${g.brand}`);
    g.products.forEach(p => {
      const colors = p.colors?.map(c => c.name).join(', ') || 'sem cores';
      console.log(`    → "${p.name.slice(0,55)}" | ${p.colors?.length||0} cores: ${colors.slice(0,60)}`);
    });
  });

// Distribuição por categoria
const catMap = {};
for (const p of withColor) {
  catMap[p.category] = (catMap[p.category] || 0) + 1;
}
console.log('\n── Por categoria ──');
Object.entries(catMap).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c}: ${n}`));

// Salvar resultado para uso posterior
const result = {
  multiGroups: multiGroups.map(g => ({
    base: g.base,
    brand: g.brand,
    ids: g.products.map(p => ({ id: p.id, name: p.name, mlId: p.mlId, colors: p.colors?.length || 0 }))
  })),
  singles: singleGroups.map(g => ({
    id: g.products[0].id,
    name: g.products[0].name,
    base: g.base,
    mlId: g.products[0].mlId,
    brand: g.products[0].brand,
    colors: g.products[0].colors?.length || 0
  }))
};
fs.writeFileSync(path.join(__dirname, 'output/color-groups.json'), JSON.stringify(result, null, 2));
console.log('\nResultado salvo em output/color-groups.json');
