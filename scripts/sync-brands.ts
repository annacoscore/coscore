/**
 * sync-brands.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Scraper para marcas brasileiras de maquiagem influencer/direct-to-consumer:
 *
 *  VTEX (API direta acessível):
 *    • Mari Maria Makeup          — www.marimariamakeup.com
 *    • WePink                     — www.wepink.com.br
 *    • Bruna Tavares (BT Makeup)  — www.linhabrunatavares.com
 *    • Mascavo Beauty             — www.mascavo.com
 *
 *  Shopify (products.json):
 *    • Fran by Franciny Ehlke — franbyfr.com.br
 *    • Boca Rosa Beauty       — bocarosa.com.br
 *
 *  Mercado Livre (fallback — site bloqueia automação):
 *    • Niina Secrets by Eudora — www.eudora.com.br (403 Forbidden)
 *
 * Uso:
 *  npx tsx scripts/sync-brands.ts
 *  npx tsx scripts/sync-brands.ts --only=mariamaria,wepink
 *  npx tsx scripts/sync-brands.ts --export-ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { loadCatalog, saveCatalog, exportToProductsTs, generateId } from './lib/storage';
import { Deduplicator } from './lib/deduplicator';
import { mapCategoryByKeywords } from './lib/category-mapper';
import { cleanProductName } from './lib/normalizer';
import type { CatalogEntry, ColorVariant } from './lib/types';

// ─── Configuração global ───────────────────────────────────────────────────────

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache',
};

const DELAY_MS    = 1500;
const MAX_RETRIES = 3;
const PAGE_SIZE   = 50;

// ─── Definição das marcas ──────────────────────────────────────────────────────

interface VtexBrand {
  type: 'vtex';
  id: string;
  name: string;
  baseUrl: string;
  logo: string;
  /** IDs de categorias VTEX a buscar (vazio = busca tudo) */
  categoryIds: number[];
  /** Palavras-chave no título que indicam produto NÃO cosmético (skip) */
  skipKeywords?: string[];
  /** Apenas produtos cujo nome contém uma dessas palavras (filtro de relevância) */
  requireKeywords?: string[];
}

interface ShopifyBrand {
  type: 'shopify';
  id: string;
  name: string;
  baseUrl: string;
  logo: string;
  skipKeywords?: string[];
}

interface MlBrand {
  type: 'ml';
  id: string;
  name: string;
  logo: string;
  /** Termos de busca no ML para encontrar produtos desta marca */
  mlQueries: string[];
  mlCategoryId: string;   // MLB1246 = Beleza e Cuidado Pessoal
}

type Brand = VtexBrand | ShopifyBrand | MlBrand;

