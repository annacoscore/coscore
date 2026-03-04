const https = require('https');

function fetchPage(url) {
  return new Promise(resolve => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchPage(res.headers.location));
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, html: d }));
    });
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 0, html: '' }); });
    req.on('error', () => resolve({ status: 0, html: '' }));
  });
}

// Testa extrair preco do HTML do ML de forma mais agressiva
async function main() {
  const { html } = await fetchPage('https://www.mercadolivre.com.br/p/MLB23142476');
  
  // Tentar extrair via __NEXT_DATA__ ou estado inicial
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      console.log('NEXT_DATA keys:', Object.keys(data).join(', '));
      const str = JSON.stringify(data);
      // Procurar price patterns
      const prices = [];
      const re = /"(?:price|amount|valor)"\s*:\s*(\d+(?:\.\d+)?)/g;
      let m;
      let count = 0;
      while ((m = re.exec(str)) !== null && count < 10) {
        prices.push(m[1]);
        count++;
      }
      console.log('Preços encontrados no NEXT_DATA:', prices);
    } catch(e) {
      console.log('NEXT_DATA parse error:', e.message);
    }
  } else {
    console.log('Sem __NEXT_DATA__');
  }

  // Procurar padrão "price_amount" no HTML
  const patterns = [
    /price_amount[^"]*"[^>]*>R?\$?\s*([\d.,]+)/,
    /"price":\{"currency":"BRL","amount":(\d+)/,
    /"amount":(\d+),"currency":"BRL"/,
    /andes-money-amount__fraction[^>]*>([\d.]+)/,
    /price-tag-fraction[^>]*>([\d.]+)/,
  ];
  
  for (const p of patterns) {
    const m = html.match(p);
    if (m) console.log('Pattern match:', p.source.slice(0,40), '->', m[1]);
  }

  // Ver contexto em volta de "amount"
  const idx = html.indexOf('"amount":');
  if (idx > 0) {
    console.log('\nContexto "amount":', html.slice(idx - 10, idx + 80));
  }
  
  // Ver contexto price_amount
  const idx2 = html.indexOf('price_amount');
  if (idx2 > 0) {
    console.log('\nContexto price_amount:', html.slice(idx2 - 5, idx2 + 100));
  }
}

main().catch(console.error);
