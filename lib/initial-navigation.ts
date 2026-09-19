export interface InitialNavigation {
  requestedCwd: string | null;
  sessionId: string | null;
  sidebarCollapsed: boolean;
}

/**
 * `tabSessionId` is the session this browser tab showed last (see
 * `lib/tab-session.ts`). Without a session in the URL the tab falls back to it
 * instead of the workspace memory, which every tab of the browser profile
 * shares and any other tab overwrites when it switches sessions.
 */
export function getInitialNavigation(
  searchParams: Pick<URLSearchParams, "get">,
  tabSessionId: string | null = null,
): InitialNavigation {
  const requestedCwd = searchParams.get("cwd")?.trim() || null;

  return {
    requestedCwd,
    sessionId: requestedCwd ? null : (searchParams.get("session") || tabSessionId),
    sidebarCollapsed: searchParams.get("sidebar") === "collapsed",
  };
}

/**
 * Apply per-tab session memory to a navigation snapshot that was taken from
 * the URL alone. Returns the same object when the URL already chose a cwd or
 * session, or when this tab has nothing stored.
 *
 * Call this after mount. Reading sessionStorage during the first client render
 * (including a `useState` initializer) makes SSR HTML diverge from the client
 * tree — sessionStorage is empty on the server — and React reports a
 * hydration text mismatch in the sidebar / placeholder.
 */
export function withTabOpenSession(
  navigation: InitialNavigation,
  tabSessionId: string | null,
): InitialNavigation {
  if (navigation.requestedCwd || navigation.sessionId || !tabSessionId) {
    return navigation;
  }
  return { ...navigation, sessionId: tabSessionId };
}
