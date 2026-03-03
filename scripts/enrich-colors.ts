/**
 * enrich-colors.ts
 * ─────────────────
 * Enriquece o catálogo com variantes de cor para categorias de maquiagem.
 * Estratégias por categoria:
 *   1. Busca variantes no ML por parent_id (para produtos agrupados)
 *   2. Busca no ML com brand+nome para encontrar variantes com mesmo parent_id
 *   3. Extrai tons diretamente do RGB_COLOR (hex → nome de tom legível)
 *   4. Extrai código de tom do nome do produto (V130, B04, C01, etc.)
 *
 * Uso:
 *   npx tsx scripts/enrich-colors.ts
 *   npx tsx scripts/enrich-colors.ts --dry-run
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { loadCatalog, saveCatalog } from './lib/storage';
import type { CatalogEntry, ColorVariant } from './lib/types';

// ─── Config ───────────────────────────────────────────────────────────────────

const TARGET_CATEGORIES = [
  'Base', 'Corretivo', 'Pó Facial', 'Gloss', 'Batom',
  'Lápis Labial', 'Iluminador', 'Contorno/Bronzer', 'Blush', 'Sombra',
];

const BASE_URL = 'https://api.mercadolibre.com';
const DELAY_MS = 350;
const isDryRun = process.argv.includes('--dry-run');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function getToken(): string {
  const t = process.env.ML_ACCESS_TOKEN;
  if (!t) { console.error('❌ Token necessário. Execute: npx tsx scripts/ml-auth.ts'); process.exit(1); }
  return t;
}

async function fetchJson<T>(url: string, retries = 2): Promise<T | null> {
  const token = getToken();
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  for (let i = 1; i <= retries; i++) {
    await sleep(DELAY_MS);
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) { await sleep(3000 * i); continue; }
      if (res.status === 401) { console.error('\n❌ Token expirado. Execute: npx tsx scripts/ml-auth.ts'); process.exit(1); }
      if (!res.ok) return null;
      return await res.json() as T;
    } catch { if (i === retries) return null; }
  }
  return null;
}

// ─── Conversão RGB → nome de tom ─────────────────────────────────────────────

/** Converte hex RGB em nome de tom legível para bases/corretivos */
function rgbHexToToneName(hex: string): string {
  const h = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  // Luminosidade percebida (fórmula WCAG)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Saturação (quanto de cor há)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;

  // Detecta tom rosado/quente vs neutro/frio para bases de maquiagem
  const isWarm = r > b + 20;
  const isCool = b > r + 10;
  const isRosy = r > g + 20 && r > b;
  const isGolden = r > g && g > b && sat > 0.25;

  // Iluminadores / produtos com muita luz (hex muito claro com shimmer)
  if (lum > 210) return 'Perolado';
  if (lum > 185) return isGolden ? 'Dourado Claro' : isCool ? 'Rosa Claro' : 'Porcelana';
  if (lum > 160) return isRosy ? 'Rosa' : isGolden ? 'Dourado' : isWarm ? 'Bege Claro' : 'Nude Claro';
  if (lum > 130) return isRosy ? 'Rosé' : isGolden ? 'Champagne' : isWarm ? 'Bege' : 'Nude';
  if (lum > 100) return isWarm ? 'Bege Médio' : isCool ? 'Amêndoa Fria' : 'Amêndoa';
  if (lum > 70)  return isWarm ? 'Mel' : 'Cacau';
  if (lum > 45)  return isWarm ? 'Caramelo Escuro' : 'Café';
  return 'Ébano';
}

// ─── Extração de atributos ML ─────────────────────────────────────────────────

interface MLAttr { id: string; value_name: string | null; values?: { name: string | null }[] }

function attrVal(attrs: MLAttr[], ...ids: string[]): string {
  for (const id of ids) {
    const a = attrs.find(x => x.id === id);
    const v = a?.value_name ?? a?.values?.[0]?.name ?? null;
    if (v?.trim()) return v.trim();
  }
  return '';
}

interface MLProduct {
  id: string;
  name: string;
  parent_id?: string;
  domain_id: string;
  status: string;
  attributes: MLAttr[];
  pictures: { url: string }[];
}

interface MLSearchResult {
  paging: { total: number };
  results: MLProduct[];
}

const JUNK = new Set(['n/a','unico','única','unica','sem cor','outro','multicolor','multicor',
  'batom','base','produto','incolor','transparente','nenhum','other','no color','–','-','']);

