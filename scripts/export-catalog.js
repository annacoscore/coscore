const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, 'output', 'catalog.json');
const outputPath  = path.join(__dirname, '..', 'src', 'data', 'products.ts');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

const lines = [
  '// @ts-nocheck — arquivo gerado automaticamente, não editar manualmente',
  '// Catálogo 100% Mercado Livre — gerado por scripts/export-catalog.js',
  '// Última atualização: ' + new Date().toISOString(),
  '// Total: ' + catalog.products.length + ' produtos',
  "import type { Product } from '../types';",
  '',
  'const catalogProducts = ' + JSON.stringify(catalog.products, null, 2) + ' as Product[];',
  '',
  'export const products: Product[] = catalogProducts;',
  'export default products;',
];

fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
console.log('products.ts exportado: ' + catalog.products.length + ' produtos');
