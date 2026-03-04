/**
 * sync-sephora.ts
 * ───────────────
 * Scraper do catálogo da Sephora Brasil (sephora.com.br).
 *
 * Estratégia em camadas:
 *  1. Tenta extrair __NEXT_DATA__ JSON embutido na página (Next.js)
 *  2. Tenta JSON-LD (schema.org Product) embutido no HTML
 *  3. Faz parsing HTML com node-html-parser (fallback)
 *
 * Usa toda a infraestrutura existente: normalizer, category-mapper,
 * deduplicator e storage — mesmo pipeline do ML e afiliados.
 *
 * Uso:
 *  npm run sync-sephora
 *  npx tsx scripts/sync-sephora.ts --dry-run
 *  npx tsx scripts/sync-sephora.ts --export-ts
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

const STORE_NAME = 'Sephora';
const STORE_LOGO = 'https://logodownload.org/wp-content/uploads/2019/11/sephora-logo.png';

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

// Categorias da Sephora a varrer — URL base + total estimado de páginas
const CATEGORIES = [
  { url: 'https://www.sephora.com.br/maquiagem',  label: 'Maquiagem', pages: 8 },
  { url: 'https://www.sephora.com.br/skincare',   label: 'Skincare',  pages: 6 },
  { url: 'https://www.sephora.com.br/perfumes',   label: 'Perfumes',  pages: 5 },
  { url: 'https://www.sephora.com.br/cabelos',    label: 'Cabelos',   pages: 4 },
];

const PAGE_SIZE = 48; // produtos por página (padrão Sephora)
const DELAY_MS = 2000; // delay entre requisições (ms)
const MAX_RETRIES = 3;

// ─── Utilitários ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url: string, attempt = 1): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 429) {
      // Rate limit — espera mais e tenta novamente
      console.warn(`  ⏳ Rate limit (429) em ${url}, aguardando ${DELAY_MS * attempt * 2}ms...`);
      await sleep(DELAY_MS * attempt * 2);
      if (attempt < MAX_RETRIES) return fetchPage(url, attempt + 1);
      return null;
    }
    if (!res.ok) {
      console.warn(`  ⚠ HTTP ${res.status} em ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(DELAY_MS * attempt);
      return fetchPage(url, attempt + 1);
    }
    console.error(`  ✗ Falha ao buscar ${url}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ─── Extração de dados do HTML ────────────────────────────────────────────────

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

/**
 * Estratégia 1: extrai dados do __NEXT_DATA__ JSON (Next.js SSR).
 * Cobre a maioria das páginas modernas do Sephora.
 */
function extractFromNextData(html: string): ScrapedProduct[] {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
  if (!match) return [];

  try {
    const nextData = JSON.parse(match[1]);

    // Percorre a árvore de dados procurando arrays de produtos
    const products: ScrapedProduct[] = [];
    extractProductsFromObject(nextData, products);
    return products;
  } catch {
    return [];
  }
}

function extractProductsFromObject(obj: unknown, results: ScrapedProduct[], depth = 0): void {
  if (depth > 15 || !obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractProductsFromObject(item, results, depth + 1);
    }
    return;
  }

  const record = obj as Record<string, unknown>;

  // Heurística: objeto com campos que parecem produto
  if (
    typeof record.name === 'string' &&
    record.name.length > 3 &&
    (typeof record.price === 'number' || typeof record.price === 'string') &&
    (typeof record.url === 'string' || typeof record.pdpUrl === 'string' || typeof record.productUrl === 'string')
  ) {
    const product = parseProductRecord(record);
    if (product) results.push(product);
    return;
  }

  // Recursão nas propriedades
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') {
      extractProductsFromObject(value, results, depth + 1);
    }
  }
}

