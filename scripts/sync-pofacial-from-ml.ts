/**
 * sync-pofacial-from-ml.ts
 * ─────────────────────────
 * Refaz a seção Pó Facial usando apenas o catálogo do Mercado Livre.
 * Busca produtos de pó facial no ML, deduplica e substitui todos os
 * itens de Pó Facial no catalog.json; em seguida exporta products.ts.
 *
 * Requer: ML_ACCESS_TOKEN no .env.local
 * Uso: npx tsx scripts/sync-pofacial-from-ml.ts [--export]
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { searchProducts, checkAuthRequired, PAGE_SIZE } from './lib/ml-client';
import { loadCatalog, saveCatalog, exportToProductsTs, CATALOG_PATH } from './lib/storage';
import { Deduplicator } from './lib/deduplicator';
import { postDeduplicateByNameSimilarity } from './lib/post-dedup';
import { buildEntry, type Stats } from './sync-catalog';
import type { CatalogEntry, CatalogFile } from './lib/types';

const MAX_PO_FACIAL = 50;
const MAX_PAGES_PER_QUERY = 4;
const REQUEST_DELAY_MS = 600;

const PO_FACIAL_QUERIES = [
  'po facial compacto',
  'po translucido setting',
  'setting powder loose powder',
  'po solto fixador',
  'po compacto matte',
  'po facial HD',
  'po mineral facial',
  'po banana iluminador',
  'pressed powder compacto',
  'po fixador maquiagem',
  'vult po compacto',
  'maybelline po facial',
  'nyx po banana',
];

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const doExport = process.argv.includes('--export');

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   CoScore — Refazer Pó Facial a partir do ML            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Exportar products.ts: ${doExport ? 'Sim' : 'Não'}`);
  console.log(`Meta: até ${MAX_PO_FACIAL} produtos de Pó Facial`);
  console.log('');

  await checkAuthRequired();

  const catalog: CatalogFile = loadCatalog();
  const otherProducts = catalog.products.filter(p => p.category !== 'Pó Facial');

  const dedup = new Deduplicator([]);
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

  console.log(`📂 Catálogo: ${catalog.products.length} produtos (${otherProducts.length} fora de Pó Facial)`);
  console.log('\n🔍 Buscando Pó Facial no Mercado Livre...\n');

  for (const query of PO_FACIAL_QUERIES) {
    if (dedup.all.length >= MAX_PO_FACIAL) break;

    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
      if (dedup.all.length >= MAX_PO_FACIAL) break;

      const offset = page * PAGE_SIZE;
      try {
        await sleep(REQUEST_DELAY_MS);
        const response = await searchProducts(query, offset);
        const items = response.results;
        if (items.length === 0) break;

        let pageAdded = 0;
        for (const item of items) {
          stats.fetched++;
          const entry = buildEntry(item, stats);
          if (!entry || entry.category !== 'Pó Facial') continue;

          const result = dedup.add(entry);
          if (result === 'inserted') {
            stats.inserted++;
            pageAdded++;
          } else if (result === 'updated') {
            stats.updated++;
          }
        }
        if (pageAdded > 0) {
          console.log(`  "${query}" pág ${page + 1}: +${pageAdded} (total Pó Facial: ${dedup.all.length})`);
        }
      } catch (err) {
        console.warn(`  "${query}" pág ${page + 1}: ${err}`);
        stats.errors++;
        break;
      }
    }
  }

  let pofacialList = dedup.all;
  pofacialList = postDeduplicateByNameSimilarity(pofacialList);
  if (pofacialList.length > MAX_PO_FACIAL) {
    pofacialList = pofacialList.slice(0, MAX_PO_FACIAL);
  }

  catalog.products = [...otherProducts, ...pofacialList];
  saveCatalog(catalog);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Pó Facial: ${pofacialList.length} produtos (do ML)`);
  console.log(`  Total no catálogo: ${catalog.products.length}`);
  console.log(`  Inseridos: ${stats.inserted} | Atualizados: ${stats.updated} | Erros: ${stats.errors}`);
  console.log('══════════════════════════════════════════════════════════');
  console.log(`\n💾 Catálogo salvo: ${CATALOG_PATH}`);

  if (doExport) {
    exportToProductsTs(catalog.products);
  } else {
    console.log('\n💡 Para exportar src/data/products.ts:');
    console.log('   npx tsx scripts/sync-pofacial-from-ml.ts --export');
  }
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
