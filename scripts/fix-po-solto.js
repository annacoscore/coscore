// Remove produto Casio (calculadora) e corrige marca Payot e nomes dos produtos de pó solto
const fs = require('fs');
let c = fs.readFileSync('src/data/products.ts', 'utf8');

// 1. Remover bloco do produto Casio
const casioMarker = 'Calculadora e estat';
const casioStart = c.lastIndexOf(casioMarker);
if (casioStart > -1) {
  // Achar início do objeto (abrindo { do produto)
  const blockStart = c.lastIndexOf('\n  {', casioStart);
  // Achar fechamento do objeto
  let depth = 0, i = blockStart;
  while (i < c.length) {
    if (c[i] === '{') depth++;
    else if (c[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  // remover o bloco e a vírgula antes dele
  const toRemove = c.slice(blockStart, i + 1);
  c = c.replace(',\n' + toRemove, '').replace(toRemove + ',\n', '');
  console.log('Removido produto Casio');
} else {
  console.log('Casio não encontrado');
}

// 2. Corrigir brand "Pó Solto Facial" → "Payot" para o produto Payot
c = c.replace(
  /"brand":\s*"Pó Solto Facial"([^}]*?"name":\s*"Pó Solto Facial Matte - Payot)/,
  '"brand": "Payot"$1'
);

// 3. Corrigir brand "Montoc" → "Mon Tom"
c = c.replace(/"brand":\s*"Montoc"/g, '"brand": "Mon Tom"');

fs.writeFileSync('src/data/products.ts', c, 'utf8');
console.log('Correções aplicadas.');
console.log('Tamanho final:', c.length);
