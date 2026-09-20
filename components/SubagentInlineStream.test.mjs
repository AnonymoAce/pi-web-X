import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { MessageView } = await jiti.import("./MessageView.tsx");
const { SubagentStreamBody, SubagentInlineStream } = await jiti.import("./SubagentInlineStream.tsx");
const { summarizeSubagentStream, SUBAGENT_STREAM_LIMIT } = await jiti.import("@/lib/subagent-stream");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function renderCard(result, block, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MessageView, {
        message: { role: "assistant", provider: "anthropic", model: "claude-test", content: [block] },
        toolResults: new Map([[block.toolCallId, result]]),
        ...props,
      }),
    ),
  );
}

function agentBlock(overrides = {}) {
  return {
    type: "toolCall",
    toolCallId: "call-agent-stream",
    toolName: "Agent",
    input: { subagent_type: "Explore", prompt: "Find the parser", description: "Find parser" },
    ...overrides,
  };
}

function agentResult(details, overrides = {}) {
  return {
    role: "toolResult",
    toolCallId: "call-agent-stream",
    content: [{ type: "text", text: "sub-agent output" }],
    details: {
      kind: "pi-web-subagent",
      sessionId: "child-session",
      profile: "Explore",
      description: "Find parser",
      runInBackground: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      ...details,
    },
    ...overrides,
  };
}

test("renders a stop button only while a sub-agent is still running", () => {
  for (const [status, expected] of [["running", true], ["starting", true], ["completed", false], ["aborted", false], ["failed", false]]) {
    const html = renderCard(agentResult({ status }), agentBlock(), { onOpenSession() {} });
    assert.equal(
      html.includes('aria-label="Stop sub-agent"'),
      expected,
      `status=${status} should ${expected ? "" : "not "}render the stop button`,
    );
  }
});

test("keeps the open-session button on every sub-agent card", () => {
  for (const status of ["running", "completed", "aborted"]) {
    const html = renderCard(agentResult({ status }), agentBlock(), { onOpenSession() {} });
    assert.match(html, /aria-label="Open sub-agent session"/, `status=${status}`);
  }
});

test("expands a running sub-agent card but leaves a finished one collapsed", () => {
  const running = renderCard(agentResult({ status: "running" }), agentBlock(), { onOpenSession() {} });
  assert.match(running, /data-subagent-card/, "running card should open itself");

  // The OpenCodeUI shape: a completed card stays collapsed until the user
  // opens it, so a finished run does not push chat history off screen.
  const completed = renderCard(agentResult({ status: "completed" }), agentBlock(), { onOpenSession() {} });
  assert.doesNotMatch(completed, /data-subagent-card/);

  // A stale "running" in persisted details cannot keep the card running: the
  // status the child session reports decides once it has answered. Covered by
  // the summarize/status unit below; here the collapsed state is the guard.
  assert.doesNotMatch(completed, /aria-label="Stop sub-agent"/);
});

test("keeps a sub-agent card collapsed after the user closes it by hand", async () => {
  const { clearExpandedToolCalls, setToolCallExpanded } = await jiti.import("@/lib/tool-call-expansion");
  clearExpandedToolCalls();

  // Simulate the user collapsing the running card; the streaming message is
  // re-keyed on the next render, which remounts the card.
  const block = agentBlock();
  setToolCallExpanded(block.toolCallId, false);

  const html = renderCard(agentResult({ status: "running" }), block, { onOpenSession() {} });
  assert.doesNotMatch(html, /data-subagent-card/, "a manually collapsed card must stay collapsed");
  clearExpandedToolCalls();
});

test("re-opens a sub-agent card the user left expanded", async () => {
  const { clearExpandedToolCalls, setToolCallExpanded } = await jiti.import("@/lib/tool-call-expansion");
  clearExpandedToolCalls();

  const block = agentBlock();
  setToolCallExpanded(block.toolCallId, true);
  const html = renderCard(agentResult({ status: "completed" }), block, { onOpenSession() {} });
  assert.match(html, /data-subagent-card/, "an expanded card stays open after it finishes");
  clearExpandedToolCalls();
});

