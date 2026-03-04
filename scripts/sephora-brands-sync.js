/**
 * sephora-brands-sync.js
 * Adiciona produtos das marcas vendidas na Sephora Brasil ao catálogo CoScore.
 * Busca via ML Catalog API, agrupa cores, sem duplicações.
 *
 * Uso: node scripts/sephora-brands-sync.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// Token renovado automaticamente via client_credentials
let TOKEN = process.env.ML_ACCESS_TOKEN || '';

async function refreshToken() {
  return new Promise(resolve => {
    const body = Buffer.from('grant_type=client_credentials&client_id=1664631224999083&client_secret=Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG');
    const req = https.request('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', () => resolve({}));
    req.write(body); req.end();
  });
}
const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const SAVE_EVERY   = 50;
const DELAY_MS     = 150;
const MAX_COLORS   = 20;

// ── Categorias com variações de cor ──────────────────────────────────────────
const COLOR_CATEGORIES = new Set([
  'Batom','Base','Sombra','Blush','Iluminador','Corretivo',
  'Contorno/Bronzer','Gloss','Lápis Labial','Pó Facial','Delineador','Primer',
]);

// ── Domain → Categoria ───────────────────────────────────────────────────────
const DOMAIN_TO_CATEGORY = {
  'MLB-LIPSTICKS':          'Batom',
  'MLB-LIP_GLOSSES':        'Gloss',
  'MLB-LIP_LINERS':         'Lápis Labial',
  'MLB-FOUNDATIONS':        'Base',
  'MLB-CONCEALERS':         'Corretivo',
  'MLB-MASCARAS':           'Máscara de Cílios',
  'MLB-EYESHADOWS':         'Sombra',
  'MLB-BLUSHERS':           'Blush',
  'MLB-HIGHLIGHTERS':       'Iluminador',
  'MLB-BRONZERS':           'Contorno/Bronzer',
  'MLB-CONTOUR_POWDERS':    'Contorno/Bronzer',
  'MLB-FACE_POWDERS':       'Pó Facial',
  'MLB-PRIMERS':            'Primer',
  'MLB-EYELINERS':          'Delineador',
  'MLB-SETTING_SPRAYS':     'Fixador de Maquiagem',
  'MLB-MAKEUP_BRUSHES':     'Esponjas e Pincéis',
  'MLB-MAKEUP_SPONGES':     'Esponjas e Pincéis',
  'MLB-BRUSH_SETS':         'Esponjas e Pincéis',
  'MLB-SKINCARE_SERUMS':    'Sérum',
  'MLB-FACE_MOISTURIZERS':  'Hidratante',
  'MLB-BODY_MOISTURIZERS':  'Hidratante',
  'MLB-SUNSCREENS':         'Protetor Solar',
  'MLB-TONERS':             'Tônico Facial',
  'MLB-MICELLAR_WATERS':    'Limpeza Facial',
  'MLB-FACE_CLEANSERS':     'Limpeza Facial',
  'MLB-FACE_MASKS':         'Máscara Facial',
  'MLB-FACE_EXFOLIANTS':    'Esfoliante',
  'MLB-EYE_CREAMS':         'Creme para Olhos',
  'MLB-PERFUMES':           'Perfume Feminino',
  'MLB-WOMEN_PERFUMES':     'Perfume Feminino',
  'MLB-MEN_PERFUMES':       'Perfume Masculino',
  'MLB-SHAMPOOS':           'Shampoo',
  'MLB-HAIR_CONDITIONERS':  'Condicionador',
  'MLB-HAIR_MASKS':         'Máscara Capilar',
  'MLB-HAIR_LEAVE_INS':     'Leave-in',
  'MLB-HAIR_OILS':          'Óleo Capilar',
  'MLB-HAIR_FINISHERS':     'Finalizador',
  'MLB-HAIR_DYES':          'Tintura',
};

// ── Marcas Sephora Brasil ────────────────────────────────────────────────────
const BRANDS = {
  // MAQUIAGEM
  'Anastasia Beverly Hills': {
    queries: [
      'Anastasia Beverly Hills sobrancelha brow', 'Anastasia Beverly Hills contorno bronzer',
      'Anastasia Beverly Hills sombra paleta', 'Anastasia Beverly Hills base foundation',
      'Anastasia Beverly Hills batom labial', 'Anastasia Beverly Hills iluminador',
      'Anastasia Beverly Hills primer', 'Anastasia ABH makeup',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'bareMinerals': {
    queries: [
      'bareMinerals base po mineral', 'bareMinerals batom lipstick',
      'bareMinerals blush', 'bareMinerals primer', 'bareMinerals sombra',
      'bareMinerals hidratante skincare', 'bareMinerals corretivo concealer',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'Benefit Cosmetics': {
    queries: [
      'Benefit Cosmetics sobrancelha brow', 'Benefit blush compacto',
      'Benefit primer facial', 'Benefit mascara cilios rimel',
      'Benefit iluminador highlighter', 'Benefit base maquiagem',
      'Benefit batom labial', 'Benefit corretivo concealer',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'Fenty Beauty': {
    queries: [
      'Fenty Beauty base foundation', 'Fenty Beauty corretivo concealer',
      'Fenty Beauty batom lipstick', 'Fenty Beauty gloss labial',
      'Fenty Beauty blush', 'Fenty Beauty iluminador highlighter',
      'Fenty Beauty primer', 'Fenty Beauty po facial',
      'Fenty Beauty sombra paleta', 'Fenty Beauty mascara cilios',
    ],
    colorCategories: true, maxPerQuery: 200,
  },
  'Huda Beauty': {
    queries: [
      'Huda Beauty sombra paleta', 'Huda Beauty batom labial',
      'Huda Beauty base foundation', 'Huda Beauty iluminador',
      'Huda Beauty gloss labial', 'Huda Beauty contorno bronzer',
      'Huda Beauty mascara cilios', 'Huda Beauty corretivo',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'Kylie Cosmetics': {
    queries: [
      'Kylie Cosmetics batom lip kit', 'Kylie Cosmetics gloss labial',
      'Kylie Cosmetics sombra paleta', 'Kylie Cosmetics base foundation',
      'Kylie Cosmetics blush', 'Kylie Cosmetics iluminador',
      'Kylie Cosmetics contorno bronzer',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'Laura Mercier': {
    queries: [
      'Laura Mercier po solto translucido', 'Laura Mercier base foundation',
      'Laura Mercier primer facial', 'Laura Mercier batom lipstick',
      'Laura Mercier blush', 'Laura Mercier corretivo concealer',
      'Laura Mercier iluminador', 'Laura Mercier po facial',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'NARS': {
    queries: [
      'NARS base maquiagem', 'NARS batom labial', 'NARS blush compacto',
      'NARS corretivo concealer', 'NARS sombra paleta', 'NARS iluminador',
      'NARS gloss labial', 'NARS primer', 'NARS mascara cilios',
      'NARS contorno bronzer', 'NARS delineador', 'NARS po facial',
    ],
    colorCategories: true, maxPerQuery: 200,
  },
  'Nudestix': {
    queries: [
      'Nudestix batom labial', 'Nudestix lapis labial',
      'Nudestix base stick', 'Nudestix blush',
      'Nudestix iluminador', 'Nudestix contorno',
    ],
    colorCategories: true, maxPerQuery: 100,
  },
  'Rare Beauty': {
    queries: [
      'Rare Beauty base foundation', 'Rare Beauty blush liquido',
      'Rare Beauty batom labial', 'Rare Beauty iluminador highlighter',
      'Rare Beauty primer', 'Rare Beauty corretivo', 'Rare Beauty gloss',
      'Rare Beauty sombra', 'Rare Beauty po facial',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'Sephora Collection': {
    queries: [
      'Sephora Collection base foundation', 'Sephora Collection batom labial',
      'Sephora Collection sombra paleta', 'Sephora Collection blush',
      'Sephora Collection primer', 'Sephora Collection mascara cilios',
      'Sephora Collection gloss labial', 'Sephora Collection iluminador',
      'Sephora Collection pincel brush', 'Sephora Collection corretivo',
      'Sephora Collection po facial', 'Sephora Collection delineador',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'Too Faced': {
    queries: [
      'Too Faced batom labial', 'Too Faced sombra paleta',
      'Too Faced mascara cilios better than sex', 'Too Faced base foundation',
      'Too Faced primer peach', 'Too Faced bronzer chocolate soleil',
      'Too Faced blush', 'Too Faced iluminador', 'Too Faced gloss',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'Yves Saint Laurent': {
    queries: [
      'Yves Saint Laurent batom rouge pur couture', 'YSL batom labial',
      'Yves Saint Laurent base fusion ink', 'YSL base maquiagem',
      'Yves Saint Laurent mascara volume', 'YSL gloss labial',
      'Yves Saint Laurent blush', 'YSL perfume feminino',
      'YSL perfume masculino',
    ],
    colorCategories: true, maxPerQuery: 150,
  },
  'Dior Backstage': {
    queries: [
      'Dior Backstage base foundation', 'Dior Backstage blush',
      'Dior Backstage contorno bronzer', 'Dior Backstage iluminador',
      'Dior Backstage sombra paleta', 'Dior Backstage corretivo',
      'Dior batom rouge dior', 'Dior gloss labial',
    ],
    colorCategories: true, maxPerQuery: 150,
  },

  // SKINCARE
  'Banila Co': {
    queries: [
      'Banila Co clean it zero demaquilante', 'Banila Co hidratante facial',
      'Banila Co protetor solar', 'Banila Co primer base',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Biossance': {
    queries: [
      'Biossance serum vitamina c', 'Biossance hidratante esqualano',
      'Biossance limpeza facial', 'Biossance protetor solar',
      'Biossance oleo esqualano',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Caudalie': {
    queries: [
      'Caudalie serum vitamina c', 'Caudalie hidratante facial',
      'Caudalie agua micelar', 'Caudalie protetor solar',
      'Caudalie olho creme', 'Caudalie vinoperfect',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Drunk Elephant': {
    queries: [
      'Drunk Elephant serum vitamina c', 'Drunk Elephant hidratante',
      'Drunk Elephant retinol', 'Drunk Elephant acido hialuronico',
      'Drunk Elephant limpeza facial', 'Drunk Elephant protetor solar',
      'Drunk Elephant esfoliante', 'Drunk Elephant oleo facial',
    ],
    colorCategories: false, maxPerQuery: 150,
  },
  'Embryolisse': {
    queries: [
      'Embryolisse hidratante lait creme', 'Embryolisse primer base',
      'Embryolisse limpeza facial', 'Embryolisse creme nutritivo',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Esthederm': {
    queries: [
      'Esthederm serum facial', 'Esthederm hidratante',
      'Esthederm protetor solar', 'Esthederm agua celular',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Glow Recipe': {
    queries: [
      'Glow Recipe serum melancia', 'Glow Recipe hidratante',
      'Glow Recipe protetor solar', 'Glow Recipe limpeza facial',
      'Glow Recipe tonificante', 'Glow Recipe esfoliante',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Korres': {
    queries: [
      'Korres hidratante iogurte grego', 'Korres serum facial',
      'Korres protetor solar', 'Korres limpeza facial',
      'Korres batom labial', 'Korres blush',
    ],
    colorCategories: true, maxPerQuery: 100,
  },
  'La Mer': {
    queries: [
      'La Mer creme hidratante', 'La Mer serum facial',
      'La Mer oleo facial', 'La Mer limpeza',
      'La Mer protetor solar', 'La Mer creme olhos',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'La Prairie': {
    queries: [
      'La Prairie creme hidratante caviar', 'La Prairie serum',
      'La Prairie base maquiagem', 'La Prairie protetor solar',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Laneige': {
    queries: [
      'Laneige lip sleeping mask', 'Laneige hidratante agua',
      'Laneige protetor solar', 'Laneige serum', 'Laneige agua toner',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Shiseido': {
    queries: [
      'Shiseido base foundation', 'Shiseido hidratante facial',
      'Shiseido protetor solar', 'Shiseido serum ultimune',
      'Shiseido batom labial', 'Shiseido mascara cilios',
      'Shiseido agua termal', 'Shiseido perfume feminino',
    ],
    colorCategories: true, maxPerQuery: 150,
  },

  // HAIRCARE
  'Aveda': {
    queries: [
      'Aveda shampoo cabelo', 'Aveda condicionador',
      'Aveda mascara capilar', 'Aveda leave-in',
      'Aveda oleo capilar', 'Aveda finalizador',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Authentic Beauty Concept': {
    queries: [
      'Authentic Beauty Concept shampoo', 'Authentic Beauty condicionador',
      'Authentic Beauty mascara capilar', 'Authentic Beauty leave-in',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Braé Hair Care': {
    queries: [
      'Brae shampoo cabelo', 'Brae condicionador', 'Brae mascara capilar',
      'Brae leave-in', 'Brae oleo cabelo', 'Brae finalizador',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Briogeo': {
    queries: [
      'Briogeo shampoo', 'Briogeo condicionador',
      'Briogeo mascara capilar', 'Briogeo leave-in',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Keune': {
    queries: [
      'Keune shampoo cabelo', 'Keune condicionador tratamento',
      'Keune mascara capilar', 'Keune leave-in finalizador',
      'Keune oleo capilar',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Kérastase': {
    queries: [
      'Kerastase shampoo', 'Kerastase condicionador',
      'Kerastase mascara capilar', 'Kerastase leave-in',
      'Kerastase oleo elixir', 'Kerastase serum',
    ],
    colorCategories: false, maxPerQuery: 150,
  },
  'Moroccanoil': {
    queries: [
      'Moroccanoil oleo argan', 'Moroccanoil shampoo',
      'Moroccanoil condicionador', 'Moroccanoil mascara capilar',
      'Moroccanoil leave-in finalizador',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Nioxin': {
    queries: [
      'Nioxin shampoo queda cabelo', 'Nioxin condicionador',
      'Nioxin tratamento capilar',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Redken': {
    queries: [
      'Redken shampoo cabelo', 'Redken condicionador',
      'Redken mascara capilar', 'Redken leave-in',
      'Redken oleo capilar', 'Redken finalizador',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Sebastian Professional': {
    queries: [
      'Sebastian Professional shampoo', 'Sebastian condicionador',
      'Sebastian mascara capilar', 'Sebastian finalizador',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Schwarzkopf Professional': {
    queries: [
      'Schwarzkopf Professional shampoo', 'Schwarzkopf condicionador',
      'Schwarzkopf tintura coloracao', 'Schwarzkopf mascara capilar',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Wella Professionals': {
    queries: [
      'Wella Professionals shampoo', 'Wella condicionador',
      'Wella mascara capilar', 'Wella coloracao tintura',
      'Wella finalizador',
    ],
    colorCategories: false, maxPerQuery: 100,
  },

  // PERFUMES
  'Acqua di Parma': {
    queries: [
      'Acqua di Parma colonia', 'Acqua di Parma eau de parfum',
      'Acqua di Parma perfume',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Azzaro': {
    queries: [
      'Azzaro perfume masculino wanted', 'Azzaro perfume feminino',
      'Azzaro chrome eau de toilette',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Banderas': {
    queries: [
      'Banderas perfume the icon masculino', 'Banderas perfume feminino',
      'Banderas eau de toilette',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Benetton': {
    queries: [
      'Benetton perfume united colors feminino', 'Benetton perfume masculino',
      'Benetton colors eau de toilette',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Burberry': {
    queries: [
      'Burberry perfume feminino her', 'Burberry perfume masculino brit',
      'Burberry weekend eau de parfum', 'Burberry touch',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Bvlgari': {
    queries: [
      'Bvlgari omnia perfume feminino', 'Bvlgari man masculino',
      'Bvlgari aqva eau de toilette', 'Bvlgari pour femme',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Calvin Klein': {
    queries: [
      'Calvin Klein ck one', 'Calvin Klein eternity feminino',
      'Calvin Klein euphoria', 'Calvin Klein obsession masculino',
      'Calvin Klein ck be perfume',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Carolina Herrera': {
    queries: [
      'Carolina Herrera good girl perfume', 'Carolina Herrera bad boy masculino',
      'Carolina Herrera 212 feminino', 'Carolina Herrera 212 vip',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Chloé': {
    queries: [
      'Chloe perfume feminino eau de parfum', 'Chloe nomade',
      'Chloe roses de chloe',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Dolce & Gabbana': {
    queries: [
      'Dolce Gabbana light blue feminino', 'Dolce Gabbana the one masculino',
      'Dolce Gabbana pour homme', 'Dolce Gabbana perfume feminino',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Giorgio Armani': {
    queries: [
      'Giorgio Armani acqua di gio masculino', 'Giorgio Armani si feminino',
      'Giorgio Armani stronger with you', 'Armani code masculino',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Gucci': {
    queries: [
      'Gucci bloom perfume feminino', 'Gucci guilty pour homme',
      'Gucci flora feminino', 'Gucci rush',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
  'Hermès': {
    queries: [
      'Hermes terre d hermes masculino', 'Hermes twilly feminino',
      'Hermes un jardin', 'Hermes eau des merveilles',
    ],
    colorCategories: false, maxPerQuery: 100,
  },
};

// ── Utilitários ──────────────────────────────────────────────────────────────
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

const JUNK_COLORS = new Set([
  'único','única','unico','unica','outro','outros','multicolor','multicor',
  'não se aplica','nao se aplica','','transparente','cor única','neutra','sem cor',
]);

function normalizeColor(raw) {
  if (!raw) return '';
  const c = raw.trim().toLowerCase();
  if (JUNK_COLORS.has(c)) return '';
  if (c.length < 2) return '';
  return raw.trim().replace(/\b\w/g, l => l.toUpperCase());
}

function normalizeName(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(cor|tom|original|novo|kit|de|e|a|o|ml|g|gr|oz|mg|un)\b/gi, '')
    .replace(/\b\d+\s*(?:ml|g|gr|oz|mg|un)?\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function categorize(prod) {
  if (prod.domain_id && DOMAIN_TO_CATEGORY[prod.domain_id]) {
    return DOMAIN_TO_CATEGORY[prod.domain_id];
  }
  const n = (prod.name || '').toLowerCase();
  if (/\bbatom\b/.test(n)) return 'Batom';
  if (/\bgloss\b|\bbrilho labial\b/.test(n)) return 'Gloss';
  if (/\blapis labial\b|\blip liner\b/.test(n)) return 'Lápis Labial';
  if (/\bbase\b/.test(n)) return 'Base';
  if (/\bcorretivo\b|\bconcealer\b/.test(n)) return 'Corretivo';
  if (/\bpo facial\b|\bpó\b/.test(n)) return 'Pó Facial';
  if (/\bprimer\b/.test(n)) return 'Primer';
  if (/\brimel\b|\bmascara.*cilio\b|\bmáscara.*cílio\b/.test(n)) return 'Máscara de Cílios';
  if (/\bsombra\b|\bpaleta\b|\beyeshadow\b/.test(n)) return 'Sombra';
  if (/\bdelineador\b|\beyeliner\b/.test(n)) return 'Delineador';
  if (/\bblush\b/.test(n)) return 'Blush';
  if (/\biluminador\b|\bhighlighter\b/.test(n)) return 'Iluminador';
  if (/\bcontorno\b|\bbronzer\b/.test(n)) return 'Contorno/Bronzer';
  if (/\bpincel\b|\besponja\b|\bblender\b/.test(n)) return 'Esponjas e Pincéis';
  if (/\bfixador\b|\bsetting spray\b/.test(n)) return 'Fixador de Maquiagem';
  if (/\bserum\b|\bsérum\b/.test(n)) return 'Sérum';
  if (/\bhidratante\b/.test(n)) return 'Hidratante';
  if (/\bprotetor solar\b|\bspf\b|\bfps\b/.test(n)) return 'Protetor Solar';
  if (/\btônico\b|\btonico\b|\bágua micelar\b/.test(n)) return 'Tônico Facial';
  if (/\blimpeza facial\b|\bsabonete facial\b|\bdemaquilante\b/.test(n)) return 'Limpeza Facial';
  if (/\bmáscara facial\b|\bargila\b|\bsheet mask\b/.test(n)) return 'Máscara Facial';
  if (/\besfoliante\b|\bpeeling\b/.test(n)) return 'Esfoliante';
  if (/\bcreme.*olhos\b|\beye cream\b/.test(n)) return 'Creme para Olhos';
  if (/\bperfume\b|\beau de\b|\bcolônia\b/.test(n)) {
    if (/\bmasculino\b|\bhomem\b|\bpour homme\b|\bmen\b/.test(n)) return 'Perfume Masculino';
    return 'Perfume Feminino';
  }
  if (/\bshampoo\b/.test(n)) return 'Shampoo';
  if (/\bcondicionador\b/.test(n)) return 'Condicionador';
  if (/\bmáscara capilar\b|\bcreme capilar\b/.test(n)) return 'Máscara Capilar';
  if (/\bleave.in\b/.test(n)) return 'Leave-in';
  if (/\bóleo capilar\b|\boleo capilar\b/.test(n)) return 'Óleo Capilar';
  if (/\bfinalizador\b|\banti.frizz\b/.test(n)) return 'Finalizador';
  if (/\btintura\b|\bcoloração\b/.test(n)) return 'Tintura';
  return null;
}

// Busca cores via catalog_product_id
async function fetchColors(mlId) {
  const colorMap = new Map();
  try {
    const prod = await get(`https://api.mercadolibre.com/products/${mlId}`);
    if (!prod.error) {
      const colorAttr = (prod.attributes || []).find(a => a.id === 'COLOR');
      const color = normalizeColor(colorAttr?.value_name || '');
      const img = prod.pictures?.[0]?.url || prod.pictures?.[0]?.secure_url || '';
      if (color && img) colorMap.set(color, img.replace('http://', 'https://'));
    }
    await sleep(80);
  } catch { /* ignora */ }

  try {
    const items = await get(
      `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${mlId}&limit=20`
    );
    await sleep(DELAY_MS);
    for (const item of (items.results || []).slice(0, 10)) {
      if (colorMap.size >= MAX_COLORS) break;
      try {
        const detail = await get(`https://api.mercadolibre.com/items/${item.id}?include_attributes=all`);
        if (detail.error) { await sleep(60); continue; }
        const colorAttr = (detail.attributes || []).find(a => a.id === 'COLOR');
        const color = normalizeColor(colorAttr?.value_name || '');
        const img = detail.pictures?.[0]?.url || detail.thumbnail || '';
        if (color && img && !colorMap.has(color)) {
          colorMap.set(color, img.replace('http://', 'https://'));
        }
        await sleep(70);
      } catch { /* ignora */ }
    }
  } catch { /* ignora */ }

  return Array.from(colorMap.entries()).map(([name, image]) => ({ name, image }));
}

