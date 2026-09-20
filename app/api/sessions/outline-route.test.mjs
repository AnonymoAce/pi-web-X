// 任务②（阶段三）：会话详情 API 的 ?outline=1 通道。
// 行为断言证明根因（懒加载尾部窗口 << 全量分支锚点），静态断言守住「默认行为逐字不变」。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const routeSrc = await readFileSync(new URL("./[id]/route.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { buildSessionContext } = await jiti.import("@/lib/session-reader");
const { buildOutlineSourceEntries, MIN_OUTLINE_TICKS } = await jiti.import("@/lib/outline-model");

// 14 轮对话，每轮 1 条 user + 60 条 assistant（agent 密集形态），共 854 条。
const TURNS = 14;
const ASSISTANTS_PER_TURN = 60;
function sessionEntries() {
  const entries = [];
  let id = 0;
  const push = (role) => {
    entries.push({
      id: `e${id}`,
      parentId: id === 0 ? null : `e${id - 1}`,
      type: "message",
      timestamp: new Date(1000 + id * 1000).toISOString(),
      message: { role, content: role === "user" ? `第 ${id} 条用户需求` : `助手回复 ${id}` },
    });
    id += 1;
  };
  for (let turn = 0; turn < TURNS; turn += 1) {
    push("user");
    for (let k = 0; k < ASSISTANTS_PER_TURN; k += 1) push("assistant");
  }
  return entries;
}

test("root cause: the tail window holds fewer anchors than the rail threshold", () => {
  const entries = sessionEntries();
  const leafId = entries[entries.length - 1].id;

  const tail = buildSessionContext(entries, leafId, { tail: 50 });
  const tailAnchors = buildOutlineSourceEntries(tail.messages, tail.entryIds);

  // 懒加载窗口只覆盖最后一轮 → 锚点低于 MIN_OUTLINE_TICKS，OutlineIndex 直接 return null。
  assert.equal(tail.messages.length, 50);
  assert.ok(
    tailAnchors.length < MIN_OUTLINE_TICKS,
    `tail window should starve the rail, got ${tailAnchors.length} anchors`,
  );
});

test("outline source: the full branch carries every user anchor", () => {
  const entries = sessionEntries();
  const leafId = entries[entries.length - 1].id;

  const full = buildSessionContext(entries, leafId, {});
  const fullAnchors = buildOutlineSourceEntries(full.messages, full.entryIds);

  assert.equal(full.hasMore, false);
  assert.equal(fullAnchors.length, TURNS);
  assert.equal(fullAnchors[0].title, "第 0 条用户需求");
  // 用户锚点每隔 61 条落一次，最后一个在 e793。
  assert.equal(fullAnchors[TURNS - 1].messageId, `e${(TURNS - 1) * (ASSISTANTS_PER_TURN + 1)}`);
});

test("route gates the full branch behind outline=1 and ships only the anchor list", () => {
  assert.match(routeSrc, /const fullContext = searchParams\.has\("outline"\)/);
  // 全量 context 必须不传 tail，否则又退回窗口。
  assert.match(
    routeSrc,
    /buildSessionContext\(entries as never, leafId, \{ deferThinking, deferToolResultImages, sessionId: id \}\)/,
  );
  assert.match(routeSrc, /const outlineEntries = fullContext\n?\s*\? buildOutlineSourceEntries\(fullContext\.messages, fullContext\.entryIds\)/);
  assert.match(routeSrc, /\.\.\.\(outlineEntries !== undefined \? \{ outlineEntries \} : \{\}\),/);
});

test("route default path stays byte-identical (no outline key, tail context untouched)", () => {
  const responseBlock = routeSrc.slice(
    routeSrc.indexOf("return jsonResponse("),
    routeSrc.indexOf("} catch (error) {"),
  );
  assert.notEqual(responseBlock, "");
  // 5.4MB 的全量 context 绝不下发：响应体里只有 outlineEntries。
  assert.doesNotMatch(responseBlock, /fullContext/);
  assert.match(routeSrc, /const context = buildSessionContext\(entries as never, leafId, \{/);
  assert.match(routeSrc, /Number\.isFinite\(rawTail\) && rawTail > 0 \? Math\.min\(rawTail, 1000\) : 50/);
});