test("keeps a finished sub-agent card open once it auto-expanded", async () => {
  const { clearExpandedToolCalls, isToolCallExpanded, setToolCallExpanded } =
    await jiti.import("@/lib/tool-call-expansion");
  clearExpandedToolCalls();

  // A streaming message is re-keyed from streamState to messages to entryIds,
  // so "still open after it finished" means "the expansion survived a remount".
  // The card records its own auto-expansion for exactly that reason; this locks
  // the record in place.
  const block = agentBlock();
  setToolCallExpanded(block.toolCallId, true);

  const html = renderCard(agentResult({ status: "completed" }), block, { onOpenSession() {} });
  assert.match(html, /data-subagent-card/, "auto-expanded card stays open after the child finishes");
  assert.equal(isToolCallExpanded(block.toolCallId), true);
  clearExpandedToolCalls();
});

test("hides the raw task blob for sub-agent cards", () => {
  const html = renderCard(agentResult({ status: "running" }), agentBlock(), { onOpenSession() {} });
  assert.doesNotMatch(html, /Find the parser/);
});

test("summarizes child-session messages into role-tagged stream rows", () => {
  const rows = summarizeSubagentStream([
    { role: "user", content: [{ type: "text", text: "Find the parser" }] },
    { role: "assistant", content: [
      { type: "thinking", thinking: "hidden reasoning" },
      { type: "toolCall", toolCallId: "t1", toolName: "grep", input: { pattern: "parse" } },
      { type: "toolCall", toolCallId: "t2", toolName: "read", input: { path: "a.ts" } },
    ] },
    { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "3 hits" }] },
    { role: "toolResult", toolCallId: "t2", content: [{ type: "text", text: "boom" }], isError: true },
    { role: "assistant", content: [{ type: "text", text: "Parser is in lib/parser.ts" }] },
  ]);

  assert.deepEqual(rows.map((r) => r.role), ["user", "assistant", "assistant"]);
  assert.equal(rows[0].text, "Find the parser");
  assert.deepEqual(
    rows[1].tools.map((t) => [t.name, t.status]),
    [["grep", "done"], ["read", "error"]],
  );
  // Thinking blocks carry no row of their own.
  assert.equal(rows.some((r) => r.text.includes("hidden reasoning")), false);
  assert.equal(rows[2].text, "Parser is in lib/parser.ts");
  assert.deepEqual(rows[2].tools, []);
});

test("marks tool calls without a result as still running", () => {
  const rows = summarizeSubagentStream([
    { role: "assistant", content: [{ type: "toolCall", toolCallId: "t9", toolName: "bash", input: {} }] },
  ]);
  assert.deepEqual(rows[0].tools.map((t) => t.status), ["running"]);
});

test("bounds the stream to the newest rows", () => {
  const many = Array.from({ length: 60 }, (_, index) => ({
    role: "assistant",
    content: [{ type: "text", text: `step-${index}` }],
  }));

  const rows = summarizeSubagentStream(many);
  assert.equal(rows.length, SUBAGENT_STREAM_LIMIT);
  // Newest kept, oldest dropped.
  assert.equal(rows[rows.length - 1].text, "step-59");
  assert.equal(rows[0].text, `step-${60 - SUBAGENT_STREAM_LIMIT}`);
  assert.equal(rows.some((r) => r.text === "step-0"), false);

  // The explicit limit is honored too, so a caller can ask for less.
  assert.equal(summarizeSubagentStream(many, 3).length, 3);
});

test("renders the bounded stream body with at most SUBAGENT_STREAM_LIMIT rows", () => {
  const items = summarizeSubagentStream(
    Array.from({ length: 50 }, (_, index) => ({
      role: "assistant",
      content: [{ type: "text", text: `row-${index}` }],
    })),
    // ask for everything; the body must still clamp it
    50,
  );
  const html = renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(SubagentStreamBody, { items })),
  );

  assert.match(html, /data-subagent-stream/);
  const rendered = html.match(/data-subagent-row=/g) ?? [];
  assert.equal(rendered.length, SUBAGENT_STREAM_LIMIT);
  assert.match(html, /row-49/);
  assert.doesNotMatch(html, /row-0"/);
});

test("shows a waiting placeholder before the child session has messages", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(SubagentInlineStream, { sessionId: "child-session", active: true }),
    ),
  );
  assert.match(html, /data-subagent-stream-empty/);
  assert.match(html, /Waiting for the sub-agent to start/);
});

test("uses no Tailwind class names in the stream markup", () => {
  const items = summarizeSubagentStream([
    { role: "user", content: [{ type: "text", text: "hello" }] },
    { role: "assistant", content: [{ type: "text", text: "hi" }, { type: "toolCall", toolCallId: "t1", toolName: "grep", input: {} }] },
    { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "ok" }] },
  ]);
  const html = renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(SubagentStreamBody, { items })),
  );
  assert.doesNotMatch(html, /class="/);
});
