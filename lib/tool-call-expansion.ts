/**
 * Remembers which tool-call cards the user has expanded, keyed by toolCallId.
 *
 * A streaming assistant message is rendered from `streamState`, then re-rendered
 * from `messages` after `message_end`, and re-keyed again once `entryIds` arrive
 * from the session file. Each of those hops remounts `ToolCallBlock`, so plain
 * component state would collapse a card the user just opened. Keeping the set
 * outside React lets the remounted card start expanded without threading state
 * through every message component.
 */
const expandedToolCalls = new Set<string>();

/**
 * Cards the user has collapsed by hand. Kept apart from `expandedToolCalls`
 * because absence there means "no decision yet", which a card that opens itself
 * (a running sub-agent) needs to distinguish from "the user closed this".
 * Without it a remount would re-open a card the user just collapsed.
 */
const collapsedToolCalls = new Set<string>();

export function isToolCallExpanded(toolCallId: string | undefined): boolean {
  return toolCallId !== undefined && expandedToolCalls.has(toolCallId);
}

/** True once the user has collapsed this card, so it stays closed. */
export function isToolCallCollapsedByUser(toolCallId: string | undefined): boolean {
  return toolCallId !== undefined && collapsedToolCalls.has(toolCallId);
}

export function setToolCallExpanded(toolCallId: string | undefined, expanded: boolean): void {
  if (!toolCallId) return;
  if (expanded) {
    expandedToolCalls.add(toolCallId);
    collapsedToolCalls.delete(toolCallId);
  } else {
    expandedToolCalls.delete(toolCallId);
    collapsedToolCalls.add(toolCallId);
  }
}

export function clearExpandedToolCalls(): void {
  expandedToolCalls.clear();
  collapsedToolCalls.clear();
}