function formatProduct(mlProd, category, colors, brandName) {
  const attrs  = mlProd.attributes || [];
  const brand  = attrs.find(a => a.id === 'BRAND')?.value_name || brandName;
  const pics   = (mlProd.pictures || [])
    .map(p => (p.url || p.secure_url || '').replace('http://', 'https://'))
    .filter(Boolean).slice(0, 6);
  const colorAttr = attrs.find(a => a.id === 'COLOR');
  const mainColor = normalizeColor(colorAttr?.value_name || '');
  const colorList = [...colors];
  if (mainColor && pics[0] && !colorList.find(c => c.name.toLowerCase() === mainColor.toLowerCase())) {
    colorList.unshift({ name: mainColor, image: pics[0] });
  }
  return {
    id:            `seph${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`,
    name:          (mlProd.name || '').trim(),
    brand,
    category,
    description:   (mlProd.short_description?.content || mlProd.name || '').substring(0, 500),
    image:         pics[0] || '',
    images:        pics,
    averageRating: 0,
    reviewCount:   0,
    prices:        [],
    tags:          [brand.toLowerCase(), category.toLowerCase()].filter(Boolean),
    colors:        colorList,
    mlId:          mlProd.id || mlProd.catalog_product_id || '',
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Sephora Brands Sync — CoScore × ML ===\n');

  // Obter token fresco
  console.log('Obtendo token ML...');
  const tokenResp = await refreshToken();
  if (tokenResp.access_token) {
    TOKEN = tokenResp.access_token;
    console.log('Token obtido com sucesso.\n');
  } else {
    console.error('Erro ao obter token:', JSON.stringify(tokenResp));
    process.exit(1);
  }

  // Ler catalog.json atual
  let catalog;
  if (fs.existsSync(CATALOG_PATH)) {
    catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } else {
    // Reconstruir de products.ts se não existir
    console.log('catalog.json não encontrado, reconstruindo de products.ts...');
    catalog = { version: '1.0', products: [] };
  }

  const products = catalog.products || [];
  const seenMlIds = new Set(products.map(p => p.mlId).filter(Boolean));
  const seenNames = new Set(
    products.map(p => `${normalizeName(p.name)}||${(p.brand||'').toLowerCase().trim()}`)
  );

  console.log(`Catálogo atual: ${products.length} produtos`);

  const newProducts = [];
  let totalSkipped = 0;
  let saveCounter = 0;

  for (const [brandName, config] of Object.entries(BRANDS)) {
    let brandNew = 0;
    console.log(`\n🏷  Marca: ${brandName}`);

    for (const query of config.queries) {
      process.stdout.write(`  🔍 "${query}"... `);
      const perPage = 50;
      const pages = Math.ceil(config.maxPerQuery / perPage);
      let qNew = 0;

      for (let page = 0; page < pages; page++) {
        const url = `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(query)}&limit=${perPage}&offset=${page * perPage}`;
        const data = await get(url);
        const items = data.results || [];

        for (const item of items) {
          const mlId = item.id || item.catalog_product_id;
          if (!mlId || seenMlIds.has(mlId)) { totalSkipped++; continue; }

          // Verificar marca
          const itemBrand = ((item.attributes || []).find(a => a.id === 'BRAND')?.value_name || '').toLowerCase();
          const brandLower = brandName.toLowerCase()
            .replace(/cosmetics|beauty|professional|collection|hair care|backstage/gi, '')
            .replace(/[·''&]/g, '').replace(/\s+/g, ' ').trim();
          if (itemBrand && !itemBrand.includes(brandLower.split(' ')[0]) && !brandLower.includes(itemBrand.split(' ')[0])) {
            totalSkipped++;
            continue;
          }

          const category = categorize(item);
          if (!category || category === 'Outros') { totalSkipped++; continue; }

          const nameKey = `${normalizeName(item.name || '')}||${itemBrand}`;
          if (seenNames.has(nameKey)) { totalSkipped++; continue; }

          seenMlIds.add(mlId);
          seenNames.add(nameKey);

          let colors = [];
          if (config.colorCategories && COLOR_CATEGORIES.has(category)) {
            colors = await fetchColors(mlId);
            await sleep(80);
          }

          newProducts.push(formatProduct(item, category, colors, brandName));
          qNew++;
          brandNew++;
          saveCounter++;

          // Salvar a cada 50 produtos novos
          if (saveCounter % SAVE_EVERY === 0) {
            const partial = { ...catalog, products: [...products, ...newProducts], lastSync: new Date().toISOString() };
            fs.writeFileSync(CATALOG_PATH, JSON.stringify(partial, null, 2), 'utf8');
            console.log(`\n  💾 Checkpoint: ${newProducts.length} novos produtos salvos`);
          }
        }

        if (items.length < perPage) break;
        await sleep(DELAY_MS);
      }

      console.log(`${qNew} novos`);
      await sleep(100);
    }

    console.log(`  → ${brandNew} novos para ${brandName}`);
  }

  // Salvar final
  const final = {
    ...catalog,
    products: [...products, ...newProducts],
    totalProducts: products.length + newProducts.length,
    lastSync: new Date().toISOString(),
  };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(final, null, 2), 'utf8');

  console.log('\n=== Resultado Final ===');
  console.log(`Novos produtos: ${newProducts.length}`);
  console.log(`Duplicatas ignoradas: ${totalSkipped}`);
  console.log(`Total no catálogo: ${final.totalProducts}`);

  const brandCounts = {};
  for (const p of newProducts) {
    brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
  }
  console.log('\nNovos por marca:');
  for (const [b, n] of Object.entries(brandCounts).sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${b}`);
  }
  console.log('\n⚡ Próximo: node scripts/export-catalog.js');
}

main().catch(err => { console.error('ERRO:', err); process.exit(1); });
