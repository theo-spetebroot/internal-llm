/** The two views of the usage page: the user's own figures, and the whole instance's. */
export type UsageView = 'moi' | 'instance';

/** Search parameter holding the view, e.g. `/usage?vue=instance` (absent: the user's own). */
export const VIEW_PARAM = 'vue';

/**
 * The view named by a search parameter. Only admins have the instance view: for anyone else,
 * and for anything unknown, it is the user's own.
 */
export function parseView(value: string | null, isAdmin: boolean): UsageView {
  return isAdmin && value === 'instance' ? 'instance' : 'moi';
}
