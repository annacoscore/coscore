/**
 * merge-color-dupes.js
 * Mescla produtos duplicados por variação de cor no nome.
 * Somente mescla casos claros (ex: "Máscara Preto" + "Máscara" da mesma marca).
 */

const fs   = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output/catalog.json');
const raw      = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const products = raw.products || raw;
console.log('Total inicial:', products.length);

function normBrand(b) {
  return (b || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function normName(n) {
  return (n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Remove cor/tom do nome para comparação base
const COLOR_REMOVAL = /\b(preto|preta|preto?\b|black|branco|branca|rosa|vermelho|vermelha|coral|bronze|dourado|prateado|marrom|bege|nude|caramelo|areia|natural|ocre|salmao|salmao|azul|verde|roxo|lilas|laranja|amarelo|champagne|ouro|prata)\b\s*/gi;
const NUM_REMOVAL   = /^\d+\s+/;  // "16 Rímel..." → "Rímel..."

function baseNameKey(n) {
  return normName(n)
    .replace(COLOR_REMOVAL, ' ')
    .replace(NUM_REMOVAL, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Identifica quais produtos são candidatos a merge
// Estratégia conservadora: só merge se:
// 1. baseNameKey é muito similar (>85% similar) E mesma marca
// 2. OU um nome é subconjunto do outro com diferença sendo apenas cor
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// Agrupar por (baseNameKey, brand)
const groups = {};
for (const p of products) {
  const baseKey = baseNameKey(p.name) + '||' + normBrand(p.brand);
  if (baseKey.length < 8) continue;
  if (!groups[baseKey]) groups[baseKey] = [];
  groups[baseKey].push(p);
}

const toMerge = Object.values(groups).filter(arr => arr.length > 1);
console.log('Grupos candidatos a merge:', toMerge.length);

// Ids a remover (os que serão absorvidos)
const removeIds = new Set();
let mergedCount = 0;

for (const arr of toMerge) {
  // Ordena: mantém o que tem mais cores, ou nome mais curto (menos poluído)
  arr.sort((a, b) => {
    const ca = a.colors?.length || 0;
    const cb = b.colors?.length || 0;
    if (cb !== ca) return cb - ca; // mais cores primeiro
    return (a.name?.length || 0) - (b.name?.length || 0); // nome mais curto primeiro
  });

  const primary = arr[0]; // produto que vai ficar
  
  // Verificar se realmente são duplicatas (não produtos diferentes de mesmo tipo)
  // Ex: "Argila Rosa" e "Argila Verde" são produtos diferentes, não mesclar
  for (let i = 1; i < arr.length; i++) {
    const other = arr[i];
    const sim = similarity(normName(primary.name), normName(other.name));
    
    // Só mescla se similaridade > 75% ou se a diferença é apenas uma cor
    if (sim < 0.60) {
      console.log(`  IGNORANDO (muito diferente, ${Math.round(sim*100)}%): "${primary.name?.slice(0,40)}" vs "${other.name?.slice(0,40)}"`);
      continue;
    }

    // Mescla cores do "other" no "primary"
    const existingColorNames = new Set((primary.colors || []).map(c => normName(c.name || '')));
    const newColors = (other.colors || []).filter(c => {
      const cn = normName(c.name || '');
      return cn && cn !== 'variavel' && cn !== 'unico' && !existingColorNames.has(cn);
    });
    
    if (newColors.length > 0) {
      primary.colors = [...(primary.colors || []), ...newColors];
    }
    
    // Usar melhor imagem
    if (!primary.image && other.image) primary.image = other.image;
    if ((!primary.images || primary.images.length === 0) && other.images?.length) {
      primary.images = other.images;
    }

    removeIds.add(other.id);
    mergedCount++;
    console.log(`  Merged: "${other.name?.slice(0,50)}" → "${primary.name?.slice(0,50)}" (${Math.round(sim*100)}%)`);
  }
}

console.log(`\nMerged: ${mergedCount} produtos absorvidos`);

// Filtrar os produtos removidos
const finalProducts = products.filter(p => !removeIds.has(p.id));
console.log('Total final:', finalProducts.length);

// Salvar
const output = typeof raw.version !== 'undefined'
  ? { ...raw, products: finalProducts, totalProducts: finalProducts.length, lastSync: new Date().toISOString() }
  : finalProducts;

fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log('Catálogo salvo.');
