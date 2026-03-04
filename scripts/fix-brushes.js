#!/usr/bin/env node
/**
 * Corrige pincéis e esponjas em categorias erradas,
 * movendo-os para "Esponjas e Pincéis".
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/data/products.ts');
const ts = fs.readFileSync(filePath, 'utf8');

// Parse seguro
const start = ts.indexOf('= [') + 2;
let depth = 0, end = -1;
for (let i = start; i < ts.length; i++) {
  if (ts[i] === '[') depth++;
  else if (ts[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
}
const rawArr = ts.slice(start, end + 1);
const safeArr = rawArr.replace(/("(?:[^"\\]|\\.)*")/g, m =>
  m.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
);
const products = JSON.parse(safeArr);
console.log('Produtos carregados:', products.length);

// Palavras que indicam pincel ou esponja
const BRUSH_PATTERN = /\b(pincel|pincéis|brush(?:es)?|esponja|blender|kabuki|fan\s*brush|sponge|beauty\s*blender|esponjinha|aplicador de|applicator)\b/i;

// Categorias que NÃO devem conter pincéis (se o nome tiver pincel/esponja, mover)
const WRONG_CATS = new Set([
  'Batom','Base','Corretivo','Blush','Iluminador','Contorno/Bronzer',
  'Sombra','Gloss','Lápis Labial','Delineador','Pó Facial','Pó Solto',
  'Primer','Máscara de Cílios','Fixador de Maquiagem','Sérum',
  'Hidratante','Protetor Solar','Tônico Facial','Limpeza Facial',
  'Máscara Facial','Esfoliante','Creme para Olhos',
  'Shampoo','Condicionador','Máscara Capilar','Leave-in',
  'Finalizador','Óleo Capilar','Tintura',
  'Perfume Feminino','Perfume Masculino',
]);

// Palavras que indicam que é parte do nome do produto e NÃO um pincel
// Ex: "Foundation Brush" num contexto de base ainda é pincel, mas 
// "Brush-On Powder" pode ser pó. Vamos ser conservadores.
const EXCLUDE_PATTERN = /brush.on|brush-on|bronzer brush effect|blush brush effect/i;

let moved = 0;
const moved_list = [];

for (const p of products) {
  if (p.category === 'Esponjas e Pincéis') continue; // já correto
  if (!WRONG_CATS.has(p.category)) continue; // categoria que pode ter pincel no nome
  if (!BRUSH_PATTERN.test(p.name)) continue; // nome não menciona pincel/esponja
  if (EXCLUDE_PATTERN.test(p.name)) continue; // falso positivo

  moved_list.push({ from: p.category, name: p.name });
  p.category = 'Esponjas e Pincéis';
  moved++;
}

console.log('\nProdutos movidos para "Esponjas e Pincéis":');
moved_list.forEach(m => console.log(`  [${m.from}] ${m.name}`));
console.log(`\nTotal movido: ${moved}`);

// Verificar também o inverso: produtos em Esponjas e Pincéis que não são pincéis
const CORRECT_CAT = 'Esponjas e Pincéis';
const NOT_BRUSH = products.filter(p =>
  p.category === CORRECT_CAT && !BRUSH_PATTERN.test(p.name + ' ' + (p.tags || []).join(' '))
);

if (NOT_BRUSH.length > 0) {
  console.log('\nProdutos em "Esponjas e Pincéis" que PODEM estar errados:');
  NOT_BRUSH.forEach(p => console.log(`  [${p.id}] ${p.name}`));
}

// Salvar
if (moved > 0) {
  const header = ts.slice(0, start - 2);
  const footer = '\n' + ts.slice(end + 1).trimStart();
  const newTs = header
    .replace(/\/\/ Total:.*\n/, `// Total: ${products.length} produtos\n`)
    + '= ' + JSON.stringify(products, null, 2) + ' as Product[];' + footer;
  fs.writeFileSync(filePath, newTs, 'utf8');
  console.log('\nproducts.ts salvo.');
} else {
  console.log('\nNenhuma alteração necessária.');
}
