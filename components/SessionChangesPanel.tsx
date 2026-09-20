"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { GitFileDiffResponse, GitFileStatusKind, GitStatusResponse } from "@/lib/git-types";
import {
  buildSessionChangeTree,
  buildSessionChanges,
  countPatchLineStats,
  parseUnifiedDiffRows,
  type SessionChangeEntry,
  type SessionChangeTreeNode,
  type SessionChangesSummary,
} from "@/lib/session-changes";

const ADD_COLOR = "#4ade80";
const DEL_COLOR = "#f87171";

const STATUS_COLOR: Record<GitFileStatusKind, string> = {
  added: ADD_COLOR,
  modified: "var(--accent)",
  deleted: DEL_COLOR,
  renamed: "#c084fc",
  untracked: "var(--text-dim)",
  conflict: "#fbbf24",
};

const STATUS_FALLBACK: Record<GitFileStatusKind, string> = {
  added: "已添加",
  modified: "已修改",
  deleted: "已删除",
  renamed: "已重命名",
  untracked: "未跟踪",
  conflict: "冲突",
};

/** Shared label for a Git status; falls back to Chinese literals when the key is missing. */
export function gitStatusLabel(
  status: GitFileStatusKind | null,
  translate: (key: string) => string,
): string {
  if (!status) return "无改动";
  const key = `files.${status}`;
  const translated = translate(key);
  return translated === key ? STATUS_FALLBACK[status] : translated;
}

