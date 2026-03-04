const fs = require('fs');

let content = fs.readFileSync('src/data/products.ts', 'utf8');

// Count before
const countBrilho = (content.match(/"category": "Brilho Labial"/g) || []).length;
const countContorno = (content.match(/"category": "Contorno"/g) || []).length;
const countPerfume = (content.match(/"category": "Perfume"/g) || []).length;

console.log(`Before: Brilho Labial=${countBrilho}, Contorno=${countContorno}, Perfume=${countPerfume}`);

// Fix Brilho Labial -> Gloss
content = content.replace(/"category": "Brilho Labial"/g, '"category": "Gloss"');

// Fix Contorno -> Contorno/Bronzer
content = content.replace(/"category": "Contorno"/g, '"category": "Contorno/Bronzer"');

// Fix Perfume -> need to check name for each
// Parse all products with category "Perfume" and reclassify
const MASC_KEYWORDS = [
  /\b(masculino|homem|homme|men|man|male|pour\s*homme|for\s*men|him)\b/i,
  /\bbleu\s*de\b/i,
  /\b(sauvage|invictus|aventus|eros|polo|azzaro|dunhill|davidoff|brut)\b/i,
];

// Replace remaining "Perfume" categories inline
content = content.replace(
  /("name": "([^"]+)"[^}]*?"category": "Perfume")/g,
  (match, full, name) => {
    const isMasc = MASC_KEYWORDS.some(p => p.test(name));
    const newCat = isMasc ? 'Perfume Masculino' : 'Perfume Feminino';
    return full.replace('"category": "Perfume"', `"category": "${newCat}"`);
  }
);

// Verify
const afterBrilho = (content.match(/"category": "Brilho Labial"/g) || []).length;
const afterContorno = (content.match(/"category": "Contorno"/g) || []).length;
const afterPerfume = (content.match(/"category": "Perfume"/g) || []).length;
const afterGloss = (content.match(/"category": "Gloss"/g) || []).length;
const afterCB = (content.match(/"category": "Contorno\/Bronzer"/g) || []).length;
const afterPF = (content.match(/"category": "Perfume Feminino"/g) || []).length;
const afterPM = (content.match(/"category": "Perfume Masculino"/g) || []).length;

console.log(`After: Brilho Labial=${afterBrilho}, Contorno=${afterContorno}, Perfume=${afterPerfume}`);
console.log(`New: Gloss=${afterGloss}, Contorno/Bronzer=${afterCB}, Perfume Feminino=${afterPF}, Perfume Masculino=${afterPM}`);

fs.writeFileSync('src/data/products.ts', content, 'utf8');
console.log('Done!');
