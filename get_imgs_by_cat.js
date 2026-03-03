const fs = require("fs");
const content = fs.readFileSync("src/data/products.ts", "utf8");
// Find catalogProducts array - it ends before "export const products"
const start = content.indexOf("const catalogProducts: Product[] = [");
const end = content.indexOf("];\n\nexport const products:");
const block = content.slice(start, end);
const byCat = {};
const regex = /"category": "([^"]+)"[\s\S]*?"image": "(https[^"]+)"/g;
let m;
while ((m = regex.exec(block)) !== null) {
  const cat = m[1];
  const img = m[2];
  if (!byCat[cat]) byCat[cat] = [];
  if (byCat[cat].indexOf(img) === -1) byCat[cat].push(img);
}
// Fallbacks for categories not in catalog
const fallback = {
  "Perfume Homem": "Perfume",
  "Cabelo Homem": "Shampoo",
  "Esfoliante": "Sérum",
  "Creme para Olhos": "Sérum",
  "Limpeza Facial": "Hidratante",
  "Máscara Facial": "Hidratante",
  "Pó Facial": "Base",
  "Óleo Capilar": "Condicionador",
  "Finalizador": "Condicionador",
  "Tintura": "Shampoo",
  "Leave-in": "Condicionador",
  "Lápis Labial": "Batom",
  "Contorno": "Blush",
  "Brilho Labial": "Batom",
  "Delineador": "Máscara de Cílios",
  "Sombra": "Blush",
  "Esponjas e Pincéis": "Blush"
};
const full = { ...byCat };
for (const [cat, src] of Object.entries(fallback)) {
  if (!full[cat] && full[src]) full[cat] = full[src];
}
console.log(JSON.stringify(full, null, 0).slice(0, 5000));
