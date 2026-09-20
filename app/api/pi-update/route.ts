import { NextResponse } from "next/server";
import {
  fetchLatestPiVersion,
  readInstalledPiVersion,
  toPiUpdateStatus,
  type PiUpdateStatus,
} from "@/lib/pi-update";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
const SKIP_VERSION_CHECK = process.env.PI_WEB_SKIP_VERSION_CHECK === "1";

interface PiUpdateCache {
  latestVersion?: string;
  expiresAt: number;
  inFlight?: Promise<string>;
}

declare global {
  var __piWebPiUpdateCache: PiUpdateCache | undefined;
}

function getCache(): PiUpdateCache {
  return globalThis.__piWebPiUpdateCache ??= { expiresAt: 0 };
}

async function loadLatestVersion(): Promise<string> {
  const cache = getCache();
  if (cache.latestVersion && cache.expiresAt > Date.now()) return cache.latestVersion;
  if (!cache.inFlight) {
    cache.inFlight = fetchLatestPiVersion({ timeoutMs: FETCH_TIMEOUT_MS }).then((version) => {
      cache.latestVersion = version;
      cache.expiresAt = Date.now() + CACHE_TTL_MS;
      return version;
    }).finally(() => {
      cache.inFlight = undefined;
    });
  }

  try {
    return await cache.inFlight;
  } catch (error) {
    if (cache.latestVersion) return cache.latestVersion;
    throw error;
  }
}

export async function GET() {
  const currentVersion = readInstalledPiVersion(process.cwd());
  if (SKIP_VERSION_CHECK) {
    return NextResponse.json(
      toPiUpdateStatus(currentVersion, currentVersion) satisfies PiUpdateStatus,
    );
  }
  try {
    return NextResponse.json(toPiUpdateStatus(currentVersion, await loadLatestVersion()));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}