import type { AgentMessage, CustomMessage, TextContent, UserMessage } from "./types";
import { isMessageGroupAnchor } from "./message-display";

/** 构建期标题上限：先粗截，UI 再按栏宽细截。 */
export const FULL_TITLE_MAX = 80;

/** 少于该条目数时不值得渲染索引条。 */
export const MIN_OUTLINE_TICKS = 2;

export interface OutlineSourceEntry {
  messageId: string;
  title: string;
}

/**
 * 截断大纲标签，超长时补省略号。
 * @param text 原始文本
 * @param max 最大字符数
 * @returns 截断后的文本
 */
export function truncateOutlineLabel(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "\u2026";
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 取首个非空行：多行提示词在索引条里只保留第一行。 */
function firstNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function messagePlainText(message: UserMessage | CustomMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * 从消息数组构建大纲条目。
 *
 * 只有消息组锚点（用户消息、压缩摘要）进入索引条，其余角色不产生落点。
 * 本仓消息对象本身不带 id，落点 id 与 messages 逐位对齐地取自 entryIds；
 * 取不到 id 的消息无法定位到 DOM，直接跳过而不产出死链。
 *
 * @param messages 与 entryIds 同序的消息数组
 * @param entryIds 与 messages 同序的会话条目 id（ChatWindow 的 data-entry-id 来源）
 * @returns 大纲条目，按消息顺序排列
 */
export function buildOutlineSourceEntries(
  messages: readonly AgentMessage[],
  entryIds: readonly (string | undefined)[],
): OutlineSourceEntry[] {
  const entries: OutlineSourceEntry[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!isMessageGroupAnchor(message)) continue;
    const messageId = entryIds[index];
    if (!messageId) continue;
    const raw = firstNonEmptyLine(messagePlainText(message as UserMessage | CustomMessage));
    if (!raw) continue;
    entries.push({
      messageId,
      title: truncateOutlineLabel(normalizeWhitespace(raw), FULL_TITLE_MAX),
    });
  }
  return entries;
}