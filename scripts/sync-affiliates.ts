/**
 * sync-affiliates.ts
 * ──────────────────
 * Baixa e processa feeds de produtos de programas de afiliados
 * (Admitad, Lomadee, CJ Affiliate, etc.) para popular o catálogo CoScore.
 *
 * Formatos suportados:
 *  - admitad-xml   → YML/XML padrão Admitad (Sephora, Boticário, etc.)
 *  - csv           → CSV genérico com mapeamento configurável
 *
 * Configuração:
 *  Crie o arquivo scripts/feeds.config.json baseado em feeds.config.example.json
 *
 * Uso:
 *  npm run sync-affiliates
 *  npx tsx scripts/sync-affiliates.ts --dry-run
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { loadCatalog, saveCatalog, generateId } from './lib/storage';
import { Deduplicator } from './lib/deduplicator';
import { mapCategory } from './lib/category-mapper';
import { cleanProductName, buildDisplayName, extractBrandFromTitle } from './lib/normalizer';
import type { CatalogEntry } from './lib/types';
import type { Category } from '../src/types/index';

// ─── Tipos de configuração ────────────────────────────────────────────────────

interface StoreInfo {
  name: string;
  logo: string;
}

interface CsvMapping {
  name: string;
  brand?: string;
  price: string;
  url: string;
  image: string;
  ean?: string;
  description?: string;
  category?: string;
}

interface FeedConfig {
  name: string;
  url: string;
  format: 'admitad-xml' | 'csv';
  enabled?: boolean;
  csvMapping?: CsvMapping;
  csvDelimiter?: string;
  storeInfo: StoreInfo;
}

interface FeedsFile {
  feeds: FeedConfig[];
}

// ─── Configurações de lojas ───────────────────────────────────────────────────

const STORE_LOGOS: Record<string, string> = {
  'Sephora': 'https://logodownload.org/wp-content/uploads/2019/11/sephora-logo.png',
  'Beleza na Web': 'https://logodownload.org/wp-content/uploads/2020/02/beleza-na-web-logo.png',
  'O Boticário': 'https://logodownload.org/wp-content/uploads/2014/09/o-boticario-logo.png',
  'Natura': 'https://logodownload.org/wp-content/uploads/2014/10/natura-logo.png',
  'Mercado Livre': 'https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/6.6.92/mercadolibre/logo_large_25years@2x.png',
  'Netfarma': 'https://logodownload.org/wp-content/uploads/netfarma-logo.png',
  'Drogasil': 'https://logodownload.org/wp-content/uploads/drogasil-logo.png',
  'default': 'https://via.placeholder.com/80x40?text=Loja',
};

function getStoreLogo(storeName: string): string {
  return STORE_LOGOS[storeName] ?? STORE_LOGOS['default'];
}

// ─── Download do feed ─────────────────────────────────────────────────────────

async function downloadFeed(url: string): Promise<string> {
  // Suporte a arquivo local (para testes)
  if (url.startsWith('file://') || fs.existsSync(url)) {
    return fs.readFileSync(url.replace('file://', ''), 'utf-8');
  }

  console.log(`  📥 Baixando feed: ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CoScore-AffiliateSync/1.0', 'Accept': '*/*' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar feed: ${url}`);
  return res.text();
}

// ─── Parser XML (formato Admitad YML) ────────────────────────────────────────

interface AdmitadOffer {
  '@_id'?: string;
  '@_available'?: string;
  name?: string;
  vendor?: string;
  vendorCode?: string;
  brand?: string;
  price?: number | string;
  picture?: string | string[];
  url?: string;
  description?: string;
  barcode?: string;
  categoryId?: number | string;
  param?: AdmitadParam | AdmitadParam[];
}

interface AdmitadParam {
  '@_name': string;
  '#text': string;
}

