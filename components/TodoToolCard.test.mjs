import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TodoToolCard } = await jiti.import("./TodoToolCard.tsx");
const { parseTodoList } = await jiti.import("@/lib/todo-tool");
const { clearExpandedToolCalls, setToolCallExpanded } = await jiti.import("@/lib/tool-call-expansion");

const REAL_VIEW = [
  "### 阶段一：规则双改 (status: done, 1/1 done)",
  "  1. [x] 阶段一：demo 规则强化与选型·任务①：查 OpenCode 数据库",
  "### 阶段二：对标 OpenCodeUI 第二批 (status: active, 0/2 done)",
  "  2. [ ] 任务①：会话变更面板·步骤1：新建 SessionChangesPanel",
  "  3. [/] 任务②：Todo 工具卡片·步骤1：新建 todo 提取层与 TodoToolCard",
].join("\n");

function render(data, toolCallId = "call-todo-card") {
  return renderToStaticMarkup(React.createElement(TodoToolCard, { data, toolCallId }));
}

test("renders progress, phase titles and every item", () => {
  clearExpandedToolCalls();
  const html = render(parseTodoList(REAL_VIEW));
  assert.match(html, /1\/3 已完成/);
  assert.match(html, /阶段一：规则双改/);
  assert.match(html, /阶段二：对标 OpenCodeUI 第二批/);
  assert.match(html, /1\/1/);
  assert.match(html, /0\/2/);
  assert.match(html, /新建 SessionChangesPanel/);
  assert.match(html, /新建 todo 提取层与 TodoToolCard/);
});

test("marks each item with its own status", () => {
  clearExpandedToolCalls();
  const html = render(parseTodoList(REAL_VIEW));
  assert.match(html, /data-todo-status="completed"/);
  assert.match(html, /data-todo-status="pending"/);
  assert.match(html, /data-todo-status="in_progress"/);
  assert.match(html, /已完成/);
  assert.match(html, /进行中/);
  assert.match(html, /待办/);
});

test("stays expanded by default so the list is visible at a glance", () => {
  clearExpandedToolCalls();
  const html = render(parseTodoList(REAL_VIEW));
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /data-todo-item/);
});

test("collapses to header-only when the user closed this card", () => {
  clearExpandedToolCalls();
  setToolCallExpanded("call-collapsed", false);
  const html = render(parseTodoList(REAL_VIEW), "call-collapsed");
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /1\/3 已完成/);
  assert.doesNotMatch(html, /data-todo-item/);
  assert.doesNotMatch(html, /新建 SessionChangesPanel/);
});

test("uses no class attribute and no Tailwind utility string", () => {
  clearExpandedToolCalls();
  const html = render(parseTodoList(REAL_VIEW));
  assert.doesNotMatch(html, /class=/);
  assert.doesNotMatch(html, /className/);
});

test("renders nothing without phases", () => {
  clearExpandedToolCalls();
  assert.equal(render({ phases: [], done: 0, total: 0 }), "");
});
