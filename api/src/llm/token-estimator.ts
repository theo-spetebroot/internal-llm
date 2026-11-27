/**
 * Rough average length of a token, in characters. Real tokenizers depend on the model; this
 * heuristic is only meant for figures flagged as estimated, until a provider reports the real
 * ones, and for sizing the context sent to the model.
 */
export const CHARS_PER_TOKEN = 4;

/** Estimates how many tokens `text` takes (about one token per 4 characters, rounded up). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