function parseAdmitadXml(xmlContent: string, feed: FeedConfig): CatalogEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['offer', 'picture', 'param'].includes(name),
    parseTagValue: true,
  });

  const parsed = parser.parse(xmlContent);
  const offers: AdmitadOffer[] = parsed?.yml_catalog?.shop?.offers?.offer
    ?? parsed?.rss?.channel?.item
    ?? parsed?.feed?.entry
    ?? [];

  if (!Array.isArray(offers) || offers.length === 0) {
    console.warn(`  ⚠ Nenhuma oferta encontrada no XML do feed "${feed.name}"`);
    return [];
  }

  const entries: CatalogEntry[] = [];
  const now = new Date().toISOString();

  for (const offer of offers) {
    if (offer['@_available'] === 'false') continue;

    const rawName = String(offer.name ?? '').trim();
    if (!rawName) continue;

    const rawBrand = String(offer.vendor ?? offer.brand ?? '').trim()
      || extractBrandFromTitle(rawName);

    const price = parseFloat(String(offer.price ?? '0')) || 0;
    const url = String(offer.url ?? '').trim();
    const description = String(offer.description ?? '').slice(0, 500).trim();
    const ean = String(offer.barcode ?? '').trim() || undefined;

    // Coleta fotos
    const pictures = Array.isArray(offer.picture)
      ? offer.picture.map(String)
      : offer.picture ? [String(offer.picture)] : [];

    const category = mapCategory(rawName, String(offer.categoryId ?? ''));
    if (!category) continue;

    const cleanedName = cleanProductName(rawName);
    const displayName = buildDisplayName(cleanedName, rawBrand) || cleanedName;
    if (displayName.length < 3) continue;

    entries.push({
      id: generateId(),
      name: displayName,
      brand: rawBrand,
      category,
      description: description || `${displayName} - ${rawBrand}`,
      image: pictures[0] ?? '',
      images: pictures.slice(0, 5),
      ean: ean || undefined,
      mlIds: [],
      averageRating: 0,
      reviewCount: 0,
      prices: price > 0 && url ? [{
        store: feed.storeInfo.name,
        price,
        url,
        logo: feed.storeInfo.logo || getStoreLogo(feed.storeInfo.name),
        inStock: true,
      }] : [],
      colors: [],
      tags: [category.toLowerCase(), rawBrand.toLowerCase()],
      createdAt: now,
      updatedAt: now,
    });
  }

  return entries;
}

// ─── Parser CSV genérico ──────────────────────────────────────────────────────

function parseCsv(content: string, feed: FeedConfig): CatalogEntry[] {
  const mapping = feed.csvMapping;
  if (!mapping) {
    console.warn(`  ⚠ Feed "${feed.name}" com format=csv sem csvMapping configurado.`);
    return [];
  }

  const delimiter = feed.csvDelimiter ?? ',';
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse do cabeçalho
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const getCol = (row: string[], colName: string): string => {
    const idx = headers.indexOf(colName);
    if (idx === -1) return '';
    const val = row[idx] ?? '';
    return val.replace(/^"|"$/g, '').trim();
  };

  const entries: CatalogEntry[] = [];
  const now = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(delimiter);

    const rawName = getCol(row, mapping.name);
    if (!rawName) continue;

    const rawBrand = mapping.brand ? getCol(row, mapping.brand) : extractBrandFromTitle(rawName);
    const price = parseFloat(getCol(row, mapping.price).replace(',', '.')) || 0;
    const url = getCol(row, mapping.url);
    const image = getCol(row, mapping.image);
    const ean = mapping.ean ? getCol(row, mapping.ean) || undefined : undefined;
    const description = mapping.description
      ? getCol(row, mapping.description).slice(0, 500)
      : '';

    // Categoria: do feed ou inferida pelo título
    const mlCategory = mapping.category ? getCol(row, mapping.category) : '';
    const category: Category | null = mapCategory(rawName, mlCategory);
    if (!category) continue;

    const cleanedName = cleanProductName(rawName);
    const displayName = buildDisplayName(cleanedName, rawBrand) || cleanedName;
    if (displayName.length < 3) continue;

    entries.push({
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
      prices: price > 0 && url ? [{
        store: feed.storeInfo.name,
        price,
        url,
        logo: feed.storeInfo.logo || getStoreLogo(feed.storeInfo.name),
        inStock: true,
      }] : [],
      colors: [],
      tags: [category.toLowerCase(), rawBrand.toLowerCase()],
      createdAt: now,
      updatedAt: now,
    });
  }

  return entries;
}

