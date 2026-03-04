/**
 * sync-catalog-by-category.ts
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Reabastece o catÃ¡logo do Mercado Livre com 10â€“50 produtos por subcategoria.
 * Variantes de cor ficam agrupadas no mesmo produto (sem duplicaÃ§Ã£o).
 *
 * Uso:
 *   npx tsx scripts/sync-catalog-by-category.ts           â†’ refaz catÃ¡logo e salva catalog.json
 *   npx tsx scripts/sync-catalog-by-category.ts --export   â†’ refaz e exporta src/data/products.ts
 *   npx tsx scripts/sync-catalog-by-category.ts --merge    â†’ mantÃ©m catÃ¡logo existente e sÃ³ completa categorias com < 10
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import type { Category } from '../src/types';
import { GROUP_CATEGORIES } from '../src/types';
import {
  searchProducts,
  checkAuthRequired,
  PAGE_SIZE,
} from './lib/ml-client';
import { loadCatalog, saveCatalog, exportToProductsTs, CATALOG_PATH } from './lib/storage';
import { Deduplicator } from './lib/deduplicator';
import { postDeduplicateByNameSimilarity } from './lib/post-dedup';
import { buildEntry, type Stats } from './sync-catalog';
import type { CatalogEntry, CatalogFile } from './lib/types';

const MIN_PER_CATEGORY = 10;
const MAX_PER_CATEGORY = 50;
const MAX_PAGES_PER_QUERY = 3; // 3 x 50 = 150 itens por query
// Categorias com poucos resultados no ML: buscar mais pÃ¡ginas por query
const EXTRA_PAGES_PER_QUERY: Partial<Record<string, number>> = {
  'PÃ³ Facial': 5, // 5 x 50 = 250 itens por query, mais variaÃ§Ãµes
};
const REQUEST_DELAY_MS = 600;

// Buscas por subcategoria (queries que tendem a retornar produtos dessa categoria)
const CATEGORY_QUERIES: Record<string, string[]> = {
  'Batom': ['batom lipstick', 'batom matte nude', 'batom liquido'],
  'Gloss': ['lip gloss brilho labial', 'gloss labial'],
  'LÃ¡pis Labial': ['lapis labial lip liner', 'contorno labial'],
  'Base': ['base liquida maquiagem', 'base foundation', 'bb cream'],
  'Corretivo': ['corretivo concealer', 'anti olheira'],
  'PÃ³ Facial': [
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
  ],
  'Primer': ['primer maquiagem', 'pre-base'],
  'Fixador de Maquiagem': ['fixador maquiagem spray', 'setting spray'],
  'MÃ¡scara de CÃ­lios': ['mascara de cilios', 'rÃ­mel'],
  'Sombra': ['sombra eyeshadow', 'paleta sombra'],
  'Delineador': ['delineador eyeliner'],
  'Blush': ['blush rouge', 'blush compacto'],
  'Iluminador': ['iluminador highlighter'],
  'Contorno/Bronzer': ['contorno bronzer', 'bronzer', 'bronzer contouring'],
  'Esponjas e PincÃ©is': ['esponja maquiagem', 'beauty blender', 'pincel maquiagem'],
  'SÃ©rum': ['serum facial vitamina c', 'sÃ©rum retinol', 'acido hialuronico'],
  'Hidratante': ['hidratante facial', 'creme hidratante corporal'],
  'Protetor Solar': ['protetor solar facial fps', 'filtro solar'],
  'TÃ´nico Facial': ['tonico facial', 'agua micelar'],
  'Limpeza Facial': ['gel limpeza facial', 'sabonete facial'],
  'MÃ¡scara Facial': ['mascara facial argila', 'sheet mask'],
  'Esfoliante': ['esfoliante facial', 'scrub facial'],
  'Creme para Olhos': ['creme olhos', 'contorno olhos'],
  'Perfume': ['perfume feminino', 'eau de parfum'],
  'Perfume Masculino': ['perfume masculino', 'colonia masculina'],
  'Shampoo': ['shampoo cabelo', 'shampoo anticaspa'],
  'Cabelo Homem': ['shampoo homem', 'shampoo masculino', 'gel capilar homem'],
  'Condicionador': ['condicionador cabelo', 'balsamo capilar'],
  'MÃ¡scara Capilar': ['mascara capilar', 'hair mask'],
  'Leave-in': ['leave-in cabelo', 'creme sem enxague'],
  'Ã“leo Capilar': ['oleo capilar', 'oleo argan cabelo'],
  'Tintura': ['tintura cabelo', 'coloracao capilar'],
  'Finalizador': ['finalizador cabelo', 'creme para pentear', 'mousse capilar'],
};

// Buscas por marca (catÃ¡logo ML) â€” trazem mais produtos dessas marcas; a categoria Ã© definida pelo mapper
const BRAND_QUERIES: string[] = [
  'eudora niina secrets maquiagem',
  'fran by fr cosmeticos',
  'mascavo maquiagem',
  'boca rosa beauty',
  'mari maria makeup',
  'karen bachini beauty',
  'bruna tavares maquiagem',
];

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function countByCategory(products: CatalogEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of products) {
    out[p.category] = (out[p.category] ?? 0) + 1;
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const doExport = args.includes('--export');
  const merge = args.includes('--merge');

  console.log('â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—');
  console.log('â•‘   CoScore â€” Sync por Categoria (10â€“50 por subcategoria)   â•‘');
  console.log('â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
  console.log('');
  console.log(`Modo:        ${merge ? 'Completar (manter existente)' : 'Refazer catÃ¡logo'}`);
  console.log(`Exportar TS: ${doExport ? 'Sim' : 'NÃ£o'}`);
  console.log(`Meta:        ${MIN_PER_CATEGORY}â€“${MAX_PER_CATEGORY} produtos por subcategoria`);
  console.log('');

  await checkAuthRequired();

  const catalog: CatalogFile = merge ? loadCatalog() : {
    version: 1,
    lastSync: '',
    totalProducts: 0,
    products: [],
  };

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

  const categoriesOrder: Category[] = [];
  for (const group of Object.keys(GROUP_CATEGORIES) as (keyof typeof GROUP_CATEGORIES)[]) {
    categoriesOrder.push(...GROUP_CATEGORIES[group]);
  }

  for (const category of categoriesOrder) {
    const currentCount = dedup.all.filter(p => p.category === category).length;
    if (currentCount >= MAX_PER_CATEGORY) {
      console.log(`â­ ${category}: jÃ¡ tem ${currentCount} (mÃ¡x ${MAX_PER_CATEGORY})`);
      continue;
    }

    const queries = CATEGORY_QUERIES[category] ?? [category];
    let added = 0;
    let page = 0;
    let done = false;

    console.log(`\nðŸ“‚ ${category} (atual: ${currentCount}, meta: ${MIN_PER_CATEGORY}â€“${MAX_PER_CATEGORY})`);

    const maxPages = EXTRA_PAGES_PER_QUERY[category] ?? MAX_PAGES_PER_QUERY;
    for (const query of queries) {
      if (done) break;
      page = 0;

      while (page < maxPages) {
        const countNow = dedup.all.filter(p => p.category === category).length;
        if (countNow >= MAX_PER_CATEGORY) {
          done = true;
          break;
        }

        const offset = page * PAGE_SIZE;
        process.stdout.write(`  "${query}" pÃ¡g ${page + 1}/${maxPages}... `);

        try {
          await sleep(REQUEST_DELAY_MS);
          const response = await searchProducts(query, offset);
          const items = response.results;
          if (items.length === 0) break;

          let pageAdded = 0;
          for (const item of items) {
            stats.fetched++;
            const entry = buildEntry(item, stats);
            if (!entry || entry.category !== category) continue;

            const result = dedup.add(entry);
            if (result === 'inserted') {
              stats.inserted++;
              pageAdded++;
              added++;
            } else if (result === 'updated') {
              stats.updated++;
            }
          }

          console.log(`+${pageAdded} (total categoria: ${dedup.all.filter(p => p.category === category).length})`);
          if (pageAdded === 0 && countNow >= MIN_PER_CATEGORY) done = true;
          page++;
        } catch (err) {
          console.error(`Erro: ${err}`);
          stats.errors++;
          break;
        }
      }
    }

    const finalCount = dedup.all.filter(p => p.category === category).length;
    if (finalCount < MIN_PER_CATEGORY) {
      console.log(`  âš  ${category}: ficou com ${finalCount} (mÃ­nimo ${MIN_PER_CATEGORY})`);
    }
  }

  // Buscas por marca (Eudora Niina Secrets, Fran by FR, Mascavo, Boca Rosa Beauty, Mari Maria Makeup, Karen Bachini Beauty, Bruna Tavares)
  const BRAND_PAGES = 2;
  console.log('\nðŸ·ï¸ Buscas por marca (ML)...');
  for (const query of BRAND_QUERIES) {
    for (let page = 0; page < BRAND_PAGES; page++) {
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
          if (!entry) continue;
          const result = dedup.add(entry);
          if (result === 'inserted') {
            stats.inserted++;
            pageAdded++;
          } else if (result === 'updated') {
            stats.updated++;
          }
        }
        if (pageAdded > 0) {
          console.log(`  "${query}" pÃ¡g ${page + 1}: +${pageAdded} (total inseridos: ${stats.inserted})`);
        }
      } catch (err) {
        console.warn(`  "${query}" pÃ¡g ${page + 1}: ${err}`);
        stats.errors++;
        break;
      }
    }
  }

  // PÃ³s-deduplicaÃ§Ã£o por similaridade de nome (agrupa mais variantes de cor)
  const beforePost = dedup.all.length;
  catalog.products = postDeduplicateByNameSimilarity(dedup.all);
  const postRemoved = beforePost - catalog.products.length;
  if (postRemoved > 0) {
    console.log(`\nðŸ”— PÃ³s-dedup por similaridade: ${postRemoved} variantes agrupadas`);
  }

  // Limitar a MAX_PER_CATEGORY por categoria (opcional: manter primeiros 50 por categoria)
  const byCat = new Map<string, CatalogEntry[]>();
  for (const p of catalog.products) {
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category)!.push(p);
  }
  catalog.products = [];
  for (const [, list] of byCat) {
    catalog.products.push(...list.slice(0, MAX_PER_CATEGORY));
  }

  const counts = countByCategory(catalog.products);
  console.log('\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
  console.log('  PRODUTOS POR CATEGORIA (apÃ³s dedup e limite)');
  console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
  for (const cat of categoriesOrder) {
    const n = counts[cat] ?? 0;
    const ok = n >= MIN_PER_CATEGORY && n <= MAX_PER_CATEGORY;
    console.log(`  ${ok ? 'âœ“' : (n < MIN_PER_CATEGORY ? 'âš ' : 'Â·')} ${cat}: ${n}`);
  }
  console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
  console.log(`  Total: ${catalog.products.length} produtos`);
  console.log(`  Inseridos: ${stats.inserted} | Atualizados: ${stats.updated} | Erros: ${stats.errors}`);
  console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');

  saveCatalog(catalog);
  console.log(`\nðŸ’¾ CatÃ¡logo salvo: ${CATALOG_PATH}`);

  if (doExport) {
    exportToProductsTs(catalog.products);
  } else {
    console.log('\nðŸ’¡ Para exportar src/data/products.ts:');
    console.log('   npx tsx scripts/sync-catalog-by-category.ts --export');
  }
}

main().catch(err => {
  console.error('\nâŒ Erro fatal:', err);
  process.exit(1);
});

