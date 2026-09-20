"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { ConfigButton } from "./SettingsUi";

interface PiUpdateStatus {
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
}

interface Aggregate {
  pluginUpdates: number | null;
  pluginError: string | null;
  skillUpdates: number | null;
  skillError: string | null;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
  }
  return data;
}

function countUpdates(data: Record<string, unknown>): number {
  const updates = Array.isArray(data.updates) ? data.updates : [];
  return updates.filter(
    (item) => (item as { state?: unknown }).state === "update-available",
  ).length;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function PiUpdatePanel({ cwd }: { cwd: string | null }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<PiUpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<Aggregate | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const data = await readJson(await fetch("/api/pi-update", { cache: "no-store" }));
    setStatus(data as unknown as PiUpdateStatus);
  }, []);

  const loadAggregate = useCallback(async (targetCwd: string): Promise<Aggregate> => {
    const [pluginResult, skillResult] = await Promise.allSettled([
      fetch("/api/plugins/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: targetCwd }),
      }).then(readJson),
      fetch("/api/skills/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: targetCwd }),
      }).then(readJson),
    ]);

    return {
      pluginUpdates: pluginResult.status === "fulfilled" ? countUpdates(pluginResult.value) : null,
      pluginError: pluginResult.status === "rejected" ? errorMessage(pluginResult.reason) : null,
      skillUpdates: skillResult.status === "fulfilled" ? countUpdates(skillResult.value) : null,
      skillError: skillResult.status === "rejected" ? errorMessage(skillResult.reason) : null,
    };
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    setApplyMessage(null);
    setApplyError(null);
    try {
      await loadStatus();
    } catch (error) {
      setCheckError(errorMessage(error));
    }
    if (cwd) {
      try {
        setAggregate(await loadAggregate(cwd));
      } catch (error) {
        setAggregate(null);
        setCheckError(errorMessage(error));
      }
    }
    setChecking(false);
  }, [cwd, loadAggregate, loadStatus]);

  useEffect(() => {
    void loadStatus().catch((error) => setCheckError(errorMessage(error)));
  }, [loadStatus]);

  const applyUpdate = useCallback(async () => {
    if (!cwd) return;
    setApplying(true);
    setApplyMessage(null);
    setApplyError(null);
    try {
      const data = await readJson(await fetch("/api/pi-update/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      }));
      const installed = typeof data.installedVersion === "string" ? data.installedVersion : null;
      setApplyMessage(
        `${t("i18n.installedVersion", { version: installed ?? t("i18n.unknown") })} ${t("settings.restartRequired")}`,
      );
      await loadStatus();
    } catch (error) {
      setApplyError(errorMessage(error));
    } finally {
      setApplying(false);
    }
  }, [cwd, loadStatus, t]);

  const versionLine = status
    ? [
        t("i18n.installedVersion", { version: status.currentVersion ?? t("i18n.unknown") }),
        status.latestVersion ? t("settings.latestVersion", { version: status.latestVersion }) : "",
      ].filter(Boolean).join(" · ")
    : t("i18n.loading");

  const aggregateLine = (updates: number | null, error: string | null) => {
    if (error) return `${t("settings.checkFailed")}: ${error}`;
    if (updates === null) return t("i18n.checking");
    return updates > 0
      ? `${updates} ${t("i18n.updates")}`
      : t("i18n.upToDate");
  };

  return (
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{t("settings.updates")}</h3>
      <p className="settings-general-description">{t("settings.updatesDescription")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
        <div className="settings-shell-option">
          <span>{t("settings.piRuntime")}</span>
          <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {versionLine}
          </span>
        </div>

        <div className="settings-shell-option">
          <span>{t("i18n.extensions")}</span>
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
            {aggregate
              ? aggregateLine(aggregate.pluginUpdates, aggregate.pluginError)
              : cwd ? t("settings.notChecked") : t("settings.updatesProjectRequired")}
          </span>
        </div>

        <div className="settings-shell-option">
          <span>{t("common.skills")}</span>
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
            {aggregate
              ? aggregateLine(aggregate.skillUpdates, aggregate.skillError)
              : cwd ? t("settings.notChecked") : t("settings.updatesProjectRequired")}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ConfigButton variant="secondary" size="small" disabled={checking || applying} onClick={() => void check()}>
            {checking ? t("i18n.checking") : t("i18n.checkUpdates")}
          </ConfigButton>
          {status?.updateAvailable && (
            <ConfigButton
              variant="primary"
              size="small"
              disabled={checking || applying || !cwd}
              title={cwd ? undefined : t("settings.updatesProjectRequired")}
              onClick={() => void applyUpdate()}
            >
              {applying ? t("i18n.updating") : t("settings.piUpdateAction")}
            </ConfigButton>
          )}
        </div>

        {checkError && <p role="alert" className="settings-general-error">{`${t("settings.checkFailed")}: ${checkError}`}</p>}
        {applyError && <p role="alert" className="settings-general-error">{`${t("i18n.failed")}: ${applyError}`}</p>}
        {applyMessage && <p role="status" className="settings-general-description">{applyMessage}</p>}
      </div>
    </section>
  );
}