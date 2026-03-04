const c = require('./output/catalog.json');
const products = c.products || c;
const arr = Array.isArray(products) ? products : Object.values(products);
console.log('Total produtos:', arr.length);
const withMlId = arr.filter(p => p.mlId);
console.log('Com mlId:', withMlId.length);
if (withMlId[0]) {
  const p = withMlId[0];
  console.log('Exemplo:', JSON.stringify({ id: p.id, name: p.name?.slice(0,40), mlId: p.mlId, brand: p.brand, colors: p.colors?.slice(0,2) }, null, 2));
}
