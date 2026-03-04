const fs = require('fs');

// Verifica catalog.json
const cat = JSON.parse(fs.readFileSync('scripts/output/catalog.json', 'utf8'));
console.log('catalog.json produtos:', cat.products ? cat.products.length : 0);
console.log('lastSync:', cat.lastSync);

if (cat.products) {
  const brands = {};
  for (const p of cat.products) {
    brands[p.brand] = (brands[p.brand] || 0) + 1;
  }
  const sorted = Object.entries(brands).sort((a, b) => b[1] - a[1]);
  console.log('\nTop 20 marcas no catalog.json:');
  sorted.slice(0, 20).forEach(([b, c]) => console.log(String(c).padStart(5), b));
}
