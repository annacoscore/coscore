#!/usr/bin/env node
/**
 * Corrige todas as categorias renomeadas no products.ts restaurado.
 * Usa a mesma lógica do reclassify-perfumes.js da sessão anterior.
 */
const fs = require('fs');
const path = require('path');

const PRODUCTS_TS = path.join(__dirname, '../src/data/products.ts');

// Ler o arquivo
let content = fs.readFileSync(PRODUCTS_TS, 'utf8');

// --- 1. Perfume Homem → Perfume Masculino ---
const homemBefore = (content.match(/"category": "Perfume Homem"/g) || []).length;
content = content.replace(/"category": "Perfume Homem"/g, '"category": "Perfume Masculino"');
console.log(`Perfume Homem → Perfume Masculino: ${homemBefore}`);

// --- 2. "Perfume", → classificar feminino/masculino por nome ---
// Precisamos analisar cada bloco de produto
const MASC_KEYWORDS = [
  /\b(masculino|homem|homme|men|man|male|pour\s*homme|for\s*men|him)\b/i,
  /\bbleu\s*de\b/i,
  /\baqua\s*di\s*gio\b/i,
  /\b(sauvage|invictus|aventus|eros|polo|azzaro|dunhill|davidoff|brut)\b/i,
];

// Splittar em blocos de produto pelo padrão "  {" no início + "},"
// Usar abordagem de regex global no texto
let femCount = 0;
let mascCount = 0;

// Encontrar todos os blocos com "Perfume" (não Feminino/Masculino/Homem)
// Substituição bloco a bloco
content = content.replace(
  /("name":\s*"([^"]*)"[^{}]*?"category":\s*"Perfume")/g,
  (match, full, name) => {
    const isMasc = MASC_KEYWORDS.some(re => re.test(name));
    if (isMasc) {
      mascCount++;
      return full.replace('"category": "Perfume"', '"category": "Perfume Masculino"');
    } else {
      femCount++;
      return full.replace('"category": "Perfume"', '"category": "Perfume Feminino"');
    }
  }
);

console.log(`Perfume → Perfume Feminino: ${femCount}`);
console.log(`Perfume → Perfume Masculino: ${mascCount}`);

// --- 3. Verificar se ficou algum "Perfume" sem classificar ---
const remaining = (content.match(/"category": "Perfume",/g) || []).length;
if (remaining > 0) {
  // Fallback: tudo que sobrou vai para Feminino
  content = content.replace(/"category": "Perfume",/g, '"category": "Perfume Feminino",');
  console.log(`Fallback Perfume → Perfume Feminino: ${remaining}`);
}

// --- 4. Atualizar o header com nova contagem ---
const total = (content.match(/"id":/g) || []).length;
content = content.replace(/^(\/\/ Total[^\n]*)/m, `// Total: ${total} produtos`);
content = content.replace(/^(\/\/ Última[^\n]*)/m, `// Última atualização: ${new Date().toISOString()}`);

fs.writeFileSync(PRODUCTS_TS, content, 'utf8');
console.log(`\nproducts.ts salvo. Total de produtos: ${total}`);
