/**
 * sync-manual.ts
 * ──────────────
 * Lê o arquivo scripts/manual-products.csv e insere os produtos no catálogo,
 * aplicando a mesma normalização e deduplicação das demais fontes.
 *
 * Use quando um produto não é encontrado automaticamente por nenhuma fonte —
 * produtos exclusivos de lojas físicas, lançamentos recentes, marcas de nicho, etc.
 *
 * Formato do CSV: veja scripts/manual-products.csv como template.
 *
 * Uso:
 *  npm run sync-manual
 *  npx tsx scripts/sync-manual.ts --dry-run
 *  npx tsx scripts/sync-manual.ts --file=scripts/outra-lista.csv
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import fs from 'fs';
import path from 'path';
import { loadCatalog, saveCatalog, generateId } from './lib/storage';
import { Deduplicator } from './lib/deduplicator';
import { mapCategory } from './lib/category-mapper';
import { cleanProductName, buildDisplayName } from './lib/normalizer';
import type { CatalogEntry } from './lib/types';
import type { Category } from '../src/types/index';

// ─── Colunas esperadas no CSV ─────────────────────────────────────────────────
// Obrigatórias: name, brand, category
// Opcionais: description, image, ean, price, store, store_url, tags

const REQUIRED_COLUMNS = ['name', 'brand', 'category'] as const;

const VALID_CATEGORIES = new Set<Category>([
  'Batom', 'Base', 'Máscara de Cílios', 'Sombra', 'Blush', 'Iluminador',
  'Sérum', 'Hidratante', 'Protetor Solar', 'Perfume', 'Primer', 'Contorno',
]);

// ─── Parser CSV ───────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

function readCsv(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });
    return row;
  });

  return { headers, rows };
}

// ─── Conversão de linha CSV → CatalogEntry ────────────────────────────────────

function rowToEntry(row: Record<string, string>, lineNumber: number): CatalogEntry | null {
  const rawName = row['name']?.trim();
  const rawBrand = row['brand']?.trim();
  const rawCategory = row['category']?.trim() as Category | undefined;

  if (!rawName) {
    console.warn(`  ⚠ Linha ${lineNumber}: coluna "name" vazia — ignorando.`);
    return null;
  }
  if (!rawBrand) {
    console.warn(`  ⚠ Linha ${lineNumber}: coluna "brand" vazia para "${rawName}" — ignorando.`);
    return null;
  }

  // Valida categoria
  let category: Category;
  if (rawCategory && VALID_CATEGORIES.has(rawCategory)) {
    category = rawCategory;
  } else {
    // Tenta inferir pelo nome
    const inferred = mapCategory(rawName, '');
    if (!inferred) {
      console.warn(`  ⚠ Linha ${lineNumber}: categoria "${rawCategory}" inválida para "${rawName}" — ignorando.`);
      console.warn(`     Categorias aceitas: ${[...VALID_CATEGORIES].join(', ')}`);
      return null;
    }
    category = inferred;
  }

  const cleanedName = cleanProductName(rawName);
  const displayName = buildDisplayName(cleanedName, rawBrand) || rawName;

  const ean = row['ean']?.replace(/\D/g, '') || undefined;
  const description = (row['description'] ?? '').slice(0, 500).trim();
  const image = (row['image'] ?? '').trim();
  const price = parseFloat((row['price'] ?? '0').replace(',', '.')) || 0;
  const store = (row['store'] ?? '').trim();
  const storeUrl = (row['store_url'] ?? '').trim();
  const rawTags = (row['tags'] ?? '').split(';').map(t => t.trim()).filter(Boolean);

  const now = new Date().toISOString();

  return {
    id: generateId(),
    name: displayName,
    brand: rawBrand,
    category,
    description: description || `${displayName} - ${rawBrand}`,
    image,
    images: image ? [image] : [],
    ean: ean && ean.length >= 8 ? ean : undefined,
    mlIds: [],
    averageRating: 0,
    reviewCount: 0,
    prices: price > 0 && store && storeUrl ? [{
      store,
      price,
      url: storeUrl,
      logo: '',
      inStock: true,
    }] : [],
    colors: [],
    tags: [category.toLowerCase(), rawBrand.toLowerCase(), ...rawTags],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  const fileArg = args.find(a => a.startsWith('--file='));
  const csvPath = fileArg
    ? path.resolve(fileArg.split('=')[1])
    : path.join(process.cwd(), 'scripts', 'manual-products.csv');

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   CoScore — Sync Manual (CSV)                ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nArquivo: ${csvPath}`);
  if (isDryRun) console.log('⚠  Dry run — nada será salvo.');
  console.log('');

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Arquivo não encontrado: ${csvPath}`);
    console.error(`\nCrie o arquivo baseado no template em scripts/manual-products.csv`);
    process.exit(1);
  }

  const { headers, rows } = readCsv(csvPath);

  // Valida colunas obrigatórias
  const missingCols = REQUIRED_COLUMNS.filter(c => !headers.includes(c));
  if (missingCols.length > 0) {
    console.error(`❌ Colunas obrigatórias faltando: ${missingCols.join(', ')}`);
    console.error(`   Colunas encontradas: ${headers.join(', ')}`);
    process.exit(1);
  }

  console.log(`📋 ${rows.length} linha(s) encontrada(s) no CSV.`);

  const catalog = loadCatalog();
  const dedup = new Deduplicator(catalog.products);
  const initialSize = dedup.size;

  let inserted = 0, updated = 0, duplicate = 0, skipped = 0;

  rows.forEach((row, idx) => {
    const entry = rowToEntry(row, idx + 2); // +2: linha 1 = header
    if (!entry) { skipped++; return; }

    const result = dedup.add(entry);
    if (result === 'inserted') inserted++;
    else if (result === 'updated') updated++;
    else duplicate++;
  });

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  RELATÓRIO — MANUAL');
  console.log('══════════════════════════════════════════════');
  console.log(`  Catálogo antes:           ${initialSize}`);
  console.log(`  Novos inseridos:          ${inserted}`);
  console.log(`  Registros atualizados:    ${updated}`);
  console.log(`  Duplicatas ignoradas:     ${duplicate}`);
  console.log(`  Linhas com erro/puladas:  ${skipped}`);
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
