import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { getTabOpenSession, setTabOpenSession } = await jiti.import("./tab-session.ts");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("returns null when this tab remembers nothing", () => {
  assert.equal(getTabOpenSession(createStorage()), null);
});

test("set then get round-trips the remembered session", () => {
  const storage = createStorage();
  setTabOpenSession("session-1", storage);
  assert.equal(getTabOpenSession(storage), "session-1");
  assert.equal(storage.values.get("pi-web:tab-open-session"), "session-1");
});

test("replaces the previous session of the same tab", () => {
  const storage = createStorage();
  setTabOpenSession("session-1", storage);
  setTabOpenSession("session-2", storage);
  assert.equal(getTabOpenSession(storage), "session-2");
});

test("ignores an empty stored value", () => {
  const storage = createStorage({ "pi-web:tab-open-session": "" });
  assert.equal(getTabOpenSession(storage), null);
});

test("no-ops for an empty session id", () => {
  const storage = createStorage();
  setTabOpenSession("", storage);
  assert.equal(getTabOpenSession(storage), null);
});

test("falls back to null / no-ops when browser storage is unavailable", () => {
  const unavailable = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.equal(getTabOpenSession(unavailable), null);
  assert.doesNotThrow(() => setTabOpenSession("session-1", unavailable));
});

test("uses window.sessionStorage by default", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: createStorage() },
  });

  try {
    setTabOpenSession("session-1");
    assert.equal(getTabOpenSession(), "session-1");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});

test("falls back when window.access to sessionStorage throws", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const blockedWindow = {};
  Object.defineProperty(blockedWindow, "sessionStorage", {
    get() { throw new DOMException("blocked", "SecurityError"); },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: blockedWindow,
  });

  try {
    assert.equal(getTabOpenSession(), null);
    assert.doesNotThrow(() => setTabOpenSession("session-1"));
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});
