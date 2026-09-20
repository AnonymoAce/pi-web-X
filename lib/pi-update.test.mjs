import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const {
  PI_UPDATE_DEFAULT_PACKAGE,
  buildPiUpdateArgs,
  fetchLatestPiVersion,
  isPiUpdatePackageAllowed,
  piUpdateLatestUrl,
  readInstalledPiVersion,
  toPiUpdateStatus,
} = await jiti.import("./pi-update.ts");

const projectRoot = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const installedVersion = JSON.parse(
  readFileSync(`${projectRoot}/node_modules/@earendil-works/pi-coding-agent/package.json`, "utf8"),
).version;

test("whitelist allows only pi runtime packages", () => {
  assert.equal(isPiUpdatePackageAllowed(PI_UPDATE_DEFAULT_PACKAGE), true);
  assert.equal(isPiUpdatePackageAllowed("@earendil-works/pi-ai"), true);
  assert.equal(isPiUpdatePackageAllowed("@earendil-works/pi-tui"), true);
  assert.equal(isPiUpdatePackageAllowed("@earendil-works/pi-agent-core"), true);
  assert.equal(isPiUpdatePackageAllowed("lodash"), false);
  assert.equal(isPiUpdatePackageAllowed("@earendil-works/pi-telemetry"), false);
  assert.equal(isPiUpdatePackageAllowed(""), false);
  assert.equal(isPiUpdatePackageAllowed("@earendil-works/pi-coding-agent/../../evil"), false);
});

test("reads the installed version from node_modules and is honest when missing", () => {
  assert.equal(readInstalledPiVersion(projectRoot), installedVersion);
  assert.equal(readInstalledPiVersion(projectRoot, "not-an-installed-pkg"), null);
  assert.equal(readInstalledPiVersion(`${projectRoot}/definitely-missing`), null);
});

test("update availability never invents an update", () => {
  assert.deepEqual(toPiUpdateStatus("0.85.1", "0.86.0"), {
    currentVersion: "0.85.1",
    latestVersion: "0.86.0",
    updateAvailable: true,
  });
  assert.equal(toPiUpdateStatus("0.85.1", "0.85.1").updateAvailable, false);
  assert.equal(toPiUpdateStatus("0.85.1", "0.84.4").updateAvailable, false);
  assert.equal(toPiUpdateStatus(null, "0.86.0").updateAvailable, false);
  assert.equal(toPiUpdateStatus("0.85.1", null).updateAvailable, false);
  assert.equal(toPiUpdateStatus("0.85.1", "0.86.0-beta.1").updateAvailable, false);
});

test("update arguments stay scoped to one package", () => {
  const args = buildPiUpdateArgs(PI_UPDATE_DEFAULT_PACKAGE);
  assert.ok(args.includes("install"));
  assert.ok(args.includes(`${PI_UPDATE_DEFAULT_PACKAGE}@latest`));
  assert.ok(args.includes("--package-lock=false"));
  assert.ok(!args.includes("prune"));
  assert.ok(!args.includes("audit"));
});

test("registry url escapes the scoped package name", () => {
  assert.equal(
    piUpdateLatestUrl(),
    "https://registry.npmjs.org/@earendil-works%2Fpi-coding-agent/latest",
  );
});

test("fetches the live latest version", async () => {
  const latest = await fetchLatestPiVersion({ timeoutMs: 15_000 });
  assert.match(latest, /^\d+\.\d+\.\d+/);
});

test("registry failures surface as errors instead of a fake version", async () => {
  const failing = async () => new Response("nope", { status: 500 });
  await assert.rejects(
    () => fetchLatestPiVersion({ fetcher: failing, timeoutMs: 1_000 }),
    /HTTP 500/,
  );
});
