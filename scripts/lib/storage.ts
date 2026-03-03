import fs from 'fs';
import path from 'path';
import type { CatalogEntry, CatalogFile } from './types';
import type { Product, Category } from '../../src/types/index';

const CATALOG_DIR = path.join(process.cwd(), 'scripts', 'output');
export const CATALOG_PATH = path.join(CATALOG_DIR, 'catalog.json');
const PRODUCTS_TS_PATH = path.join(process.cwd(), 'src', 'data', 'products.ts');

// ─── Leitura e escrita do catalog.json ───────────────────────────────────────

export function loadCatalog(): CatalogFile {
  if (!fs.existsSync(CATALOG_PATH)) {
    return {
      version: 1,
      lastSync: '',
      totalProducts: 0,
      products: [],
    };
  }

  const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
  return JSON.parse(raw) as CatalogFile;
}

export function saveCatalog(catalog: CatalogFile): void {
  if (!fs.existsSync(CATALOG_DIR)) {
    fs.mkdirSync(CATALOG_DIR, { recursive: true });
  }

  catalog.totalProducts = catalog.products.length;
  catalog.lastSync = new Date().toISOString();

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
}

// ─── Export para src/data/products.ts ────────────────────────────────────────

export function exportToProductsTs(entries: CatalogEntry[]): void {
  const catalogProducts: Product[] = entries.map(entry => ({
    id: entry.id,
    name: entry.name,
    brand: entry.brand,
    category: entry.category as Category,
    description: entry.description,
    image: entry.image,
    images: entry.images,
    averageRating: entry.averageRating,
    reviewCount: entry.reviewCount,
    prices: entry.prices.map(p => ({
      store: p.store,
      price: p.price,
      url: p.url,
      logo: p.logo,
      inStock: p.inStock,
    })),
    tags: entry.tags,
    ...(entry.colors && entry.colors.length > 0 ? { colors: entry.colors.map(c => ({ name: c.name, ...(c.image ? { image: c.image } : {}) })) } : {}),
  }));

  const content = [
    `// @ts-nocheck — arquivo gerado automaticamente, não editar manualmente`,
    `// Catálogo 100% Mercado Livre — gerado automaticamente.`,
    `// Última atualização: ${new Date().toISOString()}`,
    `// Total: ${catalogProducts.length} produtos`,
    `import type { Product } from '../types';`,
    ``,
    `const catalogProducts = ${JSON.stringify(catalogProducts, null, 2)} as Product[];`,
    ``,
    `export const products: Product[] = catalogProducts;`,
    `export default products;`,
  ].join('\n');

  fs.writeFileSync(PRODUCTS_TS_PATH, content, 'utf-8');
  console.log(`✅  src/data/products.ts atualizado — ${catalogProducts.length} produtos do ML.`);
}

// ─── Gerador de ID único ─────────────────────────────────────────────────────

let idCounter = 0;

export function generateId(prefix = 'p'): string {
  idCounter++;
  return `${prefix}${Date.now()}${idCounter.toString().padStart(4, '0')}`;
}
