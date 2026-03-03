import { NextRequest, NextResponse } from "next/server";
import { Category } from "@/types";

const ML_TOKEN = process.env.ML_ACCESS_TOKEN ?? "";
const ML_BASE = "https://api.mercadolibre.com";

// ─── Palavras que identificam cosméticos ─────────────────────────────────────
const COSMETIC_WORDS = [
  "batom", "gloss", "base", "rímel", "máscara de cílios", "mascara", "sombra",
  "blush", "iluminador", "primer", "contorno", "bronzer", "pó", "corretivo",
  "delineador", "lápis", "sérum", "serum", "hidratante", "moisturizer",
  "protetor solar", "sunscreen", "perfume", "colônia", "shampoo", "condicionador",
  "máscara capilar", "leave-in", "óleo capilar", "tônico", "essence", "toner",
  "esfoliante", "creme", "loção", "spray fixador", "fixador", "pincel", "esponja",
  "maquiagem", "makeup", "cosmético", "skincare", "beauty", "lip", "eye", "face",
  "foundation", "concealer", "eyeshadow", "mascara", "eyeliner", "highlighter",
  "contour", "setting powder", "translucido", "translúcido", "banana powder",
  "pó solto", "pó compacto", "bb cream", "cc cream", "tint", "glitter",
];

// ─── Palavras que NÃO são cosméticos ─────────────────────────────────────────
const NON_COSMETIC_WORDS = [
  "calculadora", "celular", "smartphone", "notebook", "tablet", "televisão", "tv",
  "geladeira", "fogão", "microondas", "aspirador", "ventilador", "ar condicionado",
  "carro", "moto", "bicicleta", "jogo", "videogame", "livro", "roupa", "sapato",
  "tênis", "bolsa carteira", "ferramenta", "parafuso", "cabo usb", "mouse",
  "teclado", "headphone", "câmera", "impressora", "filtro de água",
];

// ─── Mapeamento de categoria ML → CoScore ────────────────────────────────────
function inferCategory(name: string): Category {
  const n = name.toLowerCase();
  if (n.includes("batom") || n.includes("lip color") || n.includes("lipstick")) return "Batom";
  if (n.includes("gloss") || n.includes("brilho labial")) return "Gloss";
  if (n.includes("base") && (n.includes("maquiagem") || n.includes("facial") || n.includes("foundation"))) return "Base";
  if (n.includes("máscara de cílios") || n.includes("mascara") || n.includes("rímel") || n.includes("rimel")) return "Máscara de Cílios";
  if (n.includes("sombra") || n.includes("eyeshadow")) return "Sombra";
  if (n.includes("blush") || n.includes("ruge")) return "Blush";
  if (n.includes("iluminador") || n.includes("highlighter") || n.includes("glow")) return "Iluminador";
  if (n.includes("contorno") || n.includes("bronzer") || n.includes("bronze")) return "Contorno/Bronzer";
  if (n.includes("primer")) return "Primer";
  if (n.includes("pó") || n.includes("powder") || n.includes("translucido") || n.includes("translúcido")) return "Pó Facial";
  if (n.includes("corretivo") || n.includes("concealer")) return "Corretivo";
  if (n.includes("delineador") || n.includes("eyeliner")) return "Delineador";
  if (n.includes("lápis labial") || n.includes("lápis de boca")) return "Lápis Labial";
  if (n.includes("sérum") || n.includes("serum")) return "Sérum";
  if (n.includes("hidratante") || n.includes("moisturizer")) return "Hidratante";
  if (n.includes("protetor solar") || n.includes("sunscreen") || n.includes("fps")) return "Protetor Solar";
  if (n.includes("tônico") || n.includes("toner") || n.includes("essence")) return "Tônico Facial";
  if (n.includes("esfoliante") || n.includes("scrub")) return "Esfoliante";
  if (n.includes("perfume") || n.includes("colônia") || n.includes("eau de")) return "Perfume";
  if (n.includes("shampoo") || n.includes("xampu")) return "Shampoo";
  if (n.includes("condicionador") || n.includes("conditioner")) return "Condicionador";
  if (n.includes("máscara capilar") || n.includes("hair mask")) return "Máscara Capilar";
  if (n.includes("leave-in") || n.includes("leave in")) return "Leave-in";
  if (n.includes("óleo capilar") || n.includes("hair oil")) return "Óleo Capilar";
  if (n.includes("esponja") || n.includes("pincel") || n.includes("brush") || n.includes("sponge")) return "Esponjas e Pincéis";
  if (n.includes("fixador") || n.includes("setting spray")) return "Fixador de Maquiagem";
  return "Maquiagem" as Category;
}

function isCosmetic(name: string): boolean {
  const lower = name.toLowerCase();
  if (NON_COSMETIC_WORDS.some(w => lower.includes(w))) return false;
  return COSMETIC_WORDS.some(w => lower.includes(w));
}

