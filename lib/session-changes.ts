import type { GitFileStatus, GitFileStatusKind, GitStatusResponse } from "./git-types";
import type { AgentMessage, AssistantContentBlock, AssistantMessage, ToolResultMessage } from "./types";
import { extractTurnWrittenFiles, type WrittenFile } from "./turn-written-files";

/**
 * One file a session wrote, joined with whatever Git knows about it.
 *
 * `status` is null when the file is absent from `git status` (already
 * committed by an earlier turn, ignored, or the cwd is not a repository).
 * That is a real answer, not a failure: the file was still written.
 */
export interface SessionChangeEntry {
  /** Absolute path, exactly as `extractTurnWrittenFiles` resolved it. */
  filePath: string;
  /** Path shown in the list — relative to the session cwd, forward slashes. */
  displayPath: string;
  status: GitFileStatusKind | null;
  code: string | null;
}

export interface SessionChangeDirNode {
  kind: "dir";
  name: string;
  path: string;
  children: SessionChangeTreeNode[];
}

export interface SessionChangeFileNode {
  kind: "file";
  name: string;
  path: string;
  entry: SessionChangeEntry;
}

export type SessionChangeTreeNode = SessionChangeDirNode | SessionChangeFileNode;

export interface SessionChangesSummary {
  isGitRepository: boolean;
  entries: SessionChangeEntry[];
  /** Every file the session wrote. */
  total: number;
  /** How many of those Git currently reports as changed. */
  changed: number;
}

/**
 * Comparison key for filesystem paths. Windows paths are case-insensitive and
 * may mix separators, so both sides are folded before matching.
 */
export function normalizePathKey(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Path to show in the list: relative to `cwd` when it lives under it. */
export function relativeDisplayPath(filePath: string, cwd: string | null | undefined): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (!cwd) return normalized;
  const root = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!root) return normalized;
  const lowerFile = normalized.toLowerCase();
  const lowerRoot = root.toLowerCase();
  if (lowerFile === lowerRoot) return normalized;
  if (lowerFile.startsWith(`${lowerRoot}/`)) return normalized.slice(root.length + 1);
  return normalized;
}

/**
 * Collect the files one session's messages wrote, in first-seen order.
 *
 * The caller picks the scope: the API's `?changes=1` passes the FULL active
 * branch, because a lazily-paged tail window silently drops a long session's
 * older writes.
 */
export function collectSessionWrittenFiles(
  messages: readonly AgentMessage[],
  cwd: string | null | undefined,
): { filePath: string }[] {
  const toolResults = new Map<string, ToolResultMessage>();
  for (const message of messages) {
    if (message.role === "toolResult") {
      const result = message as ToolResultMessage;
      toolResults.set(result.toolCallId, result);
    }
  }
  const content: AssistantContentBlock[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of (message as AssistantMessage).content ?? []) content.push(block);
  }
  return extractTurnWrittenFiles(content, toolResults, cwd ?? undefined);
}

/**
 * Join the files a session wrote with the repository's current status.
 *
 * Written order is preserved — the list reads as a chronology of the session,
 * not as an alphabetical file dump.
 */
export function buildSessionChanges(
  writtenFiles: readonly WrittenFile[],
  gitStatus: Pick<GitStatusResponse, "isGitRepository" | "files"> | null,
  cwd: string | null | undefined,
): SessionChangesSummary {
  const byKey = new Map<string, GitFileStatus>();
  for (const file of gitStatus?.files ?? []) {
    byKey.set(normalizePathKey(file.filePath), file);
  }

  const seen = new Set<string>();
  const entries: SessionChangeEntry[] = [];
  let changed = 0;

  for (const written of writtenFiles) {
    const key = normalizePathKey(written.filePath);
    if (seen.has(key)) continue;
    seen.add(key);
    const gitFile = byKey.get(key);
    if (gitFile) changed += 1;
    entries.push({
      filePath: written.filePath,
      displayPath: relativeDisplayPath(written.filePath, cwd),
      status: gitFile?.status ?? null,
      code: gitFile?.code ?? null,
    });
  }

  return {
    isGitRepository: gitStatus?.isGitRepository ?? false,
    entries,
    total: entries.length,
    changed,
  };
}

