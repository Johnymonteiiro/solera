// ─── Cegamento e ordem reprodutível ──────────────────────────────────────────
//
// Módulo FOLHA (não importa nada do projeto) — os dois desenhos do estudo
// dependem dele: a seleção por condição (`studySample`) e a de pares
// antes/depois (`revisionPairs`).
//
// O requisito que manda aqui é reprodutibilidade: o `mapping.csv` guardado pelo
// pesquisador tem que continuar batendo com o `?format=posts` entregue aos
// avaliadores semanas depois. Por isso o embaralhamento é seeded, e cada
// desenho usa a SUA seed — se compartilhassem, a posição de um post num
// desenho entregaria a do outro.

/** Rótulo cego do post: A…Z e, se a amostra crescer, P27, P28… */
export function postLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `P${index + 1}`;
}

/** PRNG determinístico (mulberry32) — só precisa ser estável, não criptográfico. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash estável de string → seed inteira (FNV-1a 32 bits). */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Seed do desenho por condição (com/sem judge). Não reutilizar. */
export const SEED_CONDITION_SAMPLE = 0x50123a;
/** Seed do desenho de pares antes/depois. Não reutilizar. */
export const SEED_REVISION_PAIRS = 0x7a31c5;
