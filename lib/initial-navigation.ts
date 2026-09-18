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
