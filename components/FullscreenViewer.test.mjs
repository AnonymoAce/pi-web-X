import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { FullscreenViewer } = await jiti.import("./FullscreenViewer.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const source = await readFile(new URL("./FullscreenViewer.tsx", import.meta.url), "utf8");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(FullscreenViewer, props, React.createElement("p", null, "viewer child")),
    ),
  );
}

test("renders nothing while closed", () => {
  assert.equal(render({ isOpen: false, onClose: () => {} }), "");
});

test("renders a fullscreen modal dialog with title, extras, and a labelled close button", () => {
  const html = render({
    isOpen: true,
    onClose: () => {},
    title: "src/app/page.tsx",
    titleExtra: React.createElement("span", null, "12 lines"),
    headerRight: React.createElement("button", { type: "button" }, "extra"),
  });

  assert.match(html, /data-fullscreen-viewer=""/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label="src\/app\/page\.tsx"/);
  assert.match(html, /data-fullscreen-viewer-header=""/);
  assert.match(html, /src\/app\/page\.tsx/);
  assert.match(html, /12 lines/);
  assert.match(html, />extra</);
  assert.match(html, /aria-label="Close"/);
  assert.match(html, /viewer child/);
});

test("falls back to a generic dialog label without a title", () => {
  const html = render({ isOpen: true, onClose: () => {} });

  assert.match(html, /aria-label="Fullscreen viewer"/);
  assert.doesNotMatch(html, />null</);
});

test("showHeader=false leaves the layout entirely to children", () => {
  const html = render({ isOpen: true, onClose: () => {}, showHeader: false, title: "hidden.txt" });

  assert.match(html, /viewer child/);
  assert.doesNotMatch(html, /data-fullscreen-viewer-header=""/);
  assert.doesNotMatch(html, /aria-label="Close"/);
  // The title still names the dialog for assistive tech, but is not drawn.
  assert.match(html, /aria-label="hidden\.txt"/);
  assert.doesNotMatch(html, /font-mono/);
});

test("deferContent withholds children on the first frame", () => {
  const html = render({ isOpen: true, onClose: () => {}, deferContent: true });

  assert.match(html, /data-fullscreen-viewer=""/);
  assert.doesNotMatch(html, /viewer child/);
});

