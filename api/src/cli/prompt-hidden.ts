import { createInterface } from 'node:readline/promises';

const ENTER = new Set(['\r', '\n', '\u0004']); // Enter, Ctrl+D
const CTRL_C = '\u0003';
const BACKSPACE = new Set(['\u0008', '\u007f']);

/**
 * Asks for a secret without echoing it. When stdin is not a terminal (piped input, scripts),
 * the first line of stdin is used instead.
 */
export async function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;

  if (!stdin.isTTY) {
    const rl = createInterface({ input: stdin });
    for await (const line of rl) {
      rl.close();
      return line;
    }
    return '';
  }

  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (ENTER.has(char)) {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === CTRL_C) {
          cleanup();
          stdout.write('\n');
          reject(new Error('Aborted'));
          return;
        }
        value = BACKSPACE.has(char) ? value.slice(0, -1) : value + char;
      }
    };
    const cleanup = (): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}
