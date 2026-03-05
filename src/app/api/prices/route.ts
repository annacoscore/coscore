import { NextRequest, NextResponse } from "next/server";

const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     ?? "1664631224999083";
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET ?? "Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG";
const ML_BASE          = "https://api.mercadolibre.com";

// ── Token ML ─────────────────────────────────────────────────────────────────
let cachedToken    = process.env.ML_ACCESS_TOKEN  ?? "";
let cachedRefresh  = process.env.ML_REFRESH_TOKEN ?? "";
let tokenFetchedAt = 0;

async function getToken(): Promise<string> {
  const FIVE_HOURS = 5 * 60 * 60 * 1000;
  if (cachedToken && Date.now() - tokenFetchedAt < FIVE_HOURS) return cachedToken;

  if (cachedRefresh) {
    try {
      const res  = await fetch(`${ML_BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token", client_id: ML_CLIENT_ID,
          client_secret: ML_CLIENT_SECRET, refresh_token: cachedRefresh,
        }).toString(),
        next: { revalidate: 0 },
      });
      const data = await res.json();
      if (data.access_token) {
        cachedToken = data.access_token;
        cachedRefresh = data.refresh_token ?? cachedRefresh;
        tokenFetchedAt = Date.now();
        return cachedToken;
      }
    } catch { /* cai para client_credentials */ }
  }

  try {
    const res  = await fetch(`${ML_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${ML_CLIENT_ID}&client_secret=${ML_CLIENT_SECRET}`,
      next: { revalidate: 0 },
    });
    const data = await res.json();
    if (data.access_token) { cachedToken = data.access_token; tokenFetchedAt = Date.now(); }
  } catch { /* usa token anterior */ }
  return cachedToken;
}

async function mlGet(path: string) {
  const token = await getToken();
  const res   = await fetch(`${ML_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(10000),
    next:    { revalidate: 600 },
  });
  return res.json();
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface StorePriceResult {
  store:        string;
  price:        number | null;
  url:          string;
  inStock:      boolean;
  logo:         string;
  color:        string;
  type:         "real" | "search";
  freeShipping?: boolean;
}

// ── Sellers conhecidos no ML → Loja ──────────────────────────────────────────
// Cada entrada: nicknames do vendedor no ML que representam essa loja
const KNOWN_STORES: {
  name: string; logo: string; color: string; nicknames: string[];
}[] = [
  {
    name: "Beleza na Web", logo: "BW", color: "bg-pink-600 text-white",
    nicknames: ["belezanaweb", "beleza_na_web", "bnw", "belezaonline"],
  },
  {
    name: "Sephora", logo: "Se", color: "bg-black text-white",
    nicknames: ["sephora", "sephorabrasil", "sephora_brasil", "sephora brasil"],
  },
  {
    name: "Magazine Luiza", logo: "ML", color: "bg-blue-600 text-white",
    nicknames: ["magazineluiza", "magazine_luiza", "magazine luiza", "magalu"],
  },
  {
    name: "Americanas", logo: "Am", color: "bg-red-600 text-white",
    nicknames: ["americanas", "lojas americanas", "lojasamericanas", "b2w"],
  },
  {
    name: "Drogasil", logo: "Ds", color: "bg-green-600 text-white",
    nicknames: ["drogasil", "drogasil_oficial", "drogasilofi", "drogasiloficial"],
  },
  {
    name: "Droga Raia", logo: "DR", color: "bg-purple-600 text-white",
    nicknames: ["drogaraia", "droga_raia", "droga raia", "raia"],
  },
  {
    name: "O Boticário", logo: "OB", color: "bg-purple-700 text-white",
    nicknames: ["boticario", "o boticario", "oboticario", "boticarioofi"],
  },
  {
    name: "Natura", logo: "Na", color: "bg-amber-600 text-white",
    nicknames: ["natura", "natura oficial", "naturaoficial"],
  },
  {
    name: "Ultrafarma", logo: "Uf", color: "bg-blue-500 text-white",
    nicknames: ["ultrafarma", "ultra_farma"],
  },
  {
    name: "Pague Menos", logo: "PM", color: "bg-red-500 text-white",
    nicknames: ["pague_menos", "paguemenos", "pague menos"],
  },
  {
    name: "Época Cosméticos", logo: "Ec", color: "bg-rose-600 text-white",
    nicknames: ["epocacosmeticos", "epoca cosmeticos", "epocacosmetico"],
  },
  {
    name: "Onofre", logo: "On", color: "bg-blue-700 text-white",
    nicknames: ["onofre", "cvs_onofre", "cvsonofre"],
  },
  {
    name: "Shopee", logo: "Sh", color: "bg-orange-500 text-white",
    nicknames: ["shopee"],
  },
];

function resolveStore(nickname: string) {
  const key = nickname.toLowerCase().replace(/[_\-\.]/g, " ").trim();
  for (const store of KNOWN_STORES) {
    for (const n of store.nicknames) {
      if (key === n || key.includes(n) || n.includes(key)) return store;
    }
  }
  return null;
}

// ── Scraping Amazon BR ────────────────────────────────────────────────────────
async function fetchAmazonPrice(query: string): Promise<{ price: number; url: string } | null> {
  try {
    const enc = encodeURIComponent(query.slice(0, 100));
    const res = await fetch(`https://www.amazon.com.br/s?k=${enc}&i=beauty`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept":          "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Accept-Encoding": "identity",
      },
      signal: AbortSignal.timeout(12000),
      next:   { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Encontrar ASIN e preço do primeiro produto relevante
    // Padrão: encontrar um produto com ASIN e preço próximos no HTML
    const productBlocks = html.match(/data-asin="([A-Z0-9]{10})"[^>]*>[\s\S]{0,2000}?R\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g);
    if (productBlocks && productBlocks.length > 0) {
      for (const block of productBlocks.slice(0, 5)) {
        const asinM  = block.match(/data-asin="([A-Z0-9]{10})"/);
        const priceM = block.match(/R\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/);
        if (asinM && priceM) {
          const raw   = priceM[1].replace(/\./g, "").replace(",", ".");
          const price = parseFloat(raw);
          if (price > 1 && price < 20000) {
            return { price, url: `https://www.amazon.com.br/dp/${asinM[1]}` };
          }
        }
      }
    }

    // Fallback simples
    const asinM  = html.match(/\/dp\/([A-Z0-9]{10})/);
    const priceM = html.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/);
    if (asinM && priceM) {
      const raw   = priceM[1].replace(/\./g, "").replace(",", ".");
      const price = parseFloat(raw);
      if (price > 1 && price < 20000) {
        return { price, url: `https://www.amazon.com.br/dp/${asinM[1]}` };
      }
    }
  } catch { /* ignora */ }
  return null;
}

type MlItem = {
  id: string; title: string; price: number; available_quantity: number;
  permalink: string; seller?: { id?: number; nickname?: string };
  shipping?: { free_shipping?: boolean };
};

// ── Handler principal ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mlId  = searchParams.get("mlId")  ?? "";
  const name  = searchParams.get("name")  ?? "";
  const brand = searchParams.get("brand") ?? "";
  const color = searchParams.get("color") ?? "";

  const cleanName  = name
    .replace(/\b(maquiagem|makeup|cosmétic[ao]s?|produto)\b/gi, "")
    .replace(/\s{2,}/g, " ").trim().slice(0, 60);
  const searchTerm = [brand, cleanName, color].filter(Boolean).join(" ").trim();
  const encSearch  = encodeURIComponent(searchTerm.slice(0, 100));

  const results: StorePriceResult[] = [];

  // ── 1. Busca no ML — encontrar itens de TODOS os sellers conhecidos ───────
  try {
    let items: MlItem[] = [];

    // Busca pelo catalog_product_id (mais precisa)
    if (mlId) {
      const byId = await mlGet(`/sites/MLB/search?catalog_product_id=${mlId}&sort=price_asc&limit=50`);
      items = byId.results ?? [];
    }

    // Busca por nome se não encontrou itens suficientes
    if (items.length < 5) {
      const byName = await mlGet(`/sites/MLB/search?q=${encSearch}&sort=price_asc&limit=50`);
      const nameItems: MlItem[] = byName.results ?? [];
      // Filtrar por relevância
      const nameLow  = cleanName.toLowerCase().split(" ").filter(w => w.length > 2).slice(0, 3).join(" ");
      const brandLow = brand.toLowerCase().slice(0, 15);
      const filtered = nameItems.filter(it => {
        const t = it.title.toLowerCase();
        return t.includes(brandLow) || t.includes(nameLow);
      });
      // Mesclar, evitando duplicatas por ID
      const seen = new Set(items.map(i => i.id));
      for (const it of filtered) {
        if (!seen.has(it.id)) { items.push(it); seen.add(it.id); }
      }
    }

    // Mapear items → stores, uma entrada por loja (preço mais barato)
    const storeMap = new Map<string, { item: MlItem; store: typeof KNOWN_STORES[0] | null }>();

    for (const item of items) {
      if (!(item.available_quantity > 0)) continue;
      const nickname = item.seller?.nickname ?? "";
      const store    = resolveStore(nickname);
      const storeKey = store?.name ?? `ml_${nickname.toLowerCase().slice(0, 20)}`;

      // Só considerar lojas conhecidas OU ML genérico
      if (!store && !nickname) continue;

      const existing = storeMap.get(storeKey);
      if (!existing || item.price < existing.item.price) {
        storeMap.set(storeKey, { item, store });
      }
    }

    // ML genérico — pegar o item mais barato que não é de loja conhecida
    const mlGeneric = items
      .filter(it => it.available_quantity > 0 && !resolveStore(it.seller?.nickname ?? ""))
      .sort((a, b) => a.price - b.price)[0];

    if (mlGeneric) {
      storeMap.set("Mercado Livre", { item: mlGeneric, store: null });
    }

    // Converter para resultados
    for (const [storeKey, { item, store }] of storeMap) {
      results.push({
        store:        store?.name ?? "Mercado Livre",
        price:        item.price,
        url:          item.permalink,
        inStock:      true,
        logo:         store?.logo ?? "ML",
        color:        store?.color ?? "bg-yellow-400 text-gray-900",
        type:         "real",
        freeShipping: item.shipping?.free_shipping ?? false,
      });
    }
  } catch { /* ignora */ }

  // ── 2. Amazon BR ──────────────────────────────────────────────────────────
  const hasAmazon = results.some(r => r.store === "Amazon");
  if (!hasAmazon) {
    try {
      const amz = await fetchAmazonPrice(searchTerm);
      if (amz) {
        results.push({
          store:   "Amazon",
          price:   amz.price,
          url:     amz.url,
          inStock: true,
          logo:    "Az",
          color:   "bg-orange-400 text-white",
          type:    "real",
        });
      }
    } catch { /* ignora */ }
  }

  // ── Ordenar: mais barato primeiro ─────────────────────────────────────────
  results.sort((a, b) => {
    if (a.price !== null && b.price !== null) return a.price - b.price;
    if (a.price !== null) return -1;
    if (b.price !== null) return 1;
    return 0;
  });

  // ── Só retornar resultados COM preço confirmado ───────────────────────────
  const confirmed = results.filter(r => r.price !== null && r.price > 0 && r.inStock);

  return NextResponse.json({ results: confirmed });
}
