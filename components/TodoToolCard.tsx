"use client";

import { useState } from "react";
import { isToolCallCollapsedByUser, setToolCallExpanded } from "@/lib/tool-call-expansion";
import type { TodoItemStatus, TodoListData } from "@/lib/todo-tool";

const STATUS_LABEL: Record<TodoItemStatus, string> = {
  pending: "待办",
  in_progress: "进行中",
  completed: "已完成",
  abandoned: "已放弃",
  blocked: "被阻塞",
};

const STATUS_COLOR: Record<TodoItemStatus, string> = {
  pending: "var(--text-dim)",
  in_progress: "var(--accent)",
  completed: "#16a34a",
  abandoned: "var(--text-dim)",
  blocked: "#f59e0b",
};

function StatusIcon({ status, size = 13 }: { status: TodoItemStatus; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: STATUS_COLOR[status],
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { flexShrink: 0 },
  };
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.4" />
      {status === "completed" && <path d="M5.2 8.3 7.1 10.2 11 6.2" />}
      {status === "in_progress" && <path d="M8 4.6v3.7l2.5 1.5" />}
      {status === "abandoned" && <path d="M5.5 5.5 10.5 10.5M10.5 5.5 5.5 10.5" />}
      {status === "blocked" && <path d="M8 4.8v4.3M8 11.5h.01" />}
    </svg>
  );
}

/**
 * Renders the todo list a `todo` tool call produced, as a collapsible card with
 * per-item status icons and a done/total progress count.
 *
 * The card owns its own card chrome (a tool call may carry a list of its own),
 * so it does not reuse the generic tool-call frame. Collapse state is kept in
 * `lib/tool-call-expansion` because a streaming message remounts this component
 * more than once, and local state would lose the user's choice.
 */
export function TodoToolCard({ toolCallId, data }: {
  toolCallId?: string;
  data: TodoListData;
}) {
  const [expanded, setExpanded] = useState(() => !isToolCallCollapsedByUser(toolCallId));

  if (data.phases.length === 0) return null;

  const toggle = () => {
    const next = !expanded;
    setToolCallExpanded(toolCallId, next);
    setExpanded(next);
  };

  return (
    <div
      data-todo-card
      style={{
        borderRadius: 7,
        overflow: "hidden",
        fontSize: 12,
        border: "1px solid var(--border)",
        background: "var(--bg-subtle)",
        marginTop: 4,
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          padding: "6px 10px",
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 12,
          textAlign: "left",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="var(--text-dim)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
        <span style={{ color: "var(--text)", fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0 }}>
          todo
        </span>
        <span style={{ flex: 1, minWidth: 0 }} />
        <span data-todo-progress style={{ flexShrink: 0, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
          {`${data.done}/${data.total} 已完成`}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {data.phases.map((phase, phaseIndex) => (
            <div key={`${phase.title}-${phaseIndex}`} data-todo-phase>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  background: "var(--bg-panel)",
                  color: "var(--text-muted)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                  {phase.title}
                </span>
                <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums", color: "var(--text-dim)" }}>
                  {`${phase.done}/${phase.total}`}
                </span>
                {phase.status !== "active" && (
                  <span
                    style={{
                      flexShrink: 0,
                      padding: "0 5px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      color: "var(--text-dim)",
                      fontWeight: 400,
                    }}
                  >
                    {phase.status}
                  </span>
                )}
              </div>
              {phase.items.map((item, itemIndex) => (
                <div
                  key={`${item.content}-${itemIndex}`}
                  data-todo-item
                  data-todo-status={item.status}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 7,
                    padding: "4px 10px 4px 14px",
                    borderTop: "1px solid var(--border)",
                    color: item.status === "completed" || item.status === "abandoned"
                      ? "var(--text-dim)"
                      : "var(--text)",
                  }}
                >
                  <StatusIcon status={item.status} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      lineHeight: 1.5,
                      wordBreak: "break-word",
                      textDecoration: item.status === "completed" ? "line-through" : "none",
                    }}
                  >
                    {item.content}
                  </span>
                  <span
                    title={STATUS_LABEL[item.status]}
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      color: STATUS_COLOR[item.status],
                      whiteSpace: "nowrap",
                    }}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
