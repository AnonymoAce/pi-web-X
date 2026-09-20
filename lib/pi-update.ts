import { readFileSync } from "fs";
import { join } from "path";
import { isNewerStableVersion } from "./app-update";

const NPM_REGISTRY = "https://registry.npmjs.org";

/** Pi runtime package that ships with Pi Web. Updated by default. */
export const PI_UPDATE_DEFAULT_PACKAGE = "@earendil-works/pi-coding-agent";

/**
 * Packages the update endpoint may install. Anything else is rejected before
 * a package manager is ever invoked.
 */
export const PI_UPDATE_PACKAGES: readonly string[] = [
  PI_UPDATE_DEFAULT_PACKAGE,
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
];

export interface PiUpdateStatus {
  /** Installed version, or null when the package metadata cannot be read. */
  currentVersion: string | null;
  /** Version published as `latest` on the registry, or null when unknown. */
  latestVersion: string | null;
  updateAvailable: boolean;
}

export function isPiUpdatePackageAllowed(packageName: string): boolean {
  return PI_UPDATE_PACKAGES.includes(packageName);
}

/**
 * Read the installed version from `<root>/node_modules/<package>/package.json`.
 * Returns null instead of guessing when the package or its version is missing.
 */
export function readInstalledPiVersion(
  root: string,
  packageName: string = PI_UPDATE_DEFAULT_PACKAGE,
): string | null {
  try {
    const packageJson = join(root, "node_modules", ...packageName.split("/"), "package.json");
    const parsed = JSON.parse(readFileSync(packageJson, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version ? parsed.version : null;
  } catch {
    return null;
  }
}

export function piUpdateLatestUrl(packageName: string = PI_UPDATE_DEFAULT_PACKAGE): string {
  return `${NPM_REGISTRY}/${packageName.replace("/", "%2F")}/latest`;
}

/** Fetch the `latest` dist-tag. Throws when the registry is unreachable or answers oddly. */
export async function fetchLatestPiVersion(
  options: { packageName?: string; fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(piUpdateLatestUrl(options.packageName), {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
  });
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);

  const body = (await response.json()) as { version?: unknown };
  if (typeof body.version !== "string" || body.version.length === 0) {
    throw new Error("npm registry returned an invalid version");
  }
  return body.version;
}

export function toPiUpdateStatus(
  currentVersion: string | null,
  latestVersion: string | null,
): PiUpdateStatus {
  return {
    currentVersion,
    latestVersion,
    updateAvailable:
      currentVersion !== null
      && latestVersion !== null
      && isNewerStableVersion(latestVersion, currentVersion),
  };
}

/**
 * `npx` arguments for a package-scoped install. The project's other
 * dependencies, its lockfile and `node_modules` cleanup are left alone.
 */
export function buildPiUpdateArgs(packageName: string): string[] {
  return [
    "--yes",
    "npm",
    "install",
    `${packageName}@latest`,
    "--save-exact",
    "--package-lock=false",
    "--no-audit",
    "--no-fund",
  ];
}