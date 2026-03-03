// Script: busca detalhes dos produtos de pó solto da 1ª página do ML e adiciona ao products.ts
// node scripts/add-po-solto.js

const https = require('https');
const fs = require('fs');
const path = require('path');
const { fetchColorVariants } = require('./lib/fetch-colors');

const TOKEN = 'APP_USR-1664631224999083-030312-f10c634374533b2d59777a1ec2b5e09c-3238361303';

// IDs da 1ª página de "po solto facial" no ML (filtrados os sem imagem ou kits)
const PAGE_IDS = [
  'MLB22358686', // Catharine Hill Angel Powder
  'MLB27284760', // Playboy Pó Solto Translúcido
  'MLB59127552', // Mon Tom Pó Solto Grande
  'MLB38196908', // Kohll Beauty Iluminador Pó Solto
  'MLB64557780', // Phoera Pó Solto Facial
  'MLB36160066', // Pó Solto Facial Translúcido Maquiagem
  'MLB63302733', // Bareminerals Pó Solto
  'MLB23132465', // Dermachem Perfect Finish
  'MLB23509301', // Mahav Pó Solto Vegano
  'MLB35368987', // Vizzela Pó Solto Kit
  'MLB23520069', // Fand Pó Solto Facial
  'MLB29422711', // Bauny Pó Solto
  'MLB64632834', // Payot Pó Solto Matte
  'MLB35489030', // Vizzela Kit 01
  'MLB35202197', // Vizzela Kit 02
  'MLB64632835', // Payot Pó Solto Matte (variante)
  'MLB22265873', // Bruna Tavares BT Skinpowder
  // 'MLB39127069' removido — ID errado (retorna calculadora Casio)
  'MLB46261010', // Florelle Pó Solto Loose
  'MLB62809105', // Kit Pó Banana + Translúcido
  'MLB26826908', // Pó Solto Matte Invisível
  'MLB26826923', // Pó Solto Light Sand
  'MLB23661081', // Florenza Premium
  'MLB23199012', // Alice Salazar Pó Solto
  'MLB45208152', // Menimake Pó Solto
];

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: 'Bearer ' + TOKEN } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.setTimeout(15000, () => { reject(new Error('TIMEOUT')); req.destroy(); });
    req.on('error', reject);
  });
}

function extractAttr(attributes, id) {
  const a = (attributes || []).find(x => x.id === id);
  return a?.value_name || a?.value_struct?.number?.toString() || '';
}

function inferCategory(name) {
  const n = name.toLowerCase();
  if (n.includes('iluminador') || n.includes('highlight') || n.includes('glow')) return 'Iluminador';
  if (n.includes('contorno') || n.includes('bronzer') || n.includes('bronze')) return 'Contorno/Bronzer';
  return 'Pó Facial';
}

function slug(name, brand) {
  return (brand + '-' + name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function fetchProduct(mlId) {
  const d = await get(`https://api.mercadolibre.com/products/${mlId}`);
  if (d.error) {
    console.log(`  ERRO ${mlId}: ${d.error} - ${d.message}`);
    return null;
  }

  const name = (d.name || '').trim();
  if (!name) return null;

  // Imagens
  const images = (d.pictures || []).map(p => p.url || p.secure_url).filter(Boolean);
  if (images.length === 0) return null;  // sem imagem, pula

  const brand = extractAttr(d.attributes, 'BRAND') || name.split(' ')[0];
  const category = inferCategory(name);

  // Busca TODAS as variações de cor para evitar duplicatas de produto
  const colors = await fetchColorVariants(TOKEN, mlId, name, brand);
  if (colors.length > 0) {
    console.log(`    cores: ${colors.map(c => c.name).join(', ')}`);
  }

  const description = (d.short_description?.content || d.name || '').trim();

  return {
    id: 'p' + mlId.replace('MLB', '') + Math.floor(Math.random() * 1000),
    name,
    brand,
    category,
    description,
    image: images[0],
    images,
    colors,
    averageRating: 0,
    reviewCount: 0,
    prices: [],
    tags: [brand.toLowerCase(), category.toLowerCase(), 'pó solto'],
    mlId,
  };
}

async function main() {
  const productsFile = path.join(__dirname, '../src/data/products.ts');
  const content = fs.readFileSync(productsFile, 'utf8');

  // IDs já existentes no catálogo
  const existingMlIds = new Set([...content.matchAll(/"mlId":\s*"([^"]+)"/g)].map(m => m[1]));
  const existingNames = new Set(
    [...content.matchAll(/"name":\s*"([^"]+)"/g)].map(m => m[1].toLowerCase().trim())
  );

  console.log(`\nBuscando ${PAGE_IDS.length} produtos do ML...\n`);

  const newProducts = [];
  for (const mlId of PAGE_IDS) {
    if (existingMlIds.has(mlId)) {
      console.log(`  SKIP (já existe): ${mlId}`);
      continue;
    }
    try {
      const p = await fetchProduct(mlId);
      if (!p) { console.log(`  SKIP (sem dados): ${mlId}`); continue; }

      if (existingNames.has(p.name.toLowerCase().trim())) {
        console.log(`  SKIP (nome duplicado): ${p.name}`);
        continue;
      }

      newProducts.push(p);
      console.log(`  + ${p.category.padEnd(16)} | ${p.brand.padEnd(20)} | ${p.name.slice(0, 50)}`);
    } catch (e) {
      console.log(`  ERRO ${mlId}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 300)); // respeitar rate limit
  }

  if (newProducts.length === 0) {
    console.log('\nNenhum produto novo para adicionar.');
    return;
  }

  // Gerar linhas para inserir no products.ts
  const newLines = newProducts.map(p => JSON.stringify(p, null, 2)).join(',\n');

  // Inserir antes do ] as Product[]; final do array
  const updated = content.replace(/\]\s*as\s*Product\[\];/, `,\n${newLines}\n] as Product[];`);
  fs.writeFileSync(productsFile, updated, 'utf8');

  console.log(`\n✓ ${newProducts.length} produtos adicionados ao products.ts`);
  console.log('  Categorias:', [...new Set(newProducts.map(p => p.category))].join(', '));
}

main().catch(console.error);
