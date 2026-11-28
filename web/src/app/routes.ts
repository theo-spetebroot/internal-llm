import type { RouteObject } from 'react-router';

import { LoginPage } from '@/auth/LoginPage';
import { RequireAuth } from '@/auth/RequireAuth';
import { ConversationPage } from '@/conversations/ConversationPage';
import { AppShell } from '@/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LazyUsagePage } from '@/usage/LazyUsagePage';

/** Shared by the browser router (main.tsx) and the memory router of the tests. */
export const routes: RouteObject[] = [
  { path: '/login', Component: LoginPage },
  {
    Component: RequireAuth,
    children: [
      {
        Component: AppShell,
        children: [
          { index: true, Component: HomePage },
          { path: 'c/:conversationId', Component: ConversationPage },
          { path: 'usage', Component: LazyUsagePage },
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
];
