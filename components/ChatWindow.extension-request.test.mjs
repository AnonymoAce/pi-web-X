import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const dialogStart = source.indexOf("function ExtensionDialog");
const dialogSource = source.slice(dialogStart, source.indexOf("type ExtensionCustomRequest"));
const customStart = source.indexOf("function ExtensionCustomPanel");
const customEnd = source.indexOf("\n}", source.indexOf("</AnsiText>", customStart));
const customSource = source.slice(customStart, customEnd > customStart ? customEnd : undefined);

test("keeps extension requests inline in the message flow instead of overlaying it", () => {
  assert.doesNotMatch(source, /function ExtensionRequestSheet/);
  // Both cards render inside the scroller, after the message list and before the composer.
  assert.match(
    source,
    /className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto[\s\S]*?<ExtensionDialog[\s\S]*?<ExtensionCustomPanel[\s\S]*?className="relative shrink-0"[\s\S]*?{chatInputElement}/,
  );
  // Neither card is an absolute overlay any more.
  // The card slot itself is static flow; the only absolute box left in the panel is the
  // hidden keystroke-capture textarea, which is not an overlay.
  assert.doesNotMatch(dialogSource, /position: "absolute"/);
  assert.doesNotMatch(dialogSource, /inset: 0/);
  assert.doesNotMatch(customSource, /inset: 0/);
  assert.match(customSource, /margin: "12px 0"/);
  assert.doesNotMatch(dialogSource, /pointerEvents: "none"/);
  assert.doesNotMatch(source, /z-\[100\]|zIndex: 100/);
  // Cards stay bounded once expanded inside the flow.
  assert.match(dialogSource, /maxHeight: "min\(640px, 70vh\)"/);
  assert.match(customSource, /maxHeight: "min\(640px, 70vh\)"/);
});

test("reveals a freshly arrived inline request without stealing the scroll position", () => {
  assert.match(source, /function useInlineReveal<T extends HTMLElement>\(\)/);
  assert.match(source, /ref\.current\?\.scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(dialogSource, /const revealRef = useInlineReveal<HTMLDivElement>\(\)/);
  assert.match(customSource, /const revealRef = useInlineReveal<HTMLDivElement>\(\)/);
});

test("adds collapse without replacing cancel", () => {
  assert.match(dialogSource, /setCollapsed\(true\)/);
  assert.match(dialogSource, /chat\.extensionCollapse/);
  assert.match(dialogSource, /chat\.cancel/);
  assert.doesNotMatch(dialogSource, /chat\.extensionSkip/);
});

test("renders extension confirmation and options as markdown", () => {
  assert.match(source, /import \{ MarkdownBody \} from "\.\/MarkdownBody"/);
  assert.match(dialogSource, /<MarkdownBody>\{request\.message\}<\/MarkdownBody>/);
  assert.match(dialogSource, /role="button"[\s\S]*?data-extension-option[\s\S]*?<div inert>[\s\S]*?<MarkdownBody>\{option\}<\/MarkdownBody>/);
  assert.match(dialogSource, /ref=\{index === 0 \? focusFirstOption : undefined\}/);
});

test("preserves title newlines like pi's TUI and keeps long titles from hiding the body", () => {
  const header = dialogSource.slice(dialogSource.indexOf('role="dialog"'), dialogSource.indexOf("{request.method === \"confirm\""));
  assert.match(header, /whiteSpace: "pre-wrap", overflowWrap: "anywhere" \}\}>\{request\.title\}/);
  assert.match(header, /maxHeight: "40vh", overflowY: "auto" \}\}>[\s\S]*?\{request\.title\}/);
});

test("offers a multi-select method with checkboxes, keyboard toggling and a custom answer", () => {
  assert.match(source, /method: "select" \| "multi-select" \| "confirm" \| "input" \| "editor"/);
  assert.match(dialogSource, /request\.method === "multi-select" && \(/);
  assert.match(dialogSource, /role="checkbox"/);
  assert.match(dialogSource, /aria-checked=\{checked\}/);
  assert.match(dialogSource, /onClick=\{\(\) => toggleOption\(option\)\}/);
  assert.match(dialogSource, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(dialogSource, /const \[selectedOptions, setSelectedOptions\] = useState<Set<string>>/);
  assert.match(dialogSource, /const \[customAnswer, setCustomAnswer\] = useState\(""\)/);
  // Submitting sends every checked option plus the typed answer, and not the single-value path.
  assert.match(dialogSource, /onRespond\(request, \{ values: extra \? \[\.\.\.picked, extra\] : picked \}\)/);
  // The generic Submit button still covers select/multi-select; only plain select auto-submits on click.
  assert.match(dialogSource, /request\.method !== "select" && request\.method !== "multi-select"/);
});

test("resets collapse state when a new extension request arrives", () => {
  assert.match(source, /<ExtensionDialog key=\{extensionDialog.id\}/);
  assert.match(source, /<ExtensionCustomPanel key=\{extensionCustomUi.id\}/);
  assert.match(customSource, /if \(!collapsed\) inputRef.current\?\.focus\(\);\s*}, \[collapsed\]\)/);
});
