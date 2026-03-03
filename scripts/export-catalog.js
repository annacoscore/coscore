const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, 'output', 'catalog.json');
const outputPath  = path.join(__dirname, '..', 'src', 'data', 'products.ts');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

// Normaliza cada produto para a interface Product do TypeScript
function normalizeProduct(p) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  // Garante que imagens apontem para HTTPS
  const safeImages = images.map(img =>
    typeof img === 'string' && img.startsWith('http://') ? img.replace('http://', 'https://') : img
  );
  return {
    id:            p.id || `p${Date.now()}${Math.floor(Math.random()*9000+1000)}`,
    name:          (p.name || '').trim(),
    brand:         (p.brand || '').trim(),
    category:      p.category || 'Outros',
    description:   (p.description || p.name || '').substring(0, 500),
    image:         safeImages[0] || '',
    images:        safeImages,
    averageRating: p.averageRating ?? p.rating ?? 0,
    reviewCount:   p.reviewCount ?? 0,
    prices:        Array.isArray(p.prices) ? p.prices : [],
    tags:          Array.isArray(p.tags) ? p.tags.filter(Boolean) : [],
    colors:        Array.isArray(p.colors) ? p.colors : [],
    mlId:          p.mlId || '',
  };
}

const normalized = catalog.products.map(normalizeProduct);

const lines = [
  '// @ts-nocheck — arquivo gerado automaticamente, não editar manualmente',
  '// Catálogo 100% Mercado Livre — gerado por scripts/export-catalog.js',
  '// Última atualização: ' + new Date().toISOString(),
  '// Total: ' + normalized.length + ' produtos',
  "import type { Product } from '../types';",
  '',
  'const catalogProducts = ' + JSON.stringify(normalized, null, 2) + ' as Product[];',
  '',
  'export const products: Product[] = catalogProducts;',
  'export default products;',
];

fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
console.log('products.ts exportado: ' + normalized.length + ' produtos');
