/**
 * Tool-name predicates shared by the chat views.
 *
 * Pi's built-in names are plain `write` / `edit`, but MCP servers expose the
 * same operations under prefixed or namespaced names, so each predicate also
 * accepts the common decorated forms.
 */

export function isWriteToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === "write" ||
    name.startsWith("write_") ||
    name.endsWith(".write") ||
    name.endsWith("_write");
}

export function isEditToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === "edit" ||
    name.startsWith("edit_") ||
    name.endsWith(".edit") ||
    name.endsWith("_edit") ||
    name.includes("str_replace") ||
    name.includes("replace_editor");
}

/** Codex-style patch tools (e.g. the pi-apply-patch extension). */
export function isApplyPatchToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === "apply_patch" ||
    name.startsWith("apply_patch_") ||
    name.endsWith(".apply_patch") ||
    name.endsWith("_apply_patch");
}

/**
 * Todo tools. Pi's own todo extension registers the plain name `todo`, but the
 * TodoWrite-style extensions and namespaced MCP variants exist too, so the
 * decorated forms are accepted.
 *
 * Deliberately not a bare `startsWith("todo")` — that would swallow unrelated
 * names such as `todolist`, so every accepted form is spelled out.
 */
export function isTodoToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === "todo" ||
    name === "todos" ||
    name === "todoread" ||
    name === "todowrite" ||
    name.startsWith("todo_") ||
    name.startsWith("todo-") ||
    name.endsWith(".todo") ||
    name.endsWith("_todo");
}
