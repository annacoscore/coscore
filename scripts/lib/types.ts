// ─── Mercado Livre API ────────────────────────────────────────────────────────

export interface MLAttribute {
  id: string;
  name: string;
  value_name: string | null;
  values: { id?: string; name: string | null }[];
}

// Endpoint: GET /products/search?site_id=MLB&q=KEYWORD
export interface MLCatalogSearchResponse {
  keywords: string;
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
  results: MLCatalogProduct[];
}

export interface MLCatalogProduct {
  id: string;
  catalog_product_id: string;
  parent_id?: string;          // ID do produto-pai — todos os filhos com o mesmo parent_id são variantes de cor
  domain_id: string;
  name: string;
  status: string;
  attributes: MLAttribute[];
  pictures: {
    id: string;
    url: string;
    max_width?: string;
    max_height?: string;
  }[];
  short_description?: {
    type: string;
    content: string;
  };
  date_created: string;
  last_updated: string;
}

// Tipos legados (mantidos para compatibilidade com possíveis importações)
export interface MLSearchResponse {
  paging: { total: number; offset: number; limit: number };
  results: MLSearchItem[];
}
export interface MLSearchItem {
  id: string;
  title: string;
  thumbnail: string;
  price: number;
  permalink: string;
  condition: string;
  category_id: string;
  attributes?: MLAttribute[];
}
export interface MLItemDetail {
  id: string;
  title: string;
  thumbnail: string;
  pictures: { url: string; secure_url: string }[];
  price: number;
  permalink: string;
  category_id: string;
  attributes: MLAttribute[];
}
export interface MLDescription {
  plain_text: string;
}

// ─── Catálogo interno (catalog.json) ─────────────────────────────────────────

export interface CatalogPrice {
  store: string;
  price: number;
  url: string;
  logo: string;
  inStock: boolean;
}

export interface ColorVariant {
  name: string;   // nome da cor/tom
  image?: string; // URL da imagem específica daquele tom
}

export interface CatalogEntry {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  image: string;
  images: string[];
  ean?: string;
  mlIds: string[];
  mlParentId?: string;     // parent_id do ML — agrupa variantes de cor do mesmo produto
  colors: ColorVariant[];  // variantes de cor com imagem própria
  averageRating: number;
  reviewCount: number;
  prices: CatalogPrice[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogFile {
  version: number;
  lastSync: string;
  totalProducts: number;
  products: CatalogEntry[];
}
