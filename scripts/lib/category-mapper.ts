import type { Category } from '../../src/types/index';

// domain_id do endpoint /products/search → categoria CoScore
const ML_DOMAIN_MAP: Record<string, Category> = {
  // Lábios
  'MLB-LIPSTICKS':            'Batom',
  'MLB-LIP_TINTS':            'Batom',
  'MLB-LIP_GLOSSES':          'Gloss',
  'MLB-LIP_LINERS':           'Lápis Labial',
  'MLB-LIP_BALMS':            'Gloss',
  // Rosto
  'MLB-FOUNDATIONS':          'Base',
  'MLB-BB_CREAMS':            'Base',
  'MLB-CC_CREAMS':            'Base',
  'MLB-CONCEALERS':           'Corretivo',
  'MLB-SETTING_POWDERS':      'Pó Facial',
  'MLB-FACE_POWDERS':         'Pó Facial',
  'MLB-PRIMERS':              'Primer',
  'MLB-SETTING_SPRAYS':       'Fixador de Maquiagem',
  'MLB-BLUSHES':              'Blush',
  'MLB-HIGHLIGHTERS':         'Iluminador',
  'MLB-BRONZERS':             'Contorno/Bronzer',
  'MLB-CONTOUR':              'Contorno/Bronzer',
  // Olhos
  'MLB-EYE_SHADOWS':          'Sombra',
  'MLB-EYE_PALETTES':         'Sombra',
  'MLB-MASCARAS':             'Máscara de Cílios',
  'MLB-EYELINERS':            'Delineador',
  'MLB-EYE_LINERS':           'Delineador',
  'MLB-EYEBROW_PENCILS':      'Delineador',
  // Skincare
  'MLB-FACE_SERUMS':          'Sérum',
  'MLB-SERUMS':               'Sérum',
  'MLB-FACE_MOISTURIZERS':    'Hidratante',
  'MLB-BODY_MOISTURIZERS':    'Hidratante',
  'MLB-FACE_SUNSCREENS':      'Protetor Solar',
  'MLB-SUNSCREENS':           'Protetor Solar',
  'MLB-FACIAL_CLEANSERS':     'Limpeza Facial',
  'MLB-FACE_TONERS':          'Tônico Facial',
  'MLB-FACE_MASKS':           'Máscara Facial',
  'MLB-EYE_CREAMS':           'Creme para Olhos',
  'MLB-EXFOLIANTS':           'Esfoliante',
  // Cabelo
  'MLB-SHAMPOOS':             'Shampoo',
  'MLB-CONDITIONERS':         'Condicionador',
  'MLB-HAIR_MASKS':           'Máscara Capilar',
  'MLB-HAIR_OILS':            'Óleo Capilar',
  'MLB-HAIR_LEAVE_INS':       'Leave-in',
  'MLB-HAIR_FINISHING':       'Finalizador',
  'MLB-HAIR_GELS':            'Finalizador',
  'MLB-HAIR_DYES':            'Tintura',
  // Perfumes
  'MLB-PERFUMES':             'Perfume',
  'MLB-EAU_DE_PARFUM':        'Perfume',
  'MLB-EAU_DE_TOILETTE':      'Perfume',
  'MLB-BODY_MISTS':           'Perfume',
  'MLB-COLOGNES':             'Perfume',
};

// IDs de subcategorias do ML (legado) — mantidos para compatibilidade
const ML_SUBCATEGORY_MAP: Record<string, Category> = {
  MLB5767: 'Batom',
  MLB5766: 'Base',
  MLB5769: 'Sombra',
  MLB5770: 'Máscara de Cílios',
  MLB5768: 'Blush',
  MLB1275: 'Perfume',
  MLB1273: 'Perfume',
  MLB3368: 'Shampoo',
  MLB3370: 'Condicionador',
  MLB3371: 'Máscara Capilar',
  MLB3374: 'Finalizador',
};

// Regras por palavras-chave — ordem importa: mais específico primeiro
interface KeywordRule {
  keywords: string[];
  category: Category;
}

