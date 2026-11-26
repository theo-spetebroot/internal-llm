import { z } from 'zod';

/** Emails are compared case-insensitively: always store and look them up normalised. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const PASSWORD_MIN_LENGTH = 12;

export const createUserSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(100),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(256),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    role: z.enum(['USER', 'ADMIN']),
    createdAt: z.date(),
  })
  .meta({ id: 'User' });

export type UserDto = z.infer<typeof userSchema>;
