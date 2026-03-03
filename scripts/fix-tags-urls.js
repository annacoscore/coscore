const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/data/extra-products.ts');
let c = fs.readFileSync(file, 'utf8');
// Remove first tag when it's a URL: ],['https://...', 'next' -> ],['next'
c = c.replace(/\],\s*\['(https:\/\/[^']+)',\s*'/g, "],['");
fs.writeFileSync(file, c, 'utf8');
console.log('URLs removidas dos arrays de tags.');
