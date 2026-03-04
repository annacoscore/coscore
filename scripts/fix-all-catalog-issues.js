#!/usr/bin/env node
/**
 * Correções completas do catálogo:
 * 1. Remove tons específicos do nome do produto
 * 2. Mescla grupos de duplicatas como variações de cor
 * 3. Remove kits duplicados
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/data/products.ts');
const tsContent = fs.readFileSync(filePath, 'utf8');

// Parse seguro
const assignIdx = tsContent.indexOf('= [');
const bracketStart = assignIdx + 2;
let depth = 0, bracketEnd = -1;
for (let i = bracketStart; i < tsContent.length; i++) {
  if (tsContent[i] === '[') depth++;
  else if (tsContent[i] === ']') { depth--; if (depth === 0) { bracketEnd = i; break; } }
}
const rawArray = tsContent.slice(bracketStart, bracketEnd + 1);
const safeArray = rawArray.replace(/("(?:[^"\\]|\\.)*")/g, m =>
  m.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
);
let products = JSON.parse(safeArray);
console.log(`Produtos carregados: ${products.length}`);

// ─── 1. CORREÇÕES DE NOME (remover tom específico) ────────────────────────────
const NAME_FIXES = [
  // { id, newName, addColor? }
  { id: 'p17725006476670001', newName: 'Batom Lipstick Crush', addColor: 'Mango' },
  { find: 'Capri Batom Lipstick - Océane - Godness', newName: 'Capri Batom Lipstick - Océane', addColor: 'Godness' },
  { find: 'Batom Lipstick Technosatin Shiseido Shift Shift - Cheery', newName: 'Batom Lipstick Technosatin Shiseido', addColor: 'Cherry' },
  { find: 'Base Pele Lisa Foundation Marfim', newName: 'Base Pele Lisa Foundation', addColor: 'Marfim' },
  { find: 'Tirtir - Máscara Ajuste Base Cushion Cobertura Total 24n Latte', newName: 'Tirtir Base Cushion Cobertura Total 24n', addColor: 'Latte' },
  { find: 'Dailus Lápis Apontável Para Contorno Labial Taupe', newName: 'Dailus Lápis Apontável Para Contorno Labial', addColor: 'Taupe' },
  { find: 'Lápis De Contorno Labial Caramel Océane Edition', newName: 'Lápis De Contorno Labial Océane Edition', addColor: 'Caramel' },
  { find: 'Contorno Labial Contour Edition Bourjois Chocolate Chip', newName: 'Contorno Labial Contour Edition Bourjois', addColor: 'Chocolate Chip' },
  { find: 'Klasme Lipstick | Batom Very Berry Acabamento Fosco', newName: 'Klasme Lipstick | Batom Acabamento Fosco', addColor: 'Very Berry' },
  { find: 'Honey - Batom Matte', newName: 'Batom Matte', addColor: 'Honey' },
  { find: 'Carla - Batom Matte', newName: 'Batom Matte', addColor: 'Carla' },
  { find: 'Batom Matte Macximal - Folio', newName: 'Batom Matte M·A·Cximal', addColor: 'Folio' },
  { find: 'Batom Matte Dalla - Bela', newName: 'Batom Matte Dalla', addColor: 'Bela' },
  { find: 'Batom Matte Face Beautiful - Classico', newName: 'Batom Matte Face Beautiful', addColor: 'Clássico' },
  { find: 'Gloss Labial Brilho E Hidratante Lip Oil - Sorvete Baunilha', newName: 'Gloss Labial Brilho E Hidratante Lip Oil', addColor: 'Sorvete Baunilha' },
  { find: 'Gloss Lábial - Coleção Ppoeta - Catarina', newName: 'Gloss Labial Coleção Ppoeta', addColor: 'Catarina' },
  { find: 'Boca Beauty Hd 1 Jasmin', newName: 'Boca Beauty HD Base', addColor: 'Jasmin' },
  { find: 'Chocochilli Gloss Fran By Franciny Ehlke Acabamento Brilhante Chocolate', newName: 'Chocochilli Gloss Fran By Franciny Ehlke', addColor: 'Chocolate' },
  // Remoção de marcas/linhas que não são tons
  { find: 'Batom Matte - Suave', newName: 'Batom Matte Suave' },
  { find: 'Batom Matte Ramona - Boca', newName: 'Batom Matte Ramona' },
  { find: 'Batom Matte -rosê', newName: 'Batom Matte Rosê' },
  { find: 'Boca - Base - Matte', newName: 'Base Matte' },
];

let nameFixed = 0;
for (const fix of NAME_FIXES) {
  const p = fix.id
    ? products.find(x => x.id === fix.id)
    : products.find(x => x.name === fix.find);
  if (!p) continue;
  p.name = fix.newName;
  if (fix.addColor) {
    if (!p.colors) p.colors = [];
    const already = p.colors.some(c => (c.name||'').toLowerCase() === fix.addColor.toLowerCase());
    if (!already) p.colors.push({ name: fix.addColor, images: p.images ? [...p.images] : [] });
  }
  console.log(`Nome corrigido: "${fix.find || fix.id}" → "${fix.newName}"`);
  nameFixed++;
}
console.log(`\nNomes corrigidos: ${nameFixed}`);

// ─── 2. MESCLAR DUPLICATAS ────────────────────────────────────────────────────
// Cada entrada: { keepId, removeIds[], colorNameFromRemoved? }
const MERGES = [
  // Pó Solto Plush Fran By Franciny Ehlke (1, 2, 3 → 1 produto com 3 variantes)
  {
    keepId: 'p17725558072333227', // Plush 3
    removeIds: ['brand17726348579050275', 'brand17726348579050276'],
    addColors: ['Plush 1', 'Plush 2'],
  },
  // Spray Fixador Fix & Last Essence (18h = mesma coisa)
  {
    keepId: 'p17725556849261016',
    removeIds: ['p17725679993764464'],
  },
  // Spray Fixador Ruby Rose HB-312
  {
    keepId: 'p17725556849271039', // tem 3 cores
    removeIds: ['p17725679993769968'],
  },
  // Máscara Cílios Soul Turbo Eudora (3x = kit, manter versão simples)
  {
    keepId: 'p17725670157672552', // versão simples
    removeIds: ['p17725556862031090'], // versão 3x (kit)
  },
  // Máscara Cílios Feels Ruby Rose
  {
    keepId: 'p17725556876461107', // tem 5 cores
    removeIds: ['p17725670157686900'],
  },
  // Protetor Solar Anasol (Fps 50 e Fps)
  {
    keepId: 'p17725684591165935', // tem 4 cores
    removeIds: ['p17725684591154546'],
  },
  // Protetor Solar Fps e Fps 50
  {
    keepId: 'p17725684591152086', // tem 6 cores
    removeIds: ['p17725684591152983'],
  },
  // Atlas e Atlas Rose (máscaras faciais)
  {
    keepId: 'p17725557452101980',
    removeIds: ['p17725687475183784'],
    addColors: ['Rose'],
  },
  // Esfoliante + Máscara Facial Ruby / Ruby Rose
  {
    keepId: 'p17725557452101981', // tem 1 cor
    removeIds: ['p17725687475188008'],
  },
  // Ice Creamy Lip Balm (Chocolate e Vanilla como variações do mesmo)
  {
    keepId: 'brand17726348401550006', // Chocolate
    removeIds: ['brand17726348401550007'],
    addColors: ['Vanilla'],
  },
  // Base e - Mari Maria (Baunilha, Chocolate → variações)
  {
    keepId: 'brand17726348428000056', // Base e - Mari Maria Makeup
    removeIds: ['brand17726348428030069', 'brand17726348452900141'],
    addColors: ['Baunilha', 'Chocolate'],
  },
  // Base e - Claro 1 e Claro 2
  {
    keepId: 'brand17726348428010057', // Claro 2
    removeIds: ['brand17726348428030068'],
    addColors: ['Claro 1'],
  },
  // Lápis de Boca Bruna Tavares (Rose como variação)
  {
    keepId: 'p17725674550191388',
    removeIds: ['p17725674550193159'],
    addColors: ['Rose'],
  },
];

const removeSet = new Set(MERGES.flatMap(m => m.removeIds));
let mergeCount = 0;

for (const merge of MERGES) {
  const keepProduct = products.find(p => p.id === merge.keepId);
  if (!keepProduct) { console.log(`AVISO: produto ${merge.keepId} não encontrado`); continue; }

  if (!keepProduct.colors) keepProduct.colors = [];

  // Copiar cores dos produtos removidos para o que ficou
  for (const removeId of merge.removeIds) {
    const removeProduct = products.find(p => p.id === removeId);
    if (removeProduct && removeProduct.colors) {
      for (const c of removeProduct.colors) {
        const already = keepProduct.colors.some(x => (x.name||'').toLowerCase() === (c.name||'').toLowerCase());
        if (!already) keepProduct.colors.push(c);
      }
    }
  }

  // Adicionar cores extras especificadas
  if (merge.addColors) {
    for (const colorName of merge.addColors) {
      const already = keepProduct.colors.some(c => (c.name||'').toLowerCase() === colorName.toLowerCase());
      if (!already) keepProduct.colors.push({ name: colorName, images: keepProduct.images ? [...keepProduct.images] : [] });
    }
  }

  console.log(`Mesclado: mantendo "${keepProduct.name}", removendo ${merge.removeIds.length} duplicata(s)`);
  mergeCount++;
}

// Remover duplicatas
const before = products.length;
products = products.filter(p => !removeSet.has(p.id));
const after = products.length;
console.log(`\nMesclagens: ${mergeCount} | Removidos: ${before - after} produtos`);

// ─── 3. GERAR products.ts ────────────────────────────────────────────────────
const header = tsContent.slice(0, bracketStart - 2); // até antes do "= ["
const footer = tsContent.slice(bracketEnd + 1).replace(/^\s*;?\s*/, '');

const newContent =
  header.replace(/\/\/ Total:.*\n/, `// Total: ${products.length} produtos\n`) +
  '= ' +
  JSON.stringify(products, null, 2) +
  (footer.trim() ? '\n' + footer : '\n');

fs.writeFileSync(filePath, newContent, 'utf8');
console.log(`\nproducts.ts salvo com ${products.length} produtos.`);
