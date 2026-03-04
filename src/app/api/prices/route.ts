import { NextRequest, NextResponse } from "next/server";

const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     ?? "1664631224999083";
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET ?? "Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG";
const ML_BASE          = "https://api.mercadolibre.com";

// Cache do token OAuth (expira em 6h — renovamos a cada 5h usando refresh_token)
let cachedToken    = process.env.ML_ACCESS_TOKEN  ?? "";
let cachedRefresh  = process.env.ML_REFRESH_TOKEN ?? "";
let tokenFetchedAt = 0;

async function getToken(): Promise<string> {
  const FIVE_HOURS = 5 * 60 * 60 * 1000;
  if (cachedToken && Date.now() - tokenFetchedAt < FIVE_HOURS) return cachedToken;

  // Tenta renovar via refresh_token (OAuth — tem permissão para buscar listagens)
  if (cachedRefresh) {
    try {
      const body = new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        refresh_token: cachedRefresh,
      });
      const res  = await fetch(`${ML_BASE}/oauth/token`, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    body.toString(),
        next:    { revalidate: 0 },
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

  // Fallback: client_credentials (funciona para /products/search mas não para marketplace)
  try {
    const body = `grant_type=client_credentials&client_id=${ML_CLIENT_ID}&client_secret=${ML_CLIENT_SECRET}`;
    const res  = await fetch(`${ML_BASE}/oauth/token`, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      next: { revalidate: 0 },
    });
    const data = await res.json();
    if (data.access_token) {
      cachedToken    = data.access_token;
      tokenFetchedAt = Date.now();
    }
  } catch { /* usa o token anterior */ }
  return cachedToken;
}

