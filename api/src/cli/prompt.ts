import { createInterface } from 'node:readline/promises';

const ENTER = new Set(['\r', '\n', '\u0004']); // Enter, Ctrl+D
const CTRL_C = '\u0003';
const BACKSPACE = new Set(['\u0008', '\u007f']);

export interface Prompter {
  ask(question: string): Promise<string>;
  /** Like `ask`, without echoing the typed characters. */
  askHidden(question: string): Promise<string>;
  close(): void;
}

/**
 * Interactive prompts on a terminal. When stdin is piped (scripts, tests), each question
 * consumes the next line of stdin instead.
 */
export function createPrompter(): Prompter {
  return process.stdin.isTTY ? createTtyPrompter() : createPipedPrompter();
}

function createTtyPrompter(): Prompter {
  return {
    async ask(question) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    askHidden: readHidden,
    close: () => undefined,
  };
}

function createPipedPrompter(): Prompter {
  const rl = createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const nextLine = async (): Promise<string> => {
    const { done, value } = await lines.next();
    return done ? '' : value;
  };
  return {
    ask: nextLine,
    askHidden: nextLine,
    close: () => {
      rl.close();
    },
  };
}

function readHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = (): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    function onData(chunk: string): void {
      for (const char of chunk) {
        if (ENTER.has(char)) {
          cleanup();
          resolve(value);
          return;
        }
        if (char === CTRL_C) {
          cleanup();
          reject(new Error('Aborted'));
          return;
        }
        value = BACKSPACE.has(char) ? value.slice(0, -1) : value + char;
      }
    }
    stdin.on('data', onData);
  });
}
