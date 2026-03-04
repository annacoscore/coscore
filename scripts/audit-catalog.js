#!/usr/bin/env node
/**
 * Auditoria completa do catálogo:
 * 1. Produtos sem imagem ou com imagem suspeita
 * 2. Produtos com nome de cor/tom no título
 * 3. Possíveis duplicatas por nome+marca (diferentes tons do mesmo produto)
 */

const fs = require('fs');
const path = require('path');

// Ler products.ts diretamente (fonte de verdade atual)
const tsContent = fs.readFileSync(path.join(__dirname, '../src/data/products.ts'), 'utf8');
const assignIdx = tsContent.indexOf('= [');
const bracketStart = assignIdx + 2;
let depth = 0, bracketEnd = -1;
for (let i = bracketStart; i < tsContent.length; i++) {
  if (tsContent[i] === '[') depth++;
  else if (tsContent[i] === ']') { depth--; if (depth === 0) { bracketEnd = i; break; } }
}
// Fix unterminated strings by replacing raw newlines inside JSON strings
const rawArray = tsContent.slice(bracketStart, bracketEnd + 1);
// Safe parse: remove control chars inside strings
const safeArray = rawArray.replace(/("(?:[^"\\]|\\.)*")/g, (m) =>
  m.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
);
const products = JSON.parse(safeArray);
console.log(`\nTotal de produtos: ${products.length}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. IMAGENS
// ─────────────────────────────────────────────────────────────────────────────
const noImage = products.filter(p => !p.image || p.image.trim() === '');
const suspiciousImage = products.filter(p => p.image && (
  p.image.includes('placeholder') ||
  p.image.includes('no-image') ||
  p.image.includes('noimage') ||
  !p.image.startsWith('http')
));

console.log(`=== IMAGENS ===`);
console.log(`Sem imagem: ${noImage.length}`);
console.log(`Imagem suspeita: ${suspiciousImage.length}`);
if (noImage.length > 0) {
  console.log('\nProdutos SEM imagem:');
  noImage.slice(0, 20).forEach(p => console.log(`  [${p.category}] ${p.name} (${p.brand}) id=${p.id}`));
  if (noImage.length > 20) console.log(`  ... e mais ${noImage.length - 20}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. NOMES COM COR/TOM
// ─────────────────────────────────────────────────────────────────────────────
// Padrões de tom específico no nome (não descritores genéricos)
const COLOR_SHADE_PATTERNS = [
  // Padrão "Nome - Tom" (tom após tracinho no final)
  /\s+-\s+(?:tom\s+)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)?)$/,
  // Tons de frutas/comida no meio/fim (palavras isoladas)
  /\b(Mango|Manga|Guava|Goiaba|Cherry|Cereja|Berry|Strawberry|Morango|Peach|Pêssego|Melon|Papaya|Pitanga|Cranberry|Caramel|Caramelo|Vanilla|Baunilha|Chocolate|Mocha|Espresso|Latte|Cappuccino|Toffee|Honey|Maple|Cinnamon|Canela|Hazelnut|Cognac|Plum|Ameixa|Mulberry|Merlot|Claret|Scarlet|Mauve|Taupe|Sienna|Amber|Champagne|Ivory|Marfim)\b/,
  // Deusas/conceitos usados como tom
  /\b(Goddess|Deusa|Venus|Aurora|Divine|Celestial|Havana|Sahara|Ibiza)\b/i,
  // Tom após número: "Batom 01 Vermelho", "Base #12 Bege"
  /\b\d{1,3}[A-Z]?\s+[A-Z][a-záéíóúâêôãõç]+/,
];

// Categorias onde faz sentido ter tom no nome
const COLOR_CATS = new Set(['Batom','Base','Corretivo','Blush','Iluminador','Contorno/Bronzer',
  'Sombra','Gloss','Lápis Labial','Delineador','Pó Facial','Pó Solto','Primer','Máscara de Cílios',
  'Fixador de Maquiagem']);

const withColorInName = products.filter(p => {
  if (!COLOR_CATS.has(p.category)) return false;
  return COLOR_SHADE_PATTERNS.some(re => re.test(p.name));
}).slice(0, 50); // limitar saída

console.log(`\n=== NOME COM COR/TOM (amostra) ===`);
console.log(`Encontrados: ${withColorInName.length}`);
withColorInName.forEach(p => {
  const match = COLOR_SHADE_PATTERNS.map(re => p.name.match(re)?.[0]).filter(Boolean)[0];
  console.log(`  [${p.category}] "${p.name}" → possível tom: "${match}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. POSSÍVEIS DUPLICATAS (mesmo nome base + mesma marca)
// ─────────────────────────────────────────────────────────────────────────────
function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // remover tons de cor comuns
    .replace(/\b(mango|manga|guava|cherry|cereja|peach|pessego|nude|coral|rose|red|pink|brown|beige|tan|black|white|espresso|mocha|latte|caramel|chocolate|vanilla|baunilha|honey|amber|gold|silver|plum|mauve|merlot|burgundy|bordeaux)\b/gi, '')
    // remover números de ton
    .replace(/\b\d+[a-z]?\b/g, '')
    // remover pontuação extra
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const nameMap = new Map();
for (const p of products) {
  const key = normalizeName(p.name) + '|' + (p.brand || '').toLowerCase();
  if (!nameMap.has(key)) nameMap.set(key, []);
  nameMap.get(key).push(p);
}

const dupGroups = [...nameMap.values()].filter(g => g.length > 1);
console.log(`\n=== POSSÍVEIS DUPLICATAS ===`);
console.log(`Grupos duplicados: ${dupGroups.length}`);
dupGroups.slice(0, 20).forEach(group => {
  console.log(`\n  GRUPO (${group.length} produtos):`);
  group.forEach(p => console.log(`    [${p.id}] "${p.name}" | cores: ${(p.colors||[]).length}`));
});
if (dupGroups.length > 20) console.log(`  ... e mais ${dupGroups.length - 20} grupos`);

// Salvar resultados para uso nos scripts de correção
const report = {
  total: products.length,
  noImageIds: noImage.map(p => p.id),
  suspiciousImageIds: suspiciousImage.map(p => p.id),
  colorInNameIds: withColorInName.map(p => ({ id: p.id, name: p.name, category: p.category })),
  dupGroups: dupGroups.map(g => g.map(p => ({ id: p.id, name: p.name, brand: p.brand, colorsCount: (p.colors||[]).length }))),
};
fs.writeFileSync(path.join(__dirname, 'audit-report.json'), JSON.stringify(report, null, 2));
console.log(`\nRelatório salvo em scripts/audit-report.json`);
