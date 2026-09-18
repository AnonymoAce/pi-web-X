/**
 * Per-tab "open session" memory.
 *
 * A browser tab remembers the session it showed last, so a reload restores
 * *this* tab's session instead of `pi-web:last-open-by-workspace` — the
 * workspace-wide memory that every tab of the browser profile shares and that
 * any other tab overwrites when it switches sessions.
 *
 * sessionStorage is the only per-tab store the browser offers: it survives
 * reloads and in-app navigations and is never shared with other tabs. A tab
 * that was just opened starts empty and falls back to the workspace memory;
 * there is no stable cross-tab window identity to key a localStorage entry on.
 *
 * Stored in sessionStorage; best-effort (silently ignored when unavailable).
 */

const STORAGE_KEY = "pi-web:tab-open-session";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The session id this tab showed last, or null when none is remembered. */
export function getTabOpenSession(
  storage: StorageLike | null = getBrowserStorage(),
): string | null {
  if (!storage) return null;
  try {
    const id = storage.getItem(STORAGE_KEY);
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function setTabOpenSession(
  sessionId: string,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage || !sessionId) return;
  try {
    storage.setItem(STORAGE_KEY, sessionId);
  } catch {
    // storage unavailable — memory is best-effort
  }
}