const BRANDS: Brand[] = [
  // ── VTEX ─────────────────────────────────────────────────────────────────────
  {
    type: 'vtex',
    id: 'mariamaria',
    name: 'Mari Maria Makeup',
    baseUrl: 'https://www.marimariamakeup.com',
    logo: 'MM',
    // Categorias: Lábios (2), Face (4), Olhos (5) — ignora acessórios, corpo, cabelo, kits
    categoryIds: [2, 4, 5],
    skipKeywords: ['necessaire', 'case', 'kit presente', 'cílios postiços', 'charm', 'argola'],
  },
  {
    type: 'vtex',
    id: 'wepink',
    name: 'WePink',
    baseUrl: 'https://www.wepink.com.br',
    logo: 'WP',
    // WePink é principalmente perfumaria — só busca categorias Make e Skincare
    categoryIds: [10558586, 10558584],
    skipKeywords: ['body splash', 'desodorante colônia', 'desodorante colonia', 'shampoo', 'condicionador', 'body cream', 'roll-on', 'óleo capilar', 'booster'],
  },

  // ── Shopify ───────────────────────────────────────────────────────────────────
  {
    type: 'shopify',
    id: 'franbyfr',
    name: 'Fran by Franciny Ehlke',
    baseUrl: 'https://franbyfr.com.br',
    logo: 'FR',
    skipKeywords: ['argola', 'mosquetão', 'necessaire', 'case', 'kit presente', 'cílios postiços', 'caixa'],
  },
  {
    type: 'shopify',
    id: 'bocarosa',
    name: 'Boca Rosa Beauty',
    baseUrl: 'https://bocarosa.com.br',
    logo: 'BR',
    skipKeywords: ['necessaire', 'bolsa', 'case', 'kit presente', 'ocultar'],
  },

  // ── VTEX (linhabrunatavares.com — domínio atualizado, API pública acessível) ──
  // Os filtros fq=C:/ não funcionam para subcategorias nesse VTEX; usa busca geral
  // (categoryIds: [] → scraper busca todos os produtos sem filtro de categoria)
  {
    type: 'vtex',
    id: 'brunatavares',
    name: 'Bruna Tavares',
    baseUrl: 'https://www.linhabrunatavares.com',
    logo: 'BT',
    categoryIds: [], // busca geral — site é monomarca, só tem cosméticos
    skipKeywords: ['kit presente', 'necessaire', 'cílios postiços', 'pincel', 'brinde', 'hello kitty', 'coca-cola', 'disney', 'collab', 'wish'],
  },

  // ── VTEX (mascavo.com — domínio atualizado, API pública acessível) ─────────
  {
    type: 'vtex',
    id: 'mascavo',
    name: 'Mascavo Beauty',
    baseUrl: 'https://www.mascavo.com',
    logo: 'MV',
    categoryIds: [], // busca geral — site é monomarca, só tem cosméticos
    skipKeywords: ['kit presente', 'necessaire', 'esponja', 'pincel', 'nécessaire', 'brinde', 'porta'],
  },

  // ── ML fallback (Eudora retorna 403 para automação) ────────────────────────
  {
    type: 'ml',
    id: 'niinasecrets',
    name: 'Niina Secrets',
    logo: 'NS',
    mlQueries: ['Niina Secrets Eudora batom', 'Niina Secrets Eudora base', 'Niina Secrets Eudora maquiagem', 'Niina Secrets gloss'],
    mlCategoryId: 'MLB1246',
  },
];

// ─── Utilitários ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJson<T>(url: string, attempt = 1): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 429) {
      await sleep(DELAY_MS * attempt * 3);
      if (attempt < MAX_RETRIES) return fetchJson(url, attempt + 1);
      return null;
    }
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    if (attempt < MAX_RETRIES) {
      await sleep(DELAY_MS * attempt);
      return fetchJson(url, attempt + 1);
    }
    return null;
  }
}

/** Melhora resolução de imagem VTEX (vteximg.com.br / vtexassets.com) */
function upgradeVtexImage(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes('vteximg.com.br') || u.hostname.includes('vtexassets.com')) {
      u.searchParams.set('width', '1000');
      u.searchParams.set('height', '1000');
      u.searchParams.set('aspect', 'true');
      return u.toString();
    }
  } catch { /**/ }
  return url;
}

