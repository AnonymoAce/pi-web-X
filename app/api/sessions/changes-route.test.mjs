// 阶段四·任务②：会话详情 API 的 ?changes=1 全量写入文件通道。
// 行为断言证明根因（懒加载尾部窗口丢写入），静态断言守住「默认响应逐字不变」。
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
const { collectSessionWrittenFiles } = await jiti.import("@/lib/session-changes");

const CWD = "e:/work";
const TURNS = 13;
const ASSISTANTS_PER_TURN = 60;
// 写入只发生在最前三轮 —— 尾部窗口（最后 50 个可见消息）必然覆盖不到。
const EARLY_WRITES = [
  { id: "w0", filePath: "e:/work/src/early-0.ts" },
  { id: "w1", filePath: "e:/work/src/early-1.ts" },
  { id: "w2", filePath: "e:/work/src/early-2.ts" },
];

function sessionEntries() {
  const entries = [];
  let id = 0;
  const push = (message) => {
    entries.push({
      id: `e${id}`,
      parentId: id === 0 ? null : `e${id - 1}`,
      type: "message",
      timestamp: new Date(1000 + id * 1000).toISOString(),
      message,
    });
    id += 1;
  };
  for (let turn = 0; turn < TURNS; turn += 1) {
    push({ role: "user", content: `第 ${turn} 轮` });
    for (let k = 0; k < ASSISTANTS_PER_TURN; k += 1) {
      const write = turn < EARLY_WRITES.length && k === 0 ? EARLY_WRITES[turn] : null;
      push({
        role: "assistant",
        content: write
          ? [
              { type: "text", text: `写入 ${write.filePath}` },
              { type: "toolCall", toolCallId: write.id, toolName: "write", input: { file_path: write.filePath } },
            ]
          : [{ type: "text", text: `助手回复 ${id}` }],
      });
      if (write) {
        push({ role: "toolResult", toolCallId: write.id, toolName: "write", content: [{ type: "text", text: "ok" }] });
      }
    }
  }
  return entries;
}

test("root cause: the tail window drops the session's early writes", () => {
  const entries = sessionEntries();
  const leafId = entries[entries.length - 1].id;

  const tail = buildSessionContext(entries, leafId, { tail: 50 });
  const tailFiles = collectSessionWrittenFiles(tail.messages, CWD);

  // 尾部窗口只覆盖最后一轮，早期写入一个都看不到。
  assert.equal(tailFiles.length, 0);
});

test("full branch: every write is found, however old", () => {
  const entries = sessionEntries();
  const leafId = entries[entries.length - 1].id;

  const full = buildSessionContext(entries, leafId, {});
  const fullFiles = collectSessionWrittenFiles(full.messages, CWD);

  assert.deepEqual(fullFiles.map((file) => file.filePath), EARLY_WRITES.map((write) => write.filePath));
});

test("route gates the full branch behind changes=1 and ships only the path list", () => {
  assert.match(routeSrc, /const changesContext = searchParams\.has\("changes"\)/);
  // 全量 context 必须不传 tail，否则又退回窗口。
  assert.match(routeSrc, /buildSessionContext\(entries as never, leafId, \{ sessionId: id \}\)/);
  assert.match(routeSrc, /collectSessionWrittenFiles\(changesContext\.messages, header\?\.cwd \?\? null\)/);
  assert.match(routeSrc, /\.\.\.\(writtenFiles !== undefined \? \{ writtenFiles \} : \{\}\),/);
});

test("route default path stays byte-identical (no writtenFiles key)", () => {
  const responseBlock = routeSrc.slice(
    routeSrc.indexOf("return jsonResponse("),
    routeSrc.indexOf("} catch (error) {"),
  );
  assert.notEqual(responseBlock, "");
  // 全量 messages（长会话可达数 MB）绝不下发：响应体里只有几十条路径。
  assert.doesNotMatch(responseBlock, /changesContext/);
  assert.match(routeSrc, /const context = buildSessionContext\(entries as never, leafId, \{/);
  assert.match(routeSrc, /Number\.isFinite\(rawTail\) && rawTail > 0 \? Math\.min\(rawTail, 1000\) : 50/);
});
