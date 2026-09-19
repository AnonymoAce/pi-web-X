import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("first paint does not read tab sessionStorage", () => {
  assert.match(
    source,
    /const \[initialNavigation, setInitialNavigation\] = useState\(\(\) => getInitialNavigation\(searchParams\)\);/,
  );
  assert.doesNotMatch(
    source,
    /useState\(\(\) => getInitialNavigation\(searchParams,\s*getTabOpenSession\(\)\)\)/,
  );
});

test("applies tab session memory after mount instead of suppressing hydration", () => {
  assert.match(
    source,
    /useLayoutEffect\(\(\) => \{\s+const next = withTabOpenSession\(initialNavigation, getTabOpenSession\(\)\);[\s\S]*?setInitialNavigation\(next\);[\s\S]*?setInitialSessionRestored\(false\);[\s\S]*?\}, \[initialNavigation\]\);/,
  );
  assert.doesNotMatch(source, /suppressHydrationWarning/);
});
