#!/usr/bin/env node
/**
 * Reconstrói catalog.json a partir de src/data/products.ts
 * Suporta arquivos grandes com parsing manual do array JSON.
 */
const fs = require('fs');
const path = require('path');

const PRODUCTS_TS = path.join(__dirname, '../src/data/products.ts');
const CATALOG_OUT = path.join(__dirname, 'output/catalog.json');

const content = fs.readFileSync(PRODUCTS_TS, 'utf8');

// Encontrar "= [" que inicia o array de produtos (após "Product[] =")
const assignIdx = content.indexOf('= [');
if (assignIdx === -1) {
  console.error('Não foi possível encontrar o array products no arquivo.');
  process.exit(1);
}

const bracketStart = assignIdx + 2;

// Encontrar o colchete de fechamento correspondente
let depth = 0;
let bracketEnd = -1;
for (let i = bracketStart; i < content.length; i++) {
  if (content[i] === '[') depth++;
  else if (content[i] === ']') {
    depth--;
    if (depth === 0) { bracketEnd = i; break; }
  }
}

if (bracketEnd === -1) {
  console.error('Array não fechado corretamente.');
  process.exit(1);
}

const arrayStr = content.slice(bracketStart, bracketEnd + 1);

let products;
try {
  products = JSON.parse(arrayStr);
} catch (e) {
  console.error('Erro ao parsear products:', e.message);
  // Tentar localizar a linha com problema
  const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
  console.error('Trecho com problema:', arrayStr.slice(Math.max(0, pos - 50), pos + 50));
  process.exit(1);
}

console.log(`Lidos ${products.length} produtos de products.ts`);

// Ler metadados do catalog existente
let existingMeta = {};
try {
  existingMeta = JSON.parse(fs.readFileSync(CATALOG_OUT, 'utf8'));
} catch (e) { /* sem catalog existente */ }

const catalog = {
  version: existingMeta.version || '1.0',
  lastSync: new Date().toISOString(),
  totalProducts: products.length,
  products,
};

fs.writeFileSync(CATALOG_OUT, JSON.stringify(catalog, null, 2), 'utf8');
console.log(`catalog.json reconstruído com ${products.length} produtos.`);
