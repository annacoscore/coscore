const fs = require('fs');
let c = fs.readFileSync('src/data/extra-products.ts', 'utf8');

// Replace all ,'Perfume', with ,'Perfume Feminino',
const before = (c.match(/,'Perfume',/g) || []).length;
c = c.replace(/,'Perfume',/g, ",'Perfume Feminino',");

// Also replace 'Perfume Homem' category if still present
const beforeH = (c.match(/,'Perfume Homem',/g) || []).length;
c = c.replace(/,'Perfume Homem',/g, ",'Perfume Masculino',");

fs.writeFileSync('src/data/extra-products.ts', c, 'utf8');

const fem = (c.match(/,'Perfume Feminino',/g) || []).length;
const masc = (c.match(/,'Perfume Masculino',/g) || []).length;
const remaining = (c.match(/,'Perfume',/g) || []).length;

console.log(`Fixed: ${before} Perfume -> Perfume Feminino, ${beforeH} Perfume Homem -> Perfume Masculino`);
console.log(`Result: ${fem} Feminino, ${masc} Masculino, ${remaining} still 'Perfume'`);
