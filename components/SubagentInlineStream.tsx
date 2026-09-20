"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  SUBAGENT_STREAM_LIMIT,
  SUBAGENT_STREAM_MAX_HEIGHT,
  SUBAGENT_STREAM_POLL_MS,
  SUBAGENT_STREAM_TAIL,
  isActiveSubagentStatus,
  summarizeSubagentStream,
  type SubagentStreamItem,
  type SubagentStreamResponse,
  type SubagentStreamTool,
} from "@/lib/subagent-stream";
import type { SubagentSessionStatus } from "@/lib/types";

/** 404 polls tolerated before the card reports the child session as gone. */
const MISSING_SESSION_ATTEMPTS = 15;

const STREAM_QUERY = new URLSearchParams({
  deferThinking: "1",
  deferMedia: "1",
  tail: String(SUBAGENT_STREAM_TAIL),
}).toString();

const TOOL_STATUS_COLOR: Record<SubagentStreamTool["status"], string> = {
  running: "var(--accent)",
  done: "var(--text-dim)",
  error: "#f87171",
};

/**
 * One sub-agent stream row. User rows are right-aligned bubbles, assistant
 * rows are plain text plus tool badges, shell rows are monospace — the shape
 * the OpenCodeUI sub-session card uses.
 */
function StreamRow({ item }: { item: SubagentStreamItem }) {
  if (item.role === "user") {
    return (
      <div data-subagent-row="user" style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "85%",
            padding: "4px 8px",
            borderRadius: 6,
            background: "var(--bg-subtle)",
            color: "var(--text)",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {item.text}
        </div>
      </div>
    );
  }

  if (item.role === "bash") {
    return (
      <div
        data-subagent-row="bash"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        {`$ ${item.text}`}
      </div>
    );
  }

  return (
    <div data-subagent-row="assistant" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {item.text && (
        <div style={{ color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.text}</div>
      )}
      {item.tools.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {item.tools.map((tool, index) => (
            <span
              key={`${tool.toolCallId || index}`}
              data-subagent-tool={tool.status}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: TOOL_STATUS_COLOR[tool.status],
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
              }}
            >
              {tool.status === "running" && (
                <span style={{ width: 5, height: 5, borderRadius: 999, background: "currentColor" }} />
              )}
              {tool.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bounded, scrollable row list. Split from the loader so the row budget can be
 * asserted without a network round trip.
 */
export function SubagentStreamBody({ items }: { items: readonly SubagentStreamItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const visible = items.slice(-SUBAGENT_STREAM_LIMIT);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length, visible[visible.length - 1]?.text]);

  return (
    <div
      ref={scrollRef}
      data-subagent-stream
      onScroll={() => {
        const el = scrollRef.current;
        if (!el) return;
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
      style={{
        maxHeight: SUBAGENT_STREAM_MAX_HEIGHT,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "6px 8px",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: "calc(11px + var(--chat-font-size-offset, 0px))",
        lineHeight: 1.5,
      }}
    >
      {visible.map((item) => (
        <StreamRow key={item.key} item={item} />
      ))}
    </div>
  );
}

/**
 * Inline stream of a sub-agent session.
 *
 * Polls the shared session reader instead of subscribing to the child's SSE
 * stream: the events route hands out a liveness lease per connection, and one
 * lease per visible card would keep finished sessions alive. Each poll is
 * sequential (no pile-up) and stops as soon as the child reports a terminal
 * status, so a stale `running` in the tool details cannot poll forever.
 */
export const SubagentInlineStream = memo(function SubagentInlineStream({
  sessionId,
  active,
  onStatus,
}: {
  sessionId: string;
  active: boolean;
  /** Reported whenever the polled status changes; must be referentially stable. */
  onStatus?: (status: SubagentSessionStatus | null) => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<SubagentStreamItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<SubagentSessionStatus | null>(null);
  const signatureRef = useRef<string | null>(null);
  const missingRef = useRef(0);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    // The parent's `active` covers the live tool call; once the child reports a
    // terminal status on its own, polling stops even if `active` is still set.
    const shouldContinue = () => {
      const current = statusRef.current;
      return current === null ? active : isActiveSubagentStatus(current);
    };

    const poll = async () => {
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}?${STREAM_QUERY}`,
          { cache: "no-store", signal: controller.signal },
        );
        // The child session file may not exist yet while the agent boots. If
        // it never appears the child is gone (deleted or never created), so
        // give up loudly instead of polling an absent session forever.
        if (response.status === 404) {
          if (cancelled) return;
          statusRef.current = statusRef.current ?? "starting";
          missingRef.current += 1;
          if (missingRef.current > MISSING_SESSION_ATTEMPTS) {
            setError(tRef.current("subagent.missing"));
          }
          return;
        }
        missingRef.current = 0;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as SubagentStreamResponse;
        if (cancelled) return;
        const next = data.info?.relation?.status ?? null;
        const changed = next !== statusRef.current;
        statusRef.current = next;
        const rows = summarizeSubagentStream(data.context?.messages ?? []);
        const signature = rows.map((row) => `${row.key}\u0000${row.text}\u0000${row.tools.map((tool) => tool.status).join(",")}`).join("\u0001");
        if (signature !== signatureRef.current) {
          signatureRef.current = signature;
          setItems(rows);
        }
        setError(null);
        if (changed) onStatusRef.current?.(next);
      } catch (err) {
        if (cancelled || (err as { name?: string }).name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    const run = async () => {
      await poll();
      if (cancelled || missingRef.current > MISSING_SESSION_ATTEMPTS || !shouldContinue()) return;
      timer = setTimeout(() => void run(), SUBAGENT_STREAM_POLL_MS);
    };
    void run();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      controller?.abort();
    };
  }, [sessionId, active]);

  if (error && items === null) {
    return (
      <div
        data-subagent-stream-error
        style={{
          padding: "6px 8px",
          background: "rgba(248,113,113,0.05)",
          color: "#f87171",
          borderTop: "1px solid rgba(248,113,113,0.25)",
          fontSize: "calc(11px + var(--chat-font-size-offset, 0px))",
        }}
      >
        {error}
      </div>
    );
  }

  if (items === null || items.length === 0) {
    if (error) {
      return (
        <div
          data-subagent-stream-error
          style={{
            padding: "8px 10px",
            color: "#f87171",
            fontSize: "calc(11px + var(--chat-font-size-offset, 0px))",
          }}
        >
          {error}
        </div>
      );
    }
    return (
      <div
        data-subagent-stream-empty
        style={{
          padding: "8px 10px",
          color: "var(--text-dim)",
          fontStyle: "italic",
          fontSize: "calc(11px + var(--chat-font-size-offset, 0px))",
        }}
      >
        {t("subagent.waiting")}
      </div>
    );
  }

  return (
    <>
      <SubagentStreamBody items={items} />
      {error && (
        <div
          data-subagent-stream-error
          style={{
            padding: "4px 8px",
            color: "#f87171",
            borderTop: "1px solid rgba(248,113,113,0.25)",
            fontSize: "calc(11px + var(--chat-font-size-offset, 0px))",
          }}
        >
          {error}
        </div>
      )}
    </>
  );
});
