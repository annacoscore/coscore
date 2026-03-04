/**
 * sync-amobeleza.ts
 * ─────────────────
 * Scraper do catálogo da Amobeleza (amobeleza.com.br).
 *
 * Estratégia em camadas:
 *  1. API VTEX (muito comum em e-commerces brasileiros) — retorna JSON completo
 *  2. Extrai __NEXT_DATA__ JSON embutido na página (Next.js)
 *  3. Extrai JSON-LD (schema.org Product)
 *  4. Parsing HTML com node-html-parser (fallback)
 *
 * Usa toda a infraestrutura existente: normalizer, category-mapper,
 * deduplicator e storage.
 *
 * Uso:
 *  npm run sync-amobeleza
 *  npx tsx scripts/sync-amobeleza.ts --dry-run
 *  npx tsx scripts/sync-amobeleza.ts --export-ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { parse as parseHtml } from 'node-html-parser';
import { loadCatalog, saveCatalog, exportToProductsTs, generateId } from './lib/storage';
import { Deduplicator } from './lib/deduplicator';
import { mapCategoryByKeywords } from './lib/category-mapper';
import { cleanProductName, buildDisplayName, extractBrandFromTitle } from './lib/normalizer';
import type { CatalogEntry, ColorVariant } from './lib/types';

// ─── Configuração ─────────────────────────────────────────────────────────────

const STORE_NAME = 'Amobeleza';
const STORE_LOGO = 'https://www.amobeleza.com.br/arquivos/logo-amobeleza.svg';
const BASE_URL = 'https://www.amobeleza.com.br';

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache',
};

const API_HEADERS: Record<string, string> = {
  ...HEADERS,
  'Accept': 'application/json, text/plain, */*',
};

// Categorias da Amobeleza — IDs extraídos da API VTEX (/api/catalog_system/pub/category/tree/1)
const CATEGORIES = [
  { slug: 'maquiagem',         label: 'Maquiagem',         vtexId: 5,           pages: 12 },
  { slug: 'skincare',          label: 'Skincare',           vtexId: 1581116150,  pages: 8  },
  { slug: 'perfumes',          label: 'Perfumes',           vtexId: 3,           pages: 10 },
  { slug: 'cabelos',           label: 'Cabelos',            vtexId: 1,           pages: 12 },
  { slug: 'cuidados-pessoais', label: 'Cuidados Pessoais',  vtexId: 1799571812,  pages: 6  },
];

const PAGE_SIZE = 48;
const DELAY_MS = 2000;
const MAX_RETRIES = 3;

