import { Check, Copy } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { ThemedToken } from 'shiki/core';

// Shiki (~180 kB) is only downloaded once an answer contains a code block.
const loadHighlighter = () => import('./highlighter');

// Shiki's FontStyle flags.
const ITALIC = 1;
const BOLD = 2;
const UNDERLINE = 4;

function tokenStyle(token: ThemedToken): CSSProperties {
  const fontStyle = token.fontStyle ?? 0;
  return {
    color: token.color,
    fontStyle: fontStyle & ITALIC ? 'italic' : undefined,
    fontWeight: fontStyle & BOLD ? 600 : undefined,
    textDecoration: fontStyle & UNDERLINE ? 'underline' : undefined,
  };
}

const COPIED_FEEDBACK_MS = 2000;

/** A fenced code block: language name, copy button, and the code highlighted once loaded. */
export function CodeBlock({ code, language }: { code: string; language?: string | undefined }) {
  const [highlighted, setHighlighted] = useState<{ code: string; lines: ThemedToken[][] }>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!language) return;
    let cancelled = false;
    loadHighlighter()
      .then(({ highlightCode }) => highlightCode(code, language))
      .then(
        (lines) => {
          if (!cancelled && lines) setHighlighted({ code, lines });
        },
        () => {
          // Grammar failed to load: the code stays readable as plain text.
        },
      );
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
    }, COPIED_FEEDBACK_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard denied (insecure context, permissions): nothing to report beyond no feedback.
    }
  };

  // Highlighting of a previous version of the code (e.g. while an answer streams) is not
  // shown: plain text until the current one is ready.
  const lines = highlighted?.code === code ? highlighted.lines : undefined;

  return (
    <figure className="code-block">
      <figcaption className="flex items-center justify-between gap-2 border-b border-rule py-1.5 pr-2 pl-3.5 font-mono text-xs font-medium text-ink-3">
        <span>{language ?? 'texte'}</span>
        <button
          type="button"
          onClick={copy}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 font-sans text-xs font-medium text-ink-2 transition-colors hover:bg-active hover:text-ink"
        >
          {copied ? (
            <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          )}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </figcaption>
      <pre>
        <code>
          {lines
            ? lines.map((line, index) => (
                <span key={index} className="block">
                  {line.map((token, tokenIndex) => (
                    <span key={tokenIndex} style={tokenStyle(token)}>
                      {token.content}
                    </span>
                  ))}
                  {line.length === 0 && '\n'}
                </span>
              ))
            : code}
        </code>
      </pre>
    </figure>
  );
}
