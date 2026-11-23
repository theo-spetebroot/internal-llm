import type { ChatErrorCode } from '@/api/chat-events';

import type { SendFailure } from './send-message';

/** `error` event sent by the API during the answer (the user message is saved). */
export const CHAT_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
  LLM_UNAVAILABLE: 'Le serveur du modèle est injoignable.',
  LLM_TIMEOUT: 'Le modèle a mis trop de temps à répondre.',
  LLM_ERROR: 'Le modèle a renvoyé une erreur.',
  INTERNAL: 'Une erreur inattendue est survenue.',
};

/** The message was refused before anything was saved. */
export const SEND_FAILURE_MESSAGES: Record<SendFailure, string> = {
  busy: 'Une réponse est déjà en cours de génération dans cette conversation.',
  invalid: 'Ce message est vide ou trop long.',
  'not-found': 'Cette conversation n’existe plus.',
  unreachable: 'Le serveur est injoignable. Votre message n’a pas été envoyé.',
  server: 'Le serveur a rencontré une erreur. Votre message n’a pas été envoyé.',
};

/** The stream broke (network, invalid event) after the message was saved. */
export const BROKEN_STREAM_MESSAGE =
  'La réponse a été interrompue. La conversation a été rechargée.';
