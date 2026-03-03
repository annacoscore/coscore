/**
 * Remove indicações de cor, tom e tamanho do nome do produto para exibição.
 * Versão leve do cleanProductName do normalizer, segura para usar no frontend.
 */

const COLOR_PATTERNS: RegExp[] = [
  // "cor 01", "tom 220", "shade nude", "color beige"
  /\b(?:cor|tom|shade|color|colour|tono)\s*[:\-#]?\s*[\w\u00C0-\u017E\s]{1,30}/gi,
  // "N° 01", "Nº 220", "nr. 12"
  /\b(?:n[°ºo]|nr\.?|num\.?)\s*\d+[a-z]{0,3}\b/gi,
  // Códigos numéricos de cor: "220W", "30N", "01C"
  /\b\d{2,3}[a-z]{0,2}\b/gi,
  // Nomes de cor em PT/EN
  /\b(?:vermelho|vermelha|rosa|rosado|rosada|nude|bege|creme|marrom|caf[eé]|caramelo|dourado|prateado|bronze|coral|salm[aã]o|vinhoso|bord[oô]|ameixa|vinho|roxo|lil[aá]s|violeta|azul|verde|amarelo|laranja|preto|branca|branco|cinza|cobre|terracota|p[eê]ssego|neutro|natural|warm|cool|fair|light|medium|dark|deep|rich|clear|ivory|sand|golden|silver|rose|pink|red|burgundy|plum|berry|mauve|taupe|brown|suede|velvet)\b/gi,
];

const SIZE_PATTERNS: RegExp[] = [
  /\b\d+(?:[.,]\d+)?\s*(?:ml|g|gr|mg|kg|oz)\b/gi,
  /\btravel\s*size\b/gi,
];

const JUNK_PATTERNS: RegExp[] = [
  /\([^)]{0,40}\)/g,
  /\[[^\]]{0,40}\]/g,
];

export function cleanDisplayName(name: string): string {
  let n = name;
  for (const p of COLOR_PATTERNS) n = n.replace(p, ' ');
  for (const p of SIZE_PATTERNS)  n = n.replace(p, ' ');
  for (const p of JUNK_PATTERNS)  n = n.replace(p, ' ');
  return n.trim().replace(/\s{2,}/g, ' ').replace(/[\s,\-–]+$/, '').trim();
}
