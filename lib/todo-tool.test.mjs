import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { extractTodoList, parseTodoList, toolResultText } = await jiti.import("./todo-tool.ts");
const { isTodoToolName } = await jiti.import("./tool-names.ts");

// Verbatim output of the `todo` tool's view, taken from a real session
// (`2026-09-19T10-28-50-891Z_01a0b936-*.jsonl`, toolResult toolName="todo").
const REAL_VIEW = [
  "### 阶段一：规则双改 (status: done, 1/1 done)",
  "  1. [x] 阶段一：demo 规则强化与选型·任务①：查 OpenCode 数据库找回 WorkBuddy 画布 demo 会话解释·步骤1：枚举 opencode.db 表结构并定位含关键词的消息（已找回：ses_fd7f001d4ffeRKDOnpaHFoTydb）",
  "### 阶段二：对标 OpenCodeUI 第二批 (status: active, 0/3 done)",
  "  2. [ ] 任务①：会话变更面板·步骤1：新建 SessionChangesPanel（文件列表+diff 预览）并挂进右栏",
  "  3. [ ] 任务②：Todo 工具卡片·步骤1：新建 todo 提取层与 TodoToolCard，接进 MessageView 工具分支",
  "  4. [/] 任务③：对话大纲索引条·步骤1：新建 outline-model 与 OutlineIndex 鱼眼索引条，接进 ChatWindow",
].join("\n");

function result(text, overrides = {}) {
  return {
    role: "toolResult",
    toolCallId: "call-todo",
    toolName: "todo",
    content: [{ type: "text", text }],
    isError: false,
    ...overrides,
  };
}

test("parses the real view body into phases and items", () => {
  const data = parseTodoList(REAL_VIEW);
  assert.equal(data.phases.length, 2);
  assert.equal(data.phases[0].title, "阶段一：规则双改");
  assert.equal(data.phases[0].status, "done");
  assert.equal(data.phases[0].items.length, 1);
  assert.equal(data.phases[0].items[0].status, "completed");
  assert.equal(data.phases[1].title, "阶段二：对标 OpenCodeUI 第二批");
  assert.equal(data.phases[1].status, "active");
  assert.equal(data.phases[1].items.length, 3);
  assert.equal(data.phases[1].items[0].content.startsWith("任务①：会话变更面板"), true);
  assert.equal(data.phases[1].items[1].status, "pending");
});

test("counts progress from phase headers, matching the tool's own numbers", () => {
  const data = parseTodoList(REAL_VIEW);
  assert.equal(data.done, 1);
  assert.equal(data.total, 4);
  assert.equal(data.phases[1].done, 0);
  assert.equal(data.phases[1].total, 3);
});

test("maps every documented status mark", () => {
  const text = [
    "### P (status: active, 0/5 done)",
    "  1. [ ] pending one",
    "  2. [/] in progress one",
    "  3. [x] completed one",
    "  4. [-] abandoned one",
    "  5. [!] blocked one",
  ].join("\n");
  const statuses = parseTodoList(text).phases[0].items.map((item) => item.status);
  assert.deepEqual(statuses, ["pending", "in_progress", "completed", "abandoned", "blocked"]);
});

test("uppercase X counts as completed", () => {
  const data = parseTodoList(["### P (status: active, 1/1 done)", "  1. [X] done"].join("\n"));
  assert.equal(data.phases[0].items[0].status, "completed");
});

test("returns null for non-view replies so the card stays hidden", () => {
  assert.equal(parseTodoList("✓ Added to \"阶段二\". Use `todo start` when you begin it."), null);
  assert.equal(parseTodoList("✗ todo error: EPERM: operation not permitted, fsync"), null);
  assert.equal(parseTodoList("No todos yet. Use `todo add <phase> <content>`."), null);
  assert.equal(parseTodoList(""), null);
  assert.equal(parseTodoList(null), null);
  assert.equal(parseTodoList(undefined), null);
});

test("tolerates a malformed or missing result without throwing", () => {
  assert.equal(extractTodoList(null), null);
  assert.equal(extractTodoList(undefined), null);
  assert.equal(extractTodoList({}), null);
  assert.equal(extractTodoList({ content: null }), null);
  assert.equal(extractTodoList({ content: "### P (status: active, 0/1 done)" }), null);
  assert.equal(extractTodoList({ content: [null, 42, { type: "image" }] }), null);
  assert.equal(toolResultText({ content: [] }), "");
});

test("drops an errored call and a list without phases", () => {
  assert.equal(extractTodoList(result(REAL_VIEW, { isError: true })), null);
  assert.equal(extractTodoList(result("### P without the count suffix")), null);
});

test("extracts the real result end to end", () => {
  const data = extractTodoList(result(REAL_VIEW));
  assert.equal(data.total, 4);
  assert.equal(data.phases[1].items[2].status, "in_progress");
});

test("recognizes the todo tool name and its decorated forms only", () => {
  assert.equal(isTodoToolName("todo"), true);
  assert.equal(isTodoToolName("Todo"), true);
  assert.equal(isTodoToolName("todos"), true);
  assert.equal(isTodoToolName("todoread"), true);
  assert.equal(isTodoToolName("todowrite"), true);
  assert.equal(isTodoToolName("todo_add"), true);
  assert.equal(isTodoToolName("todo-write"), true);
  assert.equal(isTodoToolName("mcp__server.todo"), true);
  assert.equal(isTodoToolName("x_todo"), true);
  assert.equal(isTodoToolName("todolist"), false);
  assert.equal(isTodoToolName("read"), false);
  assert.equal(isTodoToolName("edit"), false);
  assert.equal(isTodoToolName("todo"), isTodoToolName("TODO"));
});

test("joins multiple text blocks and ignores non-string text", () => {
  const list = [
    "### P (status: active, 0/1 done)",
    "  1. [ ] only item",
  ].join("\n");
  assert.equal(parseTodoList(toolResultText({ content: [{ type: "text", text: list }] })).total, 1);
  assert.equal(toolResultText({ content: [{ type: "text", text: 5 }, { type: "text", text: "" }] }), "");
});
