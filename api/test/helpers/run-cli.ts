import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { TEST_DATABASE_URL } from '../test-env.js';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs a CLI script of `src/cli` against the test database, answering its prompts from `stdin`.
 * `env` adds variables to the environment of the script.
 */
export function runCli(
  script: string,
  args: string[],
  stdin = '',
  env: Record<string, string> = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', `src/cli/${script}`, ...args], {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}
