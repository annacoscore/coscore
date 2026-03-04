/**
 * enrich-images.ts
 * ─────────────────
 * Enriquece as imagens do catálogo com fotos oficiais de alta qualidade:
 *
 *  1. Sephora — upgrade de URLs de thumbnail para alta resolução
 *     (remove parâmetros ?sw=N&sh=N ou aumenta para 2000px)
 *
 *  2. Amobeleza VTEX — normaliza URLs de imagem para versão full-size
 *     (remove width/height/aspect e usa o ID de imagem direto)
 *
 *  3. Produtos sem imagem (qualquer fonte) — tenta buscar a imagem
 *     diretamente da URL de produto armazenada nos prices[]
 *
 *  4. Variantes de cor sem imagem — para produtos VTEX, usa a imagem
 *     do SKU específico via API VTEX
 *
 * Uso:
 *  npm run enrich-images:all
 *  npx tsx scripts/enrich-images.ts --dry-run
 *  npx tsx scripts/enrich-images.ts --only=sephora
 *  npx tsx scripts/enrich-images.ts --only=amobeleza
 *  npx tsx scripts/enrich-images.ts --only=missing
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { parse as parseHtml } from 'node-html-parser';
import { loadCatalog, saveCatalog, exportToProductsTs } from './lib/storage';
import type { CatalogEntry, ColorVariant } from './lib/types';

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const DELAY_MS = 800;
const MAX_RETRIES = 2;

// ─── Utilitários ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url: string, attempt = 1): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 429) {
      await sleep(DELAY_MS * attempt * 3);
      if (attempt < MAX_RETRIES) return fetchPage(url, attempt + 1);
      return null;
    }
    if (!res.ok) return null;
    return await res.text();
  } catch {
    if (attempt < MAX_RETRIES) {
      await sleep(DELAY_MS * attempt);
      return fetchPage(url, attempt + 1);
    }
    return null;
  }
}

// ─── 1. Upgrade de imagens da Sephora ────────────────────────────────────────

/**
 * Sephora usa SFCC (Salesforce Commerce Cloud).
 * URLs de imagem têm o padrão:
 *   https://www.sephora.com.br/dw/image/v2/.../image.jpg?sw=300&sh=300&q=70
 *
 * Para alta resolução: sw=2000&sh=2000&q=95
 * Ou melhor ainda: removemos os parâmetros de tamanho para pegar o original.
 */
function upgradeSephoraImageUrl(url: string): string {
  if (!url || !url.includes('sephora.com.br')) return url;

  try {
    const u = new URL(url);
    // Remove parâmetros de redimensionamento
    u.searchParams.delete('sw');
    u.searchParams.delete('sh');
    u.searchParams.delete('q');
    u.searchParams.delete('cx');
    u.searchParams.delete('cy');
    u.searchParams.delete('cw');
    u.searchParams.delete('ch');
    // Pede resolução máxima
    u.searchParams.set('sw', '2000');
    u.searchParams.set('sh', '2000');
    u.searchParams.set('q', '95');
    return u.toString();
  } catch {
    return url;
  }
}

function processSephoraImages(entry: CatalogEntry): boolean {
  let changed = false;

  const newImage = upgradeSephoraImageUrl(entry.image);
  if (newImage !== entry.image) {
    entry.image = newImage;
    changed = true;
  }

  const newImages = entry.images.map(upgradeSephoraImageUrl);
  if (JSON.stringify(newImages) !== JSON.stringify(entry.images)) {
    entry.images = newImages;
    changed = true;
  }

  const newColors = (entry.colors ?? []).map(c => ({
    ...c,
    image: c.image ? upgradeSephoraImageUrl(c.image) : c.image,
  }));
  if (JSON.stringify(newColors) !== JSON.stringify(entry.colors)) {
    entry.colors = newColors;
    changed = true;
  }

  return changed;
}

// ─── 2. Normalização de imagens VTEX (Amobeleza) ─────────────────────────────

/**
 * VTEX imagens têm o padrão:
 *   https://amobeleza.vtexassets.com/arquivos/ids/12345-1/nome.jpg?v=123&width=480
 *
 * Para alta resolução: removemos width/height/aspect, mantemos só v=
 * Opcional: adicionar ?width=1000 para uma boa resolução sem ser excessivo
 */
function upgradeVtexImageUrl(url: string): string {
  // Suporta vteximg.com.br (VTEX legado) e vtexassets.com (VTEX IO)
  if (!url || (!url.includes('vteximg.com.br') && !url.includes('vtexassets.com'))) return url;

  try {
    const u = new URL(url);
    const vParam = u.searchParams.get('v');
    // Limpa parâmetros de tamanho e mantém só v= (cache-busting)
    u.search = '';
    if (vParam) u.searchParams.set('v', vParam);
    // Solicita 1000×1000 com aspect ratio preservado
    u.searchParams.set('width', '1000');
    u.searchParams.set('height', '1000');
    u.searchParams.set('aspect', 'true');
    return u.toString();
  } catch {
    return url;
  }
}

