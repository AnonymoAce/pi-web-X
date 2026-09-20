import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { OutlineIndex } = await jiti.import("./OutlineIndex.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const source = await readFile(new URL("./OutlineIndex.tsx", import.meta.url), "utf8");

function user(content) {
  return { role: "user", content };
}

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(OutlineIndex, props)),
  );
}

const threeMessages = [user("第一条需求"), user("第二条需求"), user("第三条需求")];
const threeIds = ["e1", "e2", "e3"];

test("renders one tick per anchor message", () => {
  const html = render({ messages: threeMessages, entryIds: threeIds, onScrollToMessageId() {} });

  assert.match(html, /data-outline-index=""/);
  assert.equal((html.match(/data-outline-tick="/g) ?? []).length, 3);
  assert.match(html, /data-outline-tick="e1"/);
  assert.match(html, /data-outline-tick="e3"/);
  assert.match(html, /第一条需求/);
});

test("renders nothing below the tick threshold", () => {
  assert.equal(render({ messages: [user("只有一条")], entryIds: ["e1"], onScrollToMessageId() {} }), "");
  assert.equal(render({ messages: [], entryIds: [], onScrollToMessageId() {} }), "");
});

test("uses the caller-supplied entries when given", () => {
  const html = render({
    messages: [user("不该出现")],
    entryIds: ["e1"],
    sourceEntries: [
      { messageId: "x1", title: "外部条目甲" },
      { messageId: "x2", title: "外部条目乙" },
    ],
    onScrollToMessageId() {},
  });

  assert.match(html, /data-outline-tick="x1"/);
  assert.match(html, /外部条目甲/);
  assert.doesNotMatch(html, /不该出现/);
});

test("renders with CSS variables and inline styles only — no Tailwind class names", () => {
  const html = render({ messages: threeMessages, entryIds: threeIds, onScrollToMessageId() {} });

  assert.doesNotMatch(html, /class=/);
  assert.doesNotMatch(source, /className=/);
  assert.match(html, /var\(--text-dim\)/);
  assert.match(html, /var\(--text-muted\)/);
  // The accent only paints in the hover state, which static markup cannot reach;
  // assert the token against the source instead of the rendered output.
  assert.match(source, /var\(--accent\)/);
});

test("keeps the rail out of the message flow and clears the right edge", () => {
  assert.match(source, /position: "absolute"/);
  assert.match(source, /zIndex: 5/);
  assert.match(source, /right: rightOffset/);
});

test("drives the fisheye from a hovered index with CSS transitions only", () => {
  assert.match(source, /const \[hoveredIndex, setHoveredIndex\] = useState<number \| null>\(null\)/);
  assert.match(source, /onMouseEnter=\{\(\) => setHoveredIndex\(index\)\}/);
  assert.match(source, /onMouseLeave=\{\(\) => setHoveredIndex\(null\)\}/);
  assert.match(source, /function fisheyeStrength\(distance: number\): number/);
  assert.match(source, /transform: `scaleX\(\$\{scale\}\)`/);
  assert.match(source, /transition: "transform 0\.15s cubic-bezier\(0, 0, 0\.2, 1\), background 0\.15s"/);
  // The trimmed version deliberately has no per-frame pointer tracking layer,
  // no haptics, and no centred overlay title.
  assert.doesNotMatch(source, /onPointerMove|touchstart|navigator\.vibrate|__opencode_android|overlayRef/);
});

test("exposes each tick as a labelled button that scrolls on click", () => {
  assert.match(source, /data-outline-tick=\{entry\.messageId\}/);
  assert.match(source, /aria-label=\{entry\.title\}/);
  assert.match(source, /title=\{entry\.title\}/);
  assert.match(source, /onClick=\{\(\) => onScrollToMessageId\(entry\.messageId\)\}/);
  assert.match(source, /role="navigation"/);
});

test("keyboard focus opens the same fisheye as hover", () => {
  assert.match(source, /onFocus=\{\(\) => setHoveredIndex\(index\)\}/);
  assert.match(source, /onBlur=\{\(\) => setHoveredIndex\(null\)\}/);
});

test("bounds the rail length without adding a scroll container", () => {
  assert.match(source, /const RAIL_MAX_TICKS = 40/);
  assert.match(source, /entries\.slice\(-RAIL_MAX_TICKS\)/);
});

test("hides itself on mobile viewports", () => {
  assert.match(source, /import \{ useIsMobile \} from "@\/hooks\/useIsMobile"/);
  assert.match(source, /if \(isMobile \|\| ticks\.length < MIN_OUTLINE_TICKS\) return null/);
});

test("builds entries through the shared outline model", () => {
  assert.match(source, /buildOutlineSourceEntries\(messages, entryIds\)/);
  assert.match(source, /truncateOutlineLabel\(entry\.title, LABEL_MAX\)/);
});

test("the tick hit area is taller than the visible line", () => {
  assert.match(source, /const TICK_HIT_HEIGHT = 11/);
  assert.match(source, /const TICK_HEIGHT = 3/);
});