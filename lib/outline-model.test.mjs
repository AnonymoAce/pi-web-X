import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  FULL_TITLE_MAX,
  MIN_OUTLINE_TICKS,
  buildOutlineSourceEntries,
  truncateOutlineLabel,
} = await jiti.import("./outline-model.ts");

function user(content) {
  return { role: "user", content };
}

function compaction(summary) {
  return { role: "custom", customType: "compaction", content: summary, display: true };
}

function assistant(text) {
  return { role: "assistant", content: [{ type: "text", text }], provider: "test", model: "test-model" };
}

test("builds one entry per anchor message, in message order", () => {
  const entries = buildOutlineSourceEntries(
    [user("第一条需求"), assistant("好的"), user("第二条需求")],
    ["e1", "e2", "e3"],
  );

  assert.deepEqual(entries, [
    { messageId: "e1", title: "第一条需求" },
    { messageId: "e3", title: "第二条需求" },
  ]);
});

test("keeps compaction summaries as anchors", () => {
  const entries = buildOutlineSourceEntries(
    [user("前期需求"), compaction("已压缩的对话摘要"), assistant("继续")],
    ["e1", "e2", "e3"],
  );

  assert.deepEqual(entries.map((entry) => entry.messageId), ["e1", "e2"]);
  assert.equal(entries[1].title, "已压缩的对话摘要");
});

test("reads text blocks out of array content", () => {
  const entries = buildOutlineSourceEntries(
    [user([{ type: "text", text: "图文混排的消息" }, { type: "image", source: { type: "url", url: "x" } }])],
    ["e1"],
  );

  assert.equal(entries[0].title, "图文混排的消息");
});

test("normalizes whitespace and keeps only the first non-empty line", () => {
  const entries = buildOutlineSourceEntries(
    [user("\n\n   第一行   带空格 \n 第二行不该出现 ")],
    ["e1"],
  );

  assert.equal(entries[0].title, "第一行 带空格");
});

test("returns an empty array for no messages", () => {
  assert.deepEqual(buildOutlineSourceEntries([], []), []);
});

test("skips messages the session has no entry id for", () => {
  const entries = buildOutlineSourceEntries([user("有 id"), user("无 id")], ["e1", undefined]);

  assert.deepEqual(entries.map((entry) => entry.messageId), ["e1"]);
});

test("skips messages without text", () => {
  const entries = buildOutlineSourceEntries(
    [user("   "), user([]), user("有内容")],
    ["e1", "e2", "e3"],
  );

  assert.deepEqual(entries.map((entry) => entry.messageId), ["e3"]);
});

test("caps built titles at the full-title limit", () => {
  const entries = buildOutlineSourceEntries([user("长".repeat(200))], ["e1"]);

  assert.equal(entries[0].title.length, FULL_TITLE_MAX + 1);
  assert.ok(entries[0].title.endsWith("\u2026"));
});

test("truncateOutlineLabel leaves short text alone and ellipsizes long text", () => {
  assert.equal(truncateOutlineLabel("短标签", 10), "短标签");
  assert.equal(truncateOutlineLabel("12345", 5), "12345");
  assert.equal(truncateOutlineLabel("123456", 5), "12345\u2026");
});

test("exposes a render threshold of two ticks", () => {
  assert.equal(MIN_OUTLINE_TICKS, 2);
  assert.ok(buildOutlineSourceEntries([user("只有一条")], ["e1"]).length < MIN_OUTLINE_TICKS);
});