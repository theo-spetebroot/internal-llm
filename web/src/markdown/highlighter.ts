import {
  createCssVariablesTheme,
  createHighlighterCore,
  type HighlighterCore,
  type ThemedToken,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';

/**
 * Token colours are CSS variables (`--shiki-token-*`, defined in styles/index.css for both
 * themes): one highlighting serves light and dark mode.
 */
const THEME_NAME = 'ink';
const theme = createCssVariablesTheme({
  name: THEME_NAME,
  variablePrefix: '--shiki-',
  fontStyle: true,
});

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  // JavaScript regex engine: no WebAssembly to download or allow in a future CSP.
  highlighter ??= createHighlighterCore({
    themes: [theme],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

type BundledLanguage = keyof typeof bundledLanguages;

function isBundledLanguage(language: string): language is BundledLanguage {
  return Object.hasOwn(bundledLanguages, language);
}

/**
 * Splits `code` into coloured tokens, one array per line. Each grammar is downloaded the
 * first time it is needed. Returns null for an unknown language (shown as plain text).
 */
export async function highlightCode(
  code: string,
  language: string,
): Promise<ThemedToken[][] | null> {
  const id = language.toLowerCase();
  if (!isBundledLanguage(id)) return null;

  const instance = await getHighlighter();
  if (!instance.getLoadedLanguages().includes(id)) {
    await instance.loadLanguage(bundledLanguages[id]);
  }
  return instance.codeToTokens(code, { lang: id, theme: THEME_NAME }).tokens;
}
