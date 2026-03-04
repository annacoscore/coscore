import { NextRequest, NextResponse } from "next/server";

const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     ?? "1664631224999083";
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET ?? "Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG";
const ML_BASE          = "https://api.mercadolibre.com";

// ── Token ML com renovação automática ────────────────────────────────────────
let cachedToken    = process.env.ML_ACCESS_TOKEN  ?? "";
let cachedRefresh  = process.env.ML_REFRESH_TOKEN ?? "";
let tokenFetchedAt = 0;

async function getToken(): Promise<string> {
  const FIVE_HOURS = 5 * 60 * 60 * 1000;
  if (cachedToken && Date.now() - tokenFetchedAt < FIVE_HOURS) return cachedToken;

  // Tenta renovar via refresh_token (OAuth)
  if (cachedRefresh) {
    try {
      const body = new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        refresh_token: cachedRefresh,
      });
      const res  = await fetch(`${ML_BASE}/oauth/token`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(), next: { revalidate: 0 },
      });
      const data = await res.json();
      if (data.access_token) {
        cachedToken    = data.access_token;
        cachedRefresh  = data.refresh_token ?? cachedRefresh;
        tokenFetchedAt = Date.now();
        return cachedToken;
      }
    } catch { /* cai para client_credentials */ }
  }

  // Fallback: client_credentials (sem acesso a marketplace com preços)
  try {
    const body = `grant_type=client_credentials&client_id=${ML_CLIENT_ID}&client_secret=${ML_CLIENT_SECRET}`;
    const res  = await fetch(`${ML_BASE}/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body, next: { revalidate: 0 },
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
    next:    { revalidate: 900 },
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

// Mapeamento de seller nickname ML → loja conhecida
const ML_STORES: Record<string, { name: string; logo: string; color: string }> = {
  belezanaweb:      { name: "Beleza na Web",  logo: "BW", color: "bg-pink-600 text-white"   },
  sephora:          { name: "Sephora",         logo: "Se", color: "bg-black text-white"      },
  sephorabrasil:    { name: "Sephora",         logo: "Se", color: "bg-black text-white"      },
  magazineluiza:    { name: "Magazine Luiza",  logo: "MG", color: "bg-blue-600 text-white"   },
  "magazine luiza": { name: "Magazine Luiza",  logo: "MG", color: "bg-blue-600 text-white"   },
  americanas:       { name: "Americanas",      logo: "Am", color: "bg-red-600 text-white"    },
  "lojas americanas": { name: "Americanas",    logo: "Am", color: "bg-red-600 text-white"    },
  drogasil:         { name: "Drogasil",        logo: "Dr", color: "bg-green-600 text-white"  },
  drogasil_oficial: { name: "Drogasil",        logo: "Dr", color: "bg-green-600 text-white"  },
  ultrafarma:       { name: "Ultrafarma",      logo: "Uf", color: "bg-blue-500 text-white"   },
  drogaraia:        { name: "Droga Raia",      logo: "DR", color: "bg-purple-600 text-white" },
  droga_raia:       { name: "Droga Raia",      logo: "DR", color: "bg-purple-600 text-white" },
  netfarma:         { name: "Netfarma",        logo: "Nf", color: "bg-green-700 text-white"  },
  boticario:        { name: "O Boticário",     logo: "OB", color: "bg-purple-700 text-white" },
  natura:           { name: "Natura",          logo: "Na", color: "bg-amber-600 text-white"  },
  avon:             { name: "Avon",            logo: "Av", color: "bg-pink-700 text-white"   },
  shopee:           { name: "Shopee",          logo: "Sh", color: "bg-orange-500 text-white" },
  farmarcas:        { name: "Farmacias Associadas", logo: "FA", color: "bg-green-500 text-white" },
  onofre:           { name: "Onofre",          logo: "On", color: "bg-blue-700 text-white"   },
  pague_menos:      { name: "Pague Menos",     logo: "PM", color: "bg-red-500 text-white"    },
};

function resolveMLStore(nickname: string): { name: string; logo: string; color: string } | null {
  const key = nickname.toLowerCase().replace(/[_\-\.]/g, " ").trim();
  for (const [k, v] of Object.entries(ML_STORES)) {
    if (key === k || key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

type MlItem = {
  id: string; title: string; price: number; available_quantity: number;
  permalink: string; seller?: { id?: number; nickname?: string };
  shipping?: { free_shipping?: boolean };
};

// ── Busca preço na Amazon BR ───────────────────────────────────────────────────
async function fetchAmazonPrice(searchQuery: string): Promise<{ price: number; url: string } | null> {
  try {
    const enc = encodeURIComponent(searchQuery.slice(0, 100));
    const res = await fetch(`https://www.amazon.com.br/s?k=${enc}&i=beauty`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Accept-Encoding": "identity",
      },
      signal: AbortSignal.timeout(12000),
      next:   { revalidate: 3600 }, // cache 1h
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Extrai ASIN e preço do primeiro resultado relevante
    const asinMatch  = html.match(/\/dp\/([A-Z0-9]{10})/);
    const priceMatch = html.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/);

    if (asinMatch && priceMatch) {
      const raw   = priceMatch[1].replace(/\./g, "").replace(",", ".");
      const price = parseFloat(raw);
      if (price > 0 && price < 10000) {
        return { price, url: `https://www.amazon.com.br/dp/${asinMatch[1]}` };
      }
    }
  } catch { /* ignora */ }
  return null;
}

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

  // ── 1. Busca no marketplace do Mercado Livre (requer OAuth user token) ───
  try {
    let items: MlItem[] = [];

    if (mlId) {
      const byId = await mlGet(`/sites/MLB/search?catalog_product_id=${mlId}&sort=price_asc&limit=25`);
      items = byId.results ?? [];
    }

    if (items.length === 0) {
      const byName = await mlGet(`/sites/MLB/search?q=${encSearch}&sort=price_asc&limit=25`);
      items = byName.results ?? [];
      const nameLow  = cleanName.toLowerCase().split(" ").slice(0, 3).join(" ");
      const brandLow = brand.toLowerCase();
      items = items.filter(it => {
        const t = it.title.toLowerCase();
        return t.includes(brandLow) || t.includes(nameLow);
      }).slice(0, 15);
    }

    const seenStores = new Set<string>();
    const seenPrices = new Set<number>();

    for (const item of items) {
      if (results.length >= 8) break;
      const nickname = item.seller?.nickname ?? "";
      const store    = resolveMLStore(nickname);
      const storeKey = store?.name ?? `ML:${nickname}`;

      if (seenStores.has(storeKey) || seenPrices.has(item.price)) continue;
      seenStores.add(storeKey);
      seenPrices.add(item.price);

      results.push({
        store:       store?.name  ?? "Mercado Livre",
        price:       item.price,
        url:         item.permalink,
        inStock:     (item.available_quantity ?? 0) > 0,
        logo:        store?.logo  ?? "ML",
        color:       store?.color ?? "bg-yellow-400 text-gray-900",
        type:        "real",
        freeShipping: item.shipping?.free_shipping ?? false,
      });
    }
  } catch { /* ignora */ }

  // Garante que Mercado Livre aparece na lista se não veio via busca
  const hasML = results.some(r => r.store === "Mercado Livre" || r.logo === "ML");
  if (!hasML) {
    results.unshift({
      store:   "Mercado Livre",
      price:   null,
      url:     mlId
        ? `https://www.mercadolivre.com.br/p/${mlId}`
        : `https://www.mercadolivre.com.br/search?q=${encSearch}`,
      inStock: true,
      logo:    "ML",
      color:   "bg-yellow-400 text-gray-900",
      type:    mlId ? "search" : "search",
    });
  }

  // ── 2. Amazon BR — extrai preço real via scraping do HTML ───────────────
  const alreadyHasAmazon = results.some(r => r.store === "Amazon");
  if (!alreadyHasAmazon) {
    try {
      const amz = await fetchAmazonPrice(searchTerm);
      if (amz) {
        results.push({
          store:   "Amazon",
          price:   amz.price,
          url:     amz.url,
          inStock: true,
          logo:    "Am",
          color:   "bg-orange-400 text-white",
          type:    "real",
        });
      } else {
        // Fallback: link de busca na Amazon (sem preço)
        results.push({
          store:   "Amazon",
          price:   null,
          url:     `https://www.amazon.com.br/s?k=${encSearch}&i=beauty`,
          inStock: true,
          logo:    "Am",
          color:   "bg-orange-400 text-white",
          type:    "search",
        });
      }
    } catch { /* ignora */ }
  }

  // ── 3. Lojas de marca direta (link de busca — sem preço, mas direcionado) ─
  const storesDone = new Set(results.map(r => r.store));
  const brandLow   = brand.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  type SearchStore = Omit<StorePriceResult, "price" | "inStock" | "type" | "freeShipping">;

  const brandStores: SearchStore[] = [];
  if (brandLow.includes("boticari") || brandLow.includes("boticário"))
    brandStores.push({ store: "O Boticário", url: `https://www.boticario.com.br/busca#q=${encSearch}`, logo: "OB", color: "bg-purple-700 text-white" });
  if (brandLow.includes("natura"))
    brandStores.push({ store: "Natura", url: `https://www.natura.com.br/busca?q=${encSearch}`, logo: "Na", color: "bg-amber-600 text-white" });
  if (brandLow.includes("avon"))
    brandStores.push({ store: "Avon", url: `https://www.avon.com.br/busca?q=${encSearch}`, logo: "Av", color: "bg-pink-700 text-white" });
  if (brandLow.includes("mac"))
    brandStores.push({ store: "MAC Cosmetics", url: `https://www.maccosmetics.com.br/search?q=${encSearch}`, logo: "MC", color: "bg-black text-white" });
  if (brandLow.includes("sephora"))
    brandStores.push({ store: "Sephora", url: `https://www.sephora.com.br/search#q=${encSearch}&t=All`, logo: "Se", color: "bg-black text-white" });

  for (const s of brandStores) {
    if (!storesDone.has(s.store)) {
      results.push({ ...s, price: null, inStock: true, type: "search", freeShipping: false });
      storesDone.add(s.store);
    }
  }

  // ── Ordena: preços reais primeiro (mais barato), depois links de busca ───
  results.sort((a, b) => {
    if (a.type === "real" && b.type !== "real") return -1;
    if (a.type !== "real" && b.type === "real") return 1;
    if (a.price !== null && b.price !== null)   return a.price - b.price;
    return 0;
  });

  return NextResponse.json({ results });
}
