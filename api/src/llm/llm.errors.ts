export const LLM_ERROR_CODES = [
  'LLM_UNAVAILABLE',
  'LLM_TIMEOUT',
  'LLM_ABORTED',
  'LLM_ERROR',
] as const;

export type LlmErrorCode = (typeof LLM_ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<LlmErrorCode, string> = {
  LLM_UNAVAILABLE: 'The language model server is unreachable',
  LLM_TIMEOUT: 'The language model took too long to respond',
  LLM_ABORTED: 'The generation was cancelled',
  LLM_ERROR: 'The language model returned an error',
};

/** Every failure of the LLM layer surfaces as an `LlmError` with a stable code. */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string = DEFAULT_MESSAGES[code],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LlmError';
  }
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** True when the error (or one of its causes) is a network-level connection failure. */
export function isNetworkError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true;
    current = current.cause;
  }
  return false;
}
