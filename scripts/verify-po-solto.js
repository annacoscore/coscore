const fs = require('fs');
const c = fs.readFileSync('src/data/products.ts','utf8');
const ids = ['MLB27284760','MLB59127552','MLB63302733','MLB23509301','MLB35368987','MLB26826908','MLB22265873','MLB64632835','MLB46261010','MLB35489030','MLB35202197','MLB23520069','MLB29422711','MLB23661081','MLB23199012'];
ids.forEach(id => {
  const idx = c.indexOf(id);
  if(idx === -1){ console.log('NAO ENCONTRADO:', id); return; }
  const block = c.slice(idx-600, idx+100);
  const nm = block.match(/"name":\s*"([^"]+)"/);
  const cat = block.match(/"category":\s*"([^"]+)"/);
  const brand = block.match(/"brand":\s*"([^"]+)"/);
  console.log('OK', id, '|', (cat?cat[1]:'?').padEnd(15), '|', (brand?brand[1]:'?').padEnd(20), '|', nm?nm[1].slice(0,45):'?');
});
