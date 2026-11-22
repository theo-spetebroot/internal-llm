import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