/** Filtra se o produto deve ser ignorado com base em skipKeywords */
function shouldSkip(title: string, skipKeywords?: string[]): boolean {
  if (!skipKeywords?.length) return false;
  const t = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return skipKeywords.some(kw =>
    t.includes(kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );
}

/** Converte produto extraído em CatalogEntry */
function buildEntry(opts: {
  name:        string;
  brand:       string;
  description: string;
  image:       string;
  images:      string[];
  price:       number;
  url:         string;
  logo:        string;
  storeName:   string;
  colors?:     ColorVariant[];
  ean?:        string;
}): CatalogEntry {
  const cleanName = cleanProductName(opts.name);
  const category  = mapCategoryByKeywords(opts.name) ??
                    mapCategoryByKeywords(opts.description) ??
                    'Outros';
  const now = new Date().toISOString();
  return {
    id:            generateId('brand'),
    name:          cleanName,
    brand:         opts.brand,
    category:      category as string,
    description:   opts.description.substring(0, 500),
    image:         opts.image,
    images:        opts.images,
    ean:           opts.ean,
    mlIds:         [],
    colors:        opts.colors ?? [],
    averageRating: 0,
    reviewCount:   0,
    prices:        opts.price > 0 && opts.url ? [{
      store:   opts.storeName,
      price:   opts.price,
      url:     opts.url,
      logo:    opts.logo,
      inStock: true,
    }] : [],
    tags:          [],
    createdAt:     now,
    updatedAt:     now,
  };
}

// ─── VTEX scraper ──────────────────────────────────────────────────────────────

interface VtexProduct {
  productId: string;
  productName: string;
  brand: string;
  link: string;
  description: string;
  categories: string[];
  items: {
    itemId: string;
    name: string;
    ean?: string;
    images: { imageUrl: string }[];
    Cor?: string[];
    sellers: {
      commertialOffer: { Price: number; IsAvailable: boolean };
    }[];
  }[];
}

async function scrapeVtex(brand: VtexBrand): Promise<CatalogEntry[]> {
  console.log(`\n🔵 VTEX — ${brand.name} (${brand.baseUrl})`);
  const entries: CatalogEntry[] = [];
  const seen = new Set<string>();

  for (const catId of (brand.categoryIds.length > 0 ? brand.categoryIds : [0])) {
    let from = 0;
    let fetched = 0;
    const fqParam = catId > 0 ? `fq=C:/${catId}/&` : '';
    console.log(`  Categoria ${catId > 0 ? catId : 'todas'}...`);

    do {
      const url = `${brand.baseUrl}/api/catalog_system/pub/products/search/?${fqParam}O=OrderByScoreDESC&_from=${from}&_to=${from + PAGE_SIZE - 1}`;
      const products = await fetchJson<VtexProduct[]>(url);
      if (!products?.length) break;

      for (const p of products) {
        if (seen.has(p.productId)) continue;
        seen.add(p.productId);

        if (shouldSkip(p.productName, brand.skipKeywords)) continue;

        // Agrega todos os itens (SKUs) do produto — cada um é uma cor/variante
        const allColors: ColorVariant[] = [];
        let mainImage = '';
        const allImages: string[] = [];
        let price  = 0;
        let inStock = false;
        let ean: string | undefined;

        for (const item of p.items) {
          const offer = item.sellers?.[0]?.commertialOffer;
          if (!price && offer?.Price > 0) {
            price   = offer.Price;
            inStock = offer.IsAvailable ?? true;
          }
          if (!ean && item.ean) ean = item.ean;

          const itemImgs = (item.images ?? [])
            .map(i => upgradeVtexImage(i.imageUrl))
            .filter(Boolean);

          if (!mainImage && itemImgs[0]) mainImage = itemImgs[0];
          for (const img of itemImgs) {
            if (!allImages.includes(img)) allImages.push(img);
          }

          const colorName = item.Cor?.[0] ?? item.name;
          if (colorName && !allColors.find(c => c.name === colorName)) {
            allColors.push({ name: colorName, ...(itemImgs[0] ? { image: itemImgs[0] } : {}) });
          }
        }

        // Limpa nomes de cor que são idênticos ao nome do produto
        const cleanColors = allColors.filter(c =>
          c.name.toLowerCase() !== p.productName.toLowerCase()
        );

        const entry = buildEntry({
          name:        p.productName,
          brand:       brand.name,
          description: (p.description ?? '').replace(/<[^>]+>/g, ' ').trim(),
          image:       mainImage,
          images:      allImages.slice(0, 8),
          price,
          url:         p.link,
          logo:        brand.logo,
          storeName:   brand.name,
          colors:      cleanColors.length > 1 ? cleanColors : undefined,
          ean,
        });

        entries.push(entry);
      }

      fetched  = products.length;
      from    += PAGE_SIZE;
      await sleep(DELAY_MS);
    } while (fetched === PAGE_SIZE && from < 1000);

    console.log(`    → ${entries.length} produtos acumulados`);
  }

  console.log(`  ✅ ${entries.length} produtos extraídos de ${brand.name}`);
  return entries;
}

// ─── Shopify scraper ───────────────────────────────────────────────────────────

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  product_type: string;
  tags: string;
  handle: string;
  variants: {
    id: number;
    title: string;
    price: string;
    sku: string;
    barcode?: string;
    option1?: string;
    option2?: string;
  }[];
  images: { src: string; position: number }[];
  options: { name: string; values: string[] }[];
}