function parseProductRecord(record: Record<string, unknown>): ScrapedProduct | null {
  const name = String(record.name ?? record.productName ?? record.displayName ?? '').trim();
  if (!name || name.length < 3) return null;

  const price = parseFloat(String(
    record.price ?? record.currentPrice ?? record.listPrice ?? record.salePrice ?? '0',
  ).replace(',', '.')) || 0;

  const url = String(
    record.url ?? record.pdpUrl ?? record.productUrl ?? record.link ?? '',
  ).trim();

  if (!url) return null;

  const fullUrl = url.startsWith('http') ? url : `https://www.sephora.com.br${url}`;

  // Imagens
  const images: string[] = [];
  const imgFields = ['image', 'images', 'imageUrl', 'thumbnail', 'smallImage', 'largeImage'];
  for (const field of imgFields) {
    const val = record[field];
    if (typeof val === 'string' && val.startsWith('http')) images.push(val);
    if (Array.isArray(val)) {
      for (const img of val) {
        const imgUrl = typeof img === 'string' ? img : (img as Record<string, string>)?.url ?? '';
        if (imgUrl.startsWith('http')) images.push(imgUrl);
      }
    }
  }

  // Marca
  const brand = String(
    record.brand ?? record.brandName ?? record.manufacturer ?? '',
  ).trim() || extractBrandFromTitle(name);

  // Descrição
  const description = String(
    record.description ?? record.shortDescription ?? record.longDescription ?? '',
  ).slice(0, 500).trim();

  // EAN
  const ean = String(record.ean ?? record.gtin ?? record.barcode ?? record.upc ?? '').trim() || undefined;

  // Cores
  const colors: ColorVariant[] = [];
  const colorFields = ['colors', 'colorVariants', 'variations', 'swatches', 'shades'];
  for (const field of colorFields) {
    const val = record[field];
    if (Array.isArray(val)) {
      for (const c of val) {
        const colorName = typeof c === 'string' ? c : String((c as Record<string, unknown>)?.name ?? (c as Record<string, unknown>)?.colorName ?? '');
        const colorImg = typeof c === 'object' ? String((c as Record<string, unknown>)?.image ?? (c as Record<string, unknown>)?.imageUrl ?? '') : '';
        if (colorName.length > 1) {
          colors.push({ name: colorName, ...(colorImg.startsWith('http') ? { image: colorImg } : {}) });
        }
      }
    }
  }

  return {
    name,
    brand,
    price,
    url: fullUrl,
    image: images[0] ?? '',
    images: [...new Set(images)].slice(0, 5),
    description,
    colors,
    ean,
  };
}

/**
 * Estratégia 2: extrai produtos de JSON-LD (schema.org Product).
 */
