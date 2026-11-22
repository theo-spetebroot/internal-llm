import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders emphasis, lists and inline code', () => {
    const { container } = render(
      <Markdown>
        {'Le **buffering** de nginx :\n\n1. `proxy_buffering off`\n2. un timeout'}
      </Markdown>,
    );

    expect(container.querySelector('strong')).toHaveTextContent('buffering');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toContainElement(screen.getByText('proxy_buffering off'));
    expect(screen.getByText('proxy_buffering off').tagName).toBe('CODE');
  });

  it('renders GitHub-flavoured tables in a scrollable box', () => {
    render(<Markdown>{'| Code | Sens |\n| --- | --- |\n| 409 | Déjà en cours |'}</Markdown>);

    const table = screen.getByRole('table');
    expect(table.parentElement).toHaveClass('table-scroll');
    expect(within(table).getByRole('cell', { name: 'Déjà en cours' })).toBeInTheDocument();
  });

  it('opens links in a new tab without giving it access to the page', () => {
    render(<Markdown>{'Voir [la doc](https://nginx.org/en/docs/).'}</Markdown>);

    const link = screen.getByRole('link', { name: 'la doc' });
    expect(link).toHaveAttribute('href', 'https://nginx.org/en/docs/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never renders raw HTML', () => {
    const { container } = render(
      <Markdown>
        {'Avant <img src=x onerror="alert(1)"> après\n\n<script>alert(1)</script>'}
      </Markdown>,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('drops javascript: links', () => {
    render(<Markdown>{'[clic](javascript:alert(1))'}</Markdown>);

    expect(screen.getByText('clic').closest('a')?.getAttribute('href') ?? '').not.toContain(
      'javascript',
    );
  });
});