async function scrapeShopify(brand: ShopifyBrand): Promise<CatalogEntry[]> {
  console.log(`\n🟢 Shopify — ${brand.name} (${brand.baseUrl})`);
  const entries: CatalogEntry[] = [];
  let page = 1;

  while (true) {
    const url = `${brand.baseUrl}/products.json?limit=250&page=${page}`;
    const data = await fetchJson<{ products: ShopifyProduct[] }>(url);
    if (!data?.products?.length) break;

    for (const p of data.products) {
      if (shouldSkip(p.title, brand.skipKeywords)) continue;

      // Filtra produtos sem preço ou com título claramente inválido
      const firstVariant = p.variants?.[0];
      const price = firstVariant ? parseFloat(firstVariant.price ?? '0') : 0;
      if (!price && p.title.includes('100% off')) continue;

      const productUrl = `${brand.baseUrl}/products/${p.handle}`;
      const images = (p.images ?? [])
        .sort((a, b) => a.position - b.position)
        .map(i => i.src);

      // Constrói variantes de cor baseado nas options de cor
      const colorOption = p.options?.find(o =>
        ['cor', 'color', 'shade', 'tonalidade', 'tom'].includes(o.name.toLowerCase())
      );
      let colors: ColorVariant[] | undefined;
      if (colorOption && colorOption.values.length > 1) {
        colors = colorOption.values.map((v, idx) => ({
          name:  v,
          image: images[idx] ?? images[0],
        }));
      }

      const desc = (p.body_html ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const ean = p.variants?.find(v => (v.barcode?.length ?? 0) >= 8)?.barcode;

      const entry = buildEntry({
        name:        p.title,
        brand:       brand.name,
        description: desc,
        image:       images[0] ?? '',
        images:      images.slice(0, 8),
        price,
        url:         productUrl,
        logo:        brand.logo,
        storeName:   brand.name,
        colors,
        ean,
      });

      entries.push(entry);
    }

    if (data.products.length < 250) break;
    page++;
    await sleep(DELAY_MS);
  }

  console.log(`  ✅ ${entries.length} produtos extraídos de ${brand.name}`);
  return entries;
}

// ─── ML fallback scraper ───────────────────────────────────────────────────────

interface MlItem {
  id: string;
  title: string;
  thumbnail: string;
  price: number;
  permalink: string;
  category_id: string;
}

interface MlSearchResponse {
  results: MlItem[];
  paging: { total: number; offset: number; limit: number };
}

const ML_BASE    = 'https://api.mercadolibre.com';
let   mlToken    = process.env.ML_ACCESS_TOKEN  ?? '';
const ML_ID      = process.env.ML_CLIENT_ID     ?? '1664631224999083';
const ML_SEC     = process.env.ML_CLIENT_SECRET ?? 'Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
const ML_REFRESH = process.env.ML_REFRESH_TOKEN ?? '';

async function getMlToken(): Promise<string> {
  // 1. Tenta refresh_token (token de usuário com permissões de busca)
  if (ML_REFRESH) {
    const res = await fetch(`${ML_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&client_id=${ML_ID}&client_secret=${ML_SEC}&refresh_token=${ML_REFRESH}`,
    });
    const data = await res.json() as { access_token?: string };
    if (data.access_token) {
      mlToken = data.access_token;
      return mlToken;
    }
  }
  // 2. Usa token salvo no env (pode estar expirado)
  if (mlToken) return mlToken;
  return '';
}

async function mlSearch(token: string, query: string, category: string, offset: number): Promise<MlSearchResponse | null> {
  const url = `${ML_BASE}/sites/MLB/search?q=${encodeURIComponent(query)}&category=${category}&offset=${offset}&limit=50`;
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json() as MlSearchResponse;
  } catch { return null; }
}

