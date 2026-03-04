#!/usr/bin/env node
/**
 * Correção de classificação de pincéis/esponjas:
 * - Reverte kits "produto + pincel" de volta à categoria original
 * - Corrige "Base líquida fosca Mary Kay" que está em Esponjas
 * - Move acessórios de tintura de cabelo para categoria correta
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/data/products.ts');
const ts = fs.readFileSync(filePath, 'utf8');

const start = ts.indexOf('= [') + 2;
let depth = 0, end = -1;
for (let i = start; i < ts.length; i++) {
  if (ts[i] === '[') depth++;
  else if (ts[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
}
const rawArr = ts.slice(start, end + 1).replace(/("(?:[^"\\]|\\.)*")/g, m =>
  m.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
);
const products = JSON.parse(rawArr);
console.log('Produtos carregados:', products.length);

let fixed = 0;

for (const p of products) {
  if (p.category !== 'Esponjas e Pincéis') continue;

  const name = p.name || '';
  const nameLower = name.toLowerCase();

  // 1. Kits que contêm produto cosmético + pincel/esponja → volta à categoria cosmética
  //    Identificados pelo "+" no nome e por palavras de produto cosmético
  if (name.includes('+') || name.includes(' com ') || name.includes('com esponja') || name.includes('com pincel')) {
    if (/\b(base|corretivo|sombra|iluminador|contorno|bronzer|paleta|pó|blush|batom)\b/i.test(name)) {
      // Descobrir categoria correta
      let newCat = null;
      if (/\bbase\b/i.test(name) && !/pincel\s+base/i.test(name)) newCat = 'Base';
      else if (/\bsombra|paleta\b/i.test(name)) newCat = 'Sombra';
      else if (/\biluminador\b/i.test(name)) newCat = 'Iluminador';
      else if (/\bcontorno|bronzer\b/i.test(name)) newCat = 'Contorno/Bronzer';
      else if (/\bblush\b/i.test(name) && !/pincel\s+blush/i.test(name)) newCat = 'Blush';
      else if (/\bpó\b/i.test(name) && !/pincel/i.test(name)) newCat = 'Pó Facial';

      if (newCat) {
        console.log(`KIT: "${name}" → ${newCat}`);
        p.category = newCat;
        fixed++;
        continue;
      }
    }
  }

  // 2. Base líquida que entrou aqui por engano
  if (/^base\s+(l[íi]quida|em\s+p[oó]|maquiagem)/i.test(name) && !/pincel/i.test(name)) {
    console.log(`BASE ERRADA: "${name}" → Base`);
    p.category = 'Base';
    fixed++;
    continue;
  }

  // 3. Acessórios de tintura (cumbuca, tigela) → Tintura
  if (/\b(cumbuca|tigela|suporte\s+de\s+pincel).*(tintura|coloração|cabelo)\b/i.test(name) ||
      /\b(tintura|coloração).*(cumbuca|tigela)\b/i.test(name)) {
    console.log(`TINTURA: "${name}" → Tintura`);
    p.category = 'Tintura';
    fixed++;
    continue;
  }

  // 4. Pincel profissional para tintura de cabelo
  if (/pincel.*tinta.*cabelo|pincel.*coloração/i.test(name)) {
    console.log(`TINTURA: "${name}" → Tintura`);
    p.category = 'Tintura';
    fixed++;
    continue;
  }
}

console.log(`\nCorrigidos: ${fixed}`);

if (fixed > 0) {
  const header = ts.slice(0, start - 2);
  const footer = '\n' + ts.slice(end + 1).trimStart();
  const newTs = header
    .replace(/\/\/ Total:.*\n/, `// Total: ${products.length} produtos\n`)
    + '= ' + JSON.stringify(products, null, 2) + ' as Product[];' + footer;
  fs.writeFileSync(filePath, newTs, 'utf8');
  console.log('products.ts salvo.');
}