// ─── Utilitários ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchUrl(url: string, customHeaders?: Record<string, string>, attempt = 1): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: customHeaders ?? HEADERS });
    if (res.status === 429) {
      console.warn(`  ⏳ Rate limit (429) em ${url}, aguardando...`);
      await sleep(DELAY_MS * attempt * 2);
      if (attempt < MAX_RETRIES) return fetchUrl(url, customHeaders, attempt + 1);
      return null;
    }
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(DELAY_MS * attempt);
      return fetchUrl(url, customHeaders, attempt + 1);
    }
    console.error(`  ✗ Falha: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ─── Produto intermediário ────────────────────────────────────────────────────

interface ScrapedProduct {
  name: string;
  brand: string;
  price: number;
  url: string;
  image: string;
  images: string[];
  description: string;
  colors: ColorVariant[];
  ean?: string;
}

// ─── Estratégia 1: API VTEX ──────────────────────────────────────────────────

interface VtexProduct {
  productId?: string;
  productName?: string;
  brand?: string;
  brandName?: string;
  description?: string;
  link?: string;
  linkText?: string;
  skuSpecifications?: { field?: { name?: string }; values?: { name?: string }[] }[];
  items?: VtexSku[];
}

interface VtexSku {
  name?: string;
  ean?: string;
  images?: { imageUrl?: string; imageLabel?: string }[];
  sellers?: { commertialOffer?: { Price?: number; ListPrice?: number } }[];
  complementName?: string;
  nameComplete?: string;
}

async function fetchVtexCategory(vtexId: number, from: number, to: number): Promise<ScrapedProduct[]> {
  const apiUrl = `${BASE_URL}/api/catalog_system/pub/products/search/?fq=C:/${vtexId}/&_from=${from}&_to=${to}&O=OrderByScoreDESC`;
  const text = await fetchUrl(apiUrl, API_HEADERS);
  if (!text) return [];

  try {
    const products: VtexProduct[] = JSON.parse(text);
    if (!Array.isArray(products) || products.length === 0) return [];

    const results: ScrapedProduct[] = [];

    for (const p of products) {
      const name = String(p.productName ?? '').trim();
      if (!name) continue;

      const brand = String(p.brand ?? p.brandName ?? '').trim() || extractBrandFromTitle(name);
      const description = String(p.description ?? '').replace(/<[^>]+>/g, '').slice(0, 500).trim();
      const slug = p.linkText ?? p.link ?? '';
      const productUrl = slug ? `${BASE_URL}/${slug}/p` : '';

      // Coleta imagens e preços do primeiro SKU
      const skus = p.items ?? [];
      const allImages: string[] = [];
      let price = 0;
      let ean: string | undefined;
      const colors: ColorVariant[] = [];

      for (const sku of skus) {
        // Preço
        const offer = sku.sellers?.[0]?.commertialOffer;
        const skuPrice = offer?.Price ?? offer?.ListPrice ?? 0;
        if (price === 0 && skuPrice > 0) price = skuPrice;

        // EAN
        if (!ean && sku.ean) ean = sku.ean;

        // Imagens
        for (const img of sku.images ?? []) {
          if (img.imageUrl) allImages.push(img.imageUrl);
        }

        // Variantes de cor — o nome do SKU frequentemente inclui a cor
        const skuName = String(sku.name ?? sku.complementName ?? '').trim();
        if (skuName && skuName !== name && skuName.length > 1 && skuName.length < 60) {
          const firstImg = sku.images?.[0]?.imageUrl ?? '';
          colors.push({
            name: skuName,
            ...(firstImg ? { image: firstImg } : {}),
          });
        }
      }

      // Também extrai cores de skuSpecifications
      for (const spec of p.skuSpecifications ?? []) {
        const fieldName = spec.field?.name?.toLowerCase() ?? '';
        if (['cor', 'color', 'colour', 'tom', 'shade', 'tonalidade'].some(k => fieldName.includes(k))) {
          for (const v of spec.values ?? []) {
            const colorName = v.name ?? '';
            if (colorName && !colors.some(c => c.name === colorName)) {
              colors.push({ name: colorName });
            }
          }
        }
      }

      results.push({
        name,
        brand,
        price,
        url: productUrl,
        image: allImages[0] ?? '',
        images: [...new Set(allImages)].slice(0, 5),
        description,
        colors,
        ean,
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Estratégia 2: __NEXT_DATA__ ─────────────────────────────────────────────

function extractFromNextData(html: string): ScrapedProduct[] {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
  if (!match) return [];

  try {
    const nextData = JSON.parse(match[1]);
    const products: ScrapedProduct[] = [];
    findProductsInTree(nextData, products);
    return products;
  } catch {
    return [];
  }
}

function findProductsInTree(obj: unknown, results: ScrapedProduct[], depth = 0): void {
  if (depth > 15 || !obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) findProductsInTree(item, results, depth + 1);
    return;
  }

  const record = obj as Record<string, unknown>;

  if (
    typeof record.productName === 'string' && record.productName.length > 3 &&
    (typeof record.price === 'number' || typeof record.link === 'string')
  ) {
    const price = parseFloat(String(record.price ?? '0').replace(',', '.')) || 0;
    const url = String(record.link ?? record.url ?? '').trim();
    const name = String(record.productName ?? record.name ?? '').trim();
    const images: string[] = Array.isArray(record.images) ? record.images.map(String) : [];

    results.push({
      name,
      brand: String(record.brand ?? record.brandName ?? '').trim() || extractBrandFromTitle(name),
      price,
      url: url.startsWith('http') ? url : url ? `${BASE_URL}${url}` : '',
      image: images[0] ?? '',
      images,
      description: String(record.description ?? '').slice(0, 500).trim(),
      colors: [],
    });
    return;
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') findProductsInTree(value, results, depth + 1);
  }
}

// ─── Estratégia 3: JSON-LD ────────────────────────────────────────────────────

function extractFromJsonLd(html: string): ScrapedProduct[] {
  const results: ScrapedProduct[] = [];
  const tags = html.matchAll(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/g);

  for (const match of tags) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item['@type'] !== 'Product') continue;

        const name = String(item.name ?? '').trim();
        if (!name) continue;

        const brand = typeof item.brand === 'object'
          ? String((item.brand as Record<string, unknown>)?.name ?? '')
          : String(item.brand ?? '');

        const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        const price = parseFloat(String((offers as Record<string, unknown>)?.price ?? '0').replace(',', '.')) || 0;
        const url = String((offers as Record<string, unknown>)?.url ?? item.url ?? '');
        const images = Array.isArray(item.image) ? item.image.map(String) : item.image ? [String(item.image)] : [];

        results.push({
          name,
          brand: brand || extractBrandFromTitle(name),
          price,
          url: url.startsWith('http') ? url : url ? `${BASE_URL}${url}` : '',
          image: images[0] ?? '',
          images: images.slice(0, 5),
          description: String(item.description ?? '').slice(0, 500).trim(),
          colors: [],
          ean: String(item.gtin ?? item.gtin13 ?? '').trim() || undefined,
        });
      }
    } catch {
      continue;
    }
  }

  return results;
}

// ─── Estratégia 4: HTML genérico ─────────────────────────────────────────────

function extractFromHtml(html: string, baseUrl: string): ScrapedProduct[] {
  const root = parseHtml(html);
  const results: ScrapedProduct[] = [];

  const productEls = root.querySelectorAll([
    '.product-item',
    '.product-tile',
    '.product-card',
    '[data-product-id]',
    '[data-sku]',
    '.shelf-item',
    '.vtex-product-summary',
    'article.product',
  ].join(','));

  for (const el of productEls) {
    const nameEl = el.querySelector('h2, h3, h4, [class*="name"], [class*="title"], [itemprop="name"]');
    const name = nameEl?.text?.trim() ?? '';
    if (!name || name.length < 3) continue;

    const linkEl = el.querySelector('a');
    const href = linkEl?.getAttribute('href') ?? '';
    const url = href.startsWith('http') ? href : href ? `${baseUrl}${href}` : baseUrl;

    const imgEl = el.querySelector('img');
    const image = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-src') ?? '';

    const priceEl = el.querySelector('[class*="price"], [itemprop="price"], [class*="valor"]');
    const priceText = priceEl?.text?.replace(/[R$\s.]/g, '').replace(',', '.') ?? '0';
    const price = parseFloat(priceText) || 0;

    const brandEl = el.querySelector('[class*="brand"], [itemprop="brand"]');
    const brand = brandEl?.text?.trim() ?? extractBrandFromTitle(name);

    const colorEls = el.querySelectorAll('[class*="swatch"], [class*="color"], [class*="shade"]');
    const colors: ColorVariant[] = [];
    for (const colorEl of colorEls) {
      const colorName = colorEl.getAttribute('title') ?? colorEl.getAttribute('aria-label') ?? colorEl.text?.trim();
      if (colorName && colorName.length > 1 && colorName.length < 60) {
        colors.push({ name: colorName });
      }
    }

    results.push({
      name,
      brand,
      price,
      url,
      image: image.startsWith('http') ? image : '',
      images: image.startsWith('http') ? [image] : [],
      description: '',
      colors,
    });
  }

  return results;
}

// ─── Conversão para CatalogEntry ──────────────────────────────────────────────

function toCatalogEntry(product: ScrapedProduct): CatalogEntry | null {
  const category = mapCategoryByKeywords(product.name);
  if (!category) return null;

  const cleanedName = cleanProductName(product.name);
  const displayName = buildDisplayName(cleanedName, product.brand) || cleanedName;
  if (displayName.length < 3) return null;

  const now = new Date().toISOString();

  return {
    id: generateId('amb'),
    name: displayName,
    brand: product.brand,
    category,
    description: product.description || `${displayName} — ${product.brand}`,
    image: product.image,
    images: product.images,
    ean: product.ean,
    mlIds: [],
    averageRating: 0,
    reviewCount: 0,
    prices: product.price > 0 && product.url ? [{
      store: STORE_NAME,
      price: product.price,
      url: product.url,
      logo: STORE_LOGO,
      inStock: true,
    }] : [],
    colors: product.colors,
    tags: [category.toLowerCase(), product.brand.toLowerCase(), 'amobeleza'],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Scraping de uma categoria ────────────────────────────────────────────────

async function scrapeCategory(
  category: { slug: string; label: string; vtexId: number; pages: number },
  dedup: Deduplicator,
): Promise<{ inserted: number; updated: number; duplicate: number; skipped: number }> {
  const stats = { inserted: 0, updated: 0, duplicate: 0, skipped: 0 };

  console.log(`\n  📂 Categoria: ${category.label}`);

  let vtexSuccess = false;

  // ── Tentativa 1: API VTEX ────────────────────────────────────────────────
  for (let page = 0; page < category.pages; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    process.stdout.write(`     [VTEX] Página ${page + 1}/${category.pages}... `);
    const products = await fetchVtexCategory(category.vtexId, from, to);

    if (products.length === 0 && page === 0) {
      process.stdout.write('API VTEX não disponível, tentando HTML...\n');
      break;
    }

    if (products.length === 0) {
      process.stdout.write('fim da paginação\n');
      vtexSuccess = true;
      break;
    }

    vtexSuccess = true;
    process.stdout.write(`${products.length} produtos\n`);

    for (const p of products) {
      const entry = toCatalogEntry(p);
      if (!entry) { stats.skipped++; continue; }
      const result = dedup.add(entry);
      if (result === 'inserted') stats.inserted++;
      else if (result === 'updated') stats.updated++;
      else stats.duplicate++;
    }

    await sleep(DELAY_MS + Math.random() * 800);
  }

  if (vtexSuccess) return stats;

  // ── Tentativa 2-4: HTML das páginas de categoria ─────────────────────────
  for (let page = 1; page <= category.pages; page++) {
    const url = `${BASE_URL}/${category.slug}?page=${page}`;

    process.stdout.write(`     [HTML] Página ${page}/${category.pages}... `);
    const html = await fetchUrl(url);

    if (!html) {
      process.stdout.write('❌ falha\n');
      stats.skipped++;
      continue;
    }

    let scraped: ScrapedProduct[] = extractFromNextData(html);
    if (scraped.length === 0) scraped = extractFromJsonLd(html);
    if (scraped.length === 0) scraped = extractFromHtml(html, BASE_URL);

    process.stdout.write(`${scraped.length} produtos\n`);
    if (scraped.length === 0) break;

    for (const p of scraped) {
      const entry = toCatalogEntry(p);
      if (!entry) { stats.skipped++; continue; }
      const result = dedup.add(entry);
      if (result === 'inserted') stats.inserted++;
      else if (result === 'updated') stats.updated++;
      else stats.duplicate++;
    }

    await sleep(DELAY_MS + Math.random() * 800);
  }

  return stats;
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const exportTs = args.includes('--export-ts');

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   CoScore — Sync Amobeleza                   ║');
  console.log('╚══════════════════════════════════════════════╝');
  if (isDryRun) console.log('\n⚠  Dry run — nada será salvo.');
  console.log('');

  const catalog = loadCatalog();
  const dedup = new Deduplicator(catalog.products);
  const initialSize = dedup.size;

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalDuplicate = 0;
  let totalSkipped = 0;

  for (const cat of CATEGORIES) {
    const stats = await scrapeCategory(cat, dedup);
    totalInserted += stats.inserted;
    totalUpdated += stats.updated;
    totalDuplicate += stats.duplicate;
    totalSkipped += stats.skipped;

    console.log(`  → ${stats.inserted} novos | ${stats.updated} atualizados | ${stats.duplicate} duplicatas | ${stats.skipped} ignorados`);
  }

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  RELATÓRIO — AMOBELEZA');
  console.log('══════════════════════════════════════════════');
  console.log(`  Catálogo antes:         ${initialSize}`);
  console.log(`  Novos inseridos:        ${totalInserted}`);
  console.log(`  Registros atualizados:  ${totalUpdated}`);
  console.log(`  Duplicatas ignoradas:   ${totalDuplicate}`);
  console.log(`  Ignorados (sem cat.):   ${totalSkipped}`);
  console.log(`  Catálogo depois:        ${dedup.size}`);
  console.log('══════════════════════════════════════════════');

  if (!isDryRun) {
    catalog.products = dedup.all;
    saveCatalog(catalog);
    console.log('\n💾 Catálogo salvo em scripts/output/catalog.json');

    if (exportTs) {
      exportToProductsTs(catalog.products);
    }
  }

  if (totalInserted === 0 && totalUpdated === 0) {
    console.log('\n⚠  Nenhum produto extraído.');
    console.log('   O site pode estar usando renderização client-side ou proteção anti-bot.');
    console.log('   A API VTEX pode estar em path diferente — verifique a URL do site.');
  }
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
