#!/usr/bin/env node
/**
 * Aplica correções pontuais de tons nos nomes dos produtos.
 */
const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output/catalog.json');
const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const products = Array.isArray(raw) ? raw : (raw.products || []);

// Correções pontuais: { find, replace, addColor? }
const FIXES = [
  {
    // "Batom Lipstick Crush Mango" — Mango é o tom, já existe em colors
    find: 'Batom Lipstick Crush Mango',
    replace: 'Batom Lipstick Crush',
  },
  {
    // "Batom Italia Deluxe Mousse Matte Lipstick Cherry Lip Tint" — Cherry é o tom
    find: 'Batom Italia Deluxe Mousse Matte Lipstick Cherry Lip Tint',
    replace: 'Batom Italia Deluxe Mousse Matte Lip Tint',
    addColor: 'Cherry',
  },
  {
    // Kit — remover da lista (kit com 2 produtos)
    remove: 'Kit Vizzela Cherry Máscara Cílios Bordô + Lapiseira Retrátil',
  },
];

const toRemove = new Set(FIXES.filter(f => f.remove).map(f => f.remove));
const fixMap = Object.fromEntries(
  FIXES.filter(f => f.find).map(f => [f.find, f])
);

let fixed = 0;
let removed = 0;
const result = [];

for (const p of products) {
  if (toRemove.has(p.name)) {
    console.log(`REMOVIDO: "${p.name}"`);
    removed++;
    continue;
  }

  const fix = fixMap[p.name];
  if (fix) {
    console.log(`CORRIGIDO: "${p.name}" → "${fix.replace}"`);
    p.name = fix.replace;
    if (fix.addColor) {
      if (!p.colors) p.colors = [];
      const already = p.colors.some(c => (c.name||'').toLowerCase() === fix.addColor.toLowerCase());
      if (!already) {
        p.colors.push({ name: fix.addColor, images: p.images ? [...p.images] : [] });
        console.log(`  + cor adicionada: ${fix.addColor}`);
      }
    }
    fixed++;
  }

  result.push(p);
}

console.log(`\nCorrigidos: ${fixed} | Removidos: ${removed}`);

if (Array.isArray(raw)) {
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(result, null, 2), 'utf8');
} else {
  raw.products = result;
  raw.totalProducts = result.length;
  raw.lastSync = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(raw, null, 2), 'utf8');
}
console.log('catalog.json salvo.');
