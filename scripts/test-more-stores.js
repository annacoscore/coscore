const https = require('https');
const http  = require('http');

function fetchPage(rawUrl, redirects = 0) {
  if (redirects > 4) return Promise.resolve({ status: 0, html: '' });
  return new Promise(resolve => {
    const u = new URL(rawUrl);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept-Encoding': 'identity',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : `${u.origin}${res.headers.location}`;
        return resolve(fetchPage(next, redirects + 1));
      }
      let d = ''; res.on('data', c => { if (d.length < 800000) d += c; });
      res.on('end', () => resolve({ status: res.statusCode, html: d }));
    });
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 0, html: '' }); });
    req.on('error', () => resolve({ status: 0, html: '' }));
  });
}

function tryExtractPrice(html) {
  // JSON-LD
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const price = data?.offers?.price || data?.offers?.lowPrice;
      if (price && parseFloat(price) > 0) return { price: parseFloat(price), method: 'JSON-LD' };
      if (Array.isArray(data?.offers)) {
        const p = data.offers[0]?.price;
        if (p && parseFloat(p) > 0) return { price: parseFloat(p), method: 'JSON-LD[]' };
      }
    } catch { }
  }
  
  // window.__STATE__ patterns
  const patterns = [
    { re: /"(?:price|selling_price|bestPrice|salePrice|salesPrice)"\s*:\s*(\d+(?:\.\d+)?)/, m: 'state.price' },
    { re: /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/, m: 'R$ pattern' },
  ];
  for (const { re, m } of patterns) {
    const match = html.match(re);
    if (match) {
      const raw = match[1].replace(/\./g, '').replace(',', '.');
      const price = parseFloat(raw);
      if (price > 0 && price < 10000) return { price, method: m };
    }
  }
  return null;
}

async function test(name, url) {
  process.stdout.write(`\n${name}: `);
  const { status, html } = await fetchPage(url);
  if (status === 0)   { console.log('TIMEOUT'); return; }
  if (status >= 400)  { console.log('HTTP ' + status); return; }
  const result = tryExtractPrice(html);
  if (result) console.log(`R$ ${result.price} (${result.method}) | ${(html.length/1024).toFixed(0)}KB`);
  else        console.log(`sem preço | ${status} | ${(html.length/1024).toFixed(0)}KB`);
}

const q = encodeURIComponent('batom maybelline');
async function main() {
  await test('Natura busca',      `https://www.natura.com.br/busca?q=${q}`);
  await test('O Boticario busca', `https://www.boticario.com.br/busca#q=${q}`);
  await test('Avon busca',        `https://www.avon.com.br/busca?q=${q}`);
  await test('MAC Cosmetics',     `https://www.maccosmetics.com.br/search?q=${q}`);
  await test('Renner busca',      `https://www.lojasrenner.com.br/pesquisa?term=${q}`);
  await test('Época Cosméticos',  `https://www.epocacosmeticos.com.br/${q}/p`);
  await test('Época busca',       `https://www.epocacosmeticos.com.br/?q=${q}`);
}

main().catch(console.error);
