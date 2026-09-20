"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";

export interface FullscreenViewerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 左侧标题；字符串走默认样式，节点原样渲染。 */
  title?: ReactNode;
  /** 标题右侧附加信息，如行列数、文件尺寸。 */
  titleExtra?: ReactNode;
  /** header 右侧自定义区域；关闭按钮始终位于其右侧。 */
  headerRight?: ReactNode;
  /** 是否渲染默认 header（false 时布局完全交给 children）。 */
  showHeader?: boolean;
  /** 顶层遮罩 z-index。 */
  zIndex?: number;
  /** 延后两帧挂载 children，避免重内容阻塞全屏打开。 */
  deferContent?: boolean;
}

const HEADER_HEIGHT = 44;

const DIALOG_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  maxWidth: "none",
  // 移动端跟 AppShell 用同一个视口变量，避开 iOS 地址栏/键盘造成的 100vh 抖动。
  height: "var(--app-viewport-height, 100dvh)",
  maxHeight: "none",
  margin: 0,
  padding: 0,
  border: 0,
  overflow: "hidden",
  background: "var(--bg)",
  color: "var(--text)",
  display: "flex",
  flexDirection: "column",
};

/**
 * 通用真全屏容器：铺满视口 + 可选 header + children 填满剩余空间。
 * 纯 UI 壳，不绑定业务逻辑；丢什么进去就全屏展示什么。
 */
export function FullscreenViewer({
  isOpen,
  onClose,
  children,
  title,
  titleExtra,
  headerRight,
  showHeader = true,
  zIndex,
  deferContent = false,
}: FullscreenViewerProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const label = typeof title === "string" && title.trim() ? title : t("i18n.fullscreenViewer");

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    // 原生 modal dialog 自带 Esc、焦点圈定与 top layer；overflow 锁定与焦点归
    // 还沿用 ImagePreview / MermaidZoomDialog 的既有模式。
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      data-fullscreen-viewer=""
      role="dialog"
      aria-label={label}
      style={zIndex === undefined ? DIALOG_STYLE : { ...DIALOG_STYLE, zIndex }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      {showHeader && (
        <div
          data-fullscreen-viewer-header=""
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            height: HEADER_HEIGHT,
            minHeight: HEADER_HEIGHT,
            padding: "0 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-panel)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 auto", minWidth: 0 }}>
            {typeof title === "string" ? (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text)",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {title}
              </span>
            ) : title}
            {titleExtra}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {headerRight}
            {headerRight && <span aria-hidden="true" style={{ width: 1, height: 16, background: "var(--border)" }} />}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label={t("i18n.close")}
              title={t("i18n.close")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                padding: 0,
                boxSizing: "border-box",
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "var(--bg-hover)";
                event.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
                event.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto", background: "var(--bg)" }}>
        {deferContent ? <DeferredFullscreenContent>{children}</DeferredFullscreenContent> : children}
      </div>
    </dialog>
  );
}

function DeferredFullscreenContent({ children }: { children: ReactNode }) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setShouldRender(true));
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return shouldRender ? <>{children}</> : null;
}
