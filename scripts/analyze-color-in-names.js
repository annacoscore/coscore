const fs = require('fs');

// Load products
const raw = fs.readFileSync('src/data/products.ts', 'utf8');
// Find the array start after "= ["
const marker = 'Product[] = [';
const startIdx = raw.indexOf(marker) + marker.length - 1;
const endIdx = raw.lastIndexOf(']');
if (startIdx < marker.length || endIdx === -1) { console.error('Could not find array in products.ts'); process.exit(1); }
const products = JSON.parse(raw.slice(startIdx, endIdx + 1));

// Comprehensive list of color/shade words that should NOT appear in product names
const COLOR_PATTERNS = [
  // English shade names
  /\bmango\b/i, /\bgoddess\b/i, /\bnude\b/i, /\bcoral\b/i, /\bberry\b/i, /\bplum\b/i,
  /\bscarlet\b/i, /\bcherry\b/i, /\bwine\b/i, /\bmauve\b/i, /\bpeach\b/i,
  /\bcaramel\b/i, /\btoffee\b/i, /\bmocha\b/i, /\bespresso\b/i, /\blatte\b/i,
  /\bhoney\b/i, /\bamber\b/i, /\bivory\b/i, /\btaupe\b/i, /\blilac\b/i,
  /\blavender\b/i, /\bmint\b/i, /\bteal\b/i, /\bsage\b/i,
  /\bmauve\b/i, /\brose\s+gold\b/i,
  // Portuguese shade names  
  /\bmaçã\b/i, /\bframboesa\b/i, /\bmorango\b/i, /\buva\b/i,
  /\bameixa\b/i, /\bcanela\b/i, /\bbaunilha\b/i, /\btiramissü\b/i,
  // Numbered shades like "01", "02", "#12", "shade 3" that are standalone 
  // Tone indicators
  /\btom\s+\d+\b/i, /\btom\s+[a-z]+\b/i,
  // Common marketing color names
  /\bvermelho\s+[a-z]+\b/i, /\brosa\s+[a-z]+\b/i,
];

// More targeted: look for products where the name contains color variation keywords
// that were supposed to be extracted
const suspicious = products.filter(p => {
  const name = p.name;
  return COLOR_PATTERNS.some(pattern => pattern.test(name));
});

console.log(`Total products: ${products.length}`);
console.log(`Products with possible color in name: ${suspicious.length}`);
console.log('\n--- Sample ---');
suspicious.slice(0, 50).forEach(p => {
  console.log(`[${p.category}] ${p.name}`);
  if (p.colors && p.colors.length > 0) {
    console.log(`  Colors: ${p.colors.map(c => c.name).join(', ')}`);
  }
});