/** The written-file list, folded into a directory tree. Pure — no fetching. */
export function SessionChangeTree({
  nodes,
  activePath,
  onSelect,
  translate,
}: {
  nodes: SessionChangeTreeNode[];
  activePath: string | null;
  onSelect: (filePath: string) => void;
  translate: (key: string) => string;
}): React.ReactElement {
  const renderNodes = (list: SessionChangeTreeNode[], depth: number): React.ReactNode[] =>
    list.flatMap((node) => {
      if (node.kind === "dir") {
        return [
          <div
            key={`d:${node.path}`}
            data-session-change-dir={node.path}
            style={{
              padding: `3px 10px 3px ${10 + depth * 12}px`,
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {node.name}/
          </div>,
          ...renderNodes(node.children, depth + 1),
        ];
      }
      const entry: SessionChangeEntry = node.entry;
      const isActive = entry.filePath === activePath;
      const color = entry.status ? STATUS_COLOR[entry.status] : "var(--text-dim)";
      return [
        <button
          key={`f:${entry.filePath}`}
          type="button"
          data-session-change-file={entry.filePath}
          data-session-change-status={entry.status ?? "none"}
          onClick={() => onSelect(entry.filePath)}
          title={entry.filePath}
          aria-pressed={isActive}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: `5px 10px 5px ${10 + depth * 12}px`,
            background: isActive ? "var(--bg-selected)" : "transparent",
            border: "none",
            borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
            color: "var(--text)",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
          onMouseEnter={(event) => { if (!isActive) event.currentTarget.style.background = "var(--bg-panel)"; }}
          onMouseLeave={(event) => { if (!isActive) event.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </span>
          <span data-session-change-status-label="" style={{ color, flexShrink: 0, fontSize: 11 }}>
            {gitStatusLabel(entry.status, translate)}
          </span>
        </button>,
      ];
    });

  return <>{renderNodes(nodes, 0)}</>;
}

/** Unified diff rows with line numbers. Pure — no fetching. */
export function SessionDiffView({ patch }: { patch: string | null | undefined }): React.ReactElement {
  const rows = useMemo(() => parseUnifiedDiffRows(patch), [patch]);

  if (rows.length === 0) {
    return (
      <div data-session-changes-no-diff="" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>
        该文件没有可显示的 diff（内容已与 Git 记录一致，或不在 Git 仓库内）
      </div>
    );
  }

  return (
    <div
      data-session-changes-diff=""
      style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: "16px", minWidth: "max-content" }}
    >
      {rows.map((row, index) => {
        const background =
          row.type === "add" ? "rgba(0,200,80,0.12)"
          : row.type === "del" ? "rgba(240,60,60,0.14)"
          : row.type === "hunk" ? "var(--bg-panel)"
          : "transparent";
        const marker =
          row.type === "add" ? "+" : row.type === "del" ? "-" : row.type === "hunk" ? "" : " ";
        const markerColor =
          row.type === "add" ? ADD_COLOR : row.type === "del" ? DEL_COLOR : "var(--text-dim)";
        return (
          <div key={index} data-session-diff-row={row.type} style={{ display: "flex", minWidth: "100%", background }}>
            <span style={{ width: 44, flexShrink: 0, textAlign: "right", paddingRight: 8, color: "var(--text-muted)", userSelect: "none" }}>
              {row.oldNo ?? ""}
            </span>
            <span style={{ width: 44, flexShrink: 0, textAlign: "right", paddingRight: 8, color: "var(--text-muted)", userSelect: "none" }}>
              {row.newNo ?? ""}
            </span>
            <span style={{ width: 12, flexShrink: 0, color: markerColor, userSelect: "none" }}>{marker}</span>
            <span style={{ paddingRight: 12, whiteSpace: "pre", color: row.type === "hunk" ? "var(--text-dim)" : "var(--text)" }}>
              {row.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Header strip: totals, diff line counts, refresh. Pure. */
export function SessionChangesHeader({
  total,
  stats,
  loading,
  onRefresh,
  onClose,
}: {
  total: number;
  stats: { additions: number; deletions: number } | null;
  loading: boolean;
  onRefresh: () => void;
  onClose?: () => void;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        padding: "8px 10px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-panel)",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>本会话改动</span>
      <span data-session-changes-total="" style={{ fontSize: 11, color: "var(--text-dim)" }}>
        {`${total.toLocaleString()} 个文件`}
      </span>
      {stats ? (
        <span data-session-changes-stats="" style={{ fontSize: 11, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
          <span style={{ color: ADD_COLOR }}>+{stats.additions.toLocaleString()}</span>{" "}
          <span style={{ color: DEL_COLOR }}>-{stats.deletions.toLocaleString()}</span>
        </span>
      ) : null}
      <span style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        title="刷新"
        aria-label="刷新"
        style={{
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text-dim)",
          cursor: loading ? "default" : "pointer",
          fontSize: 11,
          padding: "2px 8px",
        }}
      >
        刷新
      </button>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          title="关闭"
          aria-label="关闭"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-dim)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "2px 4px",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

interface SessionChangesPanelProps {
  /** Session whose writes are listed. Null renders the not-selected state. */
  sessionId: string | null;
  /** Workspace directory — resolves relative tool paths and scopes the Git queries. */
  cwd: string | null;
  onClose?: () => void;
}

/**
 * Session changes panel: the files this session wrote, plus the Git diff of the
 * selected one.
 *
 * Writes are read back from the session file rather than the live message
 * list, so the panel stays correct when mounted outside ChatWindow (which owns
 * the streaming state). The API aggregates the full active branch (?changes=1),
 * never the chat window's lazy tail, which used to drop older writes.
 */
export function SessionChangesPanel({ sessionId, cwd, onClose }: SessionChangesPanelProps) {
  const { t: translate } = useI18n();
  const [summary, setSummary] = useState<SessionChangesSummary | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [patch, setPatch] = useState<GitFileDiffResponse | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);

  const cwdKey = cwd ?? "";

  useEffect(() => {
    if (!sessionId) {
      setSummary(null);
      setBuildError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setBuildError(null);

    void (async () => {
      try {
        // ?changes=1 aggregates the FULL branch server-side: a tail window
        // silently dropped a long session's older writes, and the full message
        // list is far too large to ship here.
        const sessionResponse = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}?changes=1`,
          { cache: "no-store" },
        );
        const sessionData = await sessionResponse.json() as {
          writtenFiles?: { filePath: string }[];
          info?: { cwd?: string };
          error?: string;
        };
        if (!sessionResponse.ok) throw new Error(sessionData.error ?? `HTTP ${sessionResponse.status}`);
        if (cancelled) return;

        const sessionCwd = sessionData.info?.cwd ?? cwdKey ?? null;
        const writtenFiles = sessionData.writtenFiles ?? [];

        let gitStatus: GitStatusResponse | null = null;
        if (sessionCwd) {
          try {
            const statusResponse = await fetch(
              `/api/git/status?cwd=${encodeURIComponent(sessionCwd)}`,
              { cache: "no-store" },
            );
            if (statusResponse.ok) gitStatus = await statusResponse.json() as GitStatusResponse;
          } catch {
            // A missing Git answer degrades the list to "no status", never to empty.
          }
        }
        if (cancelled) return;

        setSummary(buildSessionChanges(writtenFiles, gitStatus, sessionCwd));
      } catch (error) {
        if (cancelled) return;
        setBuildError(error instanceof Error ? error.message : String(error));
        setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [cwdKey, refreshToken, sessionId]);

  const tree = useMemo(() => buildSessionChangeTree(summary?.entries ?? []), [summary]);

  const activePath = selectedPath
    ?? summary?.entries.find((entry) => entry.status !== null)?.filePath
    ?? summary?.entries[0]?.filePath
    ?? null;

  useEffect(() => {
    if (!activePath || !cwdKey) {
      setPatch(null);
      setPatchError(null);
      return;
    }
    let cancelled = false;
    setPatchLoading(true);
    setPatchError(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/git/diff?cwd=${encodeURIComponent(cwdKey)}&path=${encodeURIComponent(activePath)}`,
          { cache: "no-store" },
        );
        const data = await response.json() as GitFileDiffResponse & { error?: string };
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setPatch(data);
      } catch (error) {
        if (cancelled) return;
        setPatchError(error instanceof Error ? error.message : String(error));
        setPatch(null);
      } finally {
        if (!cancelled) setPatchLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activePath, cwdKey]);

  const activeEntry = summary?.entries.find((entry) => entry.filePath === activePath) ?? null;
  const patchStats = useMemo(() => {
    const stats = countPatchLineStats(patch?.patch);
    return patch?.supported && patch.patch ? { additions: stats.additions, deletions: stats.deletions } : null;
  }, [patch]);

  const hasEntries = (summary?.total ?? 0) > 0;

  return (
    <div
      data-session-changes-panel=""
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg)" }}
    >
      <SessionChangesHeader
        total={summary?.total ?? 0}
        stats={patchStats}
        loading={loading}
        onRefresh={() => setRefreshToken((token) => token + 1)}
        onClose={onClose}
      />

      {buildError ? (
        <div style={{ padding: "10px 12px", fontSize: 12, color: DEL_COLOR }}>{buildError}</div>
      ) : !sessionId ? (
        <div data-session-changes-empty="" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>
          未选择会话
        </div>
      ) : loading && !summary ? (
        <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>加载中…</div>
      ) : !hasEntries ? (
        <div data-session-changes-empty="" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>
          本会话还没有写过文件
        </div>
      ) : (
        <>
          <div
            data-session-changes-list=""
            style={{
              flex: "0 1 auto",
              maxHeight: "45%",
              overflowY: "auto",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <SessionChangeTree
              nodes={tree}
              activePath={activePath}
              onSelect={setSelectedPath}
              translate={translate}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              padding: "6px 10px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-panel)",
            }}
          >
            <span
              data-session-changes-active-path=""
              style={{
                fontSize: 11,
                color: "var(--text-dim)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
              }}
            >
              {activeEntry ? activeEntry.displayPath : ""}
            </span>
            {activeEntry ? (
              <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 11, color: "var(--text-muted)" }}>
                {gitStatusLabel(activeEntry.status, translate)}
              </span>
            ) : null}
          </div>

          <div data-session-changes-diff-scroll="" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            {patchError ? (
              <div style={{ padding: "10px 12px", fontSize: 12, color: DEL_COLOR }}>{patchError}</div>
            ) : patchLoading ? (
              <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>读取 diff…</div>
            ) : (
              <SessionDiffView patch={patch?.supported ? patch.patch : null} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default SessionChangesPanel;
