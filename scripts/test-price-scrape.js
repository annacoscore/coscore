const https = require('https');

async function mlGet(path, token) {
  return new Promise(resolve => {
    const req = https.get(`https://api.mercadolibre.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'CoScore/1.0' }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: {} }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, data: {} }); });
    req.on('error', () => resolve({ status: 0, data: {} }));
  });
}

async function test() {
  // 1. Obter client_credentials token
  const tokenRes = await new Promise(resolve => {
    const body = 'grant_type=client_credentials&client_id=1664631224999083&client_secret=Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
    const req = https.request({
      hostname: 'api.mercadolibre.com',
      path: '/oauth/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', () => resolve({}));
    req.write(body); req.end();
  });
  
  const token = tokenRes.access_token;
  console.log('Token:', token ? token.slice(0, 30) + '...' : 'FAILED');
  if (!token) return;
  
  // 2. Testar /products/search
  const q = encodeURIComponent('base maybelline fit me');
  const r1 = await mlGet(`/products/search?site_id=MLB&q=${q}&limit=5`, token);
  console.log('\n/products/search status:', r1.status);
  const firstProduct = r1.data?.results?.[0];
  if (firstProduct) {
    console.log('First product keys:', Object.keys(firstProduct).join(', '));
    console.log('buy_box_winner:', JSON.stringify(firstProduct.buy_box_winner)?.slice(0, 200));
    console.log('settings:', JSON.stringify(firstProduct.settings)?.slice(0, 200));
    const pid = firstProduct.id;
    console.log('Product ID:', pid);
    
    // 3. Testar /products/{id} para ver detalhes
    const r2 = await mlGet(`/products/${pid}`, token);
    console.log('\n/products/{id} status:', r2.status);
    if (r2.data) {
      console.log('Keys:', Object.keys(r2.data).join(', '));
      console.log('buy_box_winner:', JSON.stringify(r2.data.buy_box_winner)?.slice(0, 200));
      console.log('pdp_types:', JSON.stringify(r2.data.pdp_types)?.slice(0, 100));
      // children_ids
      const children = r2.data.children_ids || [];
      console.log('children count:', children.length, '| first 3:', children.slice(0,3).join(', '));
    }
    
    // 4. Testar /sites/MLB/search?catalog_product_id 
    const r3 = await mlGet(`/sites/MLB/search?catalog_product_id=${pid}&limit=3`, token);
    console.log('\n/sites/MLB/search?catalog_product_id status:', r3.status, '(403 = need OAuth)');
  }
}

test().catch(console.error);
