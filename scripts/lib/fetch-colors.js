/**
 * fetch-colors.js
 * Utilitário reutilizável: busca variações de cor de um produto no ML.
 *
 * Uso:
 *   const { fetchColorVariants } = require('./lib/fetch-colors');
 *   const colors = await fetchColorVariants(token, mlId, productName, brand);
 */

const https = require('https');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.on('error', () => resolve({}));
  });
}

const JUNK_COLORS = new Set([
  'sem cor', 'único', 'única', 'unica', 'unico', 'outro', 'outros', 'multicolor',
  'multicor', 'não se aplica', 'nao se aplica', '', 'transparente', 'color',
  'única cor', 'neutra', 'neutra/translúcido',
]);

function normalizeColor(raw) {
  if (!raw) return '';
  const c = raw.trim().toLowerCase();
  if (JUNK_COLORS.has(c)) return '';
  if (c.length < 2) return '';
  return raw.trim().replace(/\b\w/g, l => l.toUpperCase());
}

// Extrai tom de nomes de produtos (ex: "Base 220 Bege" → "220 Bege")
function extractToneFromName(name) {
  const n = name.toLowerCase();
  // "tom 01", "cor 02", "shade nude", "#12 Bege"
  const m = n.match(/\b(?:tom|cor|shade|cor\.?)\s*(?:0?\d{1,3}[a-z]?)\b/);
  if (m) return m[0].replace(/\b\w/g, l => l.toUpperCase());
  // código numérico com nome de cor
  const m2 = name.match(/\b(\d{1,3}[a-z]?)\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç]+(?:\s+[a-záéíóúâêîôûãõç]+)?)\b/);
  if (m2) return `${m2[1]} ${m2[2]}`;
  return '';
}

/**
 * Busca variações de cor para um produto ML.
 * Estratégias (em ordem):
 *  1. Atributos do próprio produto catálogo
 *  2. Itens com catalog_product_id (mais confiável para variants)
 *  3. Busca de itens por nome+marca no marketplace
 *  4. Extração de tons a partir dos títulos dos itens
 *
 * @returns {Promise<Array<{name: string, image: string}>>}
 */
async function fetchColorVariants(token, mlId, productName, brand) {
  const colorMap = new Map(); // colorName → imageUrl

  // ── 1. Produto catálogo: cor principal ────────────────────────────────
  try {
    const prod = await get(`https://api.mercadolibre.com/products/${mlId}`, token);
    if (!prod.error) {
      const colorAttr = (prod.attributes || []).find(a => a.id === 'COLOR');
      const color = normalizeColor(colorAttr?.value_name || '');
      const img = prod.pictures?.[0]?.url || prod.pictures?.[0]?.secure_url || '';
      if (color && img) colorMap.set(color, img);
    }
  } catch { /* ignora */ }

  // ── 2. Itens com catalog_product_id ──────────────────────────────────
  try {
    const items = await get(
      `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${mlId}&limit=20`,
      token
    );
    for (const item of (items.results || []).slice(0, 12)) {
      try {
        const detail = await get(
          `https://api.mercadolibre.com/items/${item.id}?include_attributes=all`,
          token
        );
        if (detail.error) continue;
        // Cor via atributo
        const colorAttr = (detail.attributes || []).find(a => a.id === 'COLOR');
        let color = normalizeColor(colorAttr?.value_name || '');
        // Fallback: extrai do título do item
        if (!color) color = extractToneFromName(detail.title || '');
        const img = detail.pictures?.[0]?.url || '';
        if (color && img && !colorMap.has(color)) colorMap.set(color, img);
        await sleep(80);
      } catch { /* ignora */ }
    }
  } catch { /* ignora */ }

  // ── 3. Busca de itens por nome+marca no marketplace ──────────────────
  if (colorMap.size < 2) {
    try {
      const cleanName = productName
        .replace(/\b(cor|tom|shade)\s*\d+\b/gi, '')
        .replace(/\b\d{2,3}[a-z]{0,2}\b/gi, '')
        .trim().slice(0, 50);
      const q = brand ? `${brand} ${cleanName}` : cleanName;
      const results = await get(
        `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&category=MLB1247&limit=15`,
        token
      );
      for (const item of (results.results || []).slice(0, 10)) {
        if (colorMap.size >= 8) break;
        try {
          const detail = await get(
            `https://api.mercadolibre.com/items/${item.id}?include_attributes=all`,
            token
          );
          if (detail.error) continue;
          const colorAttr = (detail.attributes || []).find(a => a.id === 'COLOR');
          let color = normalizeColor(colorAttr?.value_name || '');
          if (!color) color = extractToneFromName(detail.title || '');
          const img = detail.thumbnail || detail.pictures?.[0]?.url || '';
          if (color && img && !colorMap.has(color)) colorMap.set(color, img);
          await sleep(100);
        } catch { /* ignora */ }
      }
    } catch { /* ignora */ }
  }

  // ── 4. Busca no catálogo de produtos similares ────────────────────────
  if (colorMap.size < 2) {
    try {
      const cleanName = productName.trim().slice(0, 45);
      const q = brand ? `${brand} ${cleanName}` : cleanName;
      const results = await get(
        `https://api.mercadolibre.com/products/search?site_id=MLB&q=${encodeURIComponent(q)}&limit=10`,
        token
      );
      for (const r of (results.results || []).slice(0, 6)) {
        if (r.id === mlId || colorMap.size >= 8) continue;
        try {
          const detail = await get(`https://api.mercadolibre.com/products/${r.id}`, token);
          if (detail.error) continue;
          const colorAttr = (detail.attributes || []).find(a => a.id === 'COLOR');
          const color = normalizeColor(colorAttr?.value_name || '');
          const img = detail.pictures?.[0]?.url || detail.pictures?.[0]?.secure_url || '';
          if (color && img && !colorMap.has(color)) colorMap.set(color, img);
          await sleep(150);
        } catch { /* ignora */ }
      }
    } catch { /* ignora */ }
  }

  return Array.from(colorMap.entries()).map(([name, image]) => ({ name, image }));
}

module.exports = { fetchColorVariants };