async function mlGet(path: string) {
  const token = await getToken();
  const res   = await fetch(`${ML_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(10000),
    next:    { revalidate: 900 }, // cache 15 min
  });
  return res.json();
}

export interface StorePriceResult {
  store:        string;
  price:        number | null;    // null = sem preço aferido (link de busca)
  url:          string;
  inStock:      boolean;
  logo:         string;           // iniciais
  color:        string;           // classe tailwind
  type:         "real" | "search";
  freeShipping?: boolean;
}

// Seller nicknames das principais lojas no ML
const KNOWN_STORES: Record<string, { name: string; logo: string; color: string }> = {
  belezanaweb:          { name: "Beleza na Web",   logo: "BW", color: "bg-pink-600 text-white"   },
  sephora:              { name: "Sephora",          logo: "Se", color: "bg-black text-white"      },
  sephorabrasil:        { name: "Sephora",          logo: "Se", color: "bg-black text-white"      },
  amazon:               { name: "Amazon",           logo: "Am", color: "bg-orange-400 text-white" },
  amazonbrasil:         { name: "Amazon",           logo: "Am", color: "bg-orange-400 text-white" },
  magazineluiza:        { name: "Magazine Luiza",   logo: "MG", color: "bg-blue-600 text-white"   },
  "magazine luiza":     { name: "Magazine Luiza",   logo: "MG", color: "bg-blue-600 text-white"   },
  americanas:           { name: "Americanas",       logo: "Am", color: "bg-red-600 text-white"    },
  "lojas americanas":   { name: "Americanas",       logo: "Am", color: "bg-red-600 text-white"    },
  drogasil:             { name: "Drogasil",         logo: "Dr", color: "bg-green-600 text-white"  },
  drogasil_oficial:     { name: "Drogasil",         logo: "Dr", color: "bg-green-600 text-white"  },
  ultrafarma:           { name: "Ultrafarma",       logo: "Uf", color: "bg-blue-500 text-white"   },
  drogaraia:            { name: "Droga Raia",       logo: "DR", color: "bg-purple-600 text-white" },
  droga_raia:           { name: "Droga Raia",       logo: "DR", color: "bg-purple-600 text-white" },
  netfarma:             { name: "Netfarma",         logo: "Nf", color: "bg-green-700 text-white"  },
  boticario:            { name: "O Boticário",      logo: "OB", color: "bg-purple-700 text-white" },
  natura:               { name: "Natura",           logo: "Na", color: "bg-amber-600 text-white"  },
  avon:                 { name: "Avon",             logo: "Av", color: "bg-pink-700 text-white"   },
  renner:               { name: "Renner",           logo: "Re", color: "bg-red-700 text-white"    },
  casasbahia:           { name: "Casas Bahia",      logo: "CB", color: "bg-blue-800 text-white"   },
  shopee:               { name: "Shopee",           logo: "Sh", color: "bg-orange-500 text-white" },
};

function resolveStore(nickname: string): { name: string; logo: string; color: string } | null {
  const key = nickname.toLowerCase().replace(/[_\-\.]/g, " ").trim();
  for (const [k, v] of Object.entries(KNOWN_STORES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

type MlItem = {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  permalink: string;
  seller?: { id?: number; nickname?: string };
  shipping?: { free_shipping?: boolean };
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mlId  = searchParams.get("mlId")  ?? "";
  const name  = searchParams.get("name")  ?? "";
  const brand = searchParams.get("brand") ?? "";
  const color = searchParams.get("color") ?? "";

  // Limpa o nome do produto para a busca (remove partes genéricas)
  const cleanName  = name
    .replace(/\b(maquiagem|makeup|cosmétic[ao]s?|produto)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 60);
  const searchTerm = color
    ? `${brand} ${cleanName} ${color}`
    : `${brand} ${cleanName}`;
  const enc       = encodeURIComponent(color ? `${cleanName} ${color}` : cleanName);
  const encSearch = encodeURIComponent(searchTerm.trim().slice(0, 100));

  const results: StorePriceResult[] = [];

  // ── Busca preços reais no ML ──────────────────────────────────────────
  try {
    let items: MlItem[] = [];

    // 1ª tentativa: por catalog_product_id (mais preciso)
    if (mlId) {
      const byId = await mlGet(
        `/sites/MLB/search?catalog_product_id=${mlId}&sort=price_asc&limit=20`
      );
      items = byId.results ?? [];
    }

    // 2ª tentativa: busca por nome+marca se nenhum resultado
    if (items.length === 0) {
      const byName = await mlGet(
        `/sites/MLB/search?q=${encSearch}&sort=price_asc&limit=20`
      );
      items = byName.results ?? [];
      // Filtra só resultados relevantes (contém a marca ou as 3 primeiras palavras do nome)
      const nameLow  = cleanName.toLowerCase().split(" ").slice(0, 3).join(" ");
      const brandLow = brand.toLowerCase();
      items = items.filter(it => {
        const t = it.title.toLowerCase();
        return t.includes(brandLow) || t.includes(nameLow);
      }).slice(0, 12);
    }

    // ── Monta lista de preços por loja/vendedor ────────────────────────
    const seenStores = new Set<string>();
    const seenPrices = new Set<number>();

    for (const item of items) {
      if (results.length >= 8) break;

      const nickname = item.seller?.nickname ?? "";
      const store    = resolveStore(nickname);
      const storeKey = store?.name ?? `ML:${nickname}`;

      // Evita duplicar mesma loja ou mesmo preço
      if (seenStores.has(storeKey)) continue;
      if (seenPrices.has(item.price)) continue;
      seenStores.add(storeKey);
      seenPrices.add(item.price);

      if (store) {
        // Vendedor é uma loja conhecida
        results.push({
          store:   store.name,
          price:   item.price,
          url:     item.permalink,
          inStock: (item.available_quantity ?? 0) > 0,
          logo:    store.logo,
          color:   store.color,
          type:    "real",
          freeShipping: item.shipping?.free_shipping ?? false,
        });
      } else {
        // Vendedor genérico do Mercado Livre
        const label = results.some(r => r.store === "Mercado Livre")
          ? `Mercado Livre (2ª opção)`
          : "Mercado Livre";
        if (results.some(r => r.store === label)) continue;
        results.push({
          store:   label,
          price:   item.price,
          url:     item.permalink,
          inStock: (item.available_quantity ?? 0) > 0,
          logo:    "ML",
          color:   "bg-yellow-400 text-gray-900",
          type:    "real",
          freeShipping: item.shipping?.free_shipping ?? false,
        });
      }
    }
  } catch {
    // fallback silencioso
  }

  // Se não achou nada, link de busca no ML
  if (results.length === 0) {
    results.push({
      store:   "Mercado Livre",
      price:   null,
      url:     mlId
        ? `https://www.mercadolivre.com.br/p/${mlId}`
        : `https://www.mercadolivre.com.br/search?q=${enc}`,
      inStock: true,
      logo:    "ML",
      color:   "bg-yellow-400 text-gray-900",
      type:    "search",
    });
  }

  // ── Lojas adicionais com link de busca (para complementar) ────────────
  const storesAlreadyShown = new Set(results.map(r => r.store));

  const extraStores: Omit<StorePriceResult, "price" | "inStock" | "type" | "freeShipping">[] = [
    { store: "Beleza na Web", url: `https://www.belezanaweb.com.br/search?q=${enc}`,             logo: "BW", color: "bg-pink-600 text-white"   },
    { store: "Sephora",       url: `https://www.sephora.com.br/search#q=${enc}&t=All`,            logo: "Se", color: "bg-black text-white"      },
    { store: "Amazon",        url: `https://www.amazon.com.br/s?k=${enc}&i=beauty`,               logo: "Am", color: "bg-orange-400 text-white" },
    { store: "Magazine Luiza",url: `https://www.magazineluiza.com.br/busca/${enc.replace(/%20/g,"+")}/`, logo: "MG", color: "bg-blue-600 text-white" },
    { store: "Americanas",    url: `https://www.americanas.com.br/busca/${enc}`,                   logo: "Am", color: "bg-red-600 text-white"    },
    { store: "Drogasil",      url: `https://www.drogasil.com.br/search?q=${enc}`,                 logo: "Dr", color: "bg-green-600 text-white"  },
    { store: "Ultrafarma",    url: `https://www.ultrafarma.com.br/busca?busca=${enc}`,            logo: "Uf", color: "bg-blue-500 text-white"   },
  ];

  // Lojas de marcas específicas
  const brandLow = brand.toLowerCase();
  if (brandLow.includes("boticári") || brandLow.includes("boticari"))
    extraStores.unshift({ store: "O Boticário", url: `https://www.boticario.com.br/busca#q=${enc}`, logo: "OB", color: "bg-purple-700 text-white" });
  if (brandLow.includes("natura"))
    extraStores.unshift({ store: "Natura", url: `https://www.natura.com.br/busca?q=${enc}`, logo: "Na", color: "bg-amber-600 text-white" });
  if (brandLow.includes("avon"))
    extraStores.unshift({ store: "Avon", url: `https://www.avon.com.br/busca?q=${enc}`, logo: "Av", color: "bg-pink-700 text-white" });

  for (const s of extraStores) {
    if (!storesAlreadyShown.has(s.store)) {
      results.push({ ...s, price: null, inStock: true, type: "search", freeShipping: false });
    }
  }

  return NextResponse.json({ results });
}
