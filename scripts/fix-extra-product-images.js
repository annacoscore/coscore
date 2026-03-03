/**
 * Atribui a cada produto em extra-products.ts uma imagem do catálogo
 * da MESMA categoria (ou categoria fallback), para que a foto corresponda ao tipo de produto.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const catalogPath = path.join(ROOT, 'src/data/products.ts');
const extraPath = path.join(ROOT, 'src/data/extra-products.ts');

// 1) Extrair imagens por categoria do catálogo principal
const catalogContent = fs.readFileSync(catalogPath, 'utf8');
const catalogBlock = catalogContent.match(/const catalogProducts: Product\[\] = \[([\s\S]*?)\];\s*export const products/)?.[1] || '';
const byCategory = {};
const imgRegex = /"category": "([^"]+)"[\s\S]*?"image": "(https[^"]+)"/g;
let match;
while ((match = imgRegex.exec(catalogBlock)) !== null) {
  const cat = match[1];
  const img = match[2];
  if (!byCategory[cat]) byCategory[cat] = [];
  if (!byCategory[cat].includes(img)) byCategory[cat].push(img);
}

// Fallbacks: categorias que não existem no catálogo usam imagens da categoria indicada
const FALLBACK = {
  'Perfume Homem': 'Perfume',
  'Cabelo Homem': 'Shampoo',
  'Esfoliante': 'Sérum',
  'Creme para Olhos': 'Sérum',
  'Limpeza Facial': 'Hidratante',
  'Máscara Facial': 'Hidratante',
  'Tônico Facial': 'Sérum',
  'Pó Facial': 'Base',
  'Óleo Capilar': 'Condicionador',
  'Finalizador': 'Condicionador',
  'Tintura': 'Shampoo',
  'Leave-in': 'Condicionador',
  'Lápis Labial': 'Batom',
  'Contorno': 'Blush',
  'Brilho Labial': 'Batom',
  'Delineador': 'Máscara de Cílios',
  'Sombra': 'Blush',
  'Esponjas e Pincéis': 'Blush',
  'Protetor Solar': 'Hidratante',
  'Sérum': 'Hidratante',
};

for (const [cat, src] of Object.entries(FALLBACK)) {
  if (!byCategory[cat] && byCategory[src]) byCategory[cat] = [...byCategory[src]];
}

const defaultImg = 'https://http2.mlstatic.com/D_NQ_NP_972728-MLA92301016064_092025-F.jpg';
for (const cat of Object.keys(byCategory)) {
  if (byCategory[cat].length === 0) byCategory[cat].push(defaultImg);
}

// 2) Ler extra-products
const extraContent = fs.readFileSync(extraPath, 'utf8');
const lines = extraContent.split('\n');
const categoryCounters = {};

function getImageForCategory(category) {
  const pool = byCategory[category] || byCategory[FALLBACK[category]] || [defaultImg];
  const idx = (categoryCounters[category] || 0) % pool.length;
  categoryCounters[category] = (categoryCounters[category] || 0) + 1;
  return pool[idx];
}

// Extrair a 4ª string entre aspas (categoria)
function getQuotedStrings(str) {
  const result = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === "'" && str[i - 1] !== '\\') {
      let end = i + 1;
      while (end < str.length) {
        if (str[end] === "'" && str[end - 1] !== '\\') break;
        if (str[end] === '\\') end++;
        end++;
      }
      result.push(str.slice(i + 1, end).replace(/\\'/g, "'"));
      i = end + 1;
    } else {
      i++;
    }
  }
  return result;
}

let out = '';
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("p('") && !trimmed.startsWith('p("')) {
    out += line + '\n';
    continue;
  }
  const strings = getQuotedStrings(line);
  const category = strings[3];
  if (!category) {
    out += line + '\n';
    continue;
  }
  const newUrl = getImageForCategory(category);

  // Substituir o 6º parâmetro (imagem): é o que vem logo antes de ",\s*["
  // Pode ser 'https://...' ou IMG.xxx
  let newLine = line.replace(/,\s*'(https:\/\/[^']+)'\s*,\s*\[/, ",'" + newUrl + "',[");
  if (newLine === line) {
    newLine = line.replace(/,\s*(IMG\.\w+)\s*,\s*\[/, ",'" + newUrl + "',[");
  }
  out += newLine + '\n';
}

fs.writeFileSync(extraPath, out, 'utf8');
console.log('Imagens atualizadas por categoria. Contadores:', JSON.stringify(categoryCounters, null, 2));
