const fs   = require('fs');
const path = require('path');
const raw      = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/catalog.json'), 'utf8'));
const products = raw.products || raw;

const withMlId    = products.filter(p => p.mlId);
const withColors  = products.filter(p => p.colors && p.colors.length > 0);
const noColors    = products.filter(p => !p.colors || p.colors.length === 0);
const fewColors   = products.filter(p => p.colors && p.colors.length === 1 && p.mlId);

// Categorias onde cores são mais relevantes
const COLOR_CATS = ['Base','Batom','Lápis Labial','Gloss','Blush','Contorno/Bronzer',
  'Iluminador','Sombra','Corretivo','Pó Facial','Primer','Delineador','Máscara de Cílios',
  'Protetor Solar','Fixador de Maquiagem','Tintura','Leave-in'];

const colorCatStats = {};
for (const cat of COLOR_CATS) {
  const inCat = products.filter(p => p.category === cat);
  const withC = inCat.filter(p => p.colors && p.colors.length > 1);
  const noC   = inCat.filter(p => !p.colors || p.colors.length <= 1);
  colorCatStats[cat] = { total: inCat.length, withColors: withC.length, noColors: noC.length };
}

console.log('Total:', products.length);
console.log('Com mlId:', withMlId.length);
console.log('Com cores (>0):', withColors.length);
console.log('Sem cores:', noColors.length);
console.log('Com 1 cor apenas (+ mlId):', fewColors.length);
console.log('\nPor categoria de cor:');
Object.entries(colorCatStats).forEach(([cat, s]) => {
  const pct = s.total > 0 ? Math.round(s.withColors/s.total*100) : 0;
  console.log(`  ${cat.padEnd(25)} ${s.total} total | ${s.withColors} com cores (${pct}%) | ${s.noColors} sem`);
});
