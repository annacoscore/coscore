/**
 * Enriquece os produtos de pó solto recém adicionados com variações de cor.
 * node scripts/enrich-po-solto-colors.js
 */
const fs = require('fs');
const { fetchColorVariants } = require('./lib/fetch-colors');

const TOKEN = 'APP_USR-1664631224999083-030312-f10c634374533b2d59777a1ec2b5e09c-3238361303';

// IDs dos produtos adicionados (os que têm mlId nos dados)
const PO_SOLTO_ML_IDS = [
  { mlId: 'MLB27284760', name: 'Pó Solto Translúcido', brand: 'Playboy' },
  { mlId: 'MLB59127552', name: 'Pó Solto Grande 30gr', brand: 'Mon Tom' },
  { mlId: 'MLB64557780', name: 'Pó Solto Facial Phoera', brand: 'Phoera' },
  { mlId: 'MLB36160066', name: 'Pó Solto Facial Translúcido', brand: 'Fenzza' },
  { mlId: 'MLB63302733', name: 'Pó Solto bareMinerals', brand: 'bareMinerals' },
  { mlId: 'MLB23509301', name: 'Pó Solto Facial Vegano Mahav', brand: 'MaHav' },
  { mlId: 'MLB35368987', name: 'Pó Solto Kit Vizzela', brand: 'Vizzela' },
  { mlId: 'MLB23520069', name: 'Pó Solto Facial Fand', brand: 'Fand' },
  { mlId: 'MLB29422711', name: 'Pó Solto Facial Bauny', brand: 'Bauny' },
  { mlId: 'MLB64632835', name: 'Pó Solto Matte Payot', brand: 'Payot' },
  { mlId: 'MLB35489030', name: 'Kit Pó Solto Vizzela', brand: 'Vizzela' },
  { mlId: 'MLB35202197', name: 'Kit Pó Solto Vizzela', brand: 'Vizzela' },
  { mlId: 'MLB22265873', name: 'BT Skinpowder Bruna Tavares', brand: 'Bruna Tavares' },
  { mlId: 'MLB46261010', name: 'Pó Solto Loose Florelle', brand: 'Florelle' },
  { mlId: 'MLB62809105', name: 'Kit Pó Banana Translúcido', brand: 'Phállebeauty' },
  { mlId: 'MLB26826908', name: 'Pó Solto Matte Invisível', brand: 'Catrice' },
  { mlId: 'MLB26826923', name: 'Pó Solto Light Sand', brand: 'Flormar' },
  { mlId: 'MLB23661081', name: 'Pó Solto Premium', brand: 'Florenza' },
  { mlId: 'MLB23199012', name: 'Pó Solto Facial Alice Salazar', brand: 'Alice Salazar' },
];

async function main() {
  const filePath = 'src/data/products.ts';
  let content = fs.readFileSync(filePath, 'utf8');

  console.log(`\nEnriquecendo cores de ${PO_SOLTO_ML_IDS.length} produtos de Pó Solto...\n`);

  let totalUpdated = 0;

  for (const { mlId, name, brand } of PO_SOLTO_ML_IDS) {
    // Localizar o produto no arquivo pelo mlId
    const mlIdIdx = content.indexOf(`"${mlId}"`);
    if (mlIdIdx === -1) {
      // tenta pelo ID numérico (MLB27284760 → 27284760)
      const numId = mlId.replace('MLB', '');
      const altIdx = content.indexOf(`"p${numId}`);
      if (altIdx === -1) {
        console.log(`  NAO ENCONTRADO: ${mlId} (${name})`);
        continue;
      }
    }

    try {
      console.log(`  Buscando cores: ${brand} — ${name}...`);
      const colors = await fetchColorVariants(TOKEN, mlId, name, brand);

      if (colors.length === 0) {
        console.log(`    sem cores encontradas`);
        continue;
      }

      console.log(`    ${colors.length} cores: ${colors.map(c => c.name).join(', ')}`);

      // Substituir o bloco "colors": [...] no produto correspondente
      // Localizar o produto pelo mlId (pode estar como valor de "mlId" ou como parte do id)
      let searchStr = `"${mlId}"`;
      let idx = content.indexOf(searchStr);
      if (idx === -1) {
        const numId = mlId.replace('MLB', '');
        searchStr = `"p${numId}`;
        idx = content.indexOf(searchStr);
      }
      if (idx === -1) continue;

      // Encontrar o objeto completo (do { ao })
      const blockStart = content.lastIndexOf('\n{', idx) + 1 ||
                         content.lastIndexOf('\n  {', idx) + 1;
      let depth = 0, i = blockStart;
      while (i < content.length) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') { depth--; if (depth === 0) break; }
        i++;
      }
      const block = content.slice(blockStart, i + 1);

      // Substituir o campo colors no bloco
      const colorsJson = JSON.stringify(colors, null, 2)
        .split('\n').map((l, j) => j === 0 ? l : '    ' + l).join('\n');

      let newBlock;
      if (block.includes('"colors":')) {
        // Substituir colors existente
        newBlock = block.replace(/"colors":\s*\[[^\]]*\]/s, `"colors": ${colorsJson}`);
      } else {
        // Inserir antes de "averageRating"
        newBlock = block.replace(
          /"averageRating":/,
          `"colors": ${colorsJson},\n  "averageRating":`
        );
      }

      if (newBlock !== block) {
        content = content.slice(0, blockStart) + newBlock + content.slice(i + 1);
        totalUpdated++;
      }
    } catch (e) {
      console.log(`    ERRO: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`\n✓ ${totalUpdated} produtos atualizados com variações de cor.`);
}

main().catch(console.error);