// ─── Processa um feed ─────────────────────────────────────────────────────────

async function processFeed(
  feed: FeedConfig,
  dedup: Deduplicator,
): Promise<{ inserted: number; updated: number; duplicate: number; errors: number }> {
  const stats = { inserted: 0, updated: 0, duplicate: 0, errors: 0 };

  try {
    const content = await downloadFeed(feed.url);

    let entries: CatalogEntry[] = [];
    if (feed.format === 'admitad-xml') {
      entries = parseAdmitadXml(content, feed);
    } else if (feed.format === 'csv') {
      entries = parseCsv(content, feed);
    } else {
      console.warn(`  ⚠ Formato desconhecido: ${(feed as FeedConfig).format}`);
      return stats;
    }

    console.log(`  📦 ${entries.length} produtos lidos do feed`);

    for (const entry of entries) {
      const result = dedup.add(entry);
      stats[result === 'duplicate' ? 'duplicate' : result]++;
    }
  } catch (err) {
    stats.errors++;
    console.error(`  ✗ Erro no feed "${feed.name}": ${err instanceof Error ? err.message : err}`);
  }

  return stats;
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  const configPath = path.join(process.cwd(), 'scripts', 'feeds.config.json');
  if (!fs.existsSync(configPath)) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════╗');
    console.error('║  CONFIGURAÇÃO NECESSÁRIA                                 ║');
    console.error('║                                                          ║');
    console.error('║  Crie o arquivo scripts/feeds.config.json               ║');
    console.error('║  usando como base feeds.config.example.json             ║');
    console.error('║                                                          ║');
    console.error('║  Adicione a URL do feed de cada programa de afiliados.  ║');
    console.error('╚══════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  const feedsFile: FeedsFile = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const activeFeeds = feedsFile.feeds.filter(f => f.enabled !== false);

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   CoScore — Sync de Feeds de Afiliados       ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nFeeds ativos: ${activeFeeds.length}`);
  activeFeeds.forEach(f => console.log(`  • ${f.name} (${f.format})`));
  if (isDryRun) console.log('\n⚠  Dry run — nada será salvo.');
  console.log('');

  const catalog = loadCatalog();
  const dedup = new Deduplicator(catalog.products);
  const initialSize = dedup.size;

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalDuplicate = 0;
  let totalErrors = 0;

  for (const feed of activeFeeds) {
    console.log(`\n🔗 Feed: ${feed.name}`);
    const stats = await processFeed(feed, dedup);

    console.log(`  ✅ ${stats.inserted} novos | 🔄 ${stats.updated} atualizados | ⏭ ${stats.duplicate} duplicatas | ✗ ${stats.errors} erros`);
    totalInserted += stats.inserted;
    totalUpdated += stats.updated;
    totalDuplicate += stats.duplicate;
    totalErrors += stats.errors;
  }

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  RELATÓRIO — AFILIADOS');
  console.log('══════════════════════════════════════════════');
  console.log(`  Catálogo antes:           ${initialSize}`);
  console.log(`  Novos inseridos:          ${totalInserted}`);
  console.log(`  Registros atualizados:    ${totalUpdated}`);
  console.log(`  Duplicatas ignoradas:     ${totalDuplicate}`);
  console.log(`  Erros:                    ${totalErrors}`);
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
