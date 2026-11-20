import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ZodValidationPipe } from '../common/zod/zod-validation.pipe.js';
import type { Env } from '../config/env.schema.js';
import { createSendMessageSchema } from './chat.schemas.js';

/** Validates the send-message body with the configured maximum length. */
@Injectable()
export class SendMessagePipe extends ZodValidationPipe<ReturnType<typeof createSendMessageSchema>> {
  constructor(config: ConfigService<Env, true>) {
    super(createSendMessageSchema(config.get('MAX_MESSAGE_LENGTH', { infer: true })));
  }
}
