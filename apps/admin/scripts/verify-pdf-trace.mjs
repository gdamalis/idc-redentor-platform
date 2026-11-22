// Guards ICR-143 / ICR-200 in apps/admin: playwright-core loads browsers.json
// via a runtime-computed require that @vercel/nft cannot see statically, so it
// only reaches the Lambda because apps/admin/next.config.ts lists it in
// outputFileTracingIncludes. Fail the build check if it ever drops out.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MANIFEST = ".next/server/app/api/content/pdf-worker/route.js.nft.json";
const REQUIRED_ASSET = "browsers.json";

/** True when some traced path is exactly, or ends with a path segment equal to, `basename`. */
export function hasTracedAsset(files, basename) {
  return files.some(
    (file) => file === basename || file.endsWith(`/${basename}`),
  );
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    console.error(
      `[verify:trace] Could not read ${MANIFEST}.\n` +
        `Run the production build first: pnpm --filter @idcr/admin build`,
    );
    process.exit(1);
  }

  const files = manifest.files ?? [];
  if (!hasTracedAsset(files, REQUIRED_ASSET)) {
    console.error(
      `[verify:trace] ${REQUIRED_ASSET} is NOT traced into the admin sermon PDF worker function.\n` +
        `The Chromium render will fail in production with "Cannot find module …/${REQUIRED_ASSET}".\n` +
        `Fix: restore the outputFileTracingIncludes entry for ` +
        `"/api/content/pdf-worker" in apps/admin/next.config.ts (ICR-200).`,
    );
    process.exit(1);
  }

  const match = files.find((file) => file.endsWith(`/${REQUIRED_ASSET}`));
  console.log(`[verify:trace] OK — ${REQUIRED_ASSET} is traced: ${match}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