function cleanColorName(raw: string): string {
  const n = raw.trim();
  if (!n || JUNK.has(n.toLowerCase()) || n.length < 2 || /^\d{1,2}$/.test(n)) return '';
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Extrai a melhor cor disponível de um produto ML */
function extractColor(product: MLProduct): string {
  // 1. COLOR attribute (nome textual) — melhor opção
  const colorText = attrVal(product.attributes, 'COLOR', 'COLOR_NAME', 'SHADE', 'TINT', 'TONE');
  if (colorText && !JUNK.has(colorText.toLowerCase())) return cleanColorName(colorText);

  // 2. RGB_COLOR → converte para nome legível
  const rgb = attrVal(product.attributes, 'RGB_COLOR');
  if (rgb && /^[0-9A-Fa-f]{6}$/.test(rgb.replace('#', ''))) {
    return rgbHexToToneName(rgb);
  }

  // 3. Tenta extrair código de tom do nome (ex: "V130", "B04", "C01", "N12.5")
  const toneMatch = product.name.match(/\b([A-Z]{1,2}\d{2,3}(?:\.\d)?|\d{2,3}\.?\d?(?:\s+\w+)?)\b/);
  if (toneMatch) {
    const code = toneMatch[1].trim();
    if (code.length >= 2 && code.length <= 10) return code;
  }

  return '';
}

// ─── Busca variantes por parent_id ────────────────────────────────────────────

async function fetchVariantsByParentId(parentId: string, brand: string, category: string): Promise<ColorVariant[]> {
  const query = `${brand} ${category}`.trim();
  const url = `${BASE_URL}/products/search?site_id=MLB&q=${encodeURIComponent(query)}&limit=50`;
  const res = await fetchJson<MLSearchResult>(url);
  if (!res?.results) return [];

  const variants: ColorVariant[] = [];
  for (const p of res.results) {
    if (p.status !== 'active') continue;
    if (p.parent_id !== parentId && p.id !== parentId) continue;
    const colorName = extractColor(p);
    if (colorName && p.pictures?.[0]?.url) {
      variants.push({ name: colorName, image: p.pictures[0].url });
    }
  }
  return variants;
}

/** Busca produto por mlId e extrai cor + parent_id */
async function fetchProductDetail(mlId: string): Promise<{ colorName: string; parentId?: string; image?: string } | null> {
  const res = await fetchJson<MLProduct>(`${BASE_URL}/products/${mlId}`);
  if (!res) return null;
  return {
    colorName: extractColor(res),
    parentId: res.parent_id,
    image: res.pictures?.[0]?.url,
  };
}

/** Deduplicação de cores por nome */
function dedupeColors(colors: ColorVariant[]): ColorVariant[] {
  const seen = new Set<string>();
  return colors.filter(c => {
    const k = c.name.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });
}

function mergeColors(existing: ColorVariant[], incoming: ColorVariant[]): ColorVariant[] {
  const seen = new Set(existing.map(c => c.name.toLowerCase().trim()));
  const merged = [...existing];
  for (const c of incoming) {
    const k = c.name.toLowerCase().trim();
    if (k && !seen.has(k)) { seen.add(k); merged.push(c); }
  }
  return merged;
}

// ─── Enriquecimento por categoria ─────────────────────────────────────────────

/** Estratégia especial por categoria: queries de busca para encontrar variantes */
const CATEGORY_QUERIES: Record<string, string[]> = {
  'Base':       ['base liquida maquiagem tom', 'base liquida cobertura'],
  'Corretivo':  ['corretivo maquiagem tom', 'concealer tom'],
  'Pó Facial':  ['po compacto tom', 'po facial cor'],
  'Iluminador': ['iluminador maquiagem shimmer', 'highlighter'],
  'Contorno/Bronzer': ['contorno maquiagem bronzer', 'bronzer shimmer'],
  'Blush':      ['blush corar tom', 'blush cor'],
  'Sombra':     ['sombra unitaria pigmento', 'eyeshadow cor'],
};

/** Busca todos os produtos de uma query e agrupa por parent_id */
async function fetchAndGroupByParent(query: string): Promise<Map<string, MLProduct[]>> {
  const groups = new Map<string, MLProduct[]>();
  const url = `${BASE_URL}/products/search?site_id=MLB&q=${encodeURIComponent(query)}&limit=50`;
  const res = await fetchJson<MLSearchResult>(url);
  if (!res?.results) return groups;

  for (const p of res.results) {
    if (p.status !== 'active') continue;
    if (!p.parent_id) continue; // só nos interessam produtos com parent_id
    const list = groups.get(p.parent_id) ?? [];
    list.push(p);
    groups.set(p.parent_id, list);
  }
  return groups;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  getToken(); // valida token
  console.log('🎨 Enriquecendo cores no catálogo...');
  if (isDryRun) console.log('  [DRY RUN — nada será salvo]\n');

  const catalog = loadCatalog();
  let totalEnriched = 0;

  // ── Fase 1: Pré-busca de grupos de variantes por categoria ───────────────────
  console.log('\n📦 Fase 1: buscando grupos de variantes no ML...');

  // parent_id → lista de {colorName, image}
  const parentColorMap = new Map<string, ColorVariant[]>();

  for (const [cat, queries] of Object.entries(CATEGORY_QUERIES)) {
    console.log(`  Categoria: ${cat}`);
    for (const query of queries) {
      const groups = await fetchAndGroupByParent(query);
      for (const [parentId, products] of groups) {
        const existing = parentColorMap.get(parentId) ?? [];
        for (const p of products) {
          const colorName = extractColor(p);
          if (colorName && p.pictures?.[0]?.url) {
            const exists = existing.some(c => c.name.toLowerCase() === colorName.toLowerCase());
            if (!exists) existing.push({ name: colorName, image: p.pictures[0].url });
          }
        }
        if (existing.length > 0) parentColorMap.set(parentId, existing);
      }
    }
  }

  console.log(`  ✓ ${parentColorMap.size} grupos com variantes de cor encontrados`);

  // ── Fase 2: Aplicar cores encontradas aos produtos do catálogo ────────────────
  console.log('\n🎯 Fase 2: aplicando cores ao catálogo...');

  const targets = catalog.products.filter(p => TARGET_CATEGORIES.includes(p.category));

  for (const product of targets) {
    let newColors: ColorVariant[] = [];

    // a) Usa o parent_id do produto para buscar cores pré-buscadas
    if (product.mlParentId) {
      const found = parentColorMap.get(product.mlParentId) ?? [];
      newColors.push(...found);
    }

    // b) Busca detalhes de cada mlId para extrair cor e parent_id
    if (newColors.length < 2 && product.mlIds.length > 0) {
      for (const mlId of product.mlIds.slice(0, 2)) {
        const detail = await fetchProductDetail(mlId);
        if (!detail) continue;

        // Se este mlId tem cor, adiciona
        if (detail.colorName && detail.image) {
          newColors.push({ name: detail.colorName, image: detail.image });
        }

        // Se encontrou parent_id, busca os irmãos no mapa
        if (detail.parentId) {
          const siblings = parentColorMap.get(detail.parentId) ?? [];
          newColors.push(...siblings);

          // Atualiza mlParentId no produto se estava faltando
          if (!product.mlParentId && !isDryRun) {
            product.mlParentId = detail.parentId;
          }
        }
      }
    }

    // c) Se ainda sem cores, tenta busca por marca + nome do produto
    if (newColors.length === 0 && product.brand) {
      const brandQuery = `${product.brand} ${product.category}`;
      const groups = await fetchAndGroupByParent(brandQuery);
      for (const [, variants] of groups) {
        if (variants.length >= 2) {
          // Heurística: se encontramos um grupo de variantes compatível, usa
          newColors.push(...variants);
          if (newColors.length >= 3) break;
        }
      }
    }

    newColors = dedupeColors(newColors.filter(c => c.name && c.image));

    if (newColors.length > 0) {
      const merged = mergeColors(product.colors ?? [], newColors);
      if (merged.length > (product.colors?.length ?? 0)) {
        const added = merged.length - (product.colors?.length ?? 0);
        if (!isDryRun) {
          product.colors = merged;
          product.updatedAt = new Date().toISOString();
        }
        totalEnriched++;
        console.log(`  ✓ [${product.category}] ${product.name.slice(0, 45)} → +${added} cores (total: ${merged.length})`);
      }
    }
  }

  // ── Fase 3: Para produtos sem cores, extrai da própria imagem via RGB_COLOR ──
  console.log('\n🖌️  Fase 3: extraindo cor via RGB para produtos restantes...');

  const stillNoColors = catalog.products.filter(p =>
    TARGET_CATEGORIES.includes(p.category) && (!p.colors || p.colors.length === 0)
  );

  for (const product of stillNoColors) {
    if (!product.mlIds.length) continue;

    const detail = await fetchProductDetail(product.mlIds[0]);
    if (!detail?.colorName) continue;

    const color: ColorVariant = {
      name: detail.colorName,
      image: detail.image ?? product.image,
    };

    if (!isDryRun) {
      product.colors = [color];
      product.updatedAt = new Date().toISOString();
      if (detail.parentId && !product.mlParentId) product.mlParentId = detail.parentId;
    }
    totalEnriched++;
    console.log(`  ✓ [${product.category}] ${product.name.slice(0, 45)} → cor: ${color.name}`);
  }

  // ── Resumo final ─────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Total de produtos enriquecidos: ${totalEnriched}`);

  // Stats por categoria
  for (const cat of TARGET_CATEGORIES) {
    const all = catalog.products.filter(p => p.category === cat);
    const withColors = all.filter(p => p.colors && p.colors.length > 0);
    console.log(`  ${cat}: ${withColors.length}/${all.length} com cores`);
  }

  if (!isDryRun && totalEnriched > 0) {
    saveCatalog(catalog);
    console.log('\n💾 catalog.json salvo');
    const { execSync } = await import('child_process');
    execSync('node scripts/export-catalog.js', { stdio: 'inherit' });
  }
}

main().catch(err => { console.error('\n❌ Erro:', err); process.exit(1); });
