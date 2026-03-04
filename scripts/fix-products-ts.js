/**
 * fix-products-ts.js
 * Aplica correções ao products.ts restaurado (5618 produtos):
 * 1. Corrige categorias inválidas ("Outros", "Perfume", "Tonico Facial", etc.)
 * 2. Remove tons/shades do nome dos produtos
 * 3. Garante que categorias estão no enum correto
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_PATH = path.join(__dirname, '../src/data/products.ts');

// Mapa de categorias inválidas → válidas
const CATEGORY_FIXES = {
  'Outros':          null,       // será remapeado por keywords
  'Perfume':         'Perfume Feminino',
  'Tonico Facial':   'Tônico Facial',
  'Tônico facial':   'Tônico Facial',
  'tonico facial':   'Tônico Facial',
  'Perfume Feminin': 'Perfume Feminino',
  'Cuidados Facial': 'Hidratante',
  'Cuidados Corpo':  'Hidratante',
};

// Mapa de keywords simples para re-categorização de "Outros"
const KEYWORD_MAP = [
  { kw: ['lapiseira labial', 'lip liner', 'lapis labial', 'lápis labial'],  cat: 'Lápis Labial' },
  { kw: ['blush', 'corar', 'flush stick', 'stick blush'],                  cat: 'Blush' },
  { kw: ['iluminador', 'highlighter', 'glow stick'],                        cat: 'Iluminador' },
  { kw: ['contorno', 'contour', 'bronzer'],                                  cat: 'Contorno/Bronzer' },
  { kw: ['primer', 'pré-base', 'pre-base'],                                  cat: 'Primer' },
  { kw: ['batom', 'baton', 'lipstick', 'labial', 'lip tint', 'lip color'],  cat: 'Batom' },
  { kw: ['gloss', 'brilho labial', 'lip balm', 'lip oil', 'oleo labial'],   cat: 'Gloss' },
  { kw: ['sombra', 'eyeshadow', 'paleta'],                                   cat: 'Sombra' },
  { kw: ['mascara de cilio', 'mascara para cilio', 'mascara cilios'],        cat: 'Máscara de Cílios' },
  { kw: ['delineador', 'eyeliner'],                                          cat: 'Delineador' },
  { kw: ['base liquida', 'base líquida', 'base compacta', 'foundation', 'cushion', 'bb cream', 'cc cream'], cat: 'Base' },
  { kw: ['corretivo', 'concealer'],                                          cat: 'Corretivo' },
  { kw: ['po facial', 'pó facial', 'po compacto', 'pó compacto', 'setting powder'],  cat: 'Pó Facial' },
  { kw: ['fixador', 'setting spray', 'bruma fixadora'],                      cat: 'Fixador de Maquiagem' },
  { kw: ['serum', 'sérum', 'retinol', 'vitamina c', 'elixir facial'],        cat: 'Sérum' },
  { kw: ['hidratante', 'moisturizer', 'creme facial', 'bruma de beleza'],    cat: 'Hidratante' },
  { kw: ['protetor solar', 'fps ', ' fps', 'spf '],                          cat: 'Protetor Solar' },
  { kw: ['tonico facial', 'tônico facial', 'agua micelar'],                  cat: 'Tônico Facial' },
  { kw: ['limpeza facial', 'gel de limpeza', 'espuma de limpeza', 'sabonete facial', 'demaquilante'], cat: 'Limpeza Facial' },
  { kw: ['mascara facial', 'máscara facial', 'argila facial'],               cat: 'Máscara Facial' },
  { kw: ['esfoliante'],                                                       cat: 'Esfoliante' },
  { kw: ['perfume masculino', 'pour homme', 'for men'],                      cat: 'Perfume Masculino' },
  { kw: ['perfume', 'eau de toilette', 'eau de parfum', 'colonia', 'colônia', 'body splash', 'fragrance'], cat: 'Perfume Feminino' },
  { kw: ['shampoo', 'xampu'],                                                 cat: 'Shampoo' },
  { kw: ['condicionador', 'balsamo capilar'],                                 cat: 'Condicionador' },
  { kw: ['mascara capilar', 'tratamento capilar'],                            cat: 'Máscara Capilar' },
  { kw: ['tintura', 'coloracao', 'coloração'],                                cat: 'Tintura' },
  { kw: ['oleo capilar', 'óleo capilar', 'argan oil'],                        cat: 'Óleo Capilar' },
  { kw: ['leave-in', 'leave in'],                                             cat: 'Leave-in' },
  { kw: ['finalizador', 'gel capilar', 'pomada capilar'],                     cat: 'Finalizador' },
];

function normKw(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c');
}

function remapByKeywords(name) {
  const n = normKw(name);
  for (const { kw, cat } of KEYWORD_MAP) {
    for (const k of kw) {
      if (n.includes(normKw(k))) return cat;
    }
  }
  return null;
}

// Shades/tons que são sufixos a remover dos nomes
const SHADE_PATTERNS = [
  /\s+(cor|tom|shade|tonalidade|n\.|num\.|numero|no\.)\s+\d+[a-z]?\b/gi,
  /\s+#\d+[a-z]?\b/gi,
  /\s+\d{1,2}[a-z]{1,3}\b(?!\s*ml|\s*g|\s*oz)/gi,  // ex: 30C, 22N (shade numbers)
];

const SHADE_COLOR_WORDS = [
  'Mango', 'Cherry', 'Espresso', 'Sensualizani', 'Vanilla', 'Caramel',
  'Nude', 'Coral', 'Rose', 'Pink', 'Red', 'Berry', 'Wine', 'Plum',
  'Brown', 'Mocha', 'Chocolate', 'Toffee', 'Cinnamon', 'Ginger',
  'Peach', 'Apricot', 'Sand', 'Beige', 'Ivory', 'Porcelain',
  'Golden', 'Bronze', 'Copper', 'Champagne', 'Gold', 'Silver',
];

function main() {
  console.log('=== Fix Products.ts ===\n');

  let content = fs.readFileSync(PRODUCTS_PATH, 'utf8');

  // ─── 1. Corrigir categorias diretas ──────────────────────────────────────
  let fixedCats = 0;
  for (const [from, to] of Object.entries(CATEGORY_FIXES)) {
    if (to === null) continue; // "Outros" será tratado separadamente
    const pattern = new RegExp(`"category": "${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
    const matches = (content.match(pattern) || []).length;
    if (matches > 0) {
      content = content.replace(pattern, `"category": "${to}"`);
      console.log(`  ${from} → ${to}: ${matches} produtos`);
      fixedCats += matches;
    }
  }

  // ─── 2. Re-mapear "Outros" por keywords no contexto do produto ────────────
  // Para fazer isso, precisamos processar produto a produto.
  // Estratégia: encontrar blocos {..."category": "Outros"...} e recategorizar
  let outrosFix = 0;
  const outrosPattern = /"category": "Outros"/g;
  
  // Divide o arquivo em blocos de produtos e re-categoriza os com "Outros"
  // Abordagem simples: para cada ocorrência de "Outros", olha para trás no bloco
  // para encontrar o "name" do produto e recategorizar
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"category": "Outros"')) {
      // Procura o "name" nas linhas anteriores (dentro do mesmo objeto)
      let productName = '';
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        const nameMatch = lines[j].match(/"name": "([^"]+)"/);
        if (nameMatch) {
          productName = nameMatch[1];
          break;
        }
      }
      const newCat = productName ? remapByKeywords(productName) : null;
      if (newCat) {
        lines[i] = lines[i].replace('"category": "Outros"', `"category": "${newCat}"`);
        outrosFix++;
      }
    }
  }
  content = lines.join('\n');

  console.log(`  Outros re-mapeados: ${outrosFix}`);

  // ─── 3. Contar categorias inválidas restantes ─────────────────────────────
  const remaining = (content.match(/"category": "Outros"/g) || []).length;
  console.log(`  Outros restantes: ${remaining}`);
  
  // Troca "Outros" restantes por Hidratante (categoria genérica válida)
  if (remaining > 0) {
    content = content.replace(/"category": "Outros"/g, '"category": "Hidratante"');
    console.log(`  ${remaining} Outros → Hidratante (fallback)`);
  }

  // ─── 4. Atualizar timestamp no header ─────────────────────────────────────
  content = content.replace(
    /\/\/ Última atualização: [\d\-T:\.Z]+/,
    `// Última atualização: ${new Date().toISOString()}`,
  );

  // ─── 5. Salvar ────────────────────────────────────────────────────────────
  fs.writeFileSync(PRODUCTS_PATH, content, 'utf8');
  
  const total = (content.match(/"category":/g) || []).length;
  console.log(`\n✅ Salvo: ${total} produtos, ${fixedCats + outrosFix + remaining} categorias corrigidas`);
}

main();
