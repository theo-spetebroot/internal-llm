/** Message format exchanged with LLM providers (independent from the database model). */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequestOptions {
  /** Aborted on client disconnect or timeout: providers should stop their work promptly. */
  signal: AbortSignal;
}

/**
 * Contract every LLM backend implements. The rest of the application only depends on this
 * interface (through `LlmService`): supporting a new API format means writing a new provider
 * and registering it in `llm-provider.registry.ts`.
 */
export interface LlmProvider {
  readonly name: string;

  /** Returns the complete answer. */
  chat(messages: LlmMessage[], options: LlmRequestOptions): Promise<string>;

  /** Optional: yields the answer token by token. */
  chatStream?(messages: LlmMessage[], options: LlmRequestOptions): AsyncIterable<string>;
}
