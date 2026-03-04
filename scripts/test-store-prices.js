/**
 * Testa se conseguimos extrair preços de lojas brasileiras via fetch server-side
 */
const https = require('https');
const http  = require('http');

function fetchPage(rawUrl, redirects = 0) {
  if (redirects > 5) return Promise.resolve({ status: 0, html: '' });
  return new Promise(resolve => {
    const u = new URL(rawUrl);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${u.origin}${res.headers.location}`;
        return resolve(fetchPage(next, redirects + 1));
      }
      let d = '';
      res.on('data', c => { if (d.length < 500000) d += c; });
      res.on('end', () => resolve({ status: res.statusCode, html: d }));
    });
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 0, html: '' }); });
    req.on('error', e => resolve({ status: 0, html: '' }));
  });
}

function extractPricesFromHTML(html, storeName) {
  const results = [];
  
  // JSON-LD structured data
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const price = data?.offers?.price || data?.offers?.lowPrice || data?.price;
      if (price && !isNaN(parseFloat(price))) {
        results.push({ method: 'JSON-LD', price: parseFloat(price), url: data?.offers?.url || data?.url });
      }
    } catch { /* ignora */ }
  }

  // Meta tags de preço
  const metaPrice = html.match(/content="([0-9]+[.,][0-9]+)"\s+(?:itemprop|property)="(?:price|og:price:amount)"/);
  if (metaPrice) results.push({ method: 'meta', price: parseFloat(metaPrice[1].replace(',', '.')) });

  // window.__STATE__ ou similar (Next.js/Nuxt)
  const stateMatch = html.match(/window\.__(?:STATE|NUXT|INITIAL_STATE)__\s*=\s*({[\s\S]*?})\s*;/);
  if (stateMatch) {
    try {
      const state = JSON.parse(stateMatch[1]);
      const str = JSON.stringify(state);
      const pm = str.match(/"(?:price|preco|valor)"\s*:\s*(\d+(?:\.\d+)?)/);
      if (pm) results.push({ method: '__STATE__', price: parseFloat(pm[1]) });
    } catch { /* ignora */ }
  }

  // Padrão genérico de preço BRL no HTML
  const brlPatterns = [
    /["']price["']\s*:\s*(\d+(?:\.\d+)?)/,
    /"selling_price"\s*:\s*(\d+(?:\.\d+)?)/,
    /"salesPrice"\s*:\s*(\d+(?:\.\d+)?)/,
    /"salePrice"\s*:\s*(\d+(?:\.\d+)?)/,
    /"bestPrice"\s*:\s*(\d+(?:\.\d+)?)/,
    /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/,
  ];
  for (const p of brlPatterns) {
    const match = html.match(p);
    if (match) {
      const raw = match[1].replace(/\./g, '').replace(',', '.');
      const price = parseFloat(raw);
      if (price > 0 && price < 10000) {
        results.push({ method: p.source.slice(0, 30), price });
        break;
      }
    }
  }
  
  return results;
}

async function testStore(name, url) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Loja: ${name}`);
  console.log(`URL:  ${url.slice(0, 80)}`);
  
  const { status, html } = await fetchPage(url);
  console.log(`HTTP: ${status} | HTML: ${(html.length/1024).toFixed(0)}KB`);
  
  if (status === 0) { console.log('TIMEOUT/ERRO'); return null; }
  if (status === 403) { console.log('BLOQUEADO (403)'); return null; }
  if (status === 404) { console.log('NOT FOUND (404)'); return null; }
  
  const prices = extractPricesFromHTML(html, name);
  if (prices.length > 0) {
    console.log('PREÇOS ENCONTRADOS:');
    prices.forEach(p => console.log(`  → R$ ${p.price} (${p.method})`));
    return prices[0].price;
  } else {
    console.log('Sem preço extraível');
    // Mostrar trecho útil
    const idx = html.indexOf('R$');
    if (idx > 0) console.log('  Contexto R$:', html.slice(idx-10, idx+50).replace(/\s+/g,' '));
    return null;
  }
}

async function main() {
  const product = 'batom maybelline superstay';
  const enc = encodeURIComponent(product);

  // Testar diferentes lojas
  await testStore('Beleza na Web (busca)', `https://www.belezanaweb.com.br/search?q=${enc}`);
  await testStore('Sephora BR (busca)', `https://www.sephora.com.br/search#q=${enc}&t=All`);
  await testStore('Amazon BR (busca)', `https://www.amazon.com.br/s?k=${enc}&i=beauty`);
  await testStore('Magazine Luiza (busca)', `https://www.magazineluiza.com.br/busca/${enc.replace(/%20/g,'+')}/?from=suggest`);
  await testStore('Drogasil (busca)', `https://www.drogasil.com.br/search?q=${enc}`);
  await testStore('Droga Raia (busca)', `https://www.drogaraia.com.br/search?q=${enc}`);
  await testStore('Americanas (busca)', `https://www.americanas.com.br/busca/${enc}`);
}

main().catch(console.error);
