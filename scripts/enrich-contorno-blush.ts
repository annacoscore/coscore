/**
 * enrich-contorno-blush.ts
 * ─────────────────────────
 * Enriquece cores de Contorno/Bronzer e Blush.
 * Para cada produto sem cor, busca no ML por nome+marca para encontrar variantes.
 *
 * Uso: npx tsx scripts/enrich-contorno-blush.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { loadCatalog, saveCatalog } from './lib/storage';
import type { ColorVariant, CatalogEntry } from './lib/types';
import { execSync } from 'child_process';

const BASE_URL = 'https://api.mercadolibre.com';
const DELAY_MS = 400;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function getToken(): string {
  const t = process.env.ML_ACCESS_TOKEN;
  if (!t) { console.error('❌ Execute: npx tsx scripts/ml-auth.ts'); process.exit(1); }
  return t;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  await sleep(DELAY_MS);
  const headers = { Accept: 'application/json', Authorization: `Bearer ${getToken()}` };
  try {
    const res = await fetch(url, { headers });
    if (res.status === 401) { console.error('\n❌ Token expirado.'); process.exit(1); }
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

interface MLProduct {
  id: string;
  name: string;
  parent_id?: string;
  status: string;
  attributes: { id: string; value_name: string | null }[];
  pictures: { url: string }[];
}
interface MLSearch { paging: { total: number }; results: MLProduct[] }

// ─── Paleta de cores para cada categoria ─────────────────────────────────────

function hexToColorName(hex: string, category: string): string {
  const h = hex.replace('#', '').toLowerCase().padEnd(6, '0');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const isWarm = r > b + 20;
  const isRosy = r > g + 20 && r > b;
  const isGolden = r > g && g > b;

  if (category === 'Blush') {
    if (lum > 200) return 'Rosa Bebê';
    if (isRosy && lum > 160) return 'Rosa Claro';
    if (isRosy && lum > 120) return 'Rosa';
    if (isGolden && lum > 150) return 'Pêssego';
    if (isGolden && lum > 110) return 'Coral';
    if (isWarm && lum > 140) return 'Rosé';
    if (lum > 100) return 'Malva';
    return 'Malva Escuro';
  } else {
    // Contorno/Bronzer
    if (lum > 200) return 'Claro';
    if (lum > 160) return isGolden ? 'Dourado Claro' : 'Médio Claro';
    if (lum > 120) return isGolden ? 'Dourado' : isWarm ? 'Quente' : 'Médio';
    if (lum > 80)  return isWarm ? 'Caramelo' : 'Escuro';
    return 'Muito Escuro';
  }
}

function attrVal(attrs: { id: string; value_name: string | null }[], ...ids: string[]): string {
  for (const id of ids) {
    const v = attrs.find(a => a.id === id)?.value_name;
    if (v?.trim()) return v.trim();
  }
  return '';
}

const JUNK = new Set(['unico','única','unica','sem cor','outro','multicolor','multicor',
  'incolor','transparente','nenhum','other','no color','–','-','batom','base','produto','']);

function extractColor(p: MLProduct, category: string): string {
  const colorText = attrVal(p.attributes, 'COLOR', 'COLOR_NAME', 'SHADE', 'TONE', 'TINT');
  const c = colorText.trim();
  if (c && c.length >= 2 && !JUNK.has(c.toLowerCase())) {
    return c.charAt(0).toUpperCase() + c.slice(1);
  }
  const rgb = attrVal(p.attributes, 'RGB_COLOR');
  if (rgb && /^[0-9A-Fa-f]{6}$/i.test(rgb.replace('#', ''))) {
    return hexToColorName(rgb, category);
  }
  return '';
}

// ─── Extrai palavras-chave de cor do nome do produto ─────────────────────────

// Padrões que indicam cor/tom nos nomes de produtos
const COLOR_PATTERNS = [
  // Tons de bronzeado/contorno
  /\b(medio|médio|claro|escuro|dourado|quente|frio|neutro|deep|light|medium|dark|fair|tan|bronze|warm|cool)\b/i,
  // Nomes de shades de bronzer
  /\b(chocolate|soleil|sunkissed|sun kissed|island|tropical|paradise|terra|earth)\b/i,
  // Blush colors
  /\b(rosa|coral|pêssego|pessego|rosé|rose|peachy|peach|malva|mauve|nude|berry|vermelho|red|pink|blush|flush|glow)\b/i,
  // Shade numbers / codes
  /\b([0-9]{2,3}[A-Z]?|[A-Z][0-9]{2,3})\b/,
];

function extractColorFromName(name: string): string {
  const lower = name.toLowerCase();
  for (const pattern of COLOR_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      const word = match[1] ?? match[0];
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
  }
  return '';
}

// ─── Deduplicação ─────────────────────────────────────────────────────────────

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

// ─── Busca variantes por nome do produto no ML ────────────────────────────────

async function findVariantsByName(productName: string, brand: string, category: string): Promise<ColorVariant[]> {
  // Limpa o nome para a query — remove redundâncias e mantém palavras-chave
  const cleanName = productName
    .replace(/^(blush|bronzer|contorno|iluminador)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 5)
    .join(' ');

  const query = `${brand} ${cleanName}`.trim().slice(0, 60);
  const url = `${BASE_URL}/products/search?site_id=MLB&q=${encodeURIComponent(query)}&limit=30`;
  const res = await fetchJson<MLSearch>(url);
  if (!res?.results) return [];

  // Agrupa por parent_id
  const byParent = new Map<string, { variants: MLProduct[]; parentId: string }>();
  for (const p of res.results) {
    if (p.status !== 'active' || !p.parent_id) continue;
    const g = byParent.get(p.parent_id) ?? { variants: [], parentId: p.parent_id };
    g.variants.push(p);
    byParent.set(p.parent_id, g);
  }

  // Pega o grupo com mais variantes
  let bestGroup: MLProduct[] = [];
  for (const { variants } of byParent.values()) {
    if (variants.length > bestGroup.length) bestGroup = variants;
  }

  if (bestGroup.length === 0) return [];

  const colors: ColorVariant[] = [];
  for (const p of bestGroup) {
    const colorName = extractColor(p, category);
    if (colorName && p.pictures?.[0]?.url) {
      colors.push({ name: colorName, image: p.pictures[0].url });
    }
  }
  return dedupeColors(colors);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  getToken();
  console.log('🎨 Enriquecendo cores: Contorno/Bronzer e Blush\n');

  const catalog = loadCatalog();
  let enriched = 0;

  for (const category of ['Contorno/Bronzer', 'Blush'] as const) {
    const products = catalog.products.filter(p => p.category === category);
    const noColors = products.filter(p => !p.colors || p.colors.length === 0);
    const fewColors = products.filter(p => p.colors && p.colors.length > 0 && p.colors.length < 3);
    const toProcess = [...new Map([...noColors, ...fewColors].map(p => [p.id, p])).values()];

    console.log(`\n── ${category}: ${products.length} produtos (${toProcess.length} sem cores/poucas cores) ──`);

    for (const product of toProcess) {
      let newColors: ColorVariant[] = [];

      // Estratégia 1: busca por nome+marca no ML para encontrar variantes
      const fromSearch = await findVariantsByName(product.name, product.brand, category);
      newColors.push(...fromSearch);

      // Estratégia 2: se não achou, extrai cor do próprio nome do produto
      if (newColors.length === 0) {
        const colorFromName = extractColorFromName(product.name);
        if (colorFromName) {
          newColors.push({ name: colorFromName, image: product.image });
        }
      }

      newColors = dedupeColors(newColors.filter(c => c.name && c.image));
      if (newColors.length === 0) continue;

      const merged = mergeColors(product.colors ?? [], newColors);
      if (merged.length > (product.colors?.length ?? 0)) {
        const added = merged.length - (product.colors?.length ?? 0);
        product.colors = merged;
        product.updatedAt = new Date().toISOString();
        enriched++;
        const coresList = merged.map(c => c.name).join(', ').slice(0, 70);
        console.log(`  ✓ ${product.name.slice(0, 45)} → +${added} [${coresList}]`);
      }
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ ${enriched} produtos enriquecidos\n`);
  for (const cat of ['Contorno/Bronzer', 'Blush']) {
    const all = catalog.products.filter(p => p.category === cat);
    const withColors = all.filter(p => p.colors && p.colors.length > 0);
    console.log(`  ${cat}: ${withColors.length}/${all.length} com cores`);
  }

  if (enriched > 0) {
    saveCatalog(catalog);
    console.log('\n💾 catalog.json salvo');
    execSync('node scripts/export-catalog.js', { stdio: 'inherit' });
  } else {
    // Mesmo sem novas cores, exporta pois a categoria foi renomeada
    execSync('node scripts/export-catalog.js', { stdio: 'inherit' });
    console.log('products.ts exportado (categoria renomeada)');
  }
}

main().catch(err => { console.error('\n❌ Erro:', err); process.exit(1); });
