#!/usr/bin/env node
/**
 * Encontra produtos cujo nome principal contém variações de cor/tom
 * e sugere o nome limpo.
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output/catalog.json');
const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const catalog = Array.isArray(raw) ? raw : (raw.products || raw.data || Object.values(raw).find(Array.isArray) || []);

// Cores e tons conhecidos (inglês e português, nomes comuns em cosméticos)
const COLOR_PATTERNS = [
  // Frutas/comidas usadas como tom
  /\b(mango|manga|guava|goiaba|cherry|cereja|berry|morango|strawberry|peach|p[eê]ssego|coral|caramel|caramelo|vanilla|baunilha|chocolate|mocha|cappuccino|espresso|nude|caramel|honey|mel|rose|gold|dourado|silver|prata|bronze|tan|cobre|copper|sand|areia|ivory|marfim|latte|cafe|caf[eé]|choc|truffle|cinnamon|canela|chai|coco|coconut|almond|am[eê]ndoa|hazelnut|toffee|maple|rum|bourbon|cognac|plum|ameixa|mauve|wine|vinho|ruby|rubi|burgundy|bordeaux|bordeaux|cranberry|mulberry|cassis|hibiscus|pomegranate|papaya|mango|papaia)\b/i,
  // Nomes de personagens/deidades usados como tons
  /\b(goddess|divine|angel|venus|aurora|luna|solar|soleil|solaire|celestial|cosmic|galactic|stellar|nova|eclipse|sunset|sunrise|twilight|dusk|dawn|midnight|night|evening|daylight|radiant|glow|shimmer|glitter|sparkle|dazzle|dream|fantasy|magic|enchanted|enchanting|mystical|ethereal|celestial|divine|heavenly|sublime|luxe|elite|prestige|royale?|imperial|empress|queen|princess|goddess|muse|icon|legend|signature)\b/i,
  // Nomes de lugares/conceitos usados como tons  
  /\b(paris|milan|rome|london|tokyo|rio|sahara|amazon|tropicale?|mediterranean|caribbean|ibiza|havana|miami|bali|tahiti|hawaii|fiji|oahu|cancun|riviera|cannes|monaco|st\.?\s*tropez)\b/i,
  // Descritores de cor inglês comuns em nomes de cosméticos brasileiros
  /\b(red|pink|purple|violet|lilac|lavender|blue|teal|green|olive|brown|beige|tan|grey|gray|black|white|nude|blush|taupe|terracotta|terra\s*cotta|brick|rust|cognac|sienna|umber|ochre|amber|golden?|champagne|pearl|pearlescent|iridescent|metallic|matte|glossy|satin|shimmer|glitter)\b/i,
  // Números/códigos de tom no início ou fim do nome
  /\b(tom|shade|cor|color|n[o°]?\.?\s*\d+|\d+\s*[a-z]?)\s+(claro|escuro|medio|m[eé]dio|light|dark|medium|deep|fair|ultra)/i,
  // Padrões como "- Cor X" no final
  /[-–]\s*(cor|tom|shade|color)\s+\w+$/i,
];

// Categorias onde variações de cor são relevantes
const COLOR_CATEGORIES = new Set([
  'Batom', 'Base', 'Corretivo', 'Blush', 'Iluminador', 'Contorno/Bronzer',
  'Sombra', 'Máscara de Cílios', 'Primer', 'Pó Facial', 'Pó Solto',
  'Gloss', 'Lápis Labial', 'Delineador', 'Rímel', 'Esfoliante',
  'Perfume Feminino', 'Perfume Masculino'
]);

const results = [];

for (const p of catalog) {
  const name = p.name || '';
  const category = p.category || '';
  
  // Só categorias relevantes
  if (!COLOR_CATEGORIES.has(category)) continue;
  
  // Verificar se o nome tem padrão de cor
  const hasColorInName = COLOR_PATTERNS.some(re => re.test(name));
  if (!hasColorInName) continue;
  
  // Verificar se já tem variações de cor definidas
  const hasColors = p.colors && p.colors.length > 0;
  
  results.push({
    id: p.id,
    name,
    category,
    brand: p.brand,
    hasColors,
    colorCount: hasColors ? p.colors.length : 0,
  });
}

console.log(`\nTotal no catálogo: ${catalog.length}`);
console.log(`Produtos com possível cor no nome: ${results.length}\n`);

// Agrupar por categoria
const byCategory = {};
for (const r of results) {
  if (!byCategory[r.category]) byCategory[r.category] = [];
  byCategory[r.category].push(r);
}

for (const [cat, items] of Object.entries(byCategory)) {
  console.log(`\n=== ${cat} (${items.length}) ===`);
  for (const item of items) {
    const colorInfo = item.hasColors ? `[${item.colorCount} cores]` : '[SEM CORES]';
    console.log(`  ${colorInfo} ${item.name}`);
  }
}

// Salvar lista para o script de limpeza
const toFix = results.map(r => r.id);
fs.writeFileSync(path.join(__dirname, 'color-in-names-list.json'), JSON.stringify(toFix, null, 2));
console.log(`\nLista salva em color-in-names-list.json (${toFix.length} IDs)`);