async function scrapeML(brand: MlBrand): Promise<CatalogEntry[]> {
  console.log(`\n🔴 ML fallback — ${brand.name}`);
  const token = await getMlToken();
  if (!token) {
    console.log(`  ⚠️  Sem token ML disponível — pulando ${brand.name}`);
    return [];
  }

  const entries: CatalogEntry[] = [];
  const seenIds = new Set<string>();

  for (const query of brand.mlQueries) {
    let offset = 0;
    do {
      const data = await mlSearch(token, query, brand.mlCategoryId, offset);
      if (!data?.results?.length) break;

      for (const item of data.results) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        // Filtra por marca no título
        const titleLower = item.title.toLowerCase();
        const hasBrand = brand.mlQueries[0].toLowerCase().split(' ')
          .filter(w => w.length > 3)
          .some(w => titleLower.includes(w));
        if (!hasBrand) continue;

        const imgHd = item.thumbnail.replace('-I.jpg', '-O.jpg').replace('http://', 'https://');
        entries.push(buildEntry({
          name:        item.title,
          brand:       brand.name,
          description: '',
          image:       imgHd,
          images:      [imgHd],
          price:       item.price ?? 0,
          url:         item.permalink,
          logo:        brand.logo,
          storeName:   `${brand.name} (via ML)`,
        }));
      }

      offset += 50;
      if ((data.paging.total ?? 0) <= offset || offset >= 250) break;
      await sleep(DELAY_MS);
    } while (true);
  }

  console.log(`  ✅ ${entries.length} produtos encontrados para ${brand.name}`);
  return entries;
}

// ─── Orquestrador principal ───────────────────────────────────────────────────

async function main() {
  const args     = process.argv.slice(2);
  const onlyArg  = args.find(a => a.startsWith('--only='));
  const onlyIds  = onlyArg ? onlyArg.replace('--only=', '').split(',') : null;
  const exportTs = args.includes('--export-ts');
  const dryRun   = args.includes('--dry-run');

  const selectedBrands = onlyIds
    ? BRANDS.filter(b => onlyIds.includes(b.id))
    : BRANDS;

  console.log(`\n🏪 sync-brands.ts — ${selectedBrands.length} marcas`);
  console.log(`   ${selectedBrands.map(b => b.name).join(', ')}\n`);

  let allEntries: CatalogEntry[] = [];

  for (const brand of selectedBrands) {
    try {
      let entries: CatalogEntry[] = [];
      if (brand.type === 'vtex')    entries = await scrapeVtex(brand);
      if (brand.type === 'shopify') entries = await scrapeShopify(brand);
      if (brand.type === 'ml')      entries = await scrapeML(brand);
      allEntries = allEntries.concat(entries);
    } catch (err) {
      console.error(`  ❌ Erro em ${brand.name}:`, err instanceof Error ? err.message : err);
    }
  }

  if (dryRun) {
    console.log(`\n🔍 Dry-run: ${allEntries.length} produtos seriam adicionados.`);
    return;
  }

  // Carrega catálogo e deduplica
  const catalog = loadCatalog();
  const before  = catalog.products.length;
  const deduplicator = new Deduplicator(catalog.products);

  for (const entry of allEntries) {
    deduplicator.add(entry);
  }

  catalog.products = deduplicator.all;
  const added = catalog.products.length - before;

  console.log(`\n📊 Resultado:`);
  console.log(`   Antes:    ${before} produtos`);
  console.log(`   Extraídos: ${allEntries.length} novos`);
  console.log(`   Após dedup: ${catalog.products.length} (+${added} únicos)`);

  saveCatalog(catalog);
  console.log(`✅ catalog.json salvo.`);

  if (exportTs) {
    exportToProductsTs(catalog.products);
  } else {
    console.log(`\n➡️  Para exportar: npx tsx scripts/sync-brands.ts --export-ts`);
    console.log(`   Ou rode:        node scripts/export-catalog.js`);
  }
}

main().catch(console.error);
