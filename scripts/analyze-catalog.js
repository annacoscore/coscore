const fs = require('fs');
const path = require('path');

// Ler catalog.json
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/catalog.json'), 'utf8'));
const products = raw.products || raw;

console.log('Total de produtos:', products.length);

// ── 1. Produtos sem imagem ────────────────────────────────────────────────────
const noImage = products.filter(p => !p.image || p.image === '');
console.log('\n[1] Sem imagem principal:', noImage.length);
noImage.slice(0, 10).forEach(p => console.log('   -', p.id, p.name?.slice(0,50), '|', p.category));

// ── 2. Produtos com "kit" no nome ─────────────────────────────────────────────
const kits = products.filter(p => /\bkit\b/i.test(p.name || ''));
console.log('\n[2] Produtos "kit":', kits.length);
kits.slice(0, 30).forEach(p => console.log('   -', p.id, '|', p.name?.slice(0,70)));

// ── 3. Possíveis duplicações (mesmo nome normalizado) ─────────────────────────
function normName(n) {
  return (n || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(tom|cor|shade|color|#\d+)\s+[\w\s]{1,20}/gi, '')
    .replace(/\b\d+[a-z]{0,2}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const byNorm = {};
for (const p of products) {
  const key = normName(p.name) + '|' + (p.brand || '').toLowerCase().trim();
  if (!byNorm[key]) byNorm[key] = [];
  byNorm[key].push(p);
}
const dupes = Object.values(byNorm).filter(arr => arr.length > 1);
console.log('\n[3] Grupos com possível duplicação:', dupes.length);
dupes.slice(0, 20).forEach(arr => {
  console.log(`   (${arr.length}x) "${arr[0].name?.slice(0,50)}" | ${arr[0].brand}`);
  arr.forEach(p => console.log(`        → ${p.id} | ${p.name?.slice(0,60)}`));
});

// ── 4. Produtos com imagem de domínio suspeito/quebrado ───────────────────────
const domainCount = {};
for (const p of products) {
  if (p.image) {
    try {
      const d = new URL(p.image).hostname;
      domainCount[d] = (domainCount[d] || 0) + 1;
    } catch { domainCount['INVALID'] = (domainCount['INVALID'] || 0) + 1; }
  }
}
console.log('\n[4] Domínios de imagem:');
Object.entries(domainCount).sort((a,b) => b[1]-a[1]).forEach(([d,c]) => console.log(`   ${d}: ${c}`));

// ── 5. Produtos com nome de cor ainda no nome ─────────────────────────────────
const colorInName = products.filter(p => {
  const n = (p.name || '').toLowerCase();
  return /\b(bege|nude|rosa|vermelho|coral|bronze|dourado|prateado|marrom|caramelo|areia|porcelana|mel|cafe|terra|pêssego|pessego|clara|escura|claro|escuro|ocre|salmao|salmão|natural|tom \d|tom [a-z]|shade \d|cor \d|\d{2,3}[wn])\b/.test(n);
});
console.log('\n[5] Produtos com possível cor no nome:', colorInName.length);
colorInName.slice(0, 15).forEach(p => console.log('   -', p.name?.slice(0,70)));

// ── 6. Produtos com palavras proibidas ────────────────────────────────────────
const forbidden = products.filter(p => {
  const n = (p.name || '').toLowerCase();
  return /\bkit\b|\bconjunto\b|\bcombinação\b|\bcombo\b|\b\d\s*(unid|pcs|un|peças)\b/.test(n);
});
console.log('\n[6] Produtos com "combo/conjunto/unid":', forbidden.length);
forbidden.slice(0, 15).forEach(p => console.log('   -', p.id, '|', p.name?.slice(0,70)));
