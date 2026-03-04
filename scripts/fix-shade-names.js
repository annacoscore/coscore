#!/usr/bin/env node
/**
 * Remove nomes de tons/sombras do título principal do produto.
 * Versão 2 — com proteção contra falsos positivos em português.
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'output/catalog.json');
const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const products = Array.isArray(raw) ? raw : (raw.products || []);

// Palavras protegidas: partes de termos comuns em cosméticos que NÃO são tons
const PROTECTED_WORDS = new Set([
  'sérum', 'serum', 'rímel', 'rimel', 'primer', 'glamour', 'perfume',
  'liphoney', 'caramel skin', 'toffee apple',
]);

// Tons específicos que aparecem nos nomes dos produtos
// Ordenados do mais específico para o mais genérico para evitar colisões
const SHADE_ENTRIES = [
  // Mari Maria Makeup — tons com "Maria X"
  { pattern: /\s*-\s*Maria Liz\b/i, shade: 'Maria Liz' },
  { pattern: /\s*-\s*Maria Luisa\b/i, shade: 'Maria Luisa' },
  { pattern: /\s*-\s*Maria Graça\b/i, shade: 'Maria Graça' },
  { pattern: /\s*-\s*Maria Beatriz\b/i, shade: 'Maria Beatriz' },
  { pattern: /\s*-\s*Maria Helena\b/i, shade: 'Maria Helena' },
  { pattern: /\s*-\s*Maria Isabel\b/i, shade: 'Maria Isabel' },
  { pattern: /\s*-\s*Maria Sofia\b/i, shade: 'Maria Sofia' },
  { pattern: /\s*-\s*Maria Claudia\b/i, shade: 'Maria Claudia' },
  { pattern: /\s*-\s*Maria Antonia\b/i, shade: 'Maria Antonia' },
  { pattern: /\s*-\s*Maria Isis\b/i, shade: 'Maria Isis' },
  { pattern: /\s*-\s*Maria Julia\b/i, shade: 'Maria Julia' },
  { pattern: /\s*-\s*Maria Eduarda\b/i, shade: 'Maria Eduarda' },
  { pattern: /\s*-\s*Maria Clara\b/i, shade: 'Maria Clara' },
  { pattern: /\s*-\s*Maria Valentina\b/i, shade: 'Maria Valentina' },
  // Mari Maria — outros tons
  { pattern: /\s*-\s*Mocha Mousse\b/i, shade: 'Mocha Mousse' },
  { pattern: /\s*-\s*Toffee Temptation\b/i, shade: 'Toffee Temptation' },
  { pattern: /\s*-\s*Cherry\b/i, shade: 'Cherry' },
  { pattern: /\s*-\s*Strawberry\b/i, shade: 'Strawberry' },
  { pattern: /\s*-\s*Chocolate\b/i, shade: 'Chocolate' },
  { pattern: /\s*-\s*Vanilla\b/i, shade: 'Vanilla' },
  { pattern: /\s*-\s*Baunilha\b/i, shade: 'Baunilha' },
  { pattern: /\s*-\s*Mango\b/i, shade: 'Mango' },
  { pattern: /\s*-\s*Manga\b/i, shade: 'Manga' },
  { pattern: /\s*-\s*Peach\b/i, shade: 'Peach' },
  { pattern: /\s*-\s*Pêssego\b/i, shade: 'Pêssego' },
  { pattern: /\s*-\s*Caramel\b/i, shade: 'Caramel' },
  { pattern: /\s*-\s*Caramelo\b/i, shade: 'Caramelo' },
  { pattern: /\s*-\s*Aurora\b/i, shade: 'Aurora' },
  { pattern: /\s*-\s*Merlot\b/i, shade: 'Merlot' },
  { pattern: /\s*-\s*Canela\b/i, shade: 'Canela' },
  { pattern: /\s*-\s*Amêndoa\b/i, shade: 'Amêndoa' },
  { pattern: /\s*-\s*Delicate\b/i, shade: 'Delicate' },
  // Fran By Franciny Ehlke — tons em CAPS
  { pattern: /\s+XOXO\s+/i, shade: 'XOXO', wordOnly: true },
  { pattern: /\s+DELICATE\s+/i, shade: 'DELICATE', wordOnly: true },
  { pattern: /\s+CLARICE\s+/i, shade: 'CLARICE', wordOnly: true },
  { pattern: /\s+SENSUALIZANI\s+/i, shade: 'SENSUALIZANI', wordOnly: true },
  // Outros padrões comuns "- Tom" no final
  { pattern: /\s*-\s*Goddess\b/i, shade: 'Goddess' },
  { pattern: /\s*-\s*Divine\b/i, shade: 'Divine' },
  { pattern: /\s*-\s*Havana\b/i, shade: 'Havana' },
  { pattern: /\s*-\s*Sahara\b/i, shade: 'Sahara' },
  { pattern: /\s*-\s*Coral\b/i, shade: 'Coral' },
  { pattern: /\s*-\s*Nude\b/i, shade: 'Nude' },
  { pattern: /\s*-\s*Plum\b/i, shade: 'Plum' },
  { pattern: /\s*-\s*Mauve\b/i, shade: 'Mauve' },
  // Tons de pó solto
  { pattern: /\s*-\s*Delicate\b/i, shade: 'Delicate' },
  // Iluminadores/Blush com tom no meio
  { pattern: /\s+Mango\s+/i, shade: 'Mango' },
  { pattern: /\s+Manga\s+/i, shade: 'Manga' },
  { pattern: /\s+Goddess\s+/i, shade: 'Goddess' },
  { pattern: /\s+Venus\b/i, shade: 'Venus' },
  { pattern: /\s+Latte\s+/i, shade: 'Latte', protected: 'latte' },
  { pattern: /\s+Espresso\s+/i, shade: 'Espresso' },
  // Sombras com ton no final após o nome do produto
  { pattern: /\s+Honey\s+/i, shade: 'Honey', protectIn: ['rímel', 'liphoney'] },
  // Contorno/Bronzer chocolate (ex: "Chocolate Soleil" do Too Faced)
  { pattern: /\s+Chocolate\s+/i, shade: 'Chocolate', skipIfBrand: ['too faced', 'avon', 'cocoa'] },
];

// Categorias onde faz sentido remover tons
const COLOR_CATS = new Set([
  'Batom', 'Base', 'Corretivo', 'Blush', 'Iluminador', 'Contorno/Bronzer',
  'Sombra', 'Gloss', 'Lápis Labial', 'Delineador', 'Pó Facial', 'Pó Solto',
  'Primer', 'Máscara de Cílios',
]);

let fixed = 0;

for (const p of products) {
  if (!COLOR_CATS.has(p.category)) continue;

  const originalName = p.name || '';
  let newName = originalName;

  for (const entry of SHADE_ENTRIES) {
    if (!entry.pattern.test(newName)) continue;

    const nameLower = newName.toLowerCase();

    // Verificar se o tom está numa palavra protegida
    if (entry.protectIn) {
      if (entry.protectIn.some(w => nameLower.includes(w))) continue;
    }
    // Verificar se a marca deve pular
    if (entry.skipIfBrand) {
      const brandLower = (p.brand || '').toLowerCase();
      if (entry.skipIfBrand.some(b => brandLower.includes(b) || nameLower.includes(b))) continue;
    }

    const candidate = newName.replace(entry.pattern, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s\-–,]+|[\s\-–,]+$/g, '').trim();

    // Não aceitar se o resultado ficou muito curto ou sem sentido
    if (candidate.length < 6) continue;

    newName = candidate;

    // Adicionar tom ao colors se ainda não tem
    if (!p.colors) p.colors = [];
    const alreadyHas = p.colors.some(c =>
      (c.name || '').toLowerCase() === entry.shade.toLowerCase()
    );
    if (!alreadyHas) {
      p.colors.push({ name: entry.shade, images: p.images ? [...p.images] : [] });
    }

    break; // aplicar apenas uma correção por produto por vez
  }

  if (newName !== originalName) {
    console.log(`[${p.category}] "${originalName}"`);
    console.log(`  → "${newName}"`);
    p.name = newName;
    fixed++;
  }
}

console.log(`\nCorrigidos: ${fixed}`);

// Atualizar catalog.json
if (Array.isArray(raw)) {
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(raw, null, 2), 'utf8');
} else {
  raw.products = products;
  raw.totalProducts = products.length;
  raw.lastSync = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(raw, null, 2), 'utf8');
}
console.log('catalog.json salvo.');
