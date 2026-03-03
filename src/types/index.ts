export type Category =
  // ── Maquiagem ──────────────────────────────────────────────────────────────
  | "Batom"
  | "Brilho Labial"
  | "Lápis Labial"
  | "Base"
  | "Corretivo"
  | "Pó Facial"
  | "Primer"
  | "Fixador de Maquiagem"
  | "Máscara de Cílios"
  | "Sombra"
  | "Delineador"
  | "Blush"
  | "Iluminador"
  | "Contorno/Bronzer"
  | "Esponjas e Pincéis"
  // ── Skincare ───────────────────────────────────────────────────────────────
  | "Sérum"
  | "Hidratante"
  | "Protetor Solar"
  | "Tônico Facial"
  | "Limpeza Facial"
  | "Máscara Facial"
  | "Esfoliante"
  | "Creme para Olhos"
  // ── Perfumes ───────────────────────────────────────────────────────────────
  | "Perfume"
  | "Perfume Homem"
  // ── Cabelo ─────────────────────────────────────────────────────────────────
  | "Shampoo"
  | "Cabelo Homem"
  | "Condicionador"
  | "Máscara Capilar"
  | "Leave-in"
  | "Óleo Capilar"
  | "Tintura"
  | "Finalizador";

export type CategoryGroup = "Maquiagem" | "Skincare" | "Perfumes" | "Cabelo";

export const CATEGORY_GROUPS: Record<Category, CategoryGroup> = {
  // Maquiagem
  Batom: "Maquiagem",
  "Brilho Labial": "Maquiagem",
  "Lápis Labial": "Maquiagem",
  Base: "Maquiagem",
  Corretivo: "Maquiagem",
  "Pó Facial": "Maquiagem",
  Primer: "Maquiagem",
  "Fixador de Maquiagem": "Maquiagem",
  "Máscara de Cílios": "Maquiagem",
  Sombra: "Maquiagem",
  Delineador: "Maquiagem",
  Blush: "Maquiagem",
  Iluminador: "Maquiagem",
  "Contorno/Bronzer": "Maquiagem",
  "Esponjas e Pincéis": "Maquiagem",
  // Skincare
  Sérum: "Skincare",
  Hidratante: "Skincare",
  "Protetor Solar": "Skincare",
  "Tônico Facial": "Skincare",
  "Limpeza Facial": "Skincare",
  "Máscara Facial": "Skincare",
  Esfoliante: "Skincare",
  "Creme para Olhos": "Skincare",
  // Perfumes
  Perfume: "Perfumes",
  "Perfume Homem": "Perfumes",
  // Cabelo
  Shampoo: "Cabelo",
  "Cabelo Homem": "Cabelo",
  Condicionador: "Cabelo",
  "Máscara Capilar": "Cabelo",
  "Leave-in": "Cabelo",
  "Óleo Capilar": "Cabelo",
  Tintura: "Cabelo",
  Finalizador: "Cabelo",
};

export const GROUP_CATEGORIES: Record<CategoryGroup, Category[]> = {
  Maquiagem: [
    "Batom", "Brilho Labial", "Lápis Labial",
    "Base", "Corretivo", "Pó Facial",
    "Primer", "Fixador de Maquiagem",
    "Máscara de Cílios", "Sombra", "Delineador",
    "Blush", "Iluminador", "Contorno/Bronzer",
    "Esponjas e Pincéis",
  ],
  Skincare: [
    "Sérum", "Hidratante", "Protetor Solar",
    "Tônico Facial", "Limpeza Facial", "Máscara Facial",
    "Esfoliante", "Creme para Olhos",
  ],
  Perfumes: ["Perfume", "Perfume Homem"],
  Cabelo: ["Shampoo", "Condicionador", "Máscara Capilar", "Leave-in", "Óleo Capilar", "Tintura", "Finalizador", "Cabelo Homem"],
};

/** Nome exibido da categoria (ex.: "Cabelo Homem" e "Perfume Homem" aparecem como "Homem") */
export function getCategoryDisplayName(category: Category): string {
  if (category === "Cabelo Homem" || category === "Perfume Homem") return "Homem";
  return category;
}

export interface ColorVariant {
  name: string;
  image?: string;
}

export interface PriceEntry {
  store: string;
  price: number;
  url: string;
  logo: string;
  inStock: boolean;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: Category;
  description: string;
  image: string;
  images: string[];
  averageRating: number;
  reviewCount: number;
  prices: PriceEntry[];
  tags: string[];
  colors?: ColorVariant[];  // variantes de cor com imagem própria
  availableShades?: string[];
  availableSizes?: string[];
}

export interface FavoriteList {
  id: string;
  name: string;
  productIds: string[];
  createdAt: string;
  isDefault?: boolean;
}

export interface Review {
  id: string;
  productId: string;
  userId: string | null;
  username: string;
  avatar?: string;
  isAnonymous: boolean;
  rating: number;
  text: string;
  specification?: string;
  photos?: string[];
  videos?: string[];
  worthIt: boolean | null;
  wouldBuyAgain: boolean | null;
  packagingScore: number;
  createdAt: string;
  helpful: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  favoriteLists: FavoriteList[];
  reviewCount: number;
  joinedAt: string;
}
