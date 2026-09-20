import type { AgentMessage, SubagentSessionStatus, ToolResultMessage } from "./types";

/**
 * Sub-agent cards poll their child session through the shared
 * `/api/sessions/<id>` reader (the same channel the main chat uses) instead of
 * opening a second SSE lease per card. Everything here is pure so the render
 * rules stay testable without mounting React.
 */

/** Rendered rows per card. The child session can be arbitrarily long. */
export const SUBAGENT_STREAM_LIMIT = 20;
/** Visible-message window requested from the session reader. */
export const SUBAGENT_STREAM_TAIL = 20;
/** Poll interval while the sub-agent is still working. */
export const SUBAGENT_STREAM_POLL_MS = 2000;
/** Scroll box height, matching the OpenCodeUI sub-session card. */
export const SUBAGENT_STREAM_MAX_HEIGHT = 240;

export type SubagentStreamToolStatus = "running" | "done" | "error";

export interface SubagentStreamTool {
  toolCallId: string;
  name: string;
  status: SubagentStreamToolStatus;
}

export interface SubagentStreamItem {
  key: string;
  role: "user" | "assistant" | "bash";
  text: string;
  tools: SubagentStreamTool[];
}

/** Statuses that mean the child session still has work in flight. */
export function isActiveSubagentStatus(status: SubagentSessionStatus | undefined | null): boolean {
  return status === "starting" || status === "queued" || status === "running";
}

function blocksText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: string; text: string } =>
      Boolean(block)
      && typeof block === "object"
      && (block as { type?: unknown }).type === "text"
      && typeof (block as { text?: unknown }).text === "string")
    .map((block) => block.text)
    .join("\n");
}

function toolCallsOf(message: AgentMessage): { toolCallId: string; toolName: string }[] {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    const candidate = block as { type?: unknown; toolCallId?: unknown; toolName?: unknown };
    if (candidate.type !== "toolCall") return [];
    return [{
      toolCallId: typeof candidate.toolCallId === "string" ? candidate.toolCallId : "",
      toolName: typeof candidate.toolName === "string" ? candidate.toolName : "tool",
    }];
  });
}

/**
 * Fold a child session's messages into the compact rows the inline stream
 * draws: user bubbles, assistant text plus tool badges, and shell commands.
 * `toolResult` and hidden custom messages carry no row of their own — they only
 * resolve the status of the tool call they answer.
 */
export function summarizeSubagentStream(
  messages: readonly AgentMessage[],
  limit: number = SUBAGENT_STREAM_LIMIT,
): SubagentStreamItem[] {
  const results = new Map<string, ToolResultMessage>();
  for (const message of messages) {
    if (message.role !== "toolResult") continue;
    const result = message as ToolResultMessage;
    if (result.toolCallId) results.set(result.toolCallId, result);
  }

  const items: SubagentStreamItem[] = [];
  messages.forEach((message, index) => {
    if (message.role === "user") {
      const text = blocksText((message as { content?: unknown }).content).trim();
      if (text) items.push({ key: `u${index}`, role: "user", text, tools: [] });
      return;
    }
    if (message.role === "assistant") {
      const text = blocksText((message as { content?: unknown }).content).trim();
      const tools = toolCallsOf(message).map((call) => {
        const result = results.get(call.toolCallId);
        const status: SubagentStreamToolStatus = result ? (result.isError ? "error" : "done") : "running";
        return { toolCallId: call.toolCallId, name: call.toolName, status };
      });
      if (!text && tools.length === 0) return;
      items.push({ key: `a${index}`, role: "assistant", text, tools });
      return;
    }
    if (message.role === "bashExecution") {
      const command = (message as { command?: unknown }).command;
      if (typeof command === "string" && command.trim()) {
        items.push({ key: `b${index}`, role: "bash", text: command.trim(), tools: [] });
      }
    }
  });

  return items.slice(-Math.max(1, limit));
}

/** Minimal shape of `GET /api/sessions/<id>` that the stream reads. */
export interface SubagentStreamResponse {
  context?: { messages?: AgentMessage[] };
  info?: { relation?: { status?: SubagentSessionStatus } } | null;
}
