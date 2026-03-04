const fs = require('fs');
const path = require('path');

// Load catalog
const catalogPath = 'scripts/output/catalog.json';
const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const catalog = catalogData.products || catalogData;

// Color/shade words that should not appear standalone in product names
// These are generic color words or shade names, NOT brand product line names
const SHADE_PATTERNS = [
  // English shade names (standalone words)
  /\bmango\b/i,
  /\bnude\b/i,
  /\bcoral\b/i,
  /\bberry\b/i,
  /\bplum\b/i,
  /\bscarlet\b/i,
  /\bwine\b/i,
  /\bmauve\b/i,
  /\bpeach\b/i,
  /\bcaramel\b/i,
  /\btoffee\b/i,
  /\bmocha\b/i,
  /\blatte\b/i,
  /\btaupe\b/i,
  /\blilac\b/i,
  /\bmint\b/i,
  /\bteal\b/i,
  /\bespresso\b/i,
  /\bcherry\b/i,
  /\bguava\b/i,
  /\bbordô\b/i,
  // Portuguese shade names
  /\bcanela\b/i,
  /\bbaunilha\b/i,
  /\bameixa\b/i,
  /\bmorango\b/i,
  /\bframboesa\b/i,
  // Shade number patterns like "N01", "01 Nude", "Tom 01"
  /\b(tom|shade|cor|n[°º]?)\s*\d+\b/i,
  /\b\d+\s*(nude|coral|rose|berry|brown|tan)\b/i,
];

// Known product line names that contain color-like words but ARE the real name
const WHITELIST_NAMES = [
  /bronze\s*goddess/i,
  /honey\s*drop/i,
  /black\s*opium/i,
  /miss\s*dior/i,
  /la\s*vie\s*est\s*belle/i,
  /good\s*girl/i,
  /cherry\s*blossom/i,
  /rose\s*gold\s*(collection|edition)/i,
];

function isWhitelisted(name) {
  return WHITELIST_NAMES.some(p => p.test(name));
}

function findColorInName(product) {
  if (isWhitelisted(product.name)) return null;
  
  for (const pattern of SHADE_PATTERNS) {
    if (pattern.test(product.name)) {
      return pattern.toString();
    }
  }
  
  // Also check: if product has colors array and a color name appears in product name
  if (product.colors && product.colors.length > 0) {
    const productNameLower = product.name.toLowerCase();
    for (const color of product.colors) {
      const colorName = (color.name || '').toLowerCase().trim();
      if (colorName.length >= 3 && productNameLower.includes(colorName)) {
        // Make sure it's a word boundary match
        const escaped = colorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(product.name)) {
          return `color-match: "${color.name}"`;
        }
      }
    }
  }
  
  return null;
}

// Categories where color names in product names are expected/OK
const SKIP_CATEGORIES = ['Perfume Feminino', 'Perfume Masculino'];

const issues = [];
for (const product of catalog) {
  if (SKIP_CATEGORIES.includes(product.category)) continue;
  
  const match = findColorInName(product);
  if (match) {
    issues.push({ 
      id: product.id, 
      name: product.name, 
      category: product.category,
      brand: product.brand,
      match,
      colors: (product.colors || []).map(c => c.name).join(', ')
    });
  }
}

console.log(`Found ${issues.length} products with possible color in name:\n`);
issues.forEach(p => {
  console.log(`[${p.category}] ${p.name}`);
  console.log(`  Match: ${p.match}`);
  if (p.colors) console.log(`  Colors: ${p.colors}`);
  console.log();
});

// Write a fix script
const toFix = issues.filter(p => p.match.startsWith('color-match'));

console.log(`\n${toFix.length} products need name cleaning (color name found in both name and colors array)`);

// Auto-fix: remove trailing color name from product name
let fixCount = 0;
for (const product of catalog) {
  if (SKIP_CATEGORIES.includes(product.category)) continue;
  if (!product.colors || product.colors.length === 0) continue;
  
  let newName = product.name;
  for (const color of product.colors) {
    const colorName = (color.name || '').trim();
    if (colorName.length < 3) continue;
    
    const escaped = colorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Remove color name from the END of the product name
    const trailingPattern = new RegExp(`\\s*[-–—,]?\\s*${escaped}\\s*$`, 'i');
    const leadingPattern = new RegExp(`^\\s*${escaped}\\s*[-–—,]?\\s*`, 'i');
    
    if (trailingPattern.test(newName)) {
      newName = newName.replace(trailingPattern, '').trim();
    } else if (leadingPattern.test(newName)) {
      newName = newName.replace(leadingPattern, '').trim();
    }
  }
  
  // Also apply SHADE_PATTERNS
  if (!isWhitelisted(product.name)) {
    for (const pattern of SHADE_PATTERNS) {
      if (pattern.test(newName)) {
        // Remove the shade word from the end
        newName = newName.replace(new RegExp(`\\s*[-–—,]?\\s*${pattern.source}\\s*$`, 'i'), '').trim();
        newName = newName.replace(new RegExp(`^\\s*${pattern.source}\\s*[-–—,]?\\s*`, 'i'), '').trim();
      }
    }
  }
  
  if (newName !== product.name && newName.length > 5) {
    console.log(`FIX: "${product.name}" -> "${newName}"`);
    product.name = newName;
    fixCount++;
  }
}

if (fixCount > 0) {
  fs.writeFileSync(catalogPath, JSON.stringify(catalogData, null, 2), 'utf8');
  console.log(`\nFixed ${fixCount} product names in catalog.json`);
  console.log('Run: node scripts/export-catalog.js to update products.ts');
} else {
  console.log('\nNo automatic fixes applied.');
}
