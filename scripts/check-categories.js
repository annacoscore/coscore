const fs = require('fs');
const c = fs.readFileSync('src/data/products.ts', 'utf8');
const m = c.match(/"category": "[^"]+"/g);
const unique = [...new Set(m)].sort();
unique.forEach(x => console.log(x));
console.log('\nTotal de categorias únicas:', unique.length);
// Contar produtos por categoria
const counts = {};
m.forEach(x => { counts[x] = (counts[x]||0)+1; });
Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([cat,n]) => console.log(n, cat));
