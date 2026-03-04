const https = require('https');

function apiCall(url, token) {
  return new Promise(resolve => {
    const headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const req = https.get(url, { headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d.slice(0, 300) }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, data: 'timeout' }); });
    req.on('error', e => resolve({ status: 0, data: e.message }));
  });
}

async function main() {
  const BASE = 'https://api.mercadolibre.com';
  const q = encodeURIComponent('batom maybelline');

  // 1. Sem autenticação
  console.log('1. /sites/MLB/search sem token...');
  const r1 = await apiCall(`${BASE}/sites/MLB/search?q=${q}&sort=price_asc&limit=5`);
  console.log('Status:', r1.status);
  if (r1.data?.results?.length) {
    console.log('Resultados:', r1.data.results.length);
    const f = r1.data.results[0];
    console.log('Primeiro:', f.price, f.title?.slice(0,40));
  } else {
    console.log('Resposta:', JSON.stringify(r1.data)?.slice(0,200));
  }

  // 2. Endpoint de itens do produto via catalog
  console.log('\n2. /products/MLB23142476 sem token...');
  const r2 = await apiCall(`${BASE}/products/MLB23142476`);
  console.log('Status:', r2.status, 'buy_box:', r2.data?.buy_box_winner?.price);

  // 3. Endpoint alternativo: /sites/MLB/listing_types
  console.log('\n3. Items search via /highlights/MLB/category...');
  const r3 = await apiCall(`${BASE}/highlights/MLB/category/MLB5765?limit=5`);
  console.log('Status:', r3.status);
  if (r3.data?.results?.length) {
    const f = r3.data.results[0];
    console.log('Primeiro item id:', f.id);
    // Tentar buscar detalhes do item
    const r4 = await apiCall(`${BASE}/items/${f.id}`);
    console.log('Item status:', r4.status, 'price:', r4.data?.price);
  } else {
    console.log('Resposta:', JSON.stringify(r3.data)?.slice(0,200));
  }
  
  // 4. Tentar com APP_TOKEN o endpoint de busca (pode ser diferente de client_credentials)
  console.log('\n4. /items/search...');
  const r5 = await apiCall(`${BASE}/sites/MLB/search?q=${q}&limit=3&official_store_id=all`);
  console.log('Status:', r5.status, 'data:', JSON.stringify(r5.data)?.slice(0,200));
}

main().catch(console.error);
