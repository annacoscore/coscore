const fs = require('fs');
const content = fs.readFileSync('src/data/products.ts','utf8');
// buscar produtos com mlId que começam com MLB27, MLB59, MLB63, etc (os novos)
const newMlPattern = /"mlId":\s*"(MLB[0-9]+)"/g;
const matches = Array.from(content.matchAll(/"id":\s*"([^"]+)"[^}]+?"name":\s*"([^"]+)"[^}]+?"brand":\s*"([^"]+)"[^}]+?"category":\s*"([^"]+)"/g));
const last = matches.slice(-25);
console.log('Últimos 25 produtos:');
last.forEach(m => console.log(`  [${m[4]}] ${m[3].slice(0,18)} — ${m[2].slice(0,55)}`));
