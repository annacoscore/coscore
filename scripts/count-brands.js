const fs = require('fs');
const catalog = JSON.parse(fs.readFileSync('scripts/output/catalog.json', 'utf8'));
const brands = {};
for (const p of catalog.products) {
  brands[p.brand] = (brands[p.brand] || 0) + 1;
}
const sorted = Object.entries(brands).sort((a, b) => b[1] - a[1]);
console.log('Total produtos:', catalog.products.length);
console.log('\nTop 20 marcas:');
sorted.slice(0, 20).forEach(([b, c]) => console.log(String(c).padStart(4), b));
