/**
 * sync-catalog.ts
 * ───────────────
 * Busca produtos do catálogo oficial do Mercado Livre (endpoint /products/search),
 * deduplica por EAN ou nome+marca, e salva em scripts/output/catalog.json.
 *
 * Uso:
 *   npm run sync-catalog              → busca e salva
 *   npm run sync-catalog:export       → busca, salva e exporta products.ts
 *
 * Flags:
 *   --export-ts     Exporta src/data/products.ts ao final
 *   --pages N       Máximo de páginas por busca (padrão: 2 — até 100 por keyword)
 *   --dry-run       Exibe o que seria inserido sem salvar nada
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import {
  searchProducts,
  extractAttribute,
  checkAuthRequired,
  ML_KEYWORD_SEARCHES,
  MAX_PAGES_PER_CATEGORY,
  PAGE_SIZE,
  type MLCatalogProduct,
} from './lib/ml-client';
import type { ColorVariant } from './lib/types';
import {
  cleanProductName,
  buildDisplayName,
  extractBrandFromTitle,
} from './lib/normalizer';
import { mapCategoryByDomain } from './lib/category-mapper';
import {
  loadCatalog,
  saveCatalog,
  exportToProductsTs,
  generateId,
  CATALOG_PATH,
} from './lib/storage';
import { Deduplicator } from './lib/deduplicator';
import { postDeduplicateByNameSimilarity } from './lib/post-dedup';
import type { CatalogEntry, CatalogFile } from './lib/types';

// ─── Argumentos ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const FLAG_EXPORT_TS = args.includes('--export-ts');
const FLAG_DRY_RUN = args.includes('--dry-run');

const pagesArg = args.find(a => a.startsWith('--pages='));
const MAX_PAGES = pagesArg ? parseInt(pagesArg.split('=')[1], 10) : MAX_PAGES_PER_CATEGORY;

// ─── Estatísticas ─────────────────────────────────────────────────────────────

export interface Stats {
  fetched: number;
  skippedNoCategory: number;
  skippedDuplicateEan: number;
  skippedDuplicateName: number;
  skippedInactive: number;
  inserted: number;
  updated: number;
  errors: number;
}

// ─── Constrói um CatalogEntry a partir de MLCatalogProduct ────────────────────

// ─── Filtro de conteúdo adulto/sexual ─────────────────────────────────────────
const BLOCKED_BRANDS_RE = /vibe\s*toys|a\s*s[aã]s/i;
const BLOCKED_NAME_RE   = /vibra(dor|t[oó]rio)|vibe\s*toys|lipstick\s*vibe|kiss\s*vibe|sex\s*(toy|shop)|er[oó]tic/i;

function isAdultProduct(name: string, brand: string): boolean {
  return BLOCKED_BRANDS_RE.test(brand) || BLOCKED_NAME_RE.test(name);
}

// ─── Filtro de acessórios/não-cosméticos ──────────────────────────────────────
// Remove pincéis, kits de ferramentas, borrachas e outros itens que não são
// o produto cosmético em si (e que contaminam o catálogo com entradas inúteis).
const ACCESSORY_NAME_RE = /\b(pincel|pinceis|pincéis|kit pincel|escova de po|escova de pó|escova facial|escova maquiagem|borracha escolar|massageador|organizador|porta|suporte|estojo|necessaire|bolsa maquiagem|esponja\s+aplicad|esponja beauty blender|refil (pincel|esponja)|cortador|apontador|washi tape|puff de po|puff de pó|almofada de po|almofada de pó|kabuki)\b/i;

function isAccessory(name: string): boolean {
  return ACCESSORY_NAME_RE.test(name);
}

export function buildEntry(product: MLCatalogProduct, stats: Stats): CatalogEntry | null {
  try {
    // Ignora produtos inativos
    if (product.status !== 'active') {
      stats.skippedInactive++;
      return null;
    }

    const name = product.name;
    const domainId = product.domain_id;

    // Determina categoria cedo para não filtrar Esponjas e Pincéis como acessório
    const category = mapCategoryByDomain(domainId, name);

    // Filtra conteúdo adulto/sexual e acessórios não-cosméticos (exceto Esponjas e Pincéis)
    const brandAttr = product.attributes?.find(a => a.id === 'BRAND')?.value_name ?? '';
    if (isAdultProduct(name, brandAttr) || (category !== 'Esponjas e Pincéis' && isAccessory(name))) {
      stats.skippedInactive++;
      return null;
    }

    // Extrai atributos
    const brand = extractAttribute(product.attributes, 'BRAND') ?? '';
    const ean = extractAttribute(product.attributes, 'GTIN') ?? undefined;
    const colorRaw = extractAttribute(product.attributes, 'COLOR') ?? '';

    // Categoria já definida acima
    if (!category) {
      stats.skippedNoCategory++;
      return null;
    }

    // Imagens — prefere URL de maior resolução
    const images = product.pictures
      .map(p => p.url)
      .filter(Boolean)
      .slice(0, 5);

    if (images.length === 0) {
      stats.skippedNoCategory++;
      return null;
    }

    // Descrição
    const description = product.short_description?.content?.slice(0, 500).trim() ?? '';

    // Limpa o nome e monta nome de exibição
    const cleanedName = cleanProductName(name);
    const displayName = buildDisplayName(cleanedName, brand) || cleanedName;

    if (!displayName || displayName.trim().length < 3) {
      stats.skippedNoCategory++;
      return null;
    }

    // Extrai marca do título se não veio dos atributos
    const finalBrand = brand || extractBrandFromTitle(name);

    // Normaliza cor: descarta valores genéricos/inúteis
    const JUNK_COLORS = new Set(['batom', 'base', 'produto', 'sem cor', 'outro', 'multicolor', 'multicor', 'única', 'unica', '']);
    const colorName = colorRaw && !JUNK_COLORS.has(colorRaw.toLowerCase().trim()) ? colorRaw.trim() : '';
    const colorVariant: ColorVariant | null = colorName ? { name: colorName, image: images[0] } : null;

    const now = new Date().toISOString();

    return {
      id: generateId(),
      name: displayName,
      brand: finalBrand.trim(),
      category,
      description: description || `${displayName}${finalBrand ? ' - ' + finalBrand : ''}`,
      image: images[0],
      images,
      ean,
      mlIds: [product.id],
      mlParentId: product.parent_id ?? undefined,
      colors: colorVariant ? [colorVariant] : [],
      averageRating: 0,
      reviewCount: 0,
      prices: [],
      tags: [category.toLowerCase(), finalBrand.toLowerCase()].filter(Boolean),
      createdAt: now,
      updatedAt: now,
    };
  } catch (err) {
    stats.errors++;
    console.error(`  ✗ Erro ao processar produto ${product.id}: ${err}`);
    return null;
  }
}

// ─── Sincroniza uma busca por palavra-chave ────────────────────────────────────

async function syncKeyword(
  query: string,
  label: string,
  dedup: Deduplicator,
  stats: Stats,
  maxPages: number,
): Promise<void> {
  console.log(`\n🔍 Buscando: "${query}" (${label})`);

  let page = 0;
  let totalAvailable = 0;
  let hasMore = true;

  while (hasMore && page < maxPages) {
    const offset = page * PAGE_SIZE;
    process.stdout.write(`  Página ${page + 1}/${maxPages}...`);

    let response;
    try {
      response = await searchProducts(query, offset);
    } catch (err) {
      console.error(`\n  ✗ Falha: ${err}`);
      stats.errors++;
      break;
    }

    const items = response.results;
    if (items.length === 0) break;

    totalAvailable = Math.min(response.paging.total, 100); // ML limita a 100
    hasMore = offset + items.length < totalAvailable && items.length === PAGE_SIZE;

    let pageInserted = 0;
    let pageDuplicate = 0;

    for (const item of items) {
      stats.fetched++;

      const entry = buildEntry(item, stats);
      if (!entry) continue;

      const result = dedup.add(entry);

      if (result === 'inserted') {
        stats.inserted++;
        pageInserted++;
      } else if (result === 'updated') {
        stats.updated++;
      } else {
        pageDuplicate++;
        if (entry.ean) stats.skippedDuplicateEan++;
        else stats.skippedDuplicateName++;
      }
    }

    console.log(` ✓ ${pageInserted} novos | ${pageDuplicate} duplicatas`);
    page++;
  }

  console.log(`  Disponíveis: ${totalAvailable} | Páginas buscadas: ${page}`);
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   CoScore — Sincronização de Catálogo        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`Fonte:        ML Catalog API (/products/search)`);
  console.log(`Exportar TS:  ${FLAG_EXPORT_TS ? 'Sim' : 'Não'}`);
  console.log(`Dry run:      ${FLAG_DRY_RUN ? 'Sim (nada será salvo)' : 'Não'}`);
  console.log(`Páginas/busca: ${MAX_PAGES} (até ${MAX_PAGES * PAGE_SIZE} produtos por keyword)`);
  console.log('');

  await checkAuthRequired();

  const catalog: CatalogFile = loadCatalog();
  console.log(`📂 Catálogo existente: ${catalog.products.length} produtos em ${CATALOG_PATH}`);

  const dedup = new Deduplicator(catalog.products);

  const stats: Stats = {
    fetched: 0,
    skippedNoCategory: 0,
    skippedDuplicateEan: 0,
    skippedDuplicateName: 0,
    skippedInactive: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  const startTime = Date.now();

  for (const { query, label } of ML_KEYWORD_SEARCHES) {
    await syncKeyword(query, label, dedup, stats, MAX_PAGES);
  }

  // Segunda passagem: agrupa variantes de cor por similaridade de nome
  const beforePostDedup = dedup.all.length;
  catalog.products = postDeduplicateByNameSimilarity(dedup.all);
  const postDedupRemoved = beforePostDedup - catalog.products.length;

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════════');
  console.log('  RELATÓRIO FINAL');
  console.log('══════════════════════════════════════════════');
  console.log(`  Itens buscados da API:           ${stats.fetched}`);
  console.log(`  Sem categoria (pulados):          ${stats.skippedNoCategory}`);
  console.log(`  Inativos (pulados):               ${stats.skippedInactive}`);
  console.log(`  Duplicatas por EAN:               ${stats.skippedDuplicateEan}`);
  console.log(`  Duplicatas por nome/marca:        ${stats.skippedDuplicateName}`);
  console.log(`  Registros atualizados:            ${stats.updated}`);
  console.log(`  ✅ Novos produtos inseridos:      ${stats.inserted}`);
  console.log(`  🔗 Agrupados por similaridade:    ${postDedupRemoved}`);
  console.log(`  Total no catálogo agora:          ${catalog.products.length}`);
  console.log(`  Erros:                            ${stats.errors}`);
  console.log(`  Tempo total:                      ${elapsedSec}s`);
  console.log('══════════════════════════════════════════════');

  if (FLAG_DRY_RUN) {
    console.log('\n⚠  Dry run ativo — nenhum arquivo foi alterado.');
    return;
  }

  saveCatalog(catalog);
  console.log(`\n💾 Catálogo salvo: scripts/output/catalog.json`);

  if (FLAG_EXPORT_TS) {
    exportToProductsTs(catalog.products);
  } else {
    console.log(`\n💡 Para atualizar src/data/products.ts, execute:`);
    console.log(`   npm run sync-catalog:export`);
  }
}

// Só executa main() quando o arquivo é chamado diretamente (não quando importado)
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('sync-catalog.ts')
  || process.argv[1]?.replace(/\\/g, '/').endsWith('sync-catalog.js');

if (isMain) {
  main().catch(err => {
    console.error('\n❌ Erro fatal:', err);
    process.exit(1);
  });
}
