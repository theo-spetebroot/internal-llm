import type { Server } from 'node:http';

import request from 'supertest';
import { expect } from 'vitest';

import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { createUser } from '../../src/users/create-user.js';
import type { UserDto } from '../../src/users/users.schemas.js';

export interface TestUser {
  user: UserDto;
  email: string;
  password: string;
}

let counter = 0;

export async function createTestUser(prisma: PrismaService, name = 'Alice'): Promise<TestUser> {
  counter += 1;
  const email = `${name.toLowerCase()}.${counter}@example.com`;
  const password = 'correct-horse-battery-staple';
  const user = await createUser(prisma, { email, displayName: name, password });
  return { user, email, password };
}

/** Logs in and returns the `Cookie` header value to send on authenticated requests. */
export async function loginAs(http: Server, { email, password }: TestUser): Promise<string> {
  const response = await request(http)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  const sessionCookie = getSetCookies(response.headers).find((c) => c.startsWith('access_token='));
  expect(sessionCookie).toBeDefined();
  return (sessionCookie ?? '').split(';')[0] ?? '';
}

export function getSetCookies(headers: Record<string, unknown>): string[] {
  const value = headers['set-cookie'];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return typeof value === 'string' ? [value] : [];
}
