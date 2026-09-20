/**
 * Parses the text view of pi's structured todo tool into a renderable model.
 *
 * The `todo` tool (`@minhduydev/pi-todo`) is markdown-first: its result is the
 * same text a human reads in `.pi/artifacts/TODO.md`, not a JSON array. Shape
 * taken from the tool's own renderer (`dist/tool.js` → `viewText`):
 *
 *   ### <title> (status: <phaseStatus>, <done>/<total> done)
 *     1. [<mark>] <content>
 *
 * `mark` is one of ` ` pending, `/` in_progress, `x`/`X` completed, `-`
 * abandoned, `!` blocked (`dist/markdown.js` → `CHECKBOX_MAP`). Anything that
 * does not match — an `add`/`done` acknowledgement, an error line, a running
 * call with no result yet — yields null so the card renders nothing rather than
 * an empty shell.
 */

/** Item state as the tool reports it. Mirrors pi-todo's `ItemStatus`. */
export type TodoItemStatus = "pending" | "in_progress" | "completed" | "abandoned" | "blocked";

export interface TodoItem {
  content: string;
  status: TodoItemStatus;
}

export interface TodoPhase {
  title: string;
  /** Phase-level state: `active` | `done` | `abandoned`. */
  status: string;
  done: number;
  total: number;
  items: TodoItem[];
}

export interface TodoListData {
  phases: TodoPhase[];
  done: number;
  total: number;
}

const STATUS_BY_MARK: Record<string, TodoItemStatus> = {
  " ": "pending",
  "/": "in_progress",
  x: "completed",
  X: "completed",
  "-": "abandoned",
  "!": "blocked",
};

const PHASE_LINE = /^###\s+(.*?)\s+\(status:\s*([^,)]+?)\s*,\s*(\d+)\/(\d+)\s+done\)\s*$/;
const ITEM_LINE = /^\s*\d+\.\s*\[([ xX/!-])\]\s*(.*)$/;

/**
 * Parses a todo view body. Returns null when the text carries no phase header,
 * which covers every non-view reply (acknowledgements, errors, empty output).
 */
export function parseTodoList(text: string | null | undefined): TodoListData | null {
  if (!text) return null;
  const phases: TodoPhase[] = [];
  let current: TodoPhase | null = null;
  for (const line of text.split(/\r?\n/)) {
    const phase = PHASE_LINE.exec(line);
    if (phase) {
      current = {
        title: phase[1],
        status: phase[2],
        done: Number(phase[3]),
        total: Number(phase[4]),
        items: [],
      };
      phases.push(current);
      continue;
    }
    const item = ITEM_LINE.exec(line);
    if (item && current) {
      current.items.push({
        content: item[2].trim(),
        status: STATUS_BY_MARK[item[1]] ?? "pending",
      });
    }
  }
  if (phases.length === 0) return null;
  return {
    phases,
    done: phases.reduce((sum, phase) => sum + phase.done, 0),
    total: phases.reduce((sum, phase) => sum + phase.total, 0),
  };
}

interface ToolResultLike {
  content?: unknown;
  isError?: boolean;
}

/** Text body of a tool result, tolerating a missing or malformed `content`. */
export function toolResultText(result: ToolResultLike | null | undefined): string {
  const blocks = result?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((block): block is { type: "text"; text: string } =>
      Boolean(block) && typeof block === "object"
      && (block as { type?: unknown }).type === "text"
      && typeof (block as { text?: unknown }).text === "string")
    .map((block) => block.text)
    .join("\n");
}

/** Todo list of a finished tool call, or null when there is nothing to show. */
export function extractTodoList(result: ToolResultLike | null | undefined): TodoListData | null {
  if (result?.isError) return null;
  return parseTodoList(toolResultText(result));
}
