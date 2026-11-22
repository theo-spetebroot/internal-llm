import type { Element, ElementContent } from 'hast';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from './CodeBlock';

function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

/** Source and language (from the ```lang fence) of a <pre><code> block. */
function readCodeBlock(pre: Element | undefined): { code: string; language?: string } {
  const code = pre?.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  );
  if (!code) return { code: '' };

  const classes = code.properties.className;
  const language = Array.isArray(classes)
    ? classes
        .map(String)
        .find((name) => name.startsWith('language-'))
        ?.slice('language-'.length)
    : undefined;
  // Markdown keeps the newline that precedes the closing fence.
  const text = textOf(code).replace(/\n$/, '');
  return language ? { code: text, language } : { code: text };
}

/**
 * Element overrides. Raw HTML in the source is never rendered (react-markdown escapes it and
 * no rehype-raw plugin is used), and unsafe link protocols are dropped by its default
 * `urlTransform`.
 */
const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  // Wide tables scroll inside their own box instead of widening the page.
  table: ({ node: _node, ...props }) => (
    <div className="table-scroll">
      <table {...props} />
    </div>
  ),
  pre: ({ node }) => {
    const { code, language } = readCodeBlock(node);
    return <CodeBlock code={code} language={language} />;
  },
};

/** Renders an answer of the model (GitHub-flavoured Markdown) with the "prose" styles. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
