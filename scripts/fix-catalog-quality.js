/**
 * fix-catalog-quality.js
 * 1. Remove produtos não-cosméticos do catálogo (organizadores acrílicos, kits infantis, etc.)
 * 2. Reclassifica esponjas/pincéis que estão na categoria errada
 * 3. Remove ferramentas de tintura que não são cosméticos
 *
 * Uso: node scripts/fix-catalog-quality.js
 */

const fs   = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');

// ── 1. Palavras que indicam NÃO é um cosmético (produto para ser removido) ─────
const NON_COSMETIC = [
  // Organizadores/porta-maquiagem
  /\borganizador\b.*\b(acrílico|acrilico|batom|pincel|maquiagem)\b/i,
  /\bporta[\s-]?(batom|maquiagem|pincel|esmalte)\b/i,
  /\bporta\s+maquiagem\b/i,
  // Kits infantis
  /\b(maquiagem|kit)\s+(infantil|criança|criancas|sereia)\b/i,
  /\bkit\s+maquiagem\s+infantil\b/i,
  /\bkit\s+de\s+maquiagem\s+iantil\b/i,  // typo do ML
  // Caixas/estojos de armazenamento
  /\bcaixa\s+(porta|organizador|de\s+papelão)\b/i,
  /\bestojo\s+de\s+maquiagem\b.*\binfantil\b/i,
  // Embalagens vazias
  /\bembalagem\s+vazia\b/i,
  /\bbastão\s+embalagem\s+vazia\b/i,
  // Ferramentas de tintura (não cosméticos)
  /\b(cumbuca|tigela|tigelas)\s*(plast|graduada|com\s+suporte)?\s*(para|com)\s*(tintura|coloraç)/i,
  /\bbolsa\s*\+\s*pincel\s+para\s+tintura\b/i,
  // Acessórios de cozinha/casa erroneamente no catálogo
  /\bcalculadora\b/i,
  /\bvibrador\b/i,
  /\bvibe\s+toys?\b/i,
];

// ── 2. Palavras que indicam que o produto DEVE ir para Esponjas e Pincéis ─────
const RECLASSIFY_TO_BRUSH = [
  // Pincéis puros (não acompanhamento de produto)
  /^conjunto\s+de\s+\d+\s+pincéis?\b/i,
  /^kit\s+de\s+pincéis?\b/i,
  /^set\s+de?\s+pincéis?\b/i,
  /^pincéis?\s+(de\s+maquiagem|profissional|para\s+maquiagem)\b/i,
  /\bpincel\s+profissional\s+c\/\s*pente\s+tinta\s+cabelo\b/i,
  /\bpincel\s+de\s+rímel\s+rígido\b/i,
];

// ── 3. Categorias de origem onde estão mal classificados ───────────────────────
const BRUSH_SOURCE_CATEGORIES = new Set([
  'Batom', 'Base', 'Blush', 'Sombra', 'Iluminador',
  'Contorno/Bronzer', 'Corretivo', 'Pó Facial', 'Primer',
  'Máscara de Cílios', 'Máscara Facial', 'Tintura',
]);

// Produtos de Tintura que são pincéis de tintura (ferramentas de cabelo)
const HAIR_DYE_BRUSH = /pincel\s+(profissional|c\/\s*pente|para\s+aplicar)\s*(tinta|tintura|coloraç)/i;

function isNonCosmetic(product) {
  const text = (product.name + ' ' + (product.description || '')).toLowerCase();
  return NON_COSMETIC.some(p => p.test(text));
}

function shouldReclassifyToBrush(product) {
  if (!BRUSH_SOURCE_CATEGORIES.has(product.category)) return false;
  return RECLASSIFY_TO_BRUSH.some(p => p.test(product.name));
}

function isHairDyeTool(product) {
  return product.category === 'Tintura' && HAIR_DYE_BRUSH.test(product.name);
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  console.log('=== Correção de Qualidade do Catálogo ===\n');

  const catalog  = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  let products   = catalog.products;
  const original = products.length;

  const removed        = [];
  const reclassified   = [];
  const kept           = [];

  for (const product of products) {
    if (isNonCosmetic(product)) {
      removed.push(product);
      continue;
    }
    if (shouldReclassifyToBrush(product)) {
      console.log(`  RECLASSIFY → Esponjas e Pincéis: [${product.category}] ${product.name.slice(0,65)}`);
      product.category = 'Esponjas e Pincéis';
      reclassified.push(product);
      kept.push(product);
      continue;
    }
    if (isHairDyeTool(product)) {
      console.log(`  REMOVE (ferramenta tintura): ${product.name.slice(0,65)}`);
      removed.push(product);
      continue;
    }
    kept.push(product);
  }

  console.log(`\n--- Resumo ---`);
  console.log(`Total original:    ${original}`);
  console.log(`Removidos:         ${removed.length}`);
  console.log(`Reclassificados:   ${reclassified.length}`);
  console.log(`Total final:       ${kept.length}`);

  if (removed.length > 0) {
    console.log('\nProdutos removidos:');
    for (const p of removed.slice(0, 20)) {
      console.log(`  [${p.category}] ${p.name.slice(0, 70)}`);
    }
    if (removed.length > 20) console.log(`  ... e mais ${removed.length - 20}`);
  }

  catalog.products = kept;
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  console.log('\n✅ Catálogo salvo.');
  console.log('⚡ Próximo passo: node scripts/fetch-ml-images.js  (para buscar imagens)');
}

main();
