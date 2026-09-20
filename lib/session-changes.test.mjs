import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// jiti (not plain strip-types): session-changes.ts now imports turn-written-files
// with an extensionless specifier, which only the bundler-style resolver accepts.
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  buildSessionChangeTree,
  buildSessionChanges,
  countPatchLineStats,
  normalizePathKey,
  parseUnifiedDiffRows,
  relativeDisplayPath,
} = await jiti.import("./session-changes.ts");

const written = (...paths) => paths.map((filePath) => ({ filePath }));

test("joins written files with git status and keeps written order", () => {
  const summary = buildSessionChanges(
    written("C:\\work\\repo\\lib\\b.ts", "C:\\work\\repo\\app\\a.ts"),
    {
      isGitRepository: true,
      files: [
        { filePath: "C:\\work\\repo\\app\\a.ts", status: "added", code: "A", indexStatus: "?", worktreeStatus: "?" },
        { filePath: "C:\\work\\repo\\lib\\b.ts", status: "modified", code: "M", indexStatus: " ", worktreeStatus: "M" },
      ],
    },
    "C:\\work\\repo",
  );

  assert.equal(summary.isGitRepository, true);
  assert.equal(summary.total, 2);
  assert.equal(summary.changed, 2);
  assert.deepEqual(summary.entries.map((entry) => entry.displayPath), ["lib/b.ts", "app/a.ts"]);
  assert.deepEqual(summary.entries.map((entry) => entry.status), ["modified", "added"]);
  assert.deepEqual(summary.entries.map((entry) => entry.code), ["M", "A"]);
});

test("matches paths case-insensitively and across separators (Windows)", () => {
  assert.equal(normalizePathKey("C:\\work\\repo\\Lib\\A.ts"), "c:/work/repo/lib/a.ts");

  const summary = buildSessionChanges(
    written("C:\\WORK\\REPO\\lib\\Turn-Written-Files.ts"),
    { isGitRepository: true, files: [{ filePath: "c:/work/repo/lib/turn-written-files.ts", status: "untracked", code: "?", indexStatus: "?", worktreeStatus: "?" }] },
    "C:\\work\\repo",
  );

  assert.equal(summary.entries[0].status, "untracked");
  assert.equal(summary.entries[0].displayPath, "lib/Turn-Written-Files.ts");
});

test("drops duplicate writes and files absent from git status", () => {
  const summary = buildSessionChanges(
    written("C:\\work\\repo\\a.ts", "C:\\work\\repo\\a.ts", "C:\\work\\repo\\gone.ts"),
    { isGitRepository: true, files: [{ filePath: "C:\\work\\repo\\a.ts", status: "modified", code: "M", indexStatus: " ", worktreeStatus: "M" }] },
    "C:\\work\\repo",
  );

  assert.equal(summary.total, 2);
  assert.equal(summary.changed, 1);
  assert.equal(summary.entries[1].status, null);
  assert.equal(summary.entries[1].code, null);
});

test("empty written list yields an empty, non-failing summary", () => {
  const summary = buildSessionChanges([], { isGitRepository: true, files: [] }, "C:\\work\\repo");
  assert.deepEqual(summary.entries, []);
  assert.equal(summary.total, 0);
  assert.equal(summary.changed, 0);
});

test("non-git cwd keeps files but reports no repository", () => {
  const summary = buildSessionChanges(written("C:\\tmp\\x.ts"), null, "C:\\tmp");
  assert.equal(summary.isGitRepository, false);
  assert.equal(summary.total, 1);
  assert.equal(summary.changed, 0);
  assert.equal(summary.entries[0].status, null);
});

test("relative display path falls back to the absolute path outside cwd", () => {
  assert.equal(relativeDisplayPath("C:\\work\\repo\\lib\\a.ts", "C:\\work\\repo"), "lib/a.ts");
  assert.equal(relativeDisplayPath("D:\\other\\a.ts", "C:\\work\\repo"), "D:/other/a.ts");
  assert.equal(relativeDisplayPath("C:\\work\\repo\\lib\\a.ts", null), "C:/work/repo/lib/a.ts");
  assert.equal(relativeDisplayPath("C:\\work\\repo", "C:\\work\\repo"), "C:/work/repo");
});

