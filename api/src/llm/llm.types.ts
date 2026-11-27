/** Message format exchanged with LLM providers (independent from the database model). */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequestOptions {
  /** Aborted on client disconnect or timeout: providers should stop their work promptly. */
  signal: AbortSignal;
}

/** Token counts reported by the model server itself (as opposed to estimated ones). */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmChatResult {
  text: string;
  /** Only when the model server reports it; `LlmService` estimates the figures otherwise. */
  usage?: LlmUsage | undefined;
}

/**
 * Contract every LLM backend implements. The rest of the application only depends on this
 * interface (through `LlmService`): supporting a new API format means writing a new provider
 * and registering it in `llm-provider.registry.ts`.
 */
export interface LlmProvider {
  readonly name: string;

  /** Returns the complete answer, with the token usage when the provider knows it. */
  chat(messages: LlmMessage[], options: LlmRequestOptions): Promise<LlmChatResult>;

  /**
   * Optional: yields the answer token by token. The generator's return value is the token
   * usage, for providers that report it once the stream is over.
   */
  chatStream?(
    messages: LlmMessage[],
    options: LlmRequestOptions,
  ): AsyncGenerator<string, LlmUsage | undefined>;
}
