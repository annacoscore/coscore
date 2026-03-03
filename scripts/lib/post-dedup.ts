/**
 * post-dedup.ts
 * ─────────────
 * Segunda passagem de deduplicação por similaridade de nome (Jaccard).
 *
 * Agrupa produtos com mesmo brand + category cujos nomes compartilham
 * >= SIMILARITY_THRESHOLD de tokens em comum.
 * As palavras únicas de cada variante viram o nome da cor acumulada.
 */

import type { CatalogEntry, ColorVariant } from './types';
import { removeAccents } from './normalizer';

// Dois produtos são variantes se:
//   - compartilham >= MIN_COMMON tokens
//   - diferem em apenas <= MAX_UNIQUE tokens significativos (não stop-words/tipo)
const MIN_COMMON_TOKENS  = 3;
const MAX_UNIQUE_TOKENS  = 2;

// Palavras sem significado para comparação
const STOP_WORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'em', 'com', 'para', 'por', 'e',
  'o', 'a', 'os', 'as', 'um', 'uma', 'the', 'and', 'for', 'with',
  'of', 'in', 'to', 'la', 'le', 'el', 'les',
]);

// Tokens que indicam TIPO do produto — nunca devem ser tratados como cor
const PRODUCT_TYPE_TOKENS = new Set([
  'batom', 'base', 'blush', 'sombra', 'serum', 'hidratante',
  'primer', 'contorno', 'bronzer', 'mascara', 'cilios', 'shampoo',
  'condicionador', 'perfume', 'iluminador', 'finalizador', 'lipstick',
  'lip', 'foundation', 'eyeshadow', 'highlighter', 'paleta', 'palette',
  'matte', 'glossy', 'shimmer', 'satin', 'glitter', 'liquido', 'liquida',
  'compacto', 'compacta', 'cremoso', 'cremosa', 'cremosa', 'fps', 'spf',
]);

function tokenize(name: string): string[] {
  return removeAccents(name.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function shouldMerge(a: Set<string>, b: Set<string>): boolean {
  // Tokens comuns TOTAIS (garantem que são o mesmo tipo de produto)
  const common = [...a].filter(t => b.has(t)).length;
  if (common < MIN_COMMON_TOKENS) return false;

  // Tokens únicos SIGNIFICATIVOS em cada lado (excluindo tipo de produto)
  // — são estes que indicam variante de cor/sabor
  const uniqueInB = [...b].filter(t => !a.has(t) && !PRODUCT_TYPE_TOKENS.has(t));
  const uniqueInA = [...a].filter(t => !b.has(t) && !PRODUCT_TYPE_TOKENS.has(t));

  return uniqueInA.length <= MAX_UNIQUE_TOKENS && uniqueInB.length <= MAX_UNIQUE_TOKENS;
}

function extractColorName(base: Set<string>, variant: Set<string>): string {
  // Palavras presentes no variant mas não na base — prováveis indicadores de cor
  const unique = [...variant].filter(t => !base.has(t) && !PRODUCT_TYPE_TOKENS.has(t));
  return unique.join(' ').trim();
}

export function postDeduplicateByNameSimilarity(
  products: CatalogEntry[],
): CatalogEntry[] {
  // Agrupa por brand + category
  const groups = new Map<string, CatalogEntry[]>();
  for (const p of products) {
    const key = `${p.brand.toLowerCase()}::${p.category}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const toRemove = new Set<string>();
  let merged = 0;

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    // Pré-tokeniza
    const tokenized = group.map(p => ({
      p,
      tokens: new Set(tokenize(p.name)),
    }));

    for (let i = 0; i < tokenized.length; i++) {
      if (toRemove.has(tokenized[i].p.id)) continue;
      const base = tokenized[i];

      for (let j = i + 1; j < tokenized.length; j++) {
        if (toRemove.has(tokenized[j].p.id)) continue;
        const candidate = tokenized[j];

        if (!shouldMerge(base.tokens, candidate.tokens)) continue;

        // ─── Merge candidate → base ───────────────────────────────────────

        // Cor extraída das palavras únicas do candidato
        const colorNameFromCandidate = extractColorName(base.tokens, candidate.tokens);
        // Cor extraída das palavras únicas da base (para o produto-base também ter uma entrada de cor)
        const colorNameFromBase = extractColorName(candidate.tokens, base.tokens);

        const capitalize = (s: string) =>
          s.replace(/\b\w/g, c => c.toUpperCase());

        const addColor = (entry: CatalogEntry, name: string, image?: string) => {
          if (!name) return;
          const normalized = capitalize(name);
          if (!entry.colors.some(c => c.name.toLowerCase() === normalized.toLowerCase())) {
            entry.colors.push({ name: normalized, image });
          }
        };

        // Só registra a cor do produto-base se tiver um identificador real
        if (colorNameFromBase) {
          addColor(base.p, colorNameFromBase, base.p.image);
        }

        // Acumula as cores do candidato no produto-base
        if (candidate.p.colors.length > 0) {
          for (const c of candidate.p.colors) {
            addColor(base.p, c.name, c.image);
          }
        }
        // Se o candidato não tinha cores registradas, cria uma com os tokens únicos
        if (colorNameFromCandidate) {
          addColor(base.p, colorNameFromCandidate, candidate.p.image);
        }

        // Melhor imagem (mais fotos vence)
        if (candidate.p.images.length > base.p.images.length) {
          base.p.images = candidate.p.images;
          base.p.image  = candidate.p.images[0];
        }

        // Descrição mais completa
        if (candidate.p.description.length > base.p.description.length) {
          base.p.description = candidate.p.description;
        }

        toRemove.add(candidate.p.id);
        merged++;
      }
    }
  }

  if (merged > 0) {
    console.log(`  🔗 Pós-dedup por similaridade: ${merged} variantes agrupadas`);
  }

  return products.filter(p => !toRemove.has(p.id));
}
