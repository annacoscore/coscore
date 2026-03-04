const fs = require('fs');
const types = fs.readFileSync('src/types/index.ts', 'utf8');
const products = fs.readFileSync('src/data/products.ts', 'utf8');

const prodCats = [...new Set(
  (products.match(/"category": "[^"]+"/g) || [])
    .map(x => x.replace('"category": "', '').replace('"', ''))
)];

const typeCats = [...(types.match(/\| "[^"]+"/g) || [])]
  .map(x => x.replace('| "', '').replace('"', ''));

const missing = prodCats.filter(c => !typeCats.includes(c));
const extra = typeCats.filter(c => !prodCats.includes(c));

console.log('Em products.ts mas NÃO em types:', missing.length ? missing : '(nenhum)');
console.log('Em types mas NÃO em products.ts:', extra.length ? extra : '(nenhum)');
