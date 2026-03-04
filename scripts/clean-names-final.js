/**
 * clean-names-final.js
 * Remove cores/tons do nome principal dos produtos
 * quando essas cores já estão na lista de variants (colors[]).
 * Também remove artefatos de nome residuais.
 */

const fs   = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output/catalog.json');
const raw      = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const products = raw.products || raw;
console.log('Total:', products.length);

// Padrões de cor que não devem aparecer no nome principal
// (só remove se o produto já tem variações de cor OU se é claramente redundante)
const COLOR_SUFFIX = [
  /\s+[-–]\s+(preto|preta|black)\s*$/i,
  /\s+(preto|preta|black)\s*$/i,
  /\s+[-–]\s+(branco|branca|white)\s*$/i,
  /\s+(tom|shade|cor)\s+[A-Z0-9][^\s]{0,30}\s*$/i,
];

// Prefixos numéricos ("16 Rímel..." → "Rímel...")
const NUM_PREFIX = /^\d+\s+(unid|un|pcs|x\s*)?\s*/i;

// Palavras de marketing desnecessárias em nome
const MARKETING_JUNK = [
  /\boriginal\b/gi,
  /\bauthêntico\b/gi,
  /\bimportado\b/gi,
  /\bnovo\b(?!\s+[a-z])/gi, // "Novo" sozinho no final
];

function cleanName(name, product) {
  if (!name) return name;
  let n = name;

  // Remove prefixo numérico de quantidade ("16 Rímel...")
  n = n.replace(NUM_PREFIX, '');

  // Remove cor no final só se o produto já tem variações de cor
  const hasColors = product.colors && product.colors.length > 1;
  if (hasColors) {
    for (const p of COLOR_SUFFIX) {
      n = n.replace(p, '');
    }
  }

  // Remove marcadores de marketing
  for (const p of MARKETING_JUNK) {
    n = n.replace(p, '');
  }

  // Limpa artefatos de pontuação no final/início
  n = n.replace(/\s*[-–,;:]\s*$/, '').trim();
  n = n.replace(/^\s*[-–,;:]\s*/, '').trim();

  // Colapsa espaços duplos
  n = n.replace(/\s{2,}/g, ' ').trim();

  return n;
}

let changed = 0;
for (const p of products) {
  const cleaned = cleanName(p.name, p);
  if (cleaned !== p.name) {
    // console.log(`  "${p.name}" → "${cleaned}"`);
    p.name = cleaned;
    changed++;
  }
}
console.log(`Nomes corrigidos: ${changed}`);

// Também limpar nomes das cores dentro de cada produto (deduplicar por nome normalizado)
let colorsCleaned = 0;
for (const p of products) {
  if (!p.colors || p.colors.length === 0) continue;
  const seen = new Set();
  const unique = [];
  for (const c of p.colors) {
    // Normaliza nome da cor
    const cn = (c.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!cn || cn === 'variavel' || cn === 'variável' || cn === 'unico' || cn === 'único') {
      // Cor sem nome — só mantém se é a única cor
      if (p.colors.length === 1 || unique.length === 0) unique.push(c);
      continue;
    }
    if (!seen.has(cn)) {
      seen.add(cn);
      unique.push(c);
    } else {
      colorsCleaned++;
    }
  }
  p.colors = unique;
}
console.log(`Variações de cor duplicadas removidas: ${colorsCleaned}`);

// Salvar
const output = typeof raw.version !== 'undefined'
  ? { ...raw, products, totalProducts: products.length, lastSync: new Date().toISOString() }
  : products;

fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log('Catálogo salvo:', products.length, 'produtos');