function extractFromJsonLd(html: string): ScrapedProduct[] {
  const results: ScrapedProduct[] = [];
  const scriptTags = html.matchAll(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/g);

  for (const match of scriptTags) {
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
        const url = String((offers as Record<string, unknown>)?.url ?? item.url ?? '').trim();

        const images: string[] = Array.isArray(item.image)
          ? item.image.map(String)
          : item.image ? [String(item.image)] : [];

        results.push({
          name,
          brand: brand || extractBrandFromTitle(name),
          price,
          url: url.startsWith('http') ? url : `https://www.sephora.com.br${url}`,
          image: images[0] ?? '',
          images: images.slice(0, 5),
          description: String(item.description ?? '').slice(0, 500).trim(),
          colors: [],
          ean: String(item.gtin ?? item.gtin13 ?? item.gtin12 ?? '').trim() || undefined,
        });
      }
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Estratégia 3: parsing HTML genérico com node-html-parser.
 * Funciona para layouts server-rendered convencionais.
 */
function extractFromHtml(html: string, baseUrl: string): ScrapedProduct[] {
  const root = parseHtml(html);
  const results: ScrapedProduct[] = [];

  // Seletores comuns de produto em e-commerces brasileiros
  const productSelectors = [
    '.product-tile',
    '.product-item',
    '.product-card',
    '[data-product-id]',
    '[data-sku]',
    'article.product',
    '.item-product',
    '.vtex-product-summary',
    '.shelf-item',
  ];

  let productEls = root.querySelectorAll(productSelectors.join(','));

  if (productEls.length === 0) {
    // Tenta encontrar blocos de produto de forma menos específica
    productEls = root.querySelectorAll('[class*="product"]').filter(el =>
      el.querySelector('a') !== null && (el.querySelector('img') !== null || el.querySelector('[class*="price"]') !== null),
    );
  }

  for (const el of productEls) {
    // Nome
    const nameEl = el.querySelector(
      'h2, h3, h4, [class*="name"], [class*="title"], [class*="product-name"], [itemprop="name"]',
    );
    const name = nameEl?.text?.trim() ?? '';
    if (!name || name.length < 3) continue;

    // URL
    const linkEl = el.querySelector('a');
    const href = linkEl?.getAttribute('href') ?? '';
    const url = href.startsWith('http') ? href : href ? `https://www.sephora.com.br${href}` : baseUrl;

    // Imagem
    const imgEl = el.querySelector('img');
    const image = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('data-lazy-src') ?? '';

    // Preço
    const priceEl = el.querySelector(
      '[class*="price"], [itemprop="price"], [class*="valor"], [class*="Price"]',
    );
    const priceText = priceEl?.text?.replace(/[R$\s.]/g, '').replace(',', '.') ?? '0';
    const price = parseFloat(priceText) || 0;

    // Marca
    const brandEl = el.querySelector('[class*="brand"], [itemprop="brand"], [class*="Brand"]');
    const brand = brandEl?.text?.trim() ?? extractBrandFromTitle(name);

    // Cores (swatches)
    const colorEls = el.querySelectorAll('[class*="swatch"], [class*="color"], [class*="shade"]');
    const colors: ColorVariant[] = [];
    for (const colorEl of colorEls) {
      const colorName = colorEl.getAttribute('title') ?? colorEl.getAttribute('aria-label') ?? colorEl.text?.trim();
      if (colorName && colorName.length > 1 && colorName.length < 50) {
        const colorImg = colorEl.querySelector('img')?.getAttribute('src') ?? '';
        colors.push({ name: colorName, ...(colorImg.startsWith('http') ? { image: colorImg } : {}) });
      }
    }

    if (url && (name || brand)) {
      results.push({
        name,
        brand: brand || extractBrandFromTitle(name),
        price,
        url,
        image: image.startsWith('http') ? image : '',
        images: image.startsWith('http') ? [image] : [],
        description: '',
        colors,
      });
    }
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
    id: generateId('seph'),
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
    // Sempre registra a URL da Sephora como entrada de preço.
    // price=0 significa "ver preço no site" — o front-end trata esse caso.
    prices: product.url ? [{
      store: STORE_NAME,
      price: product.price,
      url: product.url,
      logo: STORE_LOGO,
      inStock: product.price > 0,
    }] : [],
    colors: product.colors,
    tags: [category.toLowerCase(), product.brand.toLowerCase(), 'sephora'],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Scraping de uma categoria ────────────────────────────────────────────────

async function scrapeCategory(
  categoryUrl: string,
  label: string,
  pages: number,
  dedup: Deduplicator,
): Promise<{ inserted: number; updated: number; duplicate: number; skipped: number }> {
  const stats = { inserted: 0, updated: 0, duplicate: 0, skipped: 0 };

  console.log(`\n  📂 Categoria: ${label}`);

  for (let page = 0; page < pages; page++) {
    const start = page * PAGE_SIZE;
    const url = `${categoryUrl}?sz=${PAGE_SIZE}&start=${start}`;

    process.stdout.write(`     Página ${page + 1}/${pages}... `);
    const html = await fetchPage(url);

    if (!html) {
      process.stdout.write('❌ falha\n');
      stats.skipped++;
      continue;
    }

    // Tenta as 3 estratégias em ordem
    let scraped: ScrapedProduct[] = extractFromNextData(html);
    if (scraped.length === 0) scraped = extractFromJsonLd(html);
    if (scraped.length === 0) scraped = extractFromHtml(html, categoryUrl);

    process.stdout.write(`${scraped.length} produtos encontrados\n`);

    // Detecta fim da paginação
    if (scraped.length === 0) break;

    for (const p of scraped) {
      const entry = toCatalogEntry(p);
      if (!entry) { stats.skipped++; continue; }

      const result = dedup.add(entry);
      if (result === 'inserted') stats.inserted++;
      else if (result === 'updated') stats.updated++;
      else stats.duplicate++;
    }

    await sleep(DELAY_MS + Math.random() * 1000);
  }

  return stats;
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const exportTs = args.includes('--export-ts');

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   CoScore — Sync Sephora Brasil              ║');
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

  for (const { url, label, pages } of CATEGORIES) {
    const stats = await scrapeCategory(url, label, pages, dedup);
    totalInserted += stats.inserted;
    totalUpdated += stats.updated;
    totalDuplicate += stats.duplicate;
    totalSkipped += stats.skipped;

    console.log(`  → ${stats.inserted} novos | ${stats.updated} atualizados | ${stats.duplicate} duplicatas | ${stats.skipped} ignorados`);
  }

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  RELATÓRIO — SEPHORA');
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
    console.log('   O site pode estar usando renderização client-side (JavaScript).');
    console.log('   Verifique se a URL responde com HTML completo.');
  }
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
