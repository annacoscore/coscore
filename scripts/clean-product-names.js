/**
 * clean-product-names.js
 * Remove variações de cor, tamanho e lixo dos nomes de produtos no catalog.json.
 * Salva o catálogo limpo e atualiza products.ts.
 *
 * Uso: node scripts/clean-product-names.js
 */

const fs   = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');

// ── Padrões de limpeza ────────────────────────────────────────────────────────

// 1. Remove " - Cor XYZ" / ", Cor XYZ" / " Cor 01" no fim ou meio
const COR_PATTERNS = [
  /[\s,\-–]+cor\s*[nº°#]?\s*\d+[a-záéíóúâêîôûãõç\s]{0,30}/gi,
  /[\s,\-–]+cor\s*[nº°#]?\s*[a-záéíóúâêîôûãõç]{2,30}/gi,
  /[\s,\-–]+tom\s*[nº°#]?\s*\d+[a-záéíóúâêîôûãõç\s]{0,30}/gi,
  /[\s,\-–]+tom\s*[nº°#]?\s*[a-záéíóúâêîôûãõç]{2,30}/gi,
  /[\s,\-–]+shade\s+[\w\s]{1,25}/gi,
  /[\s,\-–]+tono\s+[\w\s]{1,25}/gi,
  /[\s,\-–]+colour\s+[\w\s]{1,25}/gi,
  // "cor 420 - corado" / "cor 121- CHOCOLAK"
  /,?\s+cor\s*\d+[a-z\s\-–]{0,30}$/gi,
  // "- Cor Merry" / "Cor Lively" no fim
  /[\s,\-–]+cor\s+[A-ZÁÉÍÓÚ][a-záéíóú\s]{1,25}$/gi,
];

// 2. Remove tamanhos no fim: "6 ml", "30g", "3.5 G", "300 ml"
const SIZE_PATTERNS = [
  /[\s,\-–]+\d+(?:[.,]\d+)?\s*(?:ml|g|gr|mg|kg|oz|l)\b[\s,\-–]*/gi,
];

// 3. Remove códigos numéricos soltos de cor no fim: "Fl431", "56", "Sf-161007"
const CODE_PATTERNS = [
  /\s+[A-Z]{1,3}\d{3,}[-\w]*/g,   // "Fl431", "Sf-161007"
  /\s+\d{2,3}[A-Z]{1,3}\s*$/g,    // "420W", "30N" no fim
];

// 4. Remove nomes de cor comuns quando no fim da frase
const COLOR_NAME_SUFFIX = [
  /[\s,\-–]+(?:vermelho|vermelha|vinho|bord[oô]|ameixa|vinhoso|roxo|lil[aá]s|violeta|azul|verde|amarelo|laranja|preto|preta|branco|branca|cinza|cinzento|cobre|terracota|p[eê]ssego|dourado|prateado|bronze|coral|salm[aã]o|bege|creme|caf[eé]|caramelo|marrom|castanho|nude|natural|neutro|rosa|rosado|rosada|dourado|ivory|sand|golden|silver|nude|merry|lively|corado)\s*$/gi,
];

// 5. Remove sufixos repetidos de categoria
const REPEAT_PATTERNS = [
  // "Batom batom", "base base" duplicados
  /\b(batom|base|blush|sombra|primer|corretivo|delineador|gloss|sérum|serum|hidratante)\s+\1\b/gi,
];

// 6. Limpeza geral de pontuação e separadores no fim/começo
function finalClean(name) {
  return name
    .replace(/\s{2,}/g, ' ')           // espaços duplos
    .replace(/^[\s,\-–\.]+/, '')        // lixo no início
    .replace(/[\s,\-–\.]+$/, '')        // lixo no fim
    .trim();
}

// ── Função principal de limpeza ───────────────────────────────────────────────
function cleanName(original) {
  let name = original;

  // Aplica padrões de cor
  for (const p of COR_PATTERNS) {
    name = name.replace(p, ' ');
  }

  // Aplica padrões de tamanho
  for (const p of SIZE_PATTERNS) {
    name = name.replace(p, ' ');
  }

  // Códigos alfanuméricos de cor
  for (const p of CODE_PATTERNS) {
    name = name.replace(p, '');
  }

  // Nomes de cor no final
  for (const p of COLOR_NAME_SUFFIX) {
    name = name.replace(p, '');
  }

  // Palavras duplicadas
  for (const p of REPEAT_PATTERNS) {
    name = name.replace(p, '$1');
  }

  return finalClean(name);
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  console.log('=== Limpeza de Nomes de Produtos ===\n');

  const catalog  = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products;

  let changed = 0;
  const examples = [];

  for (const product of products) {
    const original = product.name;
    const cleaned  = cleanName(original);

    if (cleaned !== original && cleaned.length >= 5) {
      if (examples.length < 30) {
        examples.push({ antes: original.slice(0, 80), depois: cleaned.slice(0, 80) });
      }
      product.name = cleaned;
      changed++;
    }
  }

  console.log(`Produtos com nome alterado: ${changed} de ${products.length}\n`);
  console.log('Exemplos de alterações:');
  for (const ex of examples) {
    console.log(`  ANTES: ${ex.antes}`);
    console.log(`  DEPOIS: ${ex.depois}`);
    console.log('');
  }

  // Salva catálogo limpo
  catalog.products   = products;
  catalog.lastClean  = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`✅ Catálogo salvo com ${changed} nomes corrigidos.`);
  console.log('\n⚡ Próximo passo: node scripts/export-catalog.js');
}

main();
