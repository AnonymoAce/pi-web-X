import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./initial-navigation.ts");
}

test("uses cwd instead of session when both parameters are present", async () => {
  const { getInitialNavigation } = await loadSubject();
  const result = getInitialNavigation(
    new URLSearchParams({
      cwd: " /work/project ",
      session: "saved-session",
    }),
  );

  assert.deepEqual(result, {
    requestedCwd: "/work/project",
    sessionId: null,
    sidebarCollapsed: false,
  });
});

test("restores session when cwd is absent", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ session: "saved-session" })),
    { requestedCwd: null, sessionId: "saved-session", sidebarCollapsed: false },
  );
});

test("treats an empty cwd as absent", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(
      new URLSearchParams({ cwd: "  ", session: "saved-session" }),
    ),
    { requestedCwd: null, sessionId: "saved-session", sidebarCollapsed: false },
  );
});

test("preserves a URL-encoded Windows path", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams("cwd=C%3A%5CProjects%5Cpi-web")),
    {
      requestedCwd: "C:\\Projects\\pi-web",
      sessionId: null,
      sidebarCollapsed: false,
    },
  );
});

test("keeps the sidebar open when no sidebar parameter is present", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(getInitialNavigation(new URLSearchParams()), {
    requestedCwd: null,
    sessionId: null,
    sidebarCollapsed: false,
  });
});

test("collapses the sidebar for sidebar=collapsed", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ sidebar: "collapsed" })),
    {
      requestedCwd: null,
      sessionId: null,
      sidebarCollapsed: true,
    },
  );
});

test("collapses the sidebar when combined with a cwd parameter", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(
      new URLSearchParams({ cwd: "/work/project", sidebar: "collapsed" }),
    ),
    {
      requestedCwd: "/work/project",
      sessionId: null,
      sidebarCollapsed: true,
    },
  );
});

test("collapses the sidebar when combined with a session parameter", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(
      new URLSearchParams({ session: "saved-session", sidebar: "collapsed" }),
    ),
    {
      requestedCwd: null,
      sessionId: "saved-session",
      sidebarCollapsed: true,
    },
  );
});

test("ignores any other sidebar value", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ sidebar: "expanded" })),
    {
      requestedCwd: null,
      sessionId: null,
      sidebarCollapsed: false,
    },
  );
});

test("parses a URL-encoded sidebar parameter", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams("sidebar=collapsed%20")),
    {
      requestedCwd: null,
      sessionId: null,
      sidebarCollapsed: false,
    },
  );
});

test("falls back to the session this tab showed last", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams(), "tab-session"),
    { requestedCwd: null, sessionId: "tab-session", sidebarCollapsed: false },
  );
});

test("prefers the URL session over the tab session", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ session: "url-session" }), "tab-session"),
    { requestedCwd: null, sessionId: "url-session", sidebarCollapsed: false },
  );
});

test("ignores the tab session when a cwd parameter opens a workspace", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ cwd: "/work/project" }), "tab-session"),
    { requestedCwd: "/work/project", sessionId: null, sidebarCollapsed: false },
  );
});

test("treats an empty session parameter as absent", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ session: "" }), "tab-session"),
    { requestedCwd: null, sessionId: "tab-session", sidebarCollapsed: false },
  );
});

test("withTabOpenSession fills tab memory only when the URL chose nothing", async () => {
  const { withTabOpenSession } = await loadSubject();
  const empty = { requestedCwd: null, sessionId: null, sidebarCollapsed: false };

  assert.equal(withTabOpenSession(empty, null), empty);
  assert.equal(withTabOpenSession(empty, ""), empty);
  assert.deepEqual(
    withTabOpenSession(empty, "tab-session"),
    { requestedCwd: null, sessionId: "tab-session", sidebarCollapsed: false },
  );

  const fromUrl = { requestedCwd: null, sessionId: "url-session", sidebarCollapsed: false };
  assert.equal(withTabOpenSession(fromUrl, "tab-session"), fromUrl);

  const fromCwd = { requestedCwd: "/work/project", sessionId: null, sidebarCollapsed: true };
  assert.equal(withTabOpenSession(fromCwd, "tab-session"), fromCwd);
});

test("first-render navigation matches SSR even when a tab session exists", async () => {
  const { getInitialNavigation, withTabOpenSession } = await loadSubject();
  const searchParams = new URLSearchParams();
  const ssr = getInitialNavigation(searchParams);
  const firstClientRender = getInitialNavigation(searchParams);

  assert.deepEqual(ssr, firstClientRender);
  assert.equal(ssr.sessionId, null);
  assert.equal(
    withTabOpenSession(firstClientRender, "tab-session").sessionId,
    "tab-session",
  );
});
