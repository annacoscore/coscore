const https = require('https');

function fetchPage(rawUrl, redirects = 0) {
  if (redirects > 5) return Promise.resolve({ status: 0, html: '' });
  return new Promise(resolve => {
    const u = new URL(rawUrl);
    const req = https.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept-Encoding': 'identity',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : `https://www.amazon.com.br${res.headers.location}`;
        return resolve(fetchPage(next, redirects + 1));
      }
      let d = ''; res.on('data', c => { if (d.length < 1000000) d += c; });
      res.on('end', () => resolve({ status: res.statusCode, html: d }));
    });
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, html: '' }); });
    req.on('error', () => resolve({ status: 0, html: '' }));
  });
}

function extractAmazonFirstResult(html) {
  // Amazon search results geralmente têm data-asin e estrutura reconhecível
  
  // Método 1: JSON em página de busca (a-price-whole + link de produto)
  // Procurar por padrão: data-asin="B..." com preço e link
  const asinBlocks = html.match(/data-asin="([A-Z0-9]{10})"[^>]*>([\s\S]{0,3000}?)(?=data-asin="|<\/div>\s*<\/div>\s*<\/div>)/g);
  
  if (asinBlocks && asinBlocks.length > 0) {
    for (const block of asinBlocks.slice(0, 5)) {
      // Extrair ASIN
      const asinMatch = block.match(/data-asin="([A-Z0-9]{10})"/);
      const asin = asinMatch ? asinMatch[1] : null;
      
      // Extrair preço
      const priceMatch = block.match(/class="a-price-whole[^"]*">([0-9.]+)/) 
        || block.match(/"a-price-whole">([0-9.]+)/)
        || block.match(/([0-9]{1,3},[0-9]{2})/);
      
      // Extrair título
      const titleMatch = block.match(/class="[^"]*a-text-normal[^"]*"[^>]*>([^<]{10,80})/);
      
      if (asin && priceMatch) {
        const priceStr = priceMatch[1].replace('.', '').replace(',', '.');
        const price = parseFloat(priceStr);
        const title = titleMatch ? titleMatch[1].trim() : 'Produto';
        const url = `https://www.amazon.com.br/dp/${asin}`;
        return { asin, price, title, url };
      }
    }
  }
  
  // Método 2: Buscar padrão de preço BRL no JSON embutido
  const jsonMatch = html.match(/data-search-metadata="([^"]+)"/);
  
  // Método 3: regex direto no HTML
  const simplePrice = html.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/);
  const simpleAsin  = html.match(/\/dp\/([A-Z0-9]{10})/);
  
  if (simplePrice && simpleAsin) {
    const priceStr = simplePrice[1].replace(/\./g, '').replace(',', '.');
    return {
      asin:  simpleAsin[1],
      price: parseFloat(priceStr),
      title: 'Produto encontrado',
      url:   `https://www.amazon.com.br/dp/${simpleAsin[1]}`,
    };
  }
  
  return null;
}

async function main() {
  const queries = [
    'batom maybelline superstay',
    'base maybelline fit me',
    'protetor solar la roche posay anthelios',
  ];
  
  for (const q of queries) {
    console.log('\n' + '═'.repeat(60));
    console.log('Produto:', q);
    const enc = encodeURIComponent(q);
    const { status, html } = await fetchPage(`https://www.amazon.com.br/s?k=${enc}&i=beauty`);
    console.log('Status:', status, '| HTML:', (html.length/1024).toFixed(0), 'KB');
    
    if (status === 200) {
      const result = extractAmazonFirstResult(html);
      if (result) {
        console.log('Extraído:');
        console.log('  ASIN:', result.asin);
        console.log('  Preço:', 'R$', result.price);
        console.log('  Título:', result.title?.slice(0, 60));
        console.log('  URL:', result.url);
      } else {
        console.log('Não conseguiu extrair');
        // Debug: ver estrutura
        const idx = html.indexOf('data-asin="B');
        if (idx > 0) {
          console.log('  Amostra data-asin:', html.slice(idx, idx + 200).replace(/\s+/g, ' '));
        }
        const rIdx = html.indexOf('R$');
        if (rIdx > 0) {
          console.log('  Contexto R$:', html.slice(rIdx - 5, rIdx + 50).replace(/\s+/g, ' '));
        }
      }
    }
  }
}

main().catch(console.error);
