/**
 * brand-sync.js
 * Busca produtos das 10 marcas prioritárias no catálogo do ML,
 * inclui variações de cor e adiciona ao catalog.json sem duplicar.
 *
 * Uso: node scripts/brand-sync.js
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const TOKEN        = process.env.ML_ACCESS_TOKEN
                   || 'APP_USR-1664631224999083-030312-f10c634374533b2d59777a1ec2b5e09c-3238361303';
const CATALOG_PATH = path.join(__dirname, 'output', 'catalog.json');
const SAVE_EVERY   = 100;
const DELAY_MS     = 130;
const MAX_COLORS   = 18;

// ── Categorias que devem ter cores ────────────────────────────────────────────
const COLOR_CATEGORIES = new Set([
  'Batom', 'Base', 'Sombra', 'Blush', 'Iluminador', 'Corretivo',
  'Contorno/Bronzer', 'Gloss', 'Lápis Labial', 'Pó Facial', 'Delineador',
]);

// ── Mapeamento domain_id → Categoria CoScore ──────────────────────────────────
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
  'MLB-MICELLAR_WATERS':    'Tônico Facial',
  'MLB-FACE_CLEANSERS':     'Limpeza Facial',
  'MLB-FACE_MASKS':         'Máscara Facial',
  'MLB-FACE_EXFOLIANTS':    'Esfoliante',
  'MLB-EYE_CREAMS':         'Creme para Olhos',
  'MLB-PERFUMES':           'Perfume',
  'MLB-WOMEN_PERFUMES':     'Perfume',
  'MLB-MEN_PERFUMES':       'Perfume Homem',
  'MLB-SHAMPOOS':           'Shampoo',
  'MLB-MEN_SHAMPOOS':       'Cabelo Homem',
  'MLB-HAIR_CONDITIONERS':  'Condicionador',
  'MLB-HAIR_MASKS':         'Máscara Capilar',
  'MLB-HAIR_LEAVE_INS':     'Leave-in',
  'MLB-HAIR_OILS':          'Óleo Capilar',
  'MLB-HAIR_FINISHERS':     'Finalizador',
  'MLB-HAIR_DYES':          'Tintura',
};

// ── Queries por marca ─────────────────────────────────────────────────────────
const BRANDS = {
  'Maybelline': {
    queries: [
      'Maybelline base maquiagem', 'Maybelline batom labial', 'Maybelline mascara cilios rimel',
      'Maybelline sombra paleta', 'Maybelline corretivo concealer', 'Maybelline blush',
      'Maybelline delineador eyeliner', 'Maybelline gloss lip', 'Maybelline primer',
      'Maybelline contorno bronzer', 'Maybelline po facial', 'Maybelline lapis labial',
      'Maybelline skincare hidratante', 'Maybelline protetor solar',
    ],
    colorCategories: true,
    maxPerQuery: 200,
  },
  'Eudora': {
    queries: [
      'Eudora maquiagem base', 'Eudora batom labial', 'Eudora blush sombra',
      'Eudora perfume feminino', 'Eudora perfume masculino', 'Eudora hidratante corporal',
      'Eudora serum facial', 'Eudora protetor solar', 'Eudora limpeza facial',
      'Eudora corpo loção', 'Eudora niina secrets maquiagem', 'Eudora shampoo cabelo',
    ],
    colorCategories: true,
    maxPerQuery: 200,
  },
  'Natura': {
    queries: [
      'Natura hidratante corporal', 'Natura serum facial', 'Natura protetor solar',
      'Natura perfume feminino', 'Natura perfume masculino', 'Natura shampoo cabelo',
      'Natura condicionador', 'Natura mascara capilar', 'Natura maquiagem base',
      'Natura batom labial', 'Natura limpeza facial', 'Natura desodorante corporal',
      'Natura tônico facial', 'Natura esfoliante', 'Natura creme olhos',
    ],
    colorCategories: true,
    maxPerQuery: 200,
  },
  'MAC Cosmetics': {
    queries: [
      'MAC Cosmetics base maquiagem', 'MAC batom labial', 'MAC sombra olhos paleta',
      'MAC blush compacto', 'MAC delineador eyeliner', 'MAC primer facial',
      'MAC gloss lip', 'MAC corretivo concealer', 'MAC po facial',
      'MAC iluminador highlighter', 'MAC contorno bronzer', 'MAC mascara cilios',
      'MAC fixador spray', 'MAC pincel brush maquiagem',
    ],
    colorCategories: true,
    maxPerQuery: 200,
  },
  'Clinique': {
    queries: [
      'Clinique hidratante facial', 'Clinique serum vitamina c', 'Clinique limpeza facial',
      'Clinique protetor solar spf', 'Clinique base maquiagem', 'Clinique batom labial',
      'Clinique blush compacto', 'Clinique mascara cilios', 'Clinique creme olhos',
      'Clinique tonico facial', 'Clinique esfoliante', 'Clinique primer facial',
    ],
    colorCategories: true,
    maxPerQuery: 200,
  },
  'La Roche-Posay': {
    queries: [
      'La Roche Posay protetor solar', 'La Roche Posay hidratante facial',
      'La Roche Posay serum', 'La Roche Posay limpeza facial',
      'La Roche Posay tonico', 'La Roche Posay creme olhos',
      'La Roche Posay effaclar', 'La Roche Posay cicaplast',
      'La Roche Posay toleriane', 'La Roche Posay anthelios',
    ],
    colorCategories: false,
    maxPerQuery: 200,
  },
  "L'Oréal Paris": {
    queries: [
      'LOreal Paris base maquiagem', 'LOreal Paris batom labial', 'LOreal Paris mascara cilios',
      'LOreal Paris sombra paleta', 'LOreal Paris serum facial', 'LOreal Paris hidratante',
      'LOreal Paris protetor solar', 'LOreal Paris shampoo cabelo', 'LOreal Paris condicionador',
      'LOreal Paris tintura coloracao', 'LOreal Paris delineador', 'LOreal Paris primer',
      'LOreal Paris po facial', 'LOreal Paris blush', 'LOreal Paris corretivo',
      'LOreal Paris gloss labial', 'LOreal Paris contorno bronzer', 'LOreal Paris limpeza facial',
    ],
    colorCategories: true,
    maxPerQuery: 200,
  },
  'Cetaphil': {
    queries: [
      'Cetaphil hidratante pele', 'Cetaphil limpeza facial', 'Cetaphil sabonete suave',
      'Cetaphil protetor solar', 'Cetaphil serum facial', 'Cetaphil tonico',
      'Cetaphil loção corporal', 'Cetaphil creme', 'Cetaphil gel',
    ],
    colorCategories: false,
    maxPerQuery: 200,
  },
  'Ruby Rose': {
    queries: [
      'Ruby Rose base maquiagem', 'Ruby Rose batom labial', 'Ruby Rose sombra paleta',
      'Ruby Rose blush compacto', 'Ruby Rose primer', 'Ruby Rose delineador',
      'Ruby Rose mascara cilios', 'Ruby Rose gloss labial', 'Ruby Rose corretivo',
      'Ruby Rose iluminador', 'Ruby Rose contorno bronzer', 'Ruby Rose po facial',
      'Ruby Rose lapis labial', 'Ruby Rose fixador spray', 'Ruby Rose pincel esponja',
    ],
    colorCategories: true,
    maxPerQuery: 200,
  },
  'Principia': {
    queries: [
      'Principia serum facial', 'Principia hidratante', 'Principia vitamina c',
      'Principia retinol', 'Principia acido hialuronico', 'Principia protetor solar',
      'Principia limpeza facial', 'Principia esfoliante', 'Principia tonico',
    ],
    colorCategories: false,
    maxPerQuery: 200,
  },
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

const JUNK_COLORS = new Set([
  'sem cor','único','única','unica','unico','outro','outros','multicolor',
  'multicor','não se aplica','nao se aplica','','transparente','color','única cor','neutra',
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
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim().slice(0, 60);
}

function categorize(prod, fallback) {
  if (prod.domain_id && DOMAIN_TO_CATEGORY[prod.domain_id]) {
    return DOMAIN_TO_CATEGORY[prod.domain_id];
  }
  return fallback || 'Outros';
}

function inferFallbackCategory(productName) {
  const n = productName.toLowerCase();
  if (/\bbatom\b/.test(n)) return 'Batom';
  if (/\bgloss\b|\bbrilho labial\b/.test(n)) return 'Gloss';
  if (/\blapis labial\b|\blip liner\b/.test(n)) return 'Lápis Labial';
  if (/\bbase\b/.test(n)) return 'Base';
  if (/\bcorretivo\b|\bconcealer\b/.test(n)) return 'Corretivo';
  if (/\bpo facial\b|\bpó facial\b|\bpó solto\b/.test(n)) return 'Pó Facial';
  if (/\bprimer\b/.test(n)) return 'Primer';
  if (/\bfixador\b|\bsetting spray\b/.test(n)) return 'Fixador de Maquiagem';
  if (/\brimel\b|\bmascara de cilios\b|\brímel\b|\bmáscara de cílios\b/.test(n)) return 'Máscara de Cílios';
  if (/\bsombra\b|\bpaleta\b/.test(n)) return 'Sombra';
  if (/\bdelineador\b|\beyeliner\b/.test(n)) return 'Delineador';
  if (/\bblush\b/.test(n)) return 'Blush';
  if (/\biluminador\b|\bhighlighter\b/.test(n)) return 'Iluminador';
  if (/\bcontorno\b|\bbronzer\b|\bbronzeador\b/.test(n)) return 'Contorno/Bronzer';
  if (/\bpincel\b|\besponja\b|\bblender\b/.test(n)) return 'Esponjas e Pincéis';
  if (/\bserum\b|\bsérum\b/.test(n)) return 'Sérum';
  if (/\bhidratante\b/.test(n)) return 'Hidratante';
  if (/\bprotetor solar\b|\bsunscreen\b|\bfps\b|\bspf\b/.test(n)) return 'Protetor Solar';
  if (/\btonico\b|\btônico\b|\bagua micelar\b/.test(n)) return 'Tônico Facial';
  if (/\blimpeza facial\b|\bsabonete facial\b|\bdemaquilante\b/.test(n)) return 'Limpeza Facial';
  if (/\bmascara facial\b|\bargila\b|\bsheet mask\b/.test(n)) return 'Máscara Facial';
  if (/\besfoliante\b|\bpeeling\b|\bscrub\b/.test(n)) return 'Esfoliante';
  if (/\bcreme.*olhos\b|\beye cream\b/.test(n)) return 'Creme para Olhos';
  if (/\bperfume\b|\bcolonia\b|\bcolônia\b|\beau de\b|\bdeo parfum\b/.test(n)) return 'Perfume';
  if (/\bshampoo\b/.test(n)) return 'Shampoo';
  if (/\bcondicionador\b/.test(n)) return 'Condicionador';
  if (/\bmascara capilar\b|\bcreme capilar\b/.test(n)) return 'Máscara Capilar';
  if (/\bleave.in\b/.test(n)) return 'Leave-in';
  if (/\boleo capilar\b|\bóleo capilar\b/.test(n)) return 'Óleo Capilar';
  if (/\bfinalizador\b|\banti.frizz\b|\bmodelador\b/.test(n)) return 'Finalizador';
  if (/\btintura\b|\bcoloracao\b|\bcoloração\b/.test(n)) return 'Tintura';
  return null;
}

// Busca cores via catalog_product_id
async function fetchColors(mlId, productName) {
  const colorMap = new Map();

  // Estratégia 1: produto catálogo
  try {
    const prod = await get(`https://api.mercadolibre.com/products/${mlId}`);
    if (!prod.error) {
      const colorAttr = (prod.attributes || []).find(a => a.id === 'COLOR');
      const color = normalizeColor(colorAttr?.value_name || '');
      const img   = prod.pictures?.[0]?.url || prod.pictures?.[0]?.secure_url || '';
      if (color && img) colorMap.set(color, img.replace('http://', 'https://'));
    }
    await sleep(80);
  } catch { /* ignora */ }

  // Estratégia 2: itens por catalog_product_id
  try {
    const items = await get(
      `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${mlId}&limit=20`
    );
    await sleep(DELAY_MS);
    for (const item of (items.results || []).slice(0, 12)) {
      if (colorMap.size >= MAX_COLORS) break;
      try {
        const detail = await get(
          `https://api.mercadolibre.com/items/${item.id}?include_attributes=all`
        );
        if (detail.error) { await sleep(60); continue; }
        const colorAttr = (detail.attributes || []).find(a => a.id === 'COLOR');
        const color = normalizeColor(colorAttr?.value_name || '');
        const img   = detail.pictures?.[0]?.url || detail.thumbnail || '';
        if (color && img && !colorMap.has(color)) {
          colorMap.set(color, img.replace('http://', 'https://'));
        }
        await sleep(70);
      } catch { /* ignora */ }
    }
  } catch { /* ignora */ }

  return Array.from(colorMap.entries()).map(([name, image]) => ({ name, image }));
}

