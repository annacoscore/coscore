import { loadCatalog, exportToProductsTs } from './lib/storage';
const catalog = loadCatalog();
console.log(`📦 Total no catálogo: ${catalog.products.length} produtos`);
exportToProductsTs(catalog.products);