test("builds a sorted directory tree from flat entries", () => {
  const summary = buildSessionChanges(
    written("C:\\work\\repo\\lib\\b.ts", "C:\\work\\repo\\app\\page.tsx", "C:\\work\\repo\\lib\\a.ts", "C:\\work\\repo\\README.md"),
    null,
    "C:\\work\\repo",
  );
  const tree = buildSessionChangeTree(summary.entries);

  assert.deepEqual(tree.map((node) => node.name), ["app", "lib", "README.md"]);
  assert.equal(tree[0].kind, "dir");
  assert.equal(tree[2].kind, "file");

  const lib = tree.find((node) => node.kind === "dir" && node.name === "lib");
  assert.deepEqual(lib.children.map((node) => node.name), ["a.ts", "b.ts"]);
  assert.deepEqual(lib.children.map((node) => node.path), ["lib/a.ts", "lib/b.ts"]);
  assert.equal(lib.children[0].entry.filePath, "C:\\work\\repo\\lib\\a.ts");
});

test("nests deep paths and reuses intermediate dirs", () => {
  const summary = buildSessionChanges(
    written("C:\\work\\repo\\lib\\i18n\\messages\\zh-CN.ts", "C:\\work\\repo\\lib\\i18n\\registry.ts"),
    null,
    "C:\\work\\repo",
  );
  const tree = buildSessionChangeTree(summary.entries);
  const lib = tree[0];
  assert.equal(lib.name, "lib");
  const i18n = lib.children[0];
  assert.equal(i18n.name, "i18n");
  assert.deepEqual(i18n.children.map((node) => node.name), ["messages", "registry.ts"]);
});

test("tree of an empty list is empty", () => {
  assert.deepEqual(buildSessionChangeTree([]), []);
});

test("counts additions and deletions while ignoring file headers", () => {
  const patch = [
    "diff --git a/x.ts b/x.ts",
    "index 111..222 100644",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -1,2 +1,3 @@",
    " keep",
    "-old",
    "+new",
    "+extra",
  ].join("\n");

  const stats = countPatchLineStats(patch);
  assert.deepEqual(stats, { additions: 2, deletions: 1, files: 1 });
  assert.deepEqual(countPatchLineStats(null), { additions: 0, deletions: 0, files: 0 });
  assert.deepEqual(countPatchLineStats(""), { additions: 0, deletions: 0, files: 0 });
});

test("parses unified diff rows with reconstructed line numbers", () => {
  const patch = [
    "diff --git a/x.ts b/x.ts",
    "index 111..222 100644",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -10,3 +10,4 @@",
    " ctx",
    "-gone",
    "+added",
    "+more",
    " tail",
  ].join("\n");

  const rows = parseUnifiedDiffRows(patch);
  assert.deepEqual(rows.map((row) => row.type), ["hunk", "ctx", "del", "add", "add", "ctx"]);
  assert.deepEqual(rows.map((row) => row.oldNo), [null, 10, 11, null, null, 12]);
  assert.deepEqual(rows.map((row) => row.newNo), [null, 10, null, 11, 12, 13]);
  assert.equal(rows[2].text, "gone");
  assert.equal(rows[3].text, "added");
  assert.equal(parseUnifiedDiffRows(undefined).length, 0);
});

test("diff parsing tolerates missing hunk header and empty patch", () => {
  assert.deepEqual(parseUnifiedDiffRows(""), []);
  const rows = parseUnifiedDiffRows("+first\n+second");
  assert.deepEqual(rows.map((row) => row.type), ["add", "add"]);
  assert.deepEqual(rows.map((row) => row.newNo), [0, 1]);
});
