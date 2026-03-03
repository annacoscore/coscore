/**
 * assign-ml-images.ts
 * Para cada produto em extra-products.ts, busca no Mercado Livre pela nome+marca
 * e atribui a imagem do primeiro resultado (imagem real do produto).
 *
 * Requer: ML_ACCESS_TOKEN no .env.local
 * Uso: npx tsx scripts/assign-ml-images.ts [--dry-run] [--limit N]
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import * as fs from 'fs';
import * as path from 'path';
import { searchProducts, checkAuthRequired } from './lib/ml-client';

const EXTRA_PATH = path.join(process.cwd(), 'src/data/extra-products.ts');
const DELAY_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getQuotedStrings(str: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === "'" && str[i - 1] !== '\\') {
      let end = i + 1;
      while (end < str.length) {
        if (str[end] === "'" && str[end - 1] !== '\\') break;
        if (str[end] === '\\') end++;
        end++;
      }
      result.push(str.slice(i + 1, end).replace(/\\'/g, "'"));
      i = end + 1;
    } else {
      i++;
    }
  }
  return result;
}

async function fetchImageForProduct(name: string, brand: string): Promise<string | null> {
  const query = `${name} ${brand}`.trim().slice(0, 80);
  try {
    const res = await searchProducts(query, 0, 10);
    const first = res.results?.[0];
    if (!first?.pictures?.length) return null;
    const url = first.pictures[0].url;
    return url || null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  console.log('Atribuindo imagens do Mercado Livre por nome do produto (extra-products.ts)\n');
  await checkAuthRequired();

  let content = fs.readFileSync(EXTRA_PATH, 'utf8');
  const lines = content.split('\n');
  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  let processCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed.startsWith("p('") && !trimmed.startsWith('p("')) continue;

    const strings = getQuotedStrings(line);
    if (strings.length < 6) continue;

    const [, name, brand, , , currentImage] = strings;
    if (!name || !currentImage || !currentImage.startsWith('http')) continue;

    if (limit !== undefined && processCount >= limit) break;
    processCount++;

    process.stdout.write(`  [${processCount}] ${name.slice(0, 40)}... `);
    const newImage = await fetchImageForProduct(name, brand);
    await sleep(DELAY_MS);

    if (!newImage) {
      console.log('(não encontrado no ML)');
      notFound++;
      continue;
    }
    if (newImage === currentImage) {
      console.log('(já é a mesma)');
      skipped++;
      continue;
    }

    lines[i] = line.replace(currentImage, newImage);
    updated++;
    console.log('OK');
  }

  console.log(`\nResumo: ${updated} atualizados | ${skipped} iguais | ${notFound} sem resultado ML`);

  if (!dryRun && updated > 0) {
    fs.writeFileSync(EXTRA_PATH, lines.join('\n'), 'utf8');
    console.log(`\nArquivo salvo: ${EXTRA_PATH}`);
  } else if (dryRun) {
    console.log('\n(Dry run — nenhum arquivo alterado)');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
