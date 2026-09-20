import { NextResponse } from "next/server";
import { runNpx } from "@/lib/npx";
import {
  PI_UPDATE_DEFAULT_PACKAGE,
  buildPiUpdateArgs,
  isPiUpdatePackageAllowed,
  readInstalledPiVersion,
} from "@/lib/pi-update";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const UPDATE_TIMEOUT_MS = 180_000;
const OUTPUT_LIMIT = 500;

export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  try {
    const body = await req.json() as { cwd?: unknown; package?: unknown };
    const cwd = typeof body.cwd === "string" ? body.cwd : "";
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

    const packageName = body.package === undefined
      ? PI_UPDATE_DEFAULT_PACKAGE
      : typeof body.package === "string"
        ? body.package
        : "";
    if (!isPiUpdatePackageAllowed(packageName)) {
      return NextResponse.json(
        { error: `This package cannot be updated: ${packageName || "(empty)"}` },
        { status: 400 },
      );
    }

    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // The install target is the directory this server runs from, never the
    // caller-supplied cwd. The cwd above only proves the caller opened an
    // allowed project, so no request can point the install at another tree.
    const installRoot = process.cwd();
    const previousVersion = readInstalledPiVersion(installRoot, packageName);

    const { stdout, stderr } = await runNpx(buildPiUpdateArgs(packageName), {
      timeout: UPDATE_TIMEOUT_MS,
      cwd: installRoot,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    return NextResponse.json({
      success: true,
      package: packageName,
      previousVersion,
      installedVersion: readInstalledPiVersion(installRoot, packageName),
      restartRequired: true,
      output: `${stdout}${stderr}`.slice(-OUTPUT_LIMIT),
    });
  } catch (error: unknown) {
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    const output = `${detail.stdout ?? ""}${detail.stderr ?? ""}`;
    return NextResponse.json(
      { error: output || detail.message || String(error) },
      { status: 500 },
    );
  }
}