test("deferContent mounts children after two animation frames and cancels both on cleanup", () => {
  const deferred = source.slice(source.indexOf("function DeferredFullscreenContent("));

  assert.match(deferred, /firstFrame = requestAnimationFrame\(\(\) => \{/);
  assert.match(deferred, /secondFrame = requestAnimationFrame\(\(\) => setShouldRender\(true\)\)/);
  assert.match(deferred, /cancelAnimationFrame\(firstFrame\)/);
  assert.match(deferred, /cancelAnimationFrame\(secondFrame\)/);
  // Both frames are scheduled before either callback can run, so the second is
  // assigned before the first fires and cleanup can always cancel it.
  assert.match(deferred, /let firstFrame = 0;\s*\n\s*let secondFrame = 0;/);
});

test("uses a native modal dialog and restores focus to the opening trigger", () => {
  assert.match(source, /const dialogRef = useRef<HTMLDialogElement>\(null\)/);
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /document\.activeElement instanceof HTMLElement/);
  assert.match(source, /closeButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(
    source,
    /document\.body\.style\.overflow = previousOverflow[\s\S]*?trigger\?\.isConnected[\s\S]*?trigger\.focus\(\{ preventScroll: true \}\)/,
  );
  assert.match(source, /const previousOverflow = document\.body\.style\.overflow;\s*\n\s*document\.body\.style\.overflow = "hidden"/);
});

test("Escape and the close button both route through onClose", () => {
  assert.match(source, /onCancel=\{\(event\) => \{[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onClose\(\)/);
  assert.match(source, /ref=\{closeButtonRef\}[\s\S]*?onClick=\{onClose\}/);
});

test("fullscreen height follows the shared mobile viewport variable", () => {
  assert.match(source, /height: "var\(--app-viewport-height, 100dvh\)"/);
  assert.match(source, /position: "fixed"/);
  assert.match(source, /inset: 0/);
});

test("panel z-index is opt-in and never hardcoded over other overlays", () => {
  assert.match(source, /style=\{zIndex === undefined \? DIALOG_STYLE : \{ \.\.\.DIALOG_STYLE, zIndex \}\}/);
});

test("renders with CSS variables and inline styles only — no Tailwind class names", () => {
  const html = render({
    isOpen: true,
    onClose: () => {},
    title: "src/app/page.tsx",
    headerRight: React.createElement("button", { type: "button" }, "extra"),
  });

  assert.doesNotMatch(html, /class=/);
  assert.doesNotMatch(source, /className=/);
  assert.match(html, /background:var\(--bg\)/);
  assert.match(html, /background:var\(--bg-panel\)/);
});

test("FileViewer wires the shared content tree into the fullscreen viewer", async () => {
  const viewer = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");

  // One tree, two hosts: the inline panel and the fullscreen dialog render the
  // same node, and the inline copy unmounts while fullscreen is open so heavy
  // content is never built twice.
  assert.match(viewer, /import \{ FullscreenViewer \} from "\.\/FullscreenViewer"/);
  assert.match(viewer, /const \[fullscreenOpen, setFullscreenOpen\] = useState\(false\)/);
  assert.match(viewer, /const viewerBody = \(/);
  assert.match(viewer, /\{fullscreenOpen \? null : viewerBody\}/);
  assert.match(viewer, /<FullscreenViewer\s[\s\S]*?deferContent\s*>[\s\S]*?\{viewerBody\}[\s\S]*?<\/FullscreenViewer>/);
  assert.match(viewer, /onClick=\{\(\) => setFullscreenOpen\(true\)\}/);
  assert.match(viewer, /onClose=\{\(\) => \{[\s\S]{0,160}?setFullscreenOpen\(false\);/);

  // Long files keep their bound: fullscreen renders the very same memoized nodes,
  // so it cannot bypass SOURCE_HIGHLIGHT_MAX_LINES / the lightweight fallback.
  // Slice the hoisted tree only, stopping at the component's own return statement
  // (several nested `return (` statements exist inside the markdown renderer).
  const bodyStart = viewer.indexOf("const viewerBody = (");
  const bodyEnd = viewer.search(/\r?\n  return \(\r?\n {4}<div className="file-viewer-shell"/);
  assert.ok(bodyStart !== -1 && bodyEnd > bodyStart, "viewerBody bounds not found");
  const body = viewer.slice(bodyStart, bodyEnd);
  assert.match(body, /^\s*highlightedSource$/m);
  assert.match(body, /\{lightweightSourceLines\}/);
  // The tree renders the memoized nodes; it never mounts a second highlighter.
  assert.doesNotMatch(body, /<SyntaxHighlighter/);
  assert.match(viewer, /const useLightweightSource = sourceLines\.length > SOURCE_HIGHLIGHT_MAX_LINES/);
});

test("the inline scroll position survives the fullscreen round-trip", async () => {
  const viewer = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");

  // Unmounting the inline tree clamps its scroll container to 0; neither the
  // clamp nor the restore effect may overwrite the remembered position.
  assert.match(
    viewer,
    /onScroll=\{\(event\) => \{\s*\n\s*\/\/ Ignore the clamp[\s\S]*?if \(fullscreenOpen\) return;[\s\S]*?viewerStateRef\.current\.scrollTop = event\.currentTarget\.scrollTop/,
  );
  assert.match(viewer, /useEffect\(\(\) => \{\s*\n\s*if \(fullscreenOpen\) return;\s*\n\s*if \(!scrollRestorePendingRef\.current \|\| loading\) return;/);
  assert.match(viewer, /fullscreenOpen,\s*\n\s*gitDiffResolved,/);
  assert.match(
    viewer,
    /onClose=\{\(\) => \{\s*\n\s*scrollRestorePendingRef\.current = true;\s*\n\s*setFullscreenOpen\(false\);\s*\n\s*\}\}/,
  );
});
