/**
 * sync-all.ts
 * ───────────
 * Orquestrador que roda todas as fontes de dados em sequência,
 * na ordem ideal para maximizar qualidade do catálogo:
 *
 *  1. Open Beauty Facts  → base aberta, fornece EANs (sem auth)
 *  2. Manual CSV         → produtos prioritários da equipe
 *  3. Mercado Livre API  → maior volume, com fotos e preços ML
 *  4. Feeds de afiliados → preços das lojas parceiras
 *  5. Sephora Brasil     → scraper direto do sephora.com.br
 *  6. Amobeleza          → scraper direto do amobeleza.com.br
 *
 * Ao rodar em sequência, cada fonte enriquece o que a anterior deixou
 * incompleto. A deduplicação é contínua — cada fonte usa o mesmo
 * catalog.json acumulado.
 *
 * Uso:
 *  npm run sync-all
 *  npx tsx scripts/sync-all.ts --dry-run
 *  npx tsx scripts/sync-all.ts --export-ts
 *  npx tsx scripts/sync-all.ts --skip=ml,affiliates
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { exportToProductsTs } from './lib/storage';
import { loadCatalog } from './lib/storage';

// ─── Fontes disponíveis ───────────────────────────────────────────────────────

interface Source {
  id: string;
  label: string;
  script: string;
  requiresConfig?: string;
  requiresEnv?: string[];
}

const SOURCES: Source[] = [
  {
    id: 'openbeauty',
    label: 'Open Beauty Facts',
    script: 'scripts/sync-openbeauty.ts',
  },
  {
    id: 'manual',
    label: 'CSV Manual',
    script: 'scripts/sync-manual.ts',
    requiresConfig: 'scripts/manual-products.csv',
  },
  {
    id: 'ml',
    label: 'Mercado Livre',
    script: 'scripts/sync-catalog.ts',
    requiresEnv: ['ML_ACCESS_TOKEN', 'ML_CLIENT_ID'],
  },
  {
    id: 'affiliates',
    label: 'Feeds de Afiliados',
    script: 'scripts/sync-affiliates.ts',
    requiresConfig: 'scripts/feeds.config.json',
  },
  {
    id: 'sephora',
    label: 'Sephora Brasil',
    script: 'scripts/sync-sephora.ts',
  },
  {
    id: 'amobeleza',
    label: 'Amobeleza',
    script: 'scripts/sync-amobeleza.ts',
  },
  {
    id: 'brands',
    label: 'Marcas Influencer BR',
    script: 'scripts/sync-brands.ts',
  },
];

// ─── Utilitários ─────────────────────────────────────────────────────────────

function hasEnvAny(keys: string[]): boolean {
  return keys.some(k => !!process.env[k]);
}

function printSeparator(label: string): void {
  const line = '═'.repeat(48);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(line);
}

function runScript(scriptPath: string, extraArgs: string[]): boolean {
  const result = spawnSync(
    'npx',
    ['tsx', '--no-deprecation', scriptPath, ...extraArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
      shell: true,
    },
  );
  return result.status === 0;
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const exportTs = args.includes('--export-ts');

  const skipArg = args.find(a => a.startsWith('--skip='));
  const skipIds = skipArg ? skipArg.split('=')[1].split(',').map(s => s.trim()) : [];

  const onlyArg = args.find(a => a.startsWith('--only='));
  const onlyIds = onlyArg ? onlyArg.split('=')[1].split(',').map(s => s.trim()) : [];

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   CoScore — Sincronização Completa               ║');
  console.log('║   Todas as fontes → mesmo catálogo               ║');
  console.log('╚══════════════════════════════════════════════════╝');
  if (isDryRun) console.log('\n⚠  Dry run ativo em todas as fontes.');
  console.log('');

  // Filtra fontes a rodar
  let activeSources = SOURCES.filter(s => !skipIds.includes(s.id));
  if (onlyIds.length > 0) {
    activeSources = activeSources.filter(s => onlyIds.includes(s.id));
  }

  // Verifica pré-requisitos e mostra o plano
  console.log('Fontes que serão executadas:');
  const sourcesToRun: Array<{ source: Source; skippedReason?: string }> = [];

  for (const source of activeSources) {
    // Pula se requer config ausente
    if (source.requiresConfig && !fs.existsSync(path.join(process.cwd(), source.requiresConfig))) {
      console.log(`  ⏭  ${source.label} (arquivo de config não encontrado: ${source.requiresConfig})`);
      sourcesToRun.push({ source, skippedReason: 'config ausente' });
      continue;
    }

    // Pula ML se não tem token
    if (source.requiresEnv && !hasEnvAny(source.requiresEnv)) {
      console.log(`  ⏭  ${source.label} (credenciais não configuradas em .env.local)`);
      sourcesToRun.push({ source, skippedReason: 'credenciais ausentes' });
      continue;
    }

    console.log(`  ✓  ${source.label}`);
    sourcesToRun.push({ source });
  }

  const startTime = Date.now();
  const results: Record<string, 'ok' | 'skipped' | 'error'> = {};

  // Roda cada fonte
  for (const { source, skippedReason } of sourcesToRun) {
    if (skippedReason) {
      results[source.id] = 'skipped';
      continue;
    }

    printSeparator(`${source.label}`);

    const extraArgs = isDryRun ? ['--dry-run'] : [];
    const ok = runScript(source.script, extraArgs);
    results[source.id] = ok ? 'ok' : 'error';
  }

  // Exporta products.ts se solicitado
  if (exportTs && !isDryRun) {
    printSeparator('Exportando src/data/products.ts');
    const catalog = loadCatalog();
    exportToProductsTs(catalog.products);
  }

  // Relatório final
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const catalog = loadCatalog();

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   RESULTADO FINAL                                ║');
  console.log('╠══════════════════════════════════════════════════╣');

  for (const source of SOURCES) {
    const status = results[source.id];
    const icon = status === 'ok' ? '✅' : status === 'error' ? '❌' : '⏭ ';
    console.log(`║  ${icon}  ${source.label.padEnd(36)}║`);
  }

  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  📦 Total no catálogo: ${String(catalog.products.length).padEnd(24)}║`);
  console.log(`║  ⏱  Tempo total: ${elapsed}s${' '.repeat(28 - elapsed.length)}║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (!exportTs) {
    console.log(`\n💡 Para atualizar src/data/products.ts:`);
    console.log(`   npm run sync-all -- --export-ts`);
  }
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