function compareNodes(a: SessionChangeTreeNode, b: SessionChangeTreeNode): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Fold entries into a directory tree keyed by their cwd-relative path.
 *
 * Entries outside `cwd` (absolute display path) still nest — the tree simply
 * follows the path they were given.
 */
export function buildSessionChangeTree(entries: readonly SessionChangeEntry[]): SessionChangeTreeNode[] {
  const root: SessionChangeDirNode = { kind: "dir", name: "", path: "", children: [] };
  const dirs = new Map<string, SessionChangeDirNode>([["", root]]);

  for (const entry of entries) {
    const segments = entry.displayPath.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) continue;
    const fileName = segments[segments.length - 1];
    let parent = root;
    let prefix = "";
    for (let i = 0; i < segments.length - 1; i += 1) {
      prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
      let dir = dirs.get(prefix);
      if (!dir) {
        dir = { kind: "dir", name: segments[i], path: prefix, children: [] };
        dirs.set(prefix, dir);
        parent.children.push(dir);
      }
      parent = dir;
    }
    parent.children.push({ kind: "file", name: fileName, path: entry.displayPath, entry });
  }

  const sortRecursive = (nodes: SessionChangeTreeNode[]): void => {
    nodes.sort(compareNodes);
    for (const node of nodes) if (node.kind === "dir") sortRecursive(node.children);
  };
  sortRecursive(root.children);

  return root.children;
}

export interface PatchLineStats {
  additions: number;
  deletions: number;
  files: number;
}

/** Count `+`/`-` lines in a unified diff, ignoring the `+++`/`---` headers. */
export function countPatchLineStats(patch: string | null | undefined): PatchLineStats {
  const stats: PatchLineStats = { additions: 0, deletions: 0, files: 0 };
  if (!patch) return stats;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("diff --git")) {
      stats.files += 1;
      continue;
    }
    if (line.startsWith("+")) stats.additions += 1;
    else if (line.startsWith("-")) stats.deletions += 1;
  }
  return stats;
}

export interface DiffRow {
  type: "hunk" | "add" | "del" | "ctx";
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

const DIFF_META_PREFIXES = [
  "diff --git ",
  "index ",
  "new file mode ",
  "deleted file mode ",
  "old mode ",
  "new mode ",
  "similarity index ",
  "rename from ",
  "rename to ",
  "copy from ",
  "copy to ",
  "\\ No newline at end of file",
];

/**
 * Parse a unified diff into renderable rows with line numbers.
 *
 * Only the body matters here: file headers and index noise are dropped, hunk
 * headers become separator rows, and line numbers are reconstructed as the
 * body is walked.
 */
export function parseUnifiedDiffRows(patch: string | null | undefined): DiffRow[] {
  const rows: DiffRow[] = [];
  if (!patch) return rows;

  let oldNo = 0;
  let newNo = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) {
        oldNo = Number(match[1]);
        newNo = Number(match[2]);
      }
      rows.push({ type: "hunk", text: line, oldNo: null, newNo: null });
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (DIFF_META_PREFIXES.some((prefix) => line.startsWith(prefix))) continue;
    if (line.startsWith("+")) {
      rows.push({ type: "add", text: line.slice(1), oldNo: null, newNo: newNo++ });
      continue;
    }
    if (line.startsWith("-")) {
      rows.push({ type: "del", text: line.slice(1), oldNo: oldNo++, newNo: null });
      continue;
    }
    if (line.startsWith(" ")) {
      rows.push({ type: "ctx", text: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
      continue;
    }
    if (line === "") continue;
    rows.push({ type: "ctx", text: line, oldNo: null, newNo: null });
  }

  return rows;
}
