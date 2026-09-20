"use client";

import { memo, useMemo, useState, type CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { AgentMessage } from "@/lib/types";
import {
  buildOutlineSourceEntries,
  truncateOutlineLabel,
  MIN_OUTLINE_TICKS,
  type OutlineSourceEntry,
} from "@/lib/outline-model";

export interface OutlineIndexProps {
  messages: readonly AgentMessage[];
  entryIds: readonly (string | undefined)[];
  onScrollToMessageId: (messageId: string) => void;
  /** 外部已构建好的条目；传入时跳过内部构建。 */
  sourceEntries?: OutlineSourceEntry[];
  /** 距聊天区右缘的偏移；右侧有固定栏（如小地图）时传入其宽度。 */
  rightOffset?: number;
}

/** 超过该条数只保留尾部，索引条不做滚动。 */
const RAIL_MAX_TICKS = 40;
/** 视觉线宽（缩放基准）与实际线高。 */
const TICK_WIDTH = 22;
const TICK_MIN_WIDTH = 8;
const TICK_HEIGHT = 3;
/** 点击命中区高度：比 3px 视觉线宽大，细条也点得中。 */
const TICK_HIT_HEIGHT = 11;
/** 鱼眼作用半径，以条目下标为单位（1 个下标 = 1 条线间距）。 */
const FISHEYE_RADIUS = 3;
/** 强度高于该值才弹出标签。 */
const LABEL_VISIBLE_STRENGTH = 0.65;
const LABEL_MAX = 24;

const LAYER_STYLE: CSSProperties = {
  position: "absolute",
  top: "50%",
  zIndex: 5,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  padding: "6px 0",
  userSelect: "none",
};

const TICK_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  width: TICK_WIDTH,
  height: TICK_HIT_HEIGHT,
  padding: 0,
  border: 0,
  background: "transparent",
  overflow: "visible",
  cursor: "pointer",
};

/** 鱼眼强度：距离 0 时 1，距离到半径时 0（余弦平方衰减，与原实现的稳态形状一致）。 */
function fisheyeStrength(distance: number): number {
  if (distance >= FISHEYE_RADIUS) return 0;
  const cosine = Math.cos(((distance / FISHEYE_RADIUS) * Math.PI) / 2);
  return cosine * cosine;
}

/**
 * 消息流右侧浮动大纲索引条。
 *
 * 形态取自 OpenCodeUI 的 OutlineIndex：细线列 + 悬停鱼眼 + 标签弹出，但只保留最小可用部分
 * ——没有 Pointer/Touch 两套策略、没有震动反馈、没有居中遮罩标题；鱼眼由「悬停下标 + 纯 CSS
 * transform 过渡」驱动，不写逐帧 pointer 追踪层。
 */
export const OutlineIndex = memo(function OutlineIndex({
  messages,
  entryIds,
  onScrollToMessageId,
  sourceEntries,
  rightOffset = 4,
}: OutlineIndexProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const entries = useMemo(
    () => sourceEntries ?? buildOutlineSourceEntries(messages, entryIds),
    [messages, entryIds, sourceEntries],
  );
  const ticks = useMemo(() => entries.slice(-RAIL_MAX_TICKS), [entries]);

  // 移动端不渲染：窄视口里这条浮标会压住正文，与小地图在移动端隐藏的做法一致。
  if (isMobile || ticks.length < MIN_OUTLINE_TICKS) return null;

  return (
    <div
      data-outline-index=""
      role="navigation"
      aria-label={t("session.messages")}
      onMouseLeave={() => setHoveredIndex(null)}
      style={{ ...LAYER_STYLE, right: rightOffset }}
    >
      {ticks.map((entry, index) => {
        const strength = hoveredIndex === null ? 0 : fisheyeStrength(Math.abs(index - hoveredIndex));
        const scale = (TICK_MIN_WIDTH + (TICK_WIDTH - TICK_MIN_WIDTH) * strength) / TICK_WIDTH;
        const labelVisible = strength >= LABEL_VISIBLE_STRENGTH;

        return (
          <button
            key={entry.messageId}
            type="button"
            data-outline-tick={entry.messageId}
            title={entry.title}
            aria-label={entry.title}
            onMouseEnter={() => setHoveredIndex(index)}
            onFocus={() => setHoveredIndex(index)}
            onBlur={() => setHoveredIndex(null)}
            onClick={() => onScrollToMessageId(entry.messageId)}
            style={TICK_STYLE}
          >
            <span
              data-outline-label=""
              aria-hidden="true"
              style={{
                marginRight: 6,
                whiteSpace: "nowrap",
                fontSize: 12,
                lineHeight: 1.4,
                color: "var(--text-dim)",
                opacity: labelVisible ? 1 : 0,
                transform: labelVisible ? "translateX(0)" : "translateX(6px)",
                transition: "opacity 0.15s, transform 0.15s",
                pointerEvents: "none",
              }}
            >
              {truncateOutlineLabel(entry.title, LABEL_MAX)}
            </span>
            <span
              data-outline-tick-mark=""
              aria-hidden="true"
              style={{
                display: "block",
                width: TICK_WIDTH,
                height: TICK_HEIGHT,
                borderRadius: TICK_HEIGHT,
                background: labelVisible ? "var(--accent)" : "var(--text-muted)",
                transformOrigin: "right center",
                transform: `scaleX(${scale})`,
                transition: "transform 0.15s cubic-bezier(0, 0, 0.2, 1), background 0.15s",
              }}
            />
          </button>
        );
      })}
    </div>
  );
});