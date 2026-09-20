import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { SessionChangeTree, SessionDiffView, SessionChangesHeader, gitStatusLabel } = await jiti.import("./SessionChangesPanel.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { buildSessionChangeTree, buildSessionChanges } = await jiti.import("@/lib/session-changes");

const source = await readFile(new URL("./SessionChangesPanel.tsx", import.meta.url), "utf8");

const CWD = "E:\\pi-web-X";

function entriesFor(paths) {
  const summary = buildSessionChanges(
    paths.map((filePath) => ({ filePath })),
    {
      isGitRepository: true,
      files: [
        { filePath: "E:\\pi-web-X\\lib\\turn-written-files.ts", status: "modified", code: "M", indexStatus: " ", worktreeStatus: "M" },
        { filePath: "E:\\pi-web-X\\components\\SessionChangesPanel.tsx", status: "untracked", code: "?", indexStatus: "?", worktreeStatus: "?" },
      ],
    },
    CWD,
  );
  return summary.entries;
}

function render(element) {
  return renderToStaticMarkup(React.createElement(I18nProvider, null, element));
}

test("component source declares no Tailwind className and no react-i18next", () => {
  assert.equal(source.includes("className="), false, "must not use Tailwind className");
  assert.equal(source.includes("react-i18next"), false, "must not depend on react-i18next");
});

test("renders the written file paths and their git status labels", () => {
  const entries = entriesFor([
    "E:\\pi-web-X\\lib\\turn-written-files.ts",
    "E:\\pi-web-X\\components\\SessionChangesPanel.tsx",
  ]);
  const html = render(
    React.createElement(SessionChangeTree, {
      nodes: buildSessionChangeTree(entries),
      activePath: entries[0].filePath,
      onSelect: () => {},
      translate: (key) => key,
    }),
  );

  assert.match(html, /data-session-change-file="E:\\pi-web-X\\lib\\turn-written-files\.ts"/);
  assert.match(html, /data-session-change-file="E:\\pi-web-X\\components\\SessionChangesPanel\.tsx"/);
  assert.match(html, /data-session-change-status="modified"/);
  assert.match(html, /data-session-change-status="untracked"/);
  assert.match(html, /turn-written-files\.ts<\/span>/);
  assert.match(html, /SessionChangesPanel\.tsx<\/span>/);
  // Directory grouping is visible.
  assert.match(html, /data-session-change-dir="lib"/);
  assert.match(html, /data-session-change-dir="components"/);
});

test("status label falls back to Chinese when the i18n key is missing", () => {
  const passthrough = (key) => key;
  assert.equal(gitStatusLabel("modified", passthrough), "已修改");
  assert.equal(gitStatusLabel("untracked", passthrough), "未跟踪");
  assert.equal(gitStatusLabel(null, passthrough), "无改动");

  const translate = (key) => (key === "files.added" ? "Added" : key);
  assert.equal(gitStatusLabel("added", translate), "Added");
});

test("status label uses the i18n value when present", () => {
  const html = render(
    React.createElement(SessionChangeTree, {
      nodes: buildSessionChangeTree(entriesFor(["E:\\pi-web-X\\lib\\turn-written-files.ts"])),
      activePath: null,
      onSelect: () => {},
      translate: () => "已修改",
    }),
  );
  assert.match(html, /data-session-change-status-label=""[^>]*>已修改</);
});

test("empty entry list renders an empty tree without throwing", () => {
  const html = render(
    React.createElement(SessionChangeTree, {
      nodes: [],
      activePath: null,
      onSelect: () => {},
      translate: (key) => key,
    }),
  );
  assert.equal(html, "");
});

test("renders diff rows with markers and line numbers", () => {
  const patch = [
    "diff --git a/x.ts b/x.ts",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -1,2 +1,3 @@",
    " keep",
    "-old",
    "+new",
    "+extra",
  ].join("\n");

  const html = render(React.createElement(SessionDiffView, { patch }));

  assert.match(html, /data-session-changes-diff=""/);
  assert.match(html, /data-session-diff-row="hunk"/);
  assert.match(html, /data-session-diff-row="add"/);
  assert.match(html, /data-session-diff-row="del"/);
  assert.match(html, /data-session-diff-row="ctx"/);
  assert.match(html, /new/);
  assert.match(html, /old/);
  assert.match(html, /@@ -1,2 \+1,3 @@/);
});

test("no-changing diff renders the empty notice", () => {
  const html = render(React.createElement(SessionDiffView, { patch: null }));
  assert.match(html, /data-session-changes-no-diff=""/);
  assert.match(html, /没有可显示的 diff/);
});

test("header shows the file total and diff stats", () => {
  const html = render(
    React.createElement(SessionChangesHeader, {
      total: 12,
      stats: { additions: 34, deletions: 5 },
      loading: false,
      onRefresh: () => {},
      onClose: () => {},
    }),
  );

  assert.match(html, /data-session-changes-total=""/);
  assert.match(html, /12 个文件/);
  assert.match(html, /data-session-changes-stats=""/);
  assert.match(html, /\+34/);
  assert.match(html, /-5/);
  assert.match(html, /本会话改动/);
});

test("header omits stats when there is no diff and hides close when absent", () => {
  const html = render(
    React.createElement(SessionChangesHeader, {
      total: 0,
      stats: null,
      loading: false,
      onRefresh: () => {},
    }),
  );
  assert.doesNotMatch(html, /data-session-changes-stats/);
  assert.match(html, /0 个文件/);
  assert.doesNotMatch(html, /关闭/);
});

test("panel requests the full-branch written-file list, not a tail window", () => {
  assert.match(source, /changes=1/, "must call the ?changes=1 channel");
  assert.doesNotMatch(source, /tail=500/, "must not fetch a tail window");
  assert.doesNotMatch(
    source,
    /export function collectSessionWrittenFiles/,
    "aggregation belongs to @/lib/session-changes",
  );
});

