#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ts = fs.readFileSync(path.join(__dirname, '../src/data/products.ts'), 'utf8');
const start = ts.indexOf('= [') + 2;
let depth = 0, end = -1;
for (let i = start; i < ts.length; i++) {
  if (ts[i] === '[') depth++;
  else if (ts[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
}
const arr = ts.slice(start, end + 1).replace(/("(?:[^"\\]|\\.)*")/g, m =>
  m.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
);
const products = JSON.parse(arr);

const inCat = products.filter(p => p.category === 'Esponjas e Pincéis');
console.log('Total em Esponjas e Pincéis:', inCat.length);
inCat.forEach(p => console.log(' -', p.name));
