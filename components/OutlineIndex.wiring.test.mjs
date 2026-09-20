// 任务②（阶段三）：全量大纲数据源的客户端接线 + 索引条按传入条目渲染。
// 数据源缺口（懒加载窗口）在服务端测试覆盖；这里守住接线三处 + 渲染计数 + 分页通道复用。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { OutlineIndex } = await jiti.import("./OutlineIndex.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const chatWindowSrc = (await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const hookSrc = (await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(OutlineIndex, props)),
  );
}

function entries(count) {
  return Array.from({ length: count }, (_, i) => ({ messageId: `full-${i}`, title: `全量锚点 ${i}` }));
}

test("renders one tick per supplied full-branch entry", () => {
  const html = render({
    // 与线上一致：窗口里只有 1 条锚点（不足以渲染），全量条目来自服务端。
    messages: [{ role: "user", content: "窗口内唯一一条" }],
    entryIds: ["tail-1"],
    sourceEntries: entries(14),
    onScrollToMessageId() {},
  });

  assert.match(html, /data-outline-index=""/);
  assert.equal((html.match(/data-outline-tick="/g) ?? []).length, 14);
  assert.match(html, /data-outline-tick="full-13"/);
  assert.match(html, /全量锚点 0/);
  assert.doesNotMatch(html, /窗口内唯一一条/);
});

test("long sessions keep the tail window of the rail (RAIL_MAX_TICKS)", () => {
  const html = render({
    messages: [{ role: "user", content: "x" }],
    entryIds: ["tail-1"],
    sourceEntries: entries(50),
    onScrollToMessageId() {},
  });

  assert.equal((html.match(/data-outline-tick="/g) ?? []).length, 40);
  assert.match(html, /data-outline-tick="full-49"/);
  assert.doesNotMatch(html, /data-outline-tick="full-9"/);
});

test("hook fetches the full outline alongside the lazily-paged context", () => {
  assert.match(hookSrc, /new URLSearchParams\(\{ deferThinking: "1", deferMedia: "1", outline: "1" \}\)/);
  assert.match(hookSrc, /const \[outlineEntries, setOutlineEntries\] = useState<OutlineSourceEntry\[\]>\(\[\]\)/);
  assert.match(hookSrc, /setOutlineEntries\(d\.outlineEntries \?\? \[\]\)/);
  assert.match(hookSrc, /setOutlineEntries\(\[\]\);/);
  assert.match(hookSrc, /entryIds, outlineEntries, historyCursor, hasEarlierMessages, streamState,/);
  assert.match(hookSrc, /outlineEntries\?: OutlineSourceEntry\[\];/);
  // 分页路径（loadContext）不得被大纲改动牵动。
  assert.doesNotMatch(hookSrc, /const params = new URLSearchParams\(\{ deferThinking: "1", deferMedia: "1", outline: "1" \}\);\n\s+if \(leafId\)/);
});

test("ChatWindow feeds the rail from the full outline, not the page window", () => {
  assert.match(chatWindowSrc, /loading, error, messages, activeToolResults, entryIds, outlineEntries, historyCursor, hasEarlierMessages, streamState,/);
  assert.match(chatWindowSrc, /sourceEntries=\{outlineEntries\.length > 0 \? outlineEntries : undefined\}/);
  assert.match(chatWindowSrc, /rightOffset=\{CHAT_MINIMAP_WIDTH \+ 4\}/);
});

test("a tick outside the loaded page pages history in through the existing channel", () => {
  // 复用既有分页通道（loadContext + loadingOlderRef + prevScrollDistanceRef），不新造滚动管道。
  assert.match(chatWindowSrc, /pendingOutlineEntryRef\.current = entryId;/);
  assert.match(chatWindowSrc, /const context = await loadContext\(sid, activeLeafId, before, \{ tail: 200 \}\)/);
  assert.match(chatWindowSrc, /if \(context\.entryIds\.includes\(entryId\)\) \{/);
  assert.match(chatWindowSrc, /loadingOlderRef\.current = true;/);
  assert.match(chatWindowSrc, /prevScrollDistanceRef\.current = captureScrollDistance/);
  assert.match(chatWindowSrc, /prevScrollDistanceRef\.current = null;/);
  // 命中后仍走既有 pendingOutlineEntryRef → useLayoutEffect 重试滚动，未新增滚动入口。
  assert.match(chatWindowSrc, /useLayoutEffect\(\(\) => \{\n\s+const entryId = pendingOutlineEntryRef\.current;/);
});