function processVtexImages(entry: CatalogEntry): boolean {
  let changed = false;

  const newImage = upgradeVtexImageUrl(entry.image);
  if (newImage !== entry.image) {
    entry.image = newImage;
    changed = true;
  }

  const newImages = entry.images.map(upgradeVtexImageUrl);
  if (JSON.stringify(newImages) !== JSON.stringify(entry.images)) {
    entry.images = newImages;
    changed = true;
  }

  const newColors = (entry.colors ?? []).map(c => ({
    ...c,
    image: c.image ? upgradeVtexImageUrl(c.image) : c.image,
  }));
  if (JSON.stringify(newColors) !== JSON.stringify(entry.colors)) {
    entry.colors = newColors;
    changed = true;
  }

  return changed;
}

// ─── 3. Busca imagem de produtos sem foto ─────────────────────────────────────

/**
 * Para produtos sem imagem alguma, tenta buscar via:
 * a) URL do produto armazenada em prices[]
 * b) Extração de JSON-LD (schema.org) da página do produto
 * c) Open Graph (og:image) da página do produto
 * d) __NEXT_DATA__ da página do produto
 */
async function fetchMissingImage(entry: CatalogEntry): Promise<boolean> {
  const productUrl = entry.prices?.[0]?.url;
  if (!productUrl) return false;

  const html = await fetchPage(productUrl);
  if (!html) return false;

  let images: string[] = [];

  // Tenta JSON-LD
  const ldMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/g);
  for (const match of ldMatches) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type'] === 'Product') {
        const img = Array.isArray(data.image) ? data.image : data.image ? [data.image] : [];
        images.push(...img.map(String).filter((i: string) => i.startsWith('http')));
      }
    } catch { continue; }
  }

  // Tenta Open Graph
  if (images.length === 0) {
    const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    if (ogMatch?.[1]) images.push(ogMatch[1]);
  }

  // Tenta __NEXT_DATA__
  if (images.length === 0) {
    const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
    if (nextMatch) {
      try {
        const nextData = JSON.parse(nextMatch[1]);
        const imgUrls = extractImageUrls(nextData, 0);
        images.push(...imgUrls.slice(0, 3));
      } catch { /* ignore */ }
    }
  }

  // Tenta primeiro <img> relevante no HTML
  if (images.length === 0) {
    const root = parseHtml(html);
    const mainImg = root.querySelector('[class*="product"] img, [class*="hero"] img, main img');
    const src = mainImg?.getAttribute('src') ?? mainImg?.getAttribute('data-src') ?? '';
    if (src.startsWith('http')) images.push(src);
  }

  if (images.length === 0) return false;

  const validImages = [...new Set(images)].filter(u => u.startsWith('http'));
  if (validImages.length === 0) return false;

  entry.image = validImages[0];
  entry.images = validImages.slice(0, 5);
  entry.updatedAt = new Date().toISOString();
  return true;
}

function extractImageUrls(obj: unknown, depth: number): string[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return [];

  const urls: string[] = [];
  if (Array.isArray(obj)) {
    for (const item of obj) urls.push(...extractImageUrls(item, depth + 1));
    return urls;
  }

  const record = obj as Record<string, unknown>;
  for (const [key, val] of Object.entries(record)) {
    if ((key === 'url' || key === 'src' || key === 'imageUrl') && typeof val === 'string' && val.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(val)) {
      urls.push(val);
    }
    if (val && typeof val === 'object') {
      urls.push(...extractImageUrls(val, depth + 1));
    }
  }
  return urls;
}

// ─── 4. Imagens de variantes de cor via VTEX SKU API ─────────────────────────

interface VtexSkuResponse {
  SkuId?: number;
  Images?: { ImageUrl?: string; IsMain?: boolean }[];
  ProductId?: number;
}

/**
 * Para produtos da Amobeleza (VTEX) com variantes de cor sem imagem,
 * tenta buscar a imagem específica de cada SKU via API VTEX.
 */
async function enrichColorImagesVtex(entry: CatalogEntry, productSlug: string): Promise<boolean> {
  if (!entry.colors || entry.colors.length === 0) return false;

  // Busca lista de SKUs do produto
  const apiUrl = `https://www.amobeleza.com.br/api/catalog_system/pub/products/search/?fq=linkText:${productSlug}&_from=0&_to=0`;
  const text = await fetchPage(apiUrl);
  if (!text) return false;

  let changed = false;

  try {
    const products = JSON.parse(text);
    if (!Array.isArray(products) || products.length === 0) return false;

    const skus: VtexSkuResponse[] = products[0]?.items ?? [];
    const skuByName = new Map<string, string>();

    for (const sku of skus) {
      const name = String((sku as Record<string, unknown>)?.name ?? '').trim();
      const imgs = (sku as Record<string, unknown>)?.images as { imageUrl?: string }[] | undefined;
      const imgUrl = imgs?.[0]?.imageUrl ?? '';
      if (name && imgUrl) {
        skuByName.set(name.toLowerCase(), imgUrl);
      }
    }

    entry.colors = entry.colors.map(color => {
      if (color.image) return color;
      const imgUrl = skuByName.get(color.name.toLowerCase());
      if (imgUrl) {
        changed = true;
        return { ...color, image: upgradeVtexImageUrl(imgUrl) };
      }
      return color;
    });
  } catch {
    return false;
  }

  return changed;
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const exportTs = args.includes('--export-ts');
  const onlyArg = args.find(a => a.startsWith('--only='));
  const onlyMode = onlyArg ? onlyArg.split('=')[1] : 'all';

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   CoScore — Enriquecimento de Imagens        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nModo: ${onlyMode}`);
  if (isDryRun) console.log('⚠  Dry run — nada será salvo.');
  console.log('');

  const catalog = loadCatalog();
  const products = catalog.products;

  let upgradedSephora = 0;
  let upgradedVtex = 0;
  let fetchedMissing = 0;
  let stillMissing = 0;

  // ── Passo 1: Upgrade URLs Sephora ────────────────────────────────────────
  if (['all', 'sephora'].includes(onlyMode)) {
    const sephoraProducts = products.filter(p =>
      p.tags?.includes('sephora') ||
      (p.image && p.image.includes('sephora.com.br')) ||
      (p.prices?.[0]?.store === 'Sephora'),
    );

    console.log(`🔷 Sephora: ${sephoraProducts.length} produtos para otimizar imagens`);
    for (const entry of sephoraProducts) {
      if (processSephoraImages(entry)) {
        upgradedSephora++;
        entry.updatedAt = new Date().toISOString();
      }
    }
    console.log(`   ✅ ${upgradedSephora} URLs de imagem atualizadas para alta resolução\n`);
  }

  // ── Passo 2: Upgrade URLs VTEX (Amobeleza) ───────────────────────────────
  if (['all', 'amobeleza'].includes(onlyMode)) {
    const vtexProducts = products.filter(p =>
      p.tags?.includes('amobeleza') ||
      (p.image && p.image.includes('vtexassets.com')) ||
      (p.prices?.[0]?.store === 'Amobeleza'),
    );

    console.log(`🟡 Amobeleza VTEX: ${vtexProducts.length} produtos para normalizar imagens`);
    for (const entry of vtexProducts) {
      if (processVtexImages(entry)) {
        upgradedVtex++;
        entry.updatedAt = new Date().toISOString();
      }
    }
    console.log(`   ✅ ${upgradedVtex} URLs de imagem normalizadas\n`);
  }

  // ── Passo 3: Busca imagens para produtos sem foto ─────────────────────────
  if (['all', 'missing'].includes(onlyMode)) {
    const withoutImage = products.filter(p => !p.image || p.image === '');
    console.log(`⬜ Produtos sem imagem: ${withoutImage.length}`);

    let idx = 0;
    for (const entry of withoutImage) {
      idx++;
      process.stdout.write(`   [${idx}/${withoutImage.length}] ${entry.name.slice(0, 50)}... `);

      const found = await fetchMissingImage(entry);
      if (found) {
        fetchedMissing++;
        process.stdout.write('✅\n');
      } else {
        stillMissing++;
        process.stdout.write('—\n');
      }

      await sleep(DELAY_MS);
    }
    console.log(`\n   Encontradas: ${fetchedMissing} | Ainda sem imagem: ${stillMissing}\n`);
  }

  // ── Relatório ─────────────────────────────────────────────────────────────
  const nowMissing = products.filter(p => !p.image || p.image === '').length;

  console.log('══════════════════════════════════════════════');
  console.log('  RELATÓRIO — IMAGENS');
  console.log('══════════════════════════════════════════════');
  console.log(`  URLs Sephora atualizadas:  ${upgradedSephora}`);
  console.log(`  URLs VTEX normalizadas:    ${upgradedVtex}`);
  console.log(`  Imagens recuperadas:       ${fetchedMissing}`);
  console.log(`  Ainda sem imagem:          ${nowMissing}`);
  console.log('══════════════════════════════════════════════');

  if (!isDryRun) {
    saveCatalog(catalog);
    console.log('\n💾 Catálogo salvo em scripts/output/catalog.json');

    if (exportTs) {
      exportToProductsTs(products);
    }
  }
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
