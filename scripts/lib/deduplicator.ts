import type { CatalogEntry } from './types';
import { generateDedupeKey } from './normalizer';

export type DedupeResult = 'inserted' | 'updated' | 'duplicate';

/**
 * Deduplicador central — compartilhado entre todas as fontes de dados.
 *
 * Hierarquia de deduplicação:
 *  1. EAN/GTIN  → identificador primário, mais confiável
 *  2. nome normalizado + marca → fallback quando EAN não existe
 *
 * Ao encontrar uma duplicata, tenta enriquecer o registro existente
 * com dados que estavam faltando (EAN, descrição melhor, mais fotos).
 */
export class Deduplicator {
  private byEan      = new Map<string, CatalogEntry>();
  private byKey      = new Map<string, CatalogEntry>();
  private byParentId = new Map<string, CatalogEntry>(); // agrupa variantes de cor pelo parent_id do ML

  constructor(existing: CatalogEntry[]) {
    for (const product of existing) {
      this.register(product);
    }
  }

  private register(entry: CatalogEntry): void {
    if (entry.ean) this.byEan.set(entry.ean, entry);
    if (entry.mlParentId) this.byParentId.set(entry.mlParentId, entry);
    const key = generateDedupeKey(entry.name, entry.brand);
    this.byKey.set(key, entry);
  }

  /**
   * Tenta adicionar um candidato ao catálogo.
   * Hierarquia de deduplicação:
   *  0. parent_id ML  → agrupa variantes de cor do mesmo produto-pai
   *  1. EAN/GTIN      → identificador primário do produto físico
   *  2. nome+marca    → fallback normalizado
   */
  add(candidate: CatalogEntry): DedupeResult {
    // ── 0. Deduplicação por parent_id (variantes de cor) ────────────────────
    if (candidate.mlParentId) {
      const existing = this.byParentId.get(candidate.mlParentId);
      if (existing) {
        return this.merge(existing, candidate) ? 'updated' : 'duplicate';
      }
    }

    // ── 1. Deduplicação por EAN ──────────────────────────────────────────────
    if (candidate.ean) {
      const existing = this.byEan.get(candidate.ean);
      if (existing) {
        return this.merge(existing, candidate) ? 'updated' : 'duplicate';
      }
    }

    // ── 2. Deduplicação por nome normalizado + marca ─────────────────────────
    const key = generateDedupeKey(candidate.name, candidate.brand);
    const existingByKey = this.byKey.get(key);

    if (existingByKey) {
      if (candidate.ean && !existingByKey.ean) {
        existingByKey.ean = candidate.ean;
        this.byEan.set(candidate.ean, existingByKey);
        existingByKey.updatedAt = new Date().toISOString();
        this.mergeSourceIds(existingByKey, candidate);
        return 'updated';
      }
      return this.merge(existingByKey, candidate) ? 'updated' : 'duplicate';
    }

    // ── 3. Produto realmente novo ────────────────────────────────────────────
    this.register(candidate);
    return 'inserted';
  }

  /**
   * Preenche campos vazios do existente com dados do candidato.
   * Nunca sobrescreve dados que já estão presentes e completos.
   */
  private merge(existing: CatalogEntry, candidate: CatalogEntry): boolean {
    let changed = false;

    // Complementa parent_id ausente e registra no índice
    if (!existing.mlParentId && candidate.mlParentId) {
      existing.mlParentId = candidate.mlParentId;
      this.byParentId.set(candidate.mlParentId, existing);
      changed = true;
    }

    // Complementa EAN ausente
    if (!existing.ean && candidate.ean) {
      existing.ean = candidate.ean;
      this.byEan.set(candidate.ean, existing);
      changed = true;
    }

    // Descrição mais longa tende a ser mais completa
    if (candidate.description.length > existing.description.length) {
      existing.description = candidate.description;
      changed = true;
    }

    // Mais fotos é melhor
    if (candidate.images.length > existing.images.length) {
      existing.images = candidate.images;
      existing.image = candidate.images[0] ?? existing.image;
      changed = true;
    }

    // Acumula cores — cada variante de cor que encontramos vira um item na lista
    if (this.mergeColors(existing, candidate)) changed = true;

    // Registra IDs de origem para rastreabilidade
    if (this.mergeSourceIds(existing, candidate)) changed = true;

    if (changed) existing.updatedAt = new Date().toISOString();
    return changed;
  }

  private mergeColors(existing: CatalogEntry, candidate: CatalogEntry): boolean {
    if (!existing.colors) existing.colors = [];
    const before = existing.colors.length;
    for (const variant of (candidate.colors ?? [])) {
      const norm = variant.name.toLowerCase().trim();
      if (norm && !existing.colors.some(c => c.name.toLowerCase().trim() === norm)) {
        existing.colors.push(variant);
      }
    }
    return existing.colors.length > before;
  }

  private mergeSourceIds(existing: CatalogEntry, candidate: CatalogEntry): boolean {
    const before = existing.mlIds.length;
    const newIds = candidate.mlIds.filter(id => !existing.mlIds.includes(id));
    existing.mlIds.push(...newIds);
    return existing.mlIds.length > before;
  }

  /** Retorna todos os produtos únicos acumulados. */
  get all(): CatalogEntry[] {
    return [...this.byKey.values()];
  }

  get size(): number {
    return this.byKey.size;
  }
}
