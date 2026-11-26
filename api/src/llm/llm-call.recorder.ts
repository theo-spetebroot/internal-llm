import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

import { LlmCallOutcome } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** What is kept about one LLM call. Never contains prompt or answer text. */
export interface LlmCallRecord {
  userId: string;
  conversationId: string | null;
  provider: string;
  startedAt: Date;
  durationMs: number;
  timeToFirstTokenMs: number | null;
  outcome: LlmCallOutcome;
  errorCode: string | null;
}

/**
 * Stores one row per LLM call. Writes are fire-and-forget: the caller never waits for the
 * database, and a failed write is logged without affecting the chat. Pending writes are
 * awaited on shutdown.
 */
@Injectable()
export class LlmCallRecorder implements OnModuleDestroy {
  private readonly logger = new Logger(LlmCallRecorder.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  record(call: LlmCallRecord): void {
    const write: Promise<void> = this.prisma.llmCall
      .create({
        data: {
          userId: call.userId,
          conversationId: call.conversationId,
          provider: call.provider,
          startedAt: call.startedAt,
          durationMs: call.durationMs,
          timeToFirstTokenMs: call.timeToFirstTokenMs,
          outcome: call.outcome,
          errorCode: call.errorCode,
        },
      })
      .then(
        () => undefined,
        (error: unknown) => {
          this.logger.error(
            `Could not record an LLM call: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      )
      .finally(() => {
        this.pending.delete(write);
      });
    this.pending.add(write);
  }

  /** Resolves once every write started so far has settled. */
  async flush(): Promise<void> {
    await Promise.all(this.pending);
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }
}
