/**
 * mega-sync.js
 * Busca o máximo de produtos de cada categoria do Mercado Livre,
 * agrupa variações de cor dentro do mesmo produto, deduplica e
 * salva em scripts/output/catalog.json (preservando existentes).
 *
 * Uso:
 *   node scripts/mega-sync.js
 *
 * Variáveis de ambiente (ou .env.local):
 *   ML_ACCESS_TOKEN  — token de acesso do Mercado Livre
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Configuração ──────────────────────────────────────────────────────────────
const TOKEN        = process.env.ML_ACCESS_TOKEN
                   || 'APP_USR-1664631224999083-030312-f10c634374533b2d59777a1ec2b5e09c-3238361303';
const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const MAX_PER_QUERY = 200;   // máximo de itens por query (4 páginas × 50)
const DELAY_MS      = 150;   // pausa entre requests

// ── Categorias de maquiagem que devem ter variações de cor ────────────────────
const COLOR_CATEGORIES = new Set([
  'Batom', 'Base', 'Sombra', 'Blush', 'Iluminador', 'Corretivo',
  'Contorno/Bronzer', 'Gloss', 'Lápis Labial', 'Pó Facial', 'Delineador',
]);

// ── Queries por categoria CoScore ─────────────────────────────────────────────
const CATEGORY_QUERIES = {
  // ── MAQUIAGEM ──
  'Batom': [
    'batom maquiagem feminino', 'lipstick batom cor', 'batom cremoso labial matte',
    'batom liquido matte longa duração', 'batom glitter labial', 'batom rosa nude beige',
    'batom vermelho cor coral', 'batom ruby rose quem disse berenice', 'batom nyx mac',
    'batom maybelline loreal', 'batom natura avon', 'batom vult dailus',
  ],
  'Base': [
    'base maquiagem facial liquida', 'base cobertura total facial', 'base compacta maquiagem',
    'base cushion pele', 'base full coverage', 'base liquida longa duração',
    'base ruby rose quem disse berenice', 'base maybelline loreal', 'base vult dailus',
    'base natura avon', 'base nyx mac sephora', 'base mary kay revlon',
  ],
  'Máscara de Cílios': [
    'mascara cilios maquiagem volumadora', 'rimel volumador alongador', 'mascara cilios waterproof',
    'mascara cilios preta mega volume', 'rimel maybelline loreal', 'rimel ruby rose',
    'mascara cilios vult quem disse berenice', 'rimel dailus avon', 'mascara cilios nyx max factor',
  ],
  'Sombra': [
    'paleta sombras maquiagem olhos', 'sombra pigmentada glitter olhos', 'sombra matte olhos canto',
    'paleta sombras marrom bege nude', 'paleta sombras colorida', 'sombra ruby rose vult',
    'paleta sombras quem disse berenice', 'paleta sombras nyx urban decay', 'sombra dailus avon',
    'paleta sombras loreal maybelline', 'paleta sombras natura mary kay',
  ],
  'Blush': [
    'blush maquiagem rosinha face', 'blush compacto maça do rosto', 'blush coral peachy',
    'blush ruby rose quem disse berenice', 'blush vult dailus avon', 'blush nyx mac sephora',
    'blush loreal maybelline', 'blush natura mary kay revlon', 'blush contorno facial',
    'blush boca rosa fran by fr', 'blush mari maria bruna tavares',
  ],
  'Iluminador': [
    'iluminador maquiagem facial glitter', 'highlighter pó iluminador', 'iluminador liquido',
    'iluminador ruby rose vult', 'iluminador quem disse berenice dailus', 'iluminador nyx mac',
    'iluminador boca rosa bruna tavares', 'iluminador mari maria avon', 'highlighter loreal',
  ],
  'Corretivo': [
    'corretivo maquiagem olheiras pele', 'corretivo liquido concealer', 'corretivo olheiras claro',
    'corretivo ruby rose quem disse berenice', 'corretivo vult dailus avon', 'corretivo maybelline',
    'corretivo loreal nyx mac', 'corretivo natura mary kay', 'corretivo stick cobertura',
  ],
  'Contorno/Bronzer': [
    'contorno maquiagem face kit', 'bronzer bronzeador compacto', 'contorno paleta pó',
    'contorno ruby rose quem disse berenice', 'contorno vult dailus avon', 'bronzer boca rosa',
    'contorno bruna tavares mari maria', 'bronzer nyx mac sephora', 'contorno loreal maybelline',
    'kit contorno iluminador face', 'contouring maquiagem profissional',
  ],
  'Primer': [
    'primer maquiagem facial poros', 'primer base facial hidratante', 'primer olhos sombra',
    'primer ruby rose quem disse berenice', 'primer vult dailus avon', 'primer nyx mac sephora',
    'primer loreal maybelline', 'primer natura smashbox', 'primer poros abertos facial',
  ],
  'Delineador': [
    'delineador olhos caneta maquiagem', 'eyeliner liquido preto preciso', 'delineador lapis olhos',
    'delineador ruby rose quem disse berenice', 'delineador vult dailus avon', 'eyeliner nyx mac',
    'delineador loreal maybelline', 'delineador colorido artístico', 'eyeliner liner gel olhos',
  ],
  'Gloss': [
    'gloss labial brilho hidratante', 'lip gloss brilho cor', 'gloss transparente hidratante',
    'gloss ruby rose quem disse berenice', 'gloss vult dailus avon', 'lip gloss nyx mac',
    'gloss loreal maybelline', 'gloss boca rosa fran by fr', 'lip gloss plumper volume',
  ],
  'Lápis Labial': [
    'lapis labial contorno boca', 'lapis labial batom lip liner', 'lapis labial nude rosa',
    'lapis labial ruby rose quem disse berenice', 'lapis labial vult dailus avon',
    'lip liner nyx mac', 'lapis labial loreal maybelline', 'lapis labial natura avon',
  ],
  'Fixador de Maquiagem': [
    'fixador maquiagem spray facial', 'setting spray maquiagem longa duração',
    'fixador po translucido facial', 'fixing spray maquiagem profissional',
    'spray fixador nyx mac urban decay', 'fixador maquiagem ruby rose', 'fixador vult dailus',
  ],
  'Pó Facial': [
    'po facial maquiagem translucido', 'po compacto facial cobertura', 'po solto translucido banana',
    'po facial matte acabamento', 'banana powder po solto', 'po facial iluminado',
    'po facial ruby rose quem disse berenice', 'po facial vult dailus avon',
    'po facial loreal maybelline', 'po facial natura bruna tavares', 'po facial mac nyx',
    'po solto facial pigmentado', 'po facial contorno bronzer',
  ],
  'Esponjas e Pincéis': [
    'pincel maquiagem set kit profissional', 'esponja blender maquiagem beauty',
    'kit pincel profissional contorno', 'pincel base contorno sombra', 'beauty blender esponja',
    'pincel mac sigma sephora', 'esponja base líquida facial', 'pincel kabuki pó facial',
    'kit pinceis vult ruby rose', 'esponja aplicadora maquiagem',
  ],

  // ── SKINCARE ──
  'Sérum': [
    'serum facial vitamina c antioxidante', 'serum retinol antienvelhecimento', 'serum acido hialuronico',
    'serum niacinamida poros facial', 'serum clareador manchas', 'serum facial noturno',
    'serum loreal revlon olay', 'serum cerave la roche posay', 'serum neutrogena vichy',
    'serum natura avon', 'serum skincare coreano', 'serum facial hidratante leve',
  ],
  'Hidratante': [
    'hidratante facial pele seca oleosa', 'creme hidratante rosto nutrição', 'moisturizer facial spf',
    'hidratante noturno reparador', 'hidratante facial loreal olay', 'hidratante neutrogena cerave',
    'creme hidratante la roche posay vichy', 'hidratante facial natura avon',
    'hidratante corporal pele seca', 'loção hidratante corporal neutrogena', 'creme urea hidratante',
    'hidratante facial não oleoso', 'gel hidratante facial levinho',
  ],
  'Protetor Solar': [
    'protetor solar facial fps 50', 'protetor solar rosto spf 50+', 'sunscreen fps 50 facial',
    'protetor solar base maquiagem fps', 'protetor solar loreal neutrogena', 'protetor solar la roche posay',
    'protetor solar isdin sun energy', 'protetor solar cerave vichy', 'protetor solar natura avon',
    'protetor solar corporal fps 30', 'protetor solar toque seco facial', 'filtro solar mineral facial',
  ],
  'Tônico Facial': [
    'tonico facial limpeza pele', 'agua micelar desmaquillante', 'tonico pele acne poros',
    'toner facial hidratante', 'agua micelar garnier loreal', 'tonico facial neutrogena cerave',
    'agua micelar bioderma la roche posay', 'tonico facial natura avon', 'tonico esfoliante acidos',
    'agua termal facial spray', 'agua micelar sensivel pele',
  ],
  'Limpeza Facial': [
    'sabonete facial limpeza profunda', 'gel limpeza facial creme', 'espuma limpeza facial suave',
    'demaquilante bifasico oleo', 'limpeza facial loreal neutrogena', 'sabonete facial cerave',
    'limpeza facial la roche posay', 'gel limpeza facial acne', 'sabonete facial natura avon',
    'mousse limpeza facial', 'loção limpeza facial micelar',
  ],
  'Máscara Facial': [
    'mascara facial argila poros', 'mascara facial hidratante sheet mask', 'mascara facial esfoliante',
    'sheet mask coreano hidratante', 'mascara facial detox argila', 'mascara facial vitamina c',
    'mascara facial argila loreal', 'mascara facial neutrogena cerave', 'mascara facial natura',
    'mascara noturna sleeping mask', 'mascara facial clareadora',
  ],
  'Esfoliante': [
    'esfoliante facial suave pele', 'peeling facial quimico acidos', 'esfoliante corporal',
    'scrub esfoliante graos', 'esfoliante labial', 'esfoliante loreal neutrogena',
    'esfoliante facial st ives', 'esfoliante corporal natura avon', 'esfoliante acido glicolico',
  ],
  'Creme para Olhos': [
    'creme contorno olhos antibolsas', 'eye cream olheiras clareador', 'creme area olhos firmeza',
    'creme olhos loreal neutrogena', 'eye cream la roche posay', 'creme olhos natura avon',
    'creme olhos olay revlon', 'contorno olhos antiaging', 'gel creme area olhos',
  ],

  // ── PERFUMES ──
  'Perfume': [
    'perfume feminino eau de parfum', 'perfume feminino nacional', 'body splash feminino perfume',
    'deo parfum feminino importado', 'colonia feminina cheiro bom', 'eau de toilette feminino',
    'perfume feminino floral', 'perfume feminino frutado', 'perfume feminino oriental',
    'perfume natura avon feminino', 'perfume boticario feminino', 'perfume importado feminino',
    'perfume carolina herrera good girl', 'perfume lancome ysl feminino', 'perfume miss dior chanel',
  ],
  'Perfume Homem': [
    'perfume masculino eau de toilette', 'perfume masculino nacional', 'body splash masculino',
    'deo parfum masculino importado', 'colonia masculina cheiro marcante', 'perfume masculino amadeirado',
    'perfume masculino boticario natura', 'perfume masculino avon',
    'perfume masculino importado bleu dior', 'perfume masculino sauvage',
  ],

  // ── CABELO ──
  'Shampoo': [
    'shampoo hidratante cabelo feminino', 'shampoo anticaspa seborreia', 'shampoo cachos crespos',
    'shampoo liso sedoso cabelo', 'shampoo loiro matizador', 'shampoo nutrição intensa',
    'shampoo salon line tresemme', 'shampoo seda pantene loreal', 'shampoo dove garnier',
    'shampoo natura wella kerastase', 'shampoo low poo co wash cachos',
    'shampoo reparador danificados', 'shampoo queda prevenção',
  ],
  'Condicionador': [
    'condicionador cabelo hidratante nutrição', 'condicionador cachos definição',
    'condicionador sem sal sulfato', 'condicionador reparador danos', 'condicionador loiro matizador',
    'condicionador salon line tresemme', 'condicionador seda pantene loreal',
    'condicionador dove garnier natura', 'condicionador wella kerastase profissional',
    'condicionador low poo cachos', 'condicionador suavizante sedoso',
  ],
  'Máscara Capilar': [
    'mascara capilar hidratante profunda', 'mascara capilar nutrição intensa cachos',
    'creme capilar profundo reparador', 'mascara hidratação intensa cabelo', 'mascara capilar loreal',
    'mascara capilar salon line tresemme', 'mascara capilar wella kerastase',
    'mascara capilar natura avon', 'mascara capilar siàge loreal elvive',
    'tratamento profundo capilar', 'mascara reconstrutora proteica',
  ],
  'Leave-in': [
    'leave-in sem enxague proteção cabelo', 'leave-in cachos crespos definição',
    'leave-in protetor termico calor', 'creme leave-in suavizante sedoso',
    'leave-in salon line loreal', 'leave-in tresemme pantene seda',
    'leave-in natura wella kerastase', 'spray leave-in protetor solar cabelo',
    'leave-in finalizador cabelo liso', 'leave-in hidratante ondulados',
  ],
  'Óleo Capilar': [
    'oleo capilar argan marroquino', 'oleo capilar nutrição brilho', 'serum capilar finalizador',
    'oleo capilar salon line loreal', 'oleo capilar tresemme pantene', 'oleo capilar kerastase wella',
    'oleo capilar macadamia coco', 'oleo capilar reparador pontas', 'oleo capilar natura avon',
  ],
  'Finalizador': [
    'finalizador anti frizz cabelo', 'mousse modelador cachos', 'creme finalizar cabelo liso',
    'gel forte fixacao cabelo', 'finalizador salon line loreal', 'finalizador tresemme pantene',
    'wax pomada modeladora cabelo', 'spray finalizador anti frizz', 'finalizador natura wella',
    'mousse volumizador cabelo', 'creme modelador cacho definido',
  ],
  'Tintura': [
    'tintura coloracao cabelo permanente', 'coloracao tonalizante sem amonia', 'tinta cabelo cor',
    'coloracao loreal excellence', 'tintura garnier olia', 'coloracao igora schwarzkopf',
    'tintura wella koleston', 'coloracao permanente casting', 'tintura avon loreal',
    'coloracao semipermanente tonalizante', 'tintura loiro escuro castanho',
  ],
  'Cabelo Homem': [
    'shampoo masculino cabelo barba', 'produto capilar masculino', 'pomada modeladora masculina cabelo',
    'gel cabelo masculino forte', 'wax cera cabelo masculino', 'shampoo masculino loreal',
    'pomada masculina boticario', 'gel cabelo salon line masculino', 'produto styling masculino',
  ],
};

// ── Mapeamento de domain_id ML → Categoria CoScore ────────────────────────────
const DOMAIN_TO_CATEGORY = {
  'MLB-LIPSTICKS': 'Batom',
  'MLB-LIP_GLOSSES': 'Gloss',
  'MLB-LIP_LINERS': 'Lápis Labial',
  'MLB-FOUNDATIONS': 'Base',
  'MLB-CONCEALERS': 'Corretivo',
  'MLB-MASCARAS': 'Máscara de Cílios',
  'MLB-EYESHADOWS': 'Sombra',
  'MLB-BLUSHERS': 'Blush',
  'MLB-HIGHLIGHTERS': 'Iluminador',
  'MLB-BRONZERS': 'Contorno/Bronzer',
  'MLB-CONTOUR_POWDERS': 'Contorno/Bronzer',
  'MLB-FACE_POWDERS': 'Pó Facial',
  'MLB-PRIMERS': 'Primer',
  'MLB-EYELINERS': 'Delineador',
  'MLB-SETTING_SPRAYS': 'Fixador de Maquiagem',
  'MLB-MAKEUP_BRUSHES': 'Esponjas e Pincéis',
  'MLB-MAKEUP_SPONGES': 'Esponjas e Pincéis',
  'MLB-BRUSH_SETS': 'Esponjas e Pincéis',
  'MLB-SKINCARE_SERUMS': 'Sérum',
  'MLB-FACE_MOISTURIZERS': 'Hidratante',
  'MLB-BODY_MOISTURIZERS': 'Hidratante',
  'MLB-SUNSCREENS': 'Protetor Solar',
  'MLB-TONERS': 'Tônico Facial',
  'MLB-MICELLAR_WATERS': 'Tônico Facial',
  'MLB-FACE_CLEANSERS': 'Limpeza Facial',
  'MLB-FACE_MASKS': 'Máscara Facial',
  'MLB-FACE_EXFOLIANTS': 'Esfoliante',
  'MLB-EYE_CREAMS': 'Creme para Olhos',
  'MLB-PERFUMES': 'Perfume',
  'MLB-WOMEN_PERFUMES': 'Perfume',
  'MLB-MEN_PERFUMES': 'Perfume Homem',
  'MLB-SHAMPOOS': 'Shampoo',
  'MLB-MEN_SHAMPOOS': 'Cabelo Homem',
  'MLB-HAIR_CONDITIONERS': 'Condicionador',
  'MLB-HAIR_MASKS': 'Máscara Capilar',
  'MLB-HAIR_LEAVE_INS': 'Leave-in',
  'MLB-HAIR_OILS': 'Óleo Capilar',
  'MLB-HAIR_FINISHERS': 'Finalizador',
  'MLB-HAIR_DYES': 'Tintura',
  'MLB-HAIR_COLORATIONS': 'Tintura',
};

// ── Utilitários ────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${TOKEN}` } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.setTimeout(15000, () => { req.destroy(); resolve({}); });
    req.on('error', () => resolve({}));
  });
}

// Limpa nome para comparação de duplicatas
function normalizeName(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(cor|tom|shade|original|novo|kit|com|de|e|a|o|ml|g|gr|oz|mg|un|unidade|pack)\b/gi, '')
    .replace(/\b\d+\s*(?:ml|g|gr|oz|mg|un)?\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normaliza cor
const JUNK_COLORS = new Set([
  'sem cor', 'único', 'única', 'unica', 'unico', 'outro', 'outros',
  'multicolor', 'multicor', 'não se aplica', 'nao se aplica', '',
  'transparente', 'color', 'única cor', 'neutra',
]);

function normalizeColor(raw) {
  if (!raw) return '';
  const c = raw.trim().toLowerCase();
  if (JUNK_COLORS.has(c)) return '';
  if (c.length < 2) return '';
  return raw.trim().replace(/\b\w/g, l => l.toUpperCase());
}

// ── Lê catálogo existente ─────────────────────────────────────────────────────
function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) return { products: [] };
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

// ── Gera ID único ─────────────────────────────────────────────────────────────
function makeId() {
  return `p${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;
}

// ── Categoriza produto pela query ou domain_id ────────────────────────────────
function categorize(prod, targetCategory) {
  // domain_id é mais confiável
  if (prod.domain_id && DOMAIN_TO_CATEGORY[prod.domain_id]) {
    return DOMAIN_TO_CATEGORY[prod.domain_id];
  }
  return targetCategory;
}

// ── Formata produto ML para catálogo ─────────────────────────────────────────
function formatProduct(mlProd, category, colors = []) {
  const brand = (mlProd.attributes || []).find(a => a.id === 'BRAND')?.value_name || '';
  const ean   = (mlProd.attributes || []).find(a => a.id === 'EAN'  )?.value_name || '';
  const colorAttr = (mlProd.attributes || []).find(a => a.id === 'COLOR')?.value_name || '';
  const color = normalizeColor(colorAttr);
  
  // Imagens
  const pics = (mlProd.pictures || [])
    .map(p => p.url || p.secure_url || '')
    .filter(Boolean)
    .slice(0, 5);

  // Monta cores: inclui a cor principal se existir
  const colorList = [...colors];
  if (color && pics[0] && !colorList.find(c => c.name.toLowerCase() === color.toLowerCase())) {
    colorList.unshift({ name: color, image: pics[0] });
  }

  return {
    id:          makeId(),
    name:        (mlProd.name || '').trim(),
    brand:       brand,
    category:    category,
    subcategory: category,
    description: mlProd.short_description?.content || mlProd.name || '',
    images:      pics,
    colors:      colorList,
    mlId:        mlProd.id || mlProd.catalog_product_id || '',
    tags:        [brand, category].filter(Boolean),
    price:       0,
    rating:      0,
    reviewCount: 0,
    ean:         ean,
  };
}

// ── Busca produtos do ML por query ────────────────────────────────────────────
async function fetchByQuery(query, maxItems) {
  const results = [];
  const perPage = 50;
  const pages   = Math.ceil(maxItems / perPage);

  for (let page = 0; page < pages; page++) {
    const offset = page * perPage;
    const url = `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(query)}&limit=${perPage}&offset=${offset}`;
    const data = await get(url);
    const items = data.results || [];
    results.push(...items);
    if (items.length < perPage) break; // sem mais resultados
    await sleep(DELAY_MS);
  }

  return results;
}

// ── Enriquece produto com detalhes completos (imagens, etc.) ──────────────────
async function enrichProduct(mlId) {
  const data = await get(`https://api.mercadolibre.com/products/${mlId}`);
  return data.error ? null : data;
}

// ── Busca cores de um produto (apenas Strategy 1: catalog attributes) ─────────
async function getProductColors(mlProd) {
  const colors = [];
  // Cor do próprio produto catálogo
  const colorAttr = (mlProd.attributes || []).find(a => a.id === 'COLOR');
  const color = normalizeColor(colorAttr?.value_name || '');
  if (color) {
    const img = (mlProd.pictures || [])[0]?.url || '';
    if (img) colors.push({ name: color, image: img });
  }
  return colors;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Mega Sync CoScore × Mercado Livre ===\n');

  // Carrega catálogo existente
  const catalog = loadCatalog();
  const existingProducts = catalog.products || [];

  // Índices para deduplicação
  const existingMlIds   = new Set(existingProducts.map(p => p.mlId).filter(Boolean));
  const existingNameKey = new Set(
    existingProducts.map(p => `${normalizeName(p.name)}||${(p.brand||'').toLowerCase()}`)
  );

  console.log(`Produtos existentes: ${existingProducts.length}`);
  console.log(`ML IDs existentes: ${existingMlIds.size}\n`);

  const newProducts = [];
  let totalFetched  = 0;
  let totalSkipped  = 0;

  // Para deduplicação intra-sync (não adicionar o mesmo mlId duas vezes)
  const seenMlIds   = new Set(existingMlIds);
  const seenParents = new Set();

  // Agrupa por parent_id para unir variações de cor
  const parentGroups = new Map(); // parentId → { product, colors[] }

  for (const [category, queries] of Object.entries(CATEGORY_QUERIES)) {
    let catNew = 0;
    console.log(`\n📂 Categoria: ${category}`);

    for (const query of queries) {
      process.stdout.write(`  🔍 "${query}"... `);
      const items = await fetchByQuery(query, MAX_PER_QUERY);
      let qNew = 0;

      for (const item of items) {
        const mlId    = item.id || item.catalog_product_id;
        const parentId = item.parent_id;

        if (!mlId) continue;
        if (seenMlIds.has(mlId)) { totalSkipped++; continue; }
        seenMlIds.add(mlId);

        // Determina categoria
        const realCategory = categorize(item, category);

        // Se tem parent_id, pode ser variação de cor de produto já visto
        if (parentId && seenParents.has(parentId)) {
          // Adiciona como variação de cor ao produto pai
          const group = parentGroups.get(parentId);
          if (group) {
            const colorAttr = (item.attributes || []).find(a => a.id === 'COLOR');
            const color = normalizeColor(colorAttr?.value_name || '');
            const img = (item.pictures || [])[0]?.url || '';
            if (color && img && !group.colors.find(c => c.name.toLowerCase() === color.toLowerCase())) {
              group.colors.push({ name: color, image: img });
            }
            totalSkipped++;
            continue;
          }
        }

        // Deduplicação por nome+marca
        const nameKey = `${normalizeName(item.name || '')}||${((item.attributes || []).find(a => a.id === 'BRAND')?.value_name || '').toLowerCase()}`;
        if (existingNameKey.has(nameKey)) { totalSkipped++; continue; }
        existingNameKey.add(nameKey);

        // Registra parent_id
        if (parentId) {
          seenParents.add(parentId);
        }

        // Cores do produto
        const colors = await getProductColors(item);

        // Formata produto
        const product = formatProduct(item, realCategory, colors);

        // Guarda no grupo de parent_id
        if (parentId) {
          parentGroups.set(parentId, { product, colors });
        }

        newProducts.push(product);
        totalFetched++;
        qNew++;
        catNew++;
      }

      console.log(`${qNew} novos (total=${catNew})`);
      await sleep(100);
    }

    console.log(`  → ${catNew} novos em ${category}`);
  }

  // Aplica cores dos grupos (parent_id) nos produtos
  for (const [parentId, group] of parentGroups.entries()) {
    const product = newProducts.find(p => p.id === group.product.id);
    if (product) {
      product.colors = group.colors;
    }
  }

  console.log(`\n=== Resultado ===`);
  console.log(`Novos produtos: ${totalFetched}`);
  console.log(`Duplicatas ignoradas: ${totalSkipped}`);

  // Salva catálogo atualizado
  const updatedCatalog = {
    ...catalog,
    products: [...existingProducts, ...newProducts],
    lastSync: new Date().toISOString(),
    total: existingProducts.length + newProducts.length,
  };

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(updatedCatalog, null, 2), 'utf8');
  console.log(`\n✅ Catálogo salvo: ${updatedCatalog.total} produtos totais`);
  console.log(`   Arquivo: ${CATALOG_PATH}`);
  console.log(`\n⚡ Próximo passo: node scripts/export-catalog.js`);
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
