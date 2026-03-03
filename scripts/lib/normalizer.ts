// ─── Marcas conhecidas no Brasil ─────────────────────────────────────────────
// Ordenadas do mais longo para o mais curto para match guloso no início do título

const KNOWN_BRANDS = [
  "l'oréal paris", "l'oreal paris", "loreal paris",
  "l'oréal", "l'oreal", "loreal",
  "maybelline new york", "maybelline",
  "nyx professional makeup", "nyx",
  "mac cosmetics", "mac",
  "bobbi brown",
  "charlotte tilbury",
  "fenty beauty",
  "huda beauty",
  "too faced",
  "urban decay",
  "nars cosmetics", "nars",
  "giorgio armani beauty", "giorgio armani",
  "dior beauty", "dior",
  "lancôme", "lancome",
  "estée lauder", "estee lauder",
  "clinique",
  "shiseido",
  "la roche-posay", "la roche posay",
  "vichy",
  "neutrogena",
  "nivea",
  "avon",
  "natura",
  "o boticário", "o boticario",
  "quem disse berenice",
  "ruby rose",
  "vult cosmetics", "vult",
  "océane", "oceane",
  "dailus",
  "payot",
  "granado",
  "contém 1g", "contem 1g",
  "boca rosa beauty", "boca rosa",
  "bruna tavares",
  "mari maria makeup", "mari maria",
  "yes! cosmetics", "yes cosmetics",
  "eudora",
  "jequiti",
  "belle angel",
  "ludurana",
  "hits speciallita", "hits",
  "koloss",
  "tracta",
  "essence cosmetics", "essence",
  "catrice cosmetics", "catrice",
  "revlon",
  "rimmel london", "rimmel",
  "max factor",
  "covergirl", "cover girl",
  "milani cosmetics", "milani",
  "wet n wild", "wet 'n wild",
  "e.l.f. cosmetics", "e.l.f.", "elf cosmetics",
  "makeup revolution",
  "kiko milano", "kiko",
  "barry m",
];

// ─── Padrões de remoção ───────────────────────────────────────────────────────

// Cores e tons (PT + EN) — executados contra o título normalizado
const COLOR_PATTERNS: RegExp[] = [
  // "cor 01", "tom 220", "shade nude", "color beige", "colour 12"
  /\b(?:cor|tom|shade|color|colour|tono)\s*[:\-#]?\s*[\w\u00C0-\u017E\s]{1,30}/gi,
  // "N° 01", "Nº 220", "nr. 12", "num. 5"
  /\b(?:n[°ºo]|nr\.?|num\.?)\s*\d+[a-z]{0,3}\b/gi,
  // Códigos como "220W", "30N", "01C" (2-3 dígitos + letra opcional)
  /\b\d{2,3}[a-z]{0,2}\b/gi,
  // Hex colors
  /#[a-f0-9]{3,6}\b/gi,
  // Nomes de cor em PT/EN (exclui palavras de acabamento como matte/shimmer que identificam o produto)
  /\b(?:vermelho|vermelha|rosa|rosado|rosada|nude|bege|creme|marrom|caf[eé]|caramelo|dourado|prateado|bronze|coral|salm[aã]o|vinhoso|bord[oô]|ameixa|vinho|roxo|lil[aá]s|violeta|azul|verde|amarelo|laranja|preto|branca|branco|cinza|cobre|terracota|p[eê]ssego|neutro|natural|warm|cool|fair|light|medium|dark|deep|rich|clear|ivory|sand|golden|silver|rose|pink|red|burgundy|plum|berry|mauve|taupe|brown|beige|cafe|suede|velvet)\b/gi,
];

// Tamanhos e quantidades
const SIZE_PATTERNS: RegExp[] = [
  /\b\d+(?:[.,]\d+)?\s*(?:ml|g|gr|mg|kg|l\b|oz|fl\.?\s*oz|m[lL])\b/gi,
  /\btravel\s*size\b/gi,
  /\bkit\s+(?:com\s+)?\d+\b/gi,
  /\b\d+\s*(?:em\s*1|em1|in\s*1|in1)\b/gi,
  /\b\d+\s*pe[çc]as?\b/gi,
  /\bpack\s+(?:de\s+)?\d+\b/gi,
  /\bcombo\s+(?:com\s+)?\d+\b/gi,
];

// Palavras de marketing/variação que não identificam o produto
const JUNK_PATTERNS: RegExp[] = [
  /\b(?:novo|nova|original|oficial|lan[çc]amento|edi[çc][aã]o\s+limitada|limited\s+edition|promo[çc][aã]o|oferta|liquida[çc][aã]o)\b/gi,
  /\b(?:gr[aá]tis|brinde|frete\s+gr[aá]tis|super|ultra|mega|maxi|mini|plus|max)\b/gi,
  // Remove parênteses, colchetes e conteúdo dentro deles
  /\([^)]{0,40}\)/g,
  /\[[^\]]{0,40}\]/g,
  // Pontuação isolada
  /[''"""*|\\]/g,
];

// ─── Funções públicas ─────────────────────────────────────────────────────────

export function removeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C');
}

/**
 * Remove indicações de cor, tamanho e jargões de variação do nome do produto.
 * O resultado mantém capitalização original mas com conteúdo de variação removido.
 */
export function cleanProductName(rawName: string): string {
  let name = rawName;

  for (const pattern of COLOR_PATTERNS) {
    name = name.replace(pattern, ' ');
  }
  for (const pattern of SIZE_PATTERNS) {
    name = name.replace(pattern, ' ');
  }
  for (const pattern of JUNK_PATTERNS) {
    name = name.replace(pattern, ' ');
  }

  return name.trim().replace(/\s{2,}/g, ' ');
}

/**
 * Gera a chave usada para deduplicação por nome normalizado + marca.
 * Insensível a acentos, maiúsculas e pontuação.
 */
export function generateDedupeKey(cleanedName: string, brand: string): string {
  const normName = removeAccents(cleanedName.toLowerCase())
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const normBrand = removeAccents(brand.toLowerCase())
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${normBrand}::${normName}`;
}

/**
 * Tenta extrair a marca do início do título usando lista de marcas conhecidas.
 * Fallback: primeira palavra do título.
 */
export function extractBrandFromTitle(title: string): string {
  const lowerTitle = removeAccents(title.toLowerCase());

  for (const brand of KNOWN_BRANDS) {
    const normalizedBrand = removeAccents(brand);
    if (lowerTitle.startsWith(normalizedBrand)) {
      return title.substring(0, brand.length).trim();
    }
  }

  // Fallback: primeira palavra
  return title.split(' ')[0];
}

/**
 * Retorna o nome limpo para exibição: sem marca no início, sem variações,
 * com Title Case aplicado.
 */
export function buildDisplayName(rawName: string, brand: string): string {
  let name = cleanProductName(rawName);

  // Remove a marca do início se presente
  const normBrand = removeAccents(brand.toLowerCase());
  const normName = removeAccents(name.toLowerCase());
  if (normName.startsWith(normBrand)) {
    name = name.substring(brand.length).trim();
  }

  // Remove hífen ou traço inicial restante
  name = name.replace(/^[-–—\s]+/, '').trim();

  // Title Case
  return name
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
