/**
 * fix-name-artifacts.js
 * Corrige artefatos deixados pela limpeza anterior (preposições no fim, etc.)
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');

// Preposições/conjunções que não devem ficar no fim do nome
const TRAILING_PREPS = /[\s,\-–]+(de|do|da|dos|das|com|para|e|a|o|em|ao|um|uma|por|pra)\s*$/gi;
// Caracteres de lixo no início
const LEADING_JUNK  = /^[\s,\-–&\.]+/;
// Caracteres de lixo no fim
const TRAILING_JUNK = /[\s,\-–&\.\/\|]+$/;

function fixName(name) {
  let n = name;

  // Remove preposições finais (pode ter múltiplas: "para pele seca e")
  for (let i = 0; i < 5; i++) {
    const prev = n;
    n = n.replace(TRAILING_PREPS, '').trim();
    if (n === prev) break;
  }

  // Limpeza de início e fim
  n = n.replace(LEADING_JUNK, '').replace(TRAILING_JUNK, '').trim();

  // Normaliza espaços
  n = n.replace(/\s{2,}/g, ' ').trim();

  return n;
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  let fixed = 0;

  for (const product of catalog.products) {
    const original = product.name;

    // Critérios para corrigir:
    const needsFix =
      /[\s,\-–]+(de|do|da|dos|das|com|para|e|a|o|em|ao)\s*$/.test(original) ||
      /^[\s&,\-–]/.test(original) ||
      original.length < 6;

    if (needsFix) {
      const cleaned = fixName(original);
      if (cleaned !== original && cleaned.length >= 4) {
        product.name = cleaned;
        fixed++;
        console.log(`  FIX: "${original.slice(0,70)}" → "${cleaned.slice(0,70)}"`);
      }
    }
  }

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`\n✅ ${fixed} artefatos corrigidos.`);
}

main();
