import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CodeBlock } from './CodeBlock';
import { Markdown } from './Markdown';

function coloredSpans(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('code span[style]')];
}

describe('CodeBlock', () => {
  it('shows the code at once, then highlights it once the grammar has loaded', async () => {
    const { container } = render(
      <CodeBlock code={'const answer = 42;\nreturn answer;'} language="ts" />,
    );

    expect(container.querySelector('code')).toHaveTextContent('const answer = 42;');
    await waitFor(() => {
      expect(
        coloredSpans(container).some((span) => span.style.color.includes('--shiki-token-keyword')),
      ).toBe(true);
    });
    expect(container.querySelector('code')).toHaveTextContent('const answer = 42;return answer;');
  });

  it('keeps an unknown language as plain text', async () => {
    const { container } = render(<CodeBlock code="??? !!!" language="not-a-language" />);

    expect(screen.getByText('not-a-language')).toBeInTheDocument();
    // Give a highlight attempt the time to (not) happen.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(coloredSpans(container)).toHaveLength(0);
    expect(container.querySelector('code')).toHaveTextContent('??? !!!');
  });

  it('copies the code', async () => {
    const user = userEvent.setup();
    render(<CodeBlock code="proxy_buffering off;" language="nginx" />);

    await user.click(screen.getByRole('button', { name: 'Copier' }));

    expect(await navigator.clipboard.readText()).toBe('proxy_buffering off;');
    expect(screen.getByRole('button', { name: 'Copié' })).toBeInTheDocument();
  });

  it('is used for fenced code in Markdown, with the fence language', () => {
    render(<Markdown>{'Voici :\n\n```nginx\nproxy_buffering off;\n```'}</Markdown>);

    expect(screen.getByRole('figure')).toHaveTextContent('nginx');
    expect(screen.getByText('proxy_buffering off;').closest('pre')).not.toBeNull();
  });
});
