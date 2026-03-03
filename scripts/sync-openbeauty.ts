/**
 * sync-openbeauty.ts
 * ──────────────────
 * Busca produtos na Open Beauty Facts (openbeautyfacts.org) — base de dados
 * colaborativa e totalmente aberta, sem autenticação necessária.
 *
 * Foco: complementar o catálogo com EANs, ingredientes e fotos de produtos
 * que já existem via outras fontes, e adicionar produtos que faltaram.
 *
 * Uso:
 *  npm run sync-openbeauty
 *  npx tsx scripts/sync-openbeauty.ts --dry-run
 *  npx tsx scripts/sync-openbeauty.ts --pages=5
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { loadCatalog, saveCatalog, generateId } from './lib/storage';
import { Deduplicator } from './lib/deduplicator';
import { mapCategory } from './lib/category-mapper';
import { cleanProductName, buildDisplayName, extractBrandFromTitle } from './lib/normalizer';
import type { CatalogEntry } from './lib/types';

// ─── Configuração ─────────────────────────────────────────────────────────────

const BASE_URL = 'https://world.openbeautyfacts.org';
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 1000;

// Termos de busca focados em cosméticos com popularidade no Brasil
const SEARCH_TERMS = [
  'batom',
  'base maquiagem',
  'mascara cilios',
  'sombra maquiagem',
  'blush maquiagem',
  'iluminador rosto',
  'primer maquiagem',
  'contorno bronzer',
  'serum facial',
  'hidratante facial',
  'protetor solar',
  'perfume',
  'ruby rose',
  'vult maquiagem',
  'maybelline',
  "l'oreal maquiagem",
  'nyx cosmetics',
  'quem disse berenice',
  'dailus',
  'océane',
];

// ─── Tipos da API ─────────────────────────────────────────────────────────────

interface OBFProduct {
  code?: string;           // EAN/barcode
  product_name?: string;
  product_name_pt?: string;
  brands?: string;
  categories_tags?: string[];
  image_front_url?: string;
  image_url?: string;
  ingredients_text?: string;
  countries_tags?: string[];
  quantity?: string;
}

interface OBFSearchResponse {
  count: number;
  page: number;
  page_count: number;
  page_size: number;
  products: OBFProduct[];
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOBF(url: string): Promise<OBFSearchResponse | null> {
  try {
    await sleep(REQUEST_DELAY_MS);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CoScore-CatalogSync/1.0 (contato@coscore.com.br)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    return await res.json() as OBFSearchResponse;
  } catch {
    return null;
  }
}

// Filtra se o produto é provavelmente brasileiro
function isBrazilianProduct(product: OBFProduct): boolean {
  const countries = product.countries_tags ?? [];
  if (countries.length === 0) return true; // sem info de país → inclui
  return countries.some(c =>
    c.includes('brazil') || c.includes('brasil') || c.includes('pt-br'),
  );
}

// Mapeia produto OBF para CatalogEntry
function mapOBFProduct(product: OBFProduct): CatalogEntry | null {
  const rawName = (product.product_name_pt || product.product_name || '').trim();
  if (!rawName || rawName.length < 3) return null;

  // Tenta inferir categoria pelo nome e pelas tags de categoria
  const categoryHint = (product.categories_tags ?? [])
    .map(t => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '))
    .join(' ');

  const category = mapCategory(`${rawName} ${categoryHint}`, '');
  if (!category) return null;

  const rawBrand = (product.brands ?? '').split(',')[0].trim()
    || extractBrandFromTitle(rawName);

  const ean = product.code && product.code.length >= 8 ? product.code : undefined;
  const image = product.image_front_url || product.image_url || '';
  const description = (product.ingredients_text ?? '').slice(0, 500).trim();

  const cleanedName = cleanProductName(rawName);
  const displayName = buildDisplayName(cleanedName, rawBrand) || cleanedName;
  if (displayName.length < 3) return null;

  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: displayName,
    brand: rawBrand,
    category,
    description: description || `${displayName} - ${rawBrand}`,
    image,
    images: image ? [image] : [],
    ean,
    mlIds: [],
    averageRating: 0,
    reviewCount: 0,
    prices: [],
    colors: [],
    tags: [category.toLowerCase(), rawBrand.toLowerCase(), 'open-beauty-facts'],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Busca por termo ──────────────────────────────────────────────────────────

async function searchTerm(
  term: string,
  maxPages: number,
  dedup: Deduplicator,
): Promise<{ inserted: number; updated: number; duplicate: number; skipped: number }> {
  const stats = { inserted: 0, updated: 0, duplicate: 0, skipped: 0 };

  for (let page = 1; page <= maxPages; page++) {
    const url =
      `${BASE_URL}/cgi/search.pl` +
      `?search_terms=${encodeURIComponent(term)}` +
      `&search_simple=1&action=process&json=1` +
      `&page_size=${PAGE_SIZE}&page=${page}` +
      `&tagtype_0=countries&tag_contains_0=contains&tag_0=brazil`;

    const response = await fetchOBF(url);
    if (!response || response.products.length === 0) break;

    for (const product of response.products) {
      if (!isBrazilianProduct(product)) {
        stats.skipped++;
        continue;
      }

      const entry = mapOBFProduct(product);
      if (!entry) {
        stats.skipped++;
        continue;
      }

      const result = dedup.add(entry);
      if (result === 'duplicate') stats.duplicate++;
      else if (result === 'updated') stats.updated++;
      else stats.inserted++;
    }

    // Só tem mais páginas se retornou página completa
    if (response.products.length < PAGE_SIZE) break;
  }

  return stats;
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  const pagesArg = args.find(a => a.startsWith('--pages='));
  const maxPages = pagesArg ? parseInt(pagesArg.split('=')[1], 10) : 3;

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   CoScore — Sync Open Beauty Facts           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nTermos de busca: ${SEARCH_TERMS.length}`);
  console.log(`Páginas por termo: ${maxPages} (${maxPages * PAGE_SIZE} produtos/termo)`);
  if (isDryRun) console.log('\n⚠  Dry run — nada será salvo.');
  console.log('');

  const catalog = loadCatalog();
  const dedup = new Deduplicator(catalog.products);
  const initialSize = dedup.size;

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalDuplicate = 0;
  let totalSkipped = 0;

  for (const term of SEARCH_TERMS) {
    process.stdout.write(`  Buscando "${term}"...`);
    const stats = await searchTerm(term, maxPages, dedup);
    console.log(` ✅ ${stats.inserted} novos | 🔄 ${stats.updated} atualizados | ⏭ ${stats.duplicate} dup | ✗ ${stats.skipped} pulados`);
    totalInserted += stats.inserted;
    totalUpdated += stats.updated;
    totalDuplicate += stats.duplicate;
    totalSkipped += stats.skipped;
  }

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  RELATÓRIO — OPEN BEAUTY FACTS');
  console.log('══════════════════════════════════════════════');
  console.log(`  Catálogo antes:           ${initialSize}`);
  console.log(`  Novos inseridos:          ${totalInserted}`);
  console.log(`  Registros atualizados:    ${totalUpdated}`);
  console.log(`  Duplicatas ignoradas:     ${totalDuplicate}`);
  console.log(`  Pulados (sem categoria):  ${totalSkipped}`);
  console.log(`  Catálogo depois:          ${dedup.size}`);
  console.log('══════════════════════════════════════════════');

  if (!isDryRun) {
    catalog.products = dedup.all;
    saveCatalog(catalog);
    console.log(`\n💾 Catálogo salvo em scripts/output/catalog.json`);
  }
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