const KEYWORD_RULES: KeywordRule[] = [
  // ── Protetor (antes de qualquer outra regra para evitar conflito com fps) ──
  {
    keywords: ['protetor solar', 'filtro solar', 'fps ', ' fps', 'spf ', ' spf', 'sunscreen', 'fotoprotetor', 'proteção solar'],
    category: 'Protetor Solar',
  },
  // ── Fixador (antes de primer para evitar conflito) ─────────────────────────
  {
    keywords: ['fixador de maquiagem', 'spray fixador', 'setting spray', 'fixing spray', 'fixador spray', 'neblina fixadora'],
    category: 'Fixador de Maquiagem',
  },
  // ── Primer ─────────────────────────────────────────────────────────────────
  {
    keywords: ['primer', 'pre-base', 'pré-base', 'pre base', 'pré base', 'prebase'],
    category: 'Primer',
  },
  // ── Sérum ──────────────────────────────────────────────────────────────────
  {
    keywords: ['serum', 'sérum', 'booster facial', 'vitamina c facial', 'retinol', 'acido hialuronico', 'ácido hialurônico', 'niacinamida'],
    category: 'Sérum',
  },
  // ── Corretivo (antes de Base) ──────────────────────────────────────────────
  {
    keywords: ['corretivo', 'corretor', 'concealer', 'anti olheira', 'cobertura olheira'],
    category: 'Corretivo',
  },
  // ── Esponjas e Pincéis (ANTES de Pó Facial para não capturar "pincel de pó") ─
  {
    keywords: [
      'esponja maquiagem', 'esponja para base', 'esponja para po', 'esponja para pó',
      'beauty blender', 'beautyblender',
      'pincel maquiagem', 'pincel para po', 'pincel para pó', 'pincel de po', 'pincel de pó',
      'escova de po', 'escova de pó', 'escova facial', 'escova de maquiagem',
      'kit esponjas', 'kit pinceis', 'kit pincel', 'kit de pinceis', 'kit de pincel',
      'esponja aplicador', 'puff de po', 'puff de pó', 'almofada de po', 'almofada de pó',
      'kabuki brush', 'kabuki',
      'brush set', 'makeup brush', 'contour brush', 'blush brush', 'powder brush',
    ],
    category: 'Esponjas e Pincéis',
  },
  // ── Pó Facial (antes de Base) ─────────────────────────────────────────────
  {
    keywords: [
      'po compacto', 'pó compacto', 'po facial', 'pó facial', 'po translucido', 'pó translúcido',
      'po solto', 'pó solto', 'setting powder', 'loose powder', 'pressed powder', 'po fixador',
      'pó matificante', 'po matificante', 'pó banana', 'po banana', 'pó mineral', 'po mineral',
      'pó hd', 'po HD', 'face powder', 'pó de arroz', 'po de arroz',
    ],
    category: 'Pó Facial',
  },
  // ── Base ───────────────────────────────────────────────────────────────────
  {
    keywords: ['base liquida', 'base líquida', 'base compacta', 'base em po', 'base em pó', 'foundation', 'base matte', 'base cobertura', 'bb cream', 'cc cream'],
    category: 'Base',
  },
  // ── Lábios ─────────────────────────────────────────────────────────────────
  {
    keywords: ['lip liner', 'lipliner', 'lapis labial', 'lápis labial', 'delineador labial', 'contorno labial'],
    category: 'Lápis Labial',
  },
  {
    keywords: ['lip gloss', 'lipgloss', 'gloss labial', 'brilho labial', 'lip balm', 'batom gloss', 'labial gloss'],
    category: 'Gloss',
  },
  {
    keywords: ['batom', 'baton', 'lip color', 'lipcolor', 'lipstick', 'lip stick', 'labial', 'lip tint'],
    category: 'Batom',
  },
  // ── Olhos ──────────────────────────────────────────────────────────────────
  {
    keywords: ['Máscara de Cílios', 'mascara de cilios', 'mascara para cilios', 'mascara cilios', 'mascara de cílios', 'mascara para cílios'],
    category: 'Máscara de Cílios',
  },
  {
    keywords: ['delineador', 'eyeliner', 'eye liner', 'delineador olhos', 'lapis olhos', 'lápis olhos', 'kajal', 'kohl'],
    category: 'Delineador',
  },
  {
    keywords: ['sombra', 'paleta de sombra', 'paleta sombra', 'eyeshadow', 'eye shadow', 'trio de sombra'],
    category: 'Sombra',
  },
  // ── Rosto ──────────────────────────────────────────────────────────────────
  {
    keywords: ['blush', 'corar', 'blush compacto', 'blush em po', 'blush em pó'],
    category: 'Blush',
  },
  {
    keywords: ['iluminador', 'highlighter', 'po iluminador', 'pó iluminador', 'strobing'],
    category: 'Iluminador',
  },
  {
    keywords: ['contorno', 'contour', 'bronzer'],
    category: 'Contorno/Bronzer',
  },
  // ── Skincare ───────────────────────────────────────────────────────────────
  {
    keywords: ['tônico facial', 'tonico facial', 'toner facial', 'agua micelar'],
    category: 'Tônico Facial',
  },
  {
    keywords: ['limpeza facial', 'gel de limpeza', 'sabonete facial', 'espuma de limpeza', 'foam cleanser', 'facial cleanser'],
    category: 'Limpeza Facial',
  },
  {
    keywords: ['mascara facial', 'máscara facial', 'mascara de argila', 'argila facial', 'sheet mask'],
    category: 'Máscara Facial',
  },
  {
    keywords: ['esfoliante', 'esfoliante facial', 'scrub facial', 'peeling facial'],
    category: 'Esfoliante',
  },
  {
    keywords: ['creme para olhos', 'creme olhos', 'eye cream', 'contorno olhos'],
    category: 'Creme para Olhos',
  },
  {
    keywords: ['hidratante facial', 'hidratante corporal', 'creme hidratante', 'locao hidratante', 'loção hidratante', 'moisturizer', 'creme facial', 'creme corporal', 'body lotion', 'body butter'],
    category: 'Hidratante',
  },
  // ── Perfumes (Homem antes do genérico) ─────────────────────────────────────
  {
    keywords: ['perfume masculino', 'perfume homem', 'colonia masculina', 'eau de toilette homem', 'fragrance men'],
    category: 'Perfume Homem',
  },
  {
    keywords: ['perfume', 'eau de toilette', 'eau de parfum', ' edt ', ' edp ', 'colonia', 'colônia', 'deo parfum', 'body splash', 'fragrance'],
    category: 'Perfume',
  },
  // ── Cabelo (Homem antes do genérico) ───────────────────────────────────────
  {
    keywords: ['shampoo homem', 'shampoo masculino', 'condicionador homem', 'gel capilar homem', 'pomada capilar homem', 'cabelo homem', 'men hair'],
    category: 'Cabelo Homem',
  },
  {
    keywords: ['tintura', 'coloracao', 'coloração', 'colorante', 'tinta cabelo', 'hair color', 'hair dye'],
    category: 'Tintura',
  },
  {
    keywords: ['oleo capilar', 'óleo capilar', 'oleo para cabelo', 'óleo para cabelo', 'hair oil', 'argan oil', 'oleo de argan', 'óleo de argan', 'oleo de coco cabelo'],
    category: 'Óleo Capilar',
  },
  {
    keywords: ['mascara capilar', 'máscara capilar', 'mascara de hidratacao', 'mascara de hidratação', 'mascara para cabelo', 'tratamento capilar', 'hair mask'],
    category: 'Máscara Capilar',
  },
  {
    keywords: ['leave-in', 'leave in', 'leave on', 'sem enxague', 'condicionador leave'],
    category: 'Leave-in',
  },
  {
    keywords: ['finalizador', 'creme para pentear', 'mousse capilar', 'gel capilar', 'pomada capilar', 'definidor', 'hair gel'],
    category: 'Finalizador',
  },
  {
    keywords: ['condicionador', 'conditioner', 'balsamo', 'bálsamo'],
    category: 'Condicionador',
  },
  {
    keywords: ['shampoo', 'xampu', 'shampoo capilar'],
    category: 'Shampoo',
  },
  // ── Fallbacks amplos ───────────────────────────────────────────────────────
  { keywords: [' base '],     category: 'Base'       },
  { keywords: ['hidratante'], category: 'Hidratante' },
  { keywords: ['serum', 'sérum'], category: 'Sérum'  },
];

// Normaliza uma string para comparação: remove acentos e coloca em minúsculo
function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c');
}

/**
 * Mapeia um produto do Mercado Livre (endpoint legado /sites/MLB/search)
 * usando subcategoria ML ou palavras-chave no título.
 */
export function mapCategory(title: string, mlCategoryId: string): Category | null {
  if (mlCategoryId in ML_SUBCATEGORY_MAP) {
    return ML_SUBCATEGORY_MAP[mlCategoryId];
  }
  return mapCategoryByKeywords(title);
}

/**
 * Mapeia um produto do catálogo ML (/products/search) para uma categoria CoScore.
 * Estratégia:
 * 1. domain_id exato
 * 2. Palavras-chave no nome do produto
 * 3. null → produto ignorado
 */
export function mapCategoryByDomain(domainId: string, name: string): Category | null {
  if (domainId in ML_DOMAIN_MAP) {
    return ML_DOMAIN_MAP[domainId];
  }
  return mapCategoryByKeywords(name);
}

export function mapCategoryByKeywords(title: string): Category | null {
  const normTitle = normalizeForMatch(title);
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (normTitle.includes(normalizeForMatch(kw))) {
        return rule.category;
      }
    }
  }
  return null;
}
