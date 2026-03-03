import type { MLCatalogSearchResponse, MLCatalogProduct, MLAttribute } from './types';

const BASE_URL = 'https://api.mercadolibre.com';

// Intervalo entre requisições para não ser bloqueado pela API
const REQUEST_DELAY_MS = 500;

// ─── Autenticação ─────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string | null> {
  return process.env.ML_ACCESS_TOKEN ?? null;
}

// Máximo de páginas por busca — a API products/search limita total=100
export const MAX_PAGES_PER_CATEGORY = 2; // 2 × 50 = 100 por keyword
export const PAGE_SIZE = 50;

// Buscas por palavra-chave que cobrem todas as categorias CoScore
export const ML_KEYWORD_SEARCHES: { query: string; label: string }[] = [
  // ── Maquiagem — lábios ──────────────────────────────────────────────────────
  { query: 'batom lipstick lip tint',          label: 'Batom' },
  { query: 'lip gloss brilho labial',          label: 'Gloss' },
  { query: 'lapis labial lip liner delineador labial', label: 'Lápis Labial' },
  // ── Maquiagem — rosto ───────────────────────────────────────────────────────
  { query: 'base liquida maquiagem foundation', label: 'Base' },
  { query: 'corretivo concealer anti olheira',  label: 'Corretivo' },
  { query: 'po facial compacto translucido',    label: 'Pó Facial' },
  { query: 'po solto fixador loose powder',      label: 'Pó Facial' },
  { query: 'po compacto matte HD setting',      label: 'Pó Facial' },
  { query: 'po facial mineral banana iluminador', label: 'Pó Facial' },
  { query: 'primer pre-base maquiagem',         label: 'Primer' },
  { query: 'fixador maquiagem setting spray',   label: 'Fixador de Maquiagem' },
  { query: 'blush rouge corar',                 label: 'Blush' },
  { query: 'iluminador highlighter strobing',   label: 'Iluminador' },
  { query: 'contorno bronzer contouring',       label: 'Contorno/Bronzer' },
  // ── Maquiagem — olhos ───────────────────────────────────────────────────────
  { query: 'sombra eyeshadow paleta maquiagem', label: 'Sombra' },
  { query: 'mascara de cilios mascara cilios',  label: 'Máscara de Cílios' },
  { query: 'delineador eyeliner olhos kajal',   label: 'Delineador' },
  // ── Skincare ────────────────────────────────────────────────────────────────
  { query: 'serum facial vitamina c retinol',   label: 'Sérum' },
  { query: 'hidratante facial creme',           label: 'Hidratante' },
  { query: 'protetor solar facial fps',         label: 'Protetor Solar' },
  // ── Cabelo ──────────────────────────────────────────────────────────────────
  { query: 'shampoo cabelo',                   label: 'Shampoo' },
  { query: 'condicionador cabelo',             label: 'Condicionador' },
  { query: 'mascara capilar hidratacao',       label: 'Máscara Capilar' },
  // ── Perfumes ────────────────────────────────────────────────────────────────
  { query: 'perfume feminino eau de parfum',   label: 'Perfume Feminino' },
  { query: 'perfume masculino eau de toilette', label: 'Perfume Masculino' },
  // ── Marcas brasileiras populares ────────────────────────────────────────────
  { query: 'franciny elke maquiagem',          label: 'Franciny Elke' },
  { query: 'oceane maquiagem cosmeticos',      label: 'Océane' },
  { query: 'boca rosa maquiagem payot',        label: 'Boca Rosa' },
  { query: 'o boticario make b maquiagem',     label: 'O Boticário' },
  { query: 'vult maquiagem cosmeticos',        label: 'Vult' },
  { query: 'dailus maquiagem cosmeticos',      label: 'Dailus' },
  { query: 'yes cosmeticos maquiagem',         label: 'Yes Cosméticos' },
  { query: 'tracta maquiagem cosmeticos',      label: 'Tracta' },
  { query: 'koloss maquiagem cosmeticos',      label: 'Koloss' },
  { query: 'ruby rose maquiagem',              label: 'Ruby Rose' },
  { query: 'eudora maquiagem cosmeticos',      label: 'Eudora' },
  { query: 'avon maquiagem cosmeticos',        label: 'Avon' },
  { query: 'natura uma cosmeticos',            label: 'Natura' },
  { query: 'eudora niina secrets cosmeticos',  label: 'Eudora Niina Secrets' },
  { query: 'fran by fr maquiagem cosmeticos', label: 'Fran by FR' },
  { query: 'mascavo maquiagem cosmeticos',     label: 'Mascavo' },
  { query: 'boca rosa beauty maquiagem',       label: 'Boca Rosa Beauty' },
  { query: 'mari maria makeup cosmeticos',    label: 'Mari Maria Makeup' },
  { query: 'karen bachini beauty maquiagem',   label: 'Karen Bachini Beauty' },
  { query: 'bruna tavares maquiagem cosmeticos',  label: 'Bruna Tavares' },
  // ── Buscas por cor em categorias com muitas variantes ───────────────────────
  { query: 'sombra unitaria cor pigmento',     label: 'Sombra Unitária' },
  { query: 'blush corado cor tom',             label: 'Blush por Cor' },
  { query: 'iluminador cor tom shimmer',       label: 'Iluminador por Cor' },
  { query: 'corretivo cor tom bege',           label: 'Corretivo por Tom' },
  { query: 'base liquida cor tom bege',        label: 'Base por Tom' },
  { query: 'batom cor tom nude matte',         label: 'Batom por Cor' },
];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = {
        'User-Agent': 'CoScore-CatalogSync/1.0',
        'Accept': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url, { headers });

      if (res.status === 429) {
        const backoff = 3000 * attempt;
        console.warn(`  ⚠ Rate limit. Aguardando ${backoff / 1000}s...`);
        await sleep(backoff);
        continue;
      }

      if (res.status === 404) throw new Error(`NOT_FOUND: ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);

      return (await res.json()) as T;
    } catch (err) {
      const isNotFound = err instanceof Error && err.message.startsWith('NOT_FOUND');
      if (isNotFound || attempt === retries) throw err;
      console.warn(`  ⚠ Tentativa ${attempt}/${retries} falhou. Reintentando...`);
      await sleep(1000 * attempt);
    }
  }
  throw new Error(`Falha após ${retries} tentativas: ${url}`);
}

export async function checkAuthRequired(): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  TOKEN NECESSÁRIO — execute: npx tsx scripts/ml-auth.ts     ║');
    console.error('║                                                              ║');
    console.error('║  Depois adicione ao .env.local:                             ║');
    console.error('║    ML_ACCESS_TOKEN=APP_USR-...                              ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }
}

/**
 * Busca produtos no catálogo oficial do ML.
 * Endpoint: GET /products/search?site_id=MLB&q=KEYWORD&limit=N&offset=N
 * Não requer certificação — funciona com token de usuário comum.
 */
export async function searchProducts(
  query: string,
  offset: number,
  limit: number = PAGE_SIZE,
): Promise<MLCatalogSearchResponse> {
  await sleep(REQUEST_DELAY_MS);
  const url =
    `${BASE_URL}/products/search` +
    `?site_id=MLB` +
    `&q=${encodeURIComponent(query)}` +
    `&limit=${limit}` +
    `&offset=${offset}`;
  return fetchWithRetry<MLCatalogSearchResponse>(url);
}

export function extractAttribute(attributes: MLAttribute[], attrId: string): string | null {
  const attr = attributes.find(a => a.id === attrId);
  if (!attr) return null;
  return attr.value_name ?? attr.values?.[0]?.name ?? null;
}

// Re-exporta tipos para uso no sync-catalog.ts
export type { MLCatalogProduct };
