/**
 * Verifica produtos que são na verdade a mesma coisa com cor diferente no nome
 * e que deveriam estar agrupados no mesmo produto.
 */
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/catalog.json'), 'utf8'));
const products = raw.products || raw;
console.log('Total:', products.length);

function normBrand(b) {
  return (b || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Limpa cor/tom do nome para comparação
function cleanNameForGroup(n) {
  if (!n) return '';
  return n
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Remove cores/tons específicos
    .replace(/\b(bege|nude|rosa|vermelho|coral|bronze|dourado|prateado|marrom|caramelo|areia|porcelana|mel|cafe|terra|pessego|natural|ocre|salmao|branco|preto|cinza|azul|verde|roxo|lilas|bordo|borgonha|vinho|laranja|amarelo|dourado|prata|ouro|champagne|gold|silver|red|pink|nude|peach|berry|mauve|plum|wine|tawny|taupe|sienna|umber|amber|almond|ivory|sand|beige)\b/g, '')
    // Remove padrões de tom
    .replace(/\b(tom|shade|cor|color)\s+[\w\s]{1,25}/g, '')
    .replace(/\b\d{2,3}[a-z]?\b/g, '')   // "220W", "01", "N30"
    .replace(/[#\-–_]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Agrupar por nome+marca após limpar cor
const groups = {};
for (const p of products) {
  const baseKey = cleanNameForGroup(p.name) + '||' + normBrand(p.brand);
  if (baseKey.length < 5) continue; // ignora nomes muito curtos
  if (!groups[baseKey]) groups[baseKey] = [];
  groups[baseKey].push(p);
}

const multiGroups = Object.entries(groups)
  .filter(([, arr]) => arr.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

console.log('\nGrupos que deveriam ser 1 produto (mesma base + marca):', multiGroups.length);
let totalToMerge = 0;

multiGroups.slice(0, 30).forEach(([key, arr]) => {
  totalToMerge += arr.length - 1;
  console.log(`\n  (${arr.length}x) base: "${key.split('||')[0].slice(0,50)}" | ${arr[0].brand}`);
  arr.forEach(p => {
    const colorCount = p.colors?.length || 0;
    console.log(`     → [${p.id.slice(-6)}] "${p.name?.slice(0,55)}" | ${colorCount} cores`);
  });
});

console.log('\nTotal produtos que podem ser merged:', totalToMerge);
console.log('Total grupos com >1 produto:', multiGroups.length);

// Estatísticas por categoria
const catStats = {};
for (const [, arr] of multiGroups) {
  const cat = arr[0].category || 'Sem categoria';
  catStats[cat] = (catStats[cat] || 0) + (arr.length - 1);
}
console.log('\nDuplicatas por categoria:');
Object.entries(catStats).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c}: ${n}`));
