import { z } from 'zod';

import { emailSchema } from '../users/users.schemas.js';

export const loginSchema = z
  .object({
    email: emailSchema,
    // No length rule here: login only compares, it must not leak the password policy.
    password: z.string().min(1).max(256),
  })
  .meta({ id: 'LoginRequest' });

export type LoginInput = z.infer<typeof loginSchema>;

/** Claims stored in the session JWT. */
export interface JwtPayload {
  sub: string;
}
