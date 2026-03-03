import { NextRequest, NextResponse } from "next/server";

const ML_TOKEN = process.env.ML_ACCESS_TOKEN ?? "";
const ML_BASE  = "https://api.mercadolibre.com";

async function mlGet(path: string) {
  const res = await fetch(`${ML_BASE}${path}`, {
    headers: { Authorization: `Bearer ${ML_TOKEN}` },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 1800 }, // cache 30 min
  });
  return res.json();
}

export interface StorePriceResult {
  store:   string;
  price:   number | null;    // null = sem preço aferido (link de busca)
  url:     string;
  inStock: boolean;
  logo:    string;           // emoji ou iniciais
  color:   string;           // classe tailwind
  type:    "real" | "search";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mlId       = searchParams.get("mlId") ?? "";
  const name       = searchParams.get("name") ?? "";
  const brand      = searchParams.get("brand") ?? "";
  const color      = searchParams.get("color") ?? "";

  // Termo para links de busca nas lojas
  const searchTerm = color ? `${name} ${color}` : name;
  const enc        = encodeURIComponent(searchTerm);

  const results: StorePriceResult[] = [];

  // ── 1. Mercado Livre — preço real via API ─────────────────────────────
  if (mlId && ML_TOKEN) {
    try {
      // Busca o listing mais barato para este produto catálogo
      const data = await mlGet(
        `/sites/MLB/search?catalog_product_id=${mlId}&sort=price_asc&limit=3`
      );

      const items: {
        id: string;
        title: string;
        price: number;
        available_quantity: number;
        permalink: string;
        seller?: { nickname?: string };
      }[] = data.results ?? [];

      if (items.length > 0) {
        const best = items[0];
        results.push({
          store:   "Mercado Livre",
          price:   best.price,
          url:     best.permalink,
          inStock: (best.available_quantity ?? 0) > 0,
          logo:    "ML",
          color:   "bg-yellow-400 text-gray-900",
          type:    "real",
        });
        // Se tiver segundo preço diferente, mostra também
        if (items[1] && items[1].price !== best.price) {
          results.push({
            store:   `Mercado Livre (2ª opção)`,
            price:   items[1].price,
            url:     items[1].permalink,
            inStock: (items[1].available_quantity ?? 0) > 0,
            logo:    "ML",
            color:   "bg-yellow-300 text-gray-900",
            type:    "real",
          });
        }
      } else {
        // Fallback: link de busca no ML
        results.push({
          store:   "Mercado Livre",
          price:   null,
          url:     `https://www.mercadolivre.com.br/p/${mlId}`,
          inStock: true,
          logo:    "ML",
          color:   "bg-yellow-400 text-gray-900",
          type:    "search",
        });
      }
    } catch {
      results.push({
        store:   "Mercado Livre",
        price:   null,
        url:     `https://www.mercadolivre.com.br/search?q=${enc}`,
        inStock: true,
        logo:    "ML",
        color:   "bg-yellow-400 text-gray-900",
        type:    "search",
      });
    }
  } else {
    results.push({
      store:   "Mercado Livre",
      price:   null,
      url:     `https://www.mercadolivre.com.br/search?q=${enc}`,
      inStock: true,
      logo:    "ML",
      color:   "bg-yellow-400 text-gray-900",
      type:    "search",
    });
  }

  // ── 2. Lojas com links de busca ──────────────────────────────────────
  const searchStores: Omit<StorePriceResult, "price" | "inStock" | "type">[] = [
    {
      store: "Beleza na Web",
      url:   `https://www.belezanaweb.com.br/search?q=${enc}`,
      logo:  "BW",
      color: "bg-pink-600 text-white",
    },
    {
      store: "Sephora",
      url:   `https://www.sephora.com.br/search#q=${enc}&t=All`,
      logo:  "Se",
      color: "bg-black text-white",
    },
    {
      store: "Amazon",
      url:   `https://www.amazon.com.br/s?k=${enc}&i=beauty`,
      logo:  "Am",
      color: "bg-orange-400 text-white",
    },
    {
      store: "Magazine Luiza",
      url:   `https://www.magazineluiza.com.br/busca/${enc.replace(/%20/g, "+")}/`,
      logo:  "ML",
      color: "bg-blue-600 text-white",
    },
    {
      store: "Americanas",
      url:   `https://www.americanas.com.br/busca/${enc}`,
      logo:  "Am",
      color: "bg-red-600 text-white",
    },
    {
      store: "Drogasil",
      url:   `https://www.drogasil.com.br/search?q=${enc}`,
      logo:  "Dr",
      color: "bg-green-600 text-white",
    },
    {
      store: "Ultrafarma",
      url:   `https://www.ultrafarma.com.br/busca?busca=${enc}`,
      logo:  "Uf",
      color: "bg-blue-500 text-white",
    },
  ];

  // Lojas de marcas específicas
  const brandLower = brand.toLowerCase();
  if (brandLower.includes("boticário") || brandLower.includes("boticario")) {
    searchStores.unshift({
      store: "O Boticário",
      url:   `https://www.boticario.com.br/busca#q=${enc}`,
      logo:  "OB",
      color: "bg-purple-600 text-white",
    });
  }
  if (brandLower.includes("natura")) {
    searchStores.unshift({
      store: "Natura",
      url:   `https://www.natura.com.br/busca?q=${enc}`,
      logo:  "Na",
      color: "bg-amber-600 text-white",
    });
  }
  if (brandLower.includes("avon")) {
    searchStores.unshift({
      store: "Avon",
      url:   `https://www.avon.com.br/busca?q=${enc}`,
      logo:  "Av",
      color: "bg-pink-700 text-white",
    });
  }

  for (const s of searchStores) {
    results.push({ ...s, price: null, inStock: true, type: "search" });
  }

  return NextResponse.json({ results });
}