function formatProduct(mlProd, category, colors) {
  const attrs  = mlProd.attributes || [];
  const brand  = attrs.find(a => a.id === 'BRAND')?.value_name || '';
  const ean    = attrs.find(a => a.id === 'EAN')?.value_name || '';
  const pics   = (mlProd.pictures || [])
    .map(p => (p.url || p.secure_url || '').replace('http://', 'https://'))
    .filter(Boolean).slice(0, 6);

  // Cor principal do catálogo
  const colorAttr = attrs.find(a => a.id === 'COLOR');
  const mainColor = normalizeColor(colorAttr?.value_name || '');
  const colorList = [...colors];
  if (mainColor && pics[0] && !colorList.find(c => c.name.toLowerCase() === mainColor.toLowerCase())) {
    colorList.unshift({ name: mainColor, image: pics[0] });
  }

  return {
    id:            `p${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`,
    name:          (mlProd.name || '').trim(),
    brand:         brand,
    category:      category,
    description:   (mlProd.short_description?.content || mlProd.name || '').substring(0, 500),
    image:         pics[0] || '',
    images:        pics,
    averageRating: 0,
    reviewCount:   0,
    prices:        [],
    tags:          [brand, category].filter(Boolean),
    colors:        colorList,
    mlId:          mlProd.id || mlProd.catalog_product_id || '',
    ean:           ean,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Brand Sync — CoScore × Mercado Livre ===\n');

  const catalog   = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products  = catalog.products;

  // Índices de deduplicação
  const seenMlIds   = new Set(products.map(p => p.mlId).filter(Boolean));
  const seenNames   = new Set(
    products.map(p => `${normalizeName(p.name)}||${(p.brand||'').toLowerCase().trim()}`)
  );

  console.log(`Catálogo atual: ${products.length} produtos`);
  console.log(`ML IDs indexados: ${seenMlIds.size}\n`);

  const newProducts = [];
  let totalFetched  = 0;
  let totalSkipped  = 0;

  for (const [brandName, config] of Object.entries(BRANDS)) {
    let brandNew = 0;
    console.log(`\n🏷️  Marca: ${brandName}`);

    for (const query of config.queries) {
      process.stdout.write(`  🔍 "${query}"... `);

      // Busca até 4 páginas de 50
      const perPage = 50;
      const pages   = Math.ceil(config.maxPerQuery / perPage);
      let qNew      = 0;

      for (let page = 0; page < pages; page++) {
        const url = `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(query)}&limit=${perPage}&offset=${page * perPage}`;
        const data = await get(url);
        const items = (data.results || []);

        for (const item of items) {
          const mlId = item.id || item.catalog_product_id;
          if (!mlId) continue;
          if (seenMlIds.has(mlId)) { totalSkipped++; continue; }

          // Verifica marca do produto
          const itemBrand = ((item.attributes || []).find(a => a.id === 'BRAND')?.value_name || '').toLowerCase();
          const brandLower = brandName.toLowerCase().replace(/['']/g, '').replace(/\s+/g, ' ');
          const brandCheck = brandLower.replace(/cosmetics/gi, '').replace(/paris/gi, '').trim();
          if (itemBrand && !itemBrand.includes(brandCheck) && !brandCheck.includes(itemBrand)) {
            totalSkipped++;
            continue;
          }

          // Categoria
          let category = categorize(item, null);
          if (!category) category = inferFallbackCategory(item.name || '');
          if (!category || category === 'Outros') { totalSkipped++; continue; }

          // Deduplicação por nome
          const nameKey = `${normalizeName(item.name || '')}||${itemBrand}`;
          if (seenNames.has(nameKey)) { totalSkipped++; continue; }

          seenMlIds.add(mlId);
          seenNames.add(nameKey);

          // Busca cores se categoria de cor
          let colors = [];
          if (config.colorCategories && COLOR_CATEGORIES.has(category)) {
            colors = await fetchColors(mlId, item.name || '');
            await sleep(80);
          }

          const product = formatProduct(item, category, colors);
          newProducts.push(product);
          qNew++;
          brandNew++;
          totalFetched++;
        }

        if (items.length < perPage) break;
        await sleep(DELAY_MS);
      }

      console.log(`${qNew} novos`);
      await sleep(100);
    }

    console.log(`  → ${brandNew} novos para ${brandName}`);

    // Salva progresso a cada marca
    if (newProducts.length > 0 && newProducts.length % SAVE_EVERY < 50) {
      const updated = { ...catalog, products: [...products, ...newProducts], lastSync: new Date().toISOString() };
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(updated, null, 2), 'utf8');
      console.log(`  💾 Progresso parcial salvo (${newProducts.length} novos até agora)`);
    }
  }

  // Salva final
  const finalCatalog = {
    ...catalog,
    products: [...products, ...newProducts],
    total: products.length + newProducts.length,
    lastSync: new Date().toISOString(),
  };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(finalCatalog, null, 2), 'utf8');

  console.log('\n=== Resultado ===');
  console.log(`Novos produtos adicionados: ${totalFetched}`);
  console.log(`Duplicatas ignoradas: ${totalSkipped}`);
  console.log(`Total no catálogo: ${finalCatalog.total}`);

  // Distribuição por marca
  const brandCounts = {};
  for (const p of newProducts) {
    const b = p.brand || 'Sem marca';
    brandCounts[b] = (brandCounts[b] || 0) + 1;
  }
  console.log('\nNovos por marca:');
  for (const [b, n] of Object.entries(brandCounts).sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${n.toString().padStart(4)}  ${b}`);
  }

  console.log('\n⚡ Próximo passo: node scripts/export-catalog.js');
}

main().catch(err => { console.error('ERRO:', err); process.exit(1); });
