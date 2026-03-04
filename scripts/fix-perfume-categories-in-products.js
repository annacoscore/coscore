#!/usr/bin/env node
/**
 * Corrige categorias de Perfume no products.ts restaurado.
 * Processa o arquivo linha a linha mantendo contexto do nome do produto atual.
 */
const fs = require('fs');
const path = require('path');

const PRODUCTS_TS = path.join(__dirname, '../src/data/products.ts');

const MASC_KEYWORDS = [
  /\b(masculino|homem|homme|men|man|male|pour\s*homme|for\s*men|him)\b/i,
  /\bbleu\s*de\b/i,
  /\b(sauvage|invictus|aventus|eros|polo|azzaro|dunhill|davidoff|brut)\b/i,
];

function classifyPerfume(name) {
  if (MASC_KEYWORDS.some(p => p.test(name || ''))) return 'Perfume Masculino';
  return 'Perfume Feminino';
}

const lines = fs.readFileSync(PRODUCTS_TS, 'utf8').split('\n');
const out = [];
let currentName = '';
let fixedHomem = 0, fixedFem = 0, fixedMasc = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Capturar nome do produto atual
  const nameMatch = line.match(/"name"\s*:\s*"([^"]+)"/);
  if (nameMatch) currentName = nameMatch[1];

  // Corrigir "Perfume Homem" → "Perfume Masculino"
  if (line.includes('"category": "Perfume Homem"')) {
    out.push(line.replace('"Perfume Homem"', '"Perfume Masculino"'));
    fixedHomem++;
    continue;
  }

  // Corrigir "Perfume" isolado (não "Perfume Feminino" nem "Perfume Masculino")
  if (/"category"\s*:\s*"Perfume"/.test(line)) {
    const newCat = classifyPerfume(currentName);
    out.push(line.replace('"Perfume"', `"${newCat}"`));
    if (newCat === 'Perfume Masculino') fixedMasc++;
    else fixedFem++;
    continue;
  }

  out.push(line);
}

console.log(`Perfume Homem → Masculino: ${fixedHomem}`);
console.log(`Perfume → Feminino: ${fixedFem}`);
console.log(`Perfume → Masculino: ${fixedMasc}`);
console.log(`Total: ${fixedHomem + fixedFem + fixedMasc}`);

fs.writeFileSync(PRODUCTS_TS, out.join('\n'), 'utf8');
console.log('products.ts atualizado.');