function extractAttr(attributes: { id: string; value_name?: string }[], id: string): string {
  return attributes?.find(a => a.id === id)?.value_name ?? "";
}

function extractMlId(url: string): string | null {
  // mercadolivre.com.br/.../p/MLB123456  (catalog)
  const catalogMatch = url.match(/\/p\/(MLB\d+)/i);
  if (catalogMatch) return catalogMatch[1];
  // mercadolivre.com.br/.../{MLB123456789}  (listing)
  const listingMatch = url.match(/(MLB\d+)/i);
  if (listingMatch) return listingMatch[1];
  return null;
}

async function mlFetch(path: string) {
  const res = await fetch(`${ML_BASE}${path}`, {
    headers: { Authorization: `Bearer ${ML_TOKEN}` },
    signal: AbortSignal.timeout(12000),
  });
  return res.json();
}

interface MLProduct {
  id: string;
  name: string;
  pictures?: { url?: string; secure_url?: string }[];
  attributes?: { id: string; value_name?: string }[];
  short_description?: { content: string };
  buy_box_winner?: { item_id?: string };
}

async function fetchByMlId(mlId: string): Promise<MLProduct | null> {
  // Tenta como produto do catálogo
  const prod = await mlFetch(`/products/${mlId}`);
  if (!prod.error) return prod;
  // Tenta como listing
  const item = await mlFetch(`/items/${mlId}`);
  if (!item.error) return { ...item, pictures: item.pictures?.map((p: { url?: string; secure_url?: string }) => ({ url: p.url })) };
  return null;
}

async function searchByName(name: string): Promise<MLProduct | null> {
  const data = await mlFetch(`/products/search?site_id=MLB&q=${encodeURIComponent(name)}&limit=5`);
  if (!data.results?.length) return null;
  // Pega o primeiro resultado que tenha imagem
  for (const r of data.results) {
    const detail = await mlFetch(`/products/${r.id}`);
    if (!detail.error && detail.pictures?.length > 0) return detail;
  }
  return data.results[0];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, url } = body as { name: string; url?: string };

    if (!name?.trim()) {
      return NextResponse.json({ ok: false, error: "Nome do produto é obrigatório." });
    }

    if (!ML_TOKEN) {
      return NextResponse.json({ ok: false, error: "Token do Mercado Livre não configurado." });
    }

    let mlData: MLProduct | null = null;

    // 1. Se for URL do ML, extrair o ID e buscar direto
    if (url?.trim()) {
      const mlId = extractMlId(url);
      if (mlId) {
        mlData = await fetchByMlId(mlId);
      }
    }

    // 2. Se não encontrou pelo URL, buscar pelo nome
    if (!mlData) {
      mlData = await searchByName(name);
    }

    if (!mlData) {
      return NextResponse.json({
        ok: false,
        error: "Produto não encontrado no Mercado Livre. Tente com o nome mais específico ou cole o link do produto.",
      });
    }

    const productName = (mlData.name || name).trim();

    // 3. Verificar se é cosmético
    if (!isCosmetic(productName)) {
      return NextResponse.json({
        ok: false,
        error: "Este produto não parece ser um cosmético. O CoScore é especializado em beleza e cuidados pessoais.",
        notCosmetic: true,
      });
    }

    // 4. Extrair dados
    const images = (mlData.pictures ?? [])
      .map((p) => p.url ?? p.secure_url ?? "")
      .filter(Boolean);

    const brand = extractAttr(mlData.attributes ?? [], "BRAND") || productName.split(" ")[0];
    const colorRaw = extractAttr(mlData.attributes ?? [], "COLOR");
    const category = inferCategory(productName);
    const description = mlData.short_description?.content || productName;

    const colors =
      colorRaw && !["sem cor", "única", "unica", "outro", "multicolor"].includes(colorRaw.toLowerCase())
        ? [{ name: colorRaw, image: images[0] ?? "" }]
        : [];

    const product = {
      id: `usr_${mlData.id ?? Date.now()}`,
      name: productName,
      brand,
      category,
      description,
      image: images[0] ?? "",
      images: images.slice(0, 6),
      colors,
      averageRating: 0,
      reviewCount: 0,
      prices: url?.trim() ? [{ store: "Mercado Livre", price: 0, url: url.trim(), inStock: true }] : [],
      tags: [brand.toLowerCase(), category.toLowerCase()],
      mlId: mlData.id,
      isUserSubmitted: true,
    };

    return NextResponse.json({ ok: true, product });
  } catch (err) {
    console.error("[create-product]", err);
    return NextResponse.json({ ok: false, error: "Erro ao consultar o catálogo. Tente novamente." });
  }
}
