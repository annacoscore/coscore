const https = require('https');

const CLIENT_ID     = '1664631224999083';
const CLIENT_SECRET = 'Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
const BASE          = 'https://api.mercadolibre.com';

async function apiCall(url, token) {
  return new Promise(resolve => {
    const req = https.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept': 'application/json',
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d.slice(0, 200) }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, data: {} }); });
    req.on('error', e => resolve({ status: 0, data: e.message }));
  });
}

async function postForm(url, body) {
  return new Promise(resolve => {
    const data = Buffer.from(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length,
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve({ error: d.slice(0, 200) }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', e => resolve({ error: e.message }));
    req.write(data);
    req.end();
  });
}

async function main() {
  // 1. Obter token client_credentials
  console.log('1. Obtendo token client_credentials...');
  const tokenData = await postForm(`${BASE}/oauth/token`,
    `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`
  );
  
  if (!tokenData.access_token) {
    console.log('ERRO token:', JSON.stringify(tokenData));
    return;
  }
  const token = tokenData.access_token;
  console.log('Token OK, expira em:', tokenData.expires_in, 's');

  // 2. Testar /products/{mlId} com buy_box
  const mlId = 'MLB23142476'; // exemplo
  console.log('\n2. Produto /products/' + mlId + '...');
  const prod = await apiCall(`${BASE}/products/${mlId}?include_attributes=all`, token);
  console.log('Status:', prod.status);
  if (prod.data && typeof prod.data === 'object') {
    console.log('Nome:', prod.data.name);
    console.log('buy_box_winner:', JSON.stringify(prod.data.buy_box_winner)?.slice(0,200));
    console.log('domain_id:', prod.data.domain_id);
    console.log('catalog_product_id:', prod.data.catalog_product_id);
    console.log('children_ids length:', prod.data.children_ids?.length);
  }

  // 3. Testar /sites/MLB/search?catalog_product_id (marketplace)
  console.log('\n3. /sites/MLB/search?catalog_product_id=' + mlId + '...');
  const search1 = await apiCall(
    `${BASE}/sites/MLB/search?catalog_product_id=${mlId}&sort=price_asc&limit=5`,
    token
  );
  console.log('Status:', search1.status);
  if (search1.data.results) {
    console.log('Resultados:', search1.data.results.length);
    const first = search1.data.results[0];
    if (first) {
      console.log('Primeiro: price=', first.price, '| seller=', first.seller?.nickname, '| permalink=', first.permalink?.slice(0,60));
    }
  } else {
    console.log('Resposta:', JSON.stringify(search1.data)?.slice(0,200));
  }
  
  // 4. Busca genérica por nome
  const q = encodeURIComponent('batom maybelline superstay');
  console.log('\n4. /sites/MLB/search?q=batom+maybelline+superstay...');
  const search2 = await apiCall(
    `${BASE}/sites/MLB/search?q=${q}&sort=price_asc&limit=5`,
    token
  );
  console.log('Status:', search2.status);
  if (search2.data.results) {
    console.log('Resultados:', search2.data.results.length);
    const first = search2.data.results[0];
    if (first) {
      console.log('Primeiro: price=', first.price, '| title=', first.title?.slice(0,50));
    }
  } else {
    console.log('Resposta:', JSON.stringify(search2.data)?.slice(0,200));
  }
}

main().catch(console.error);
