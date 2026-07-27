import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for a PRODUCTION-BLOCKING runtime bug (ICR-127 follow-up):
 * `firebase-admin/auth` pulls in `jwks-rsa`, whose `src/utils.js` does a
 * plain CJS `const jose = require('jose')`. `jose@6.x` ships `"type":
 * "module"` with NO `require` condition in its `exports["."]` map, so that
 * `require('jose')` call throws `ERR_REQUIRE_ESM` — but only where Node's CJS
 * loader enforces the ESM/CJS boundary strictly. Node >= 22.12 quietly
 * papers over this locally via `require(esm)`, and every existing unit test
 * mocks `firebase-admin` outright, so both the local dev loop and CI were
 * green while the Vercel serverless runtime hard-failed with:
 *
 *   Error [ERR_REQUIRE_ESM]: require() of ES Module .../jose/dist/webapi/
 *   index.js from .../jwks-rsa/src/utils.js not supported.
 *
 * The fix pins `jose` to the dual CJS/ESM v5 line ONLY inside the
 * `jwks-rsa` dependency chain via a scoped pnpm override
 * (`"jwks-rsa>jose": "^5.10.0"` in the root package.json) — `jose` has
 * exactly one dependent in this workspace (`jwks-rsa`), and `jwks-rsa` only
 * calls `jose.importJWK` / `jose.exportSPKI`, both present with compatible
 * signatures in v5. This test resolves the ACTUAL installed `jose` package
 * through the real `firebase-admin -> jwks-rsa -> jose` require chain (not
 * just whatever hoists to the app's top-level node_modules) and asserts it
 * is v5 with a `require` export condition — so a future `pnpm update`/lockfile
 * change that silently drops the override, or bumps past what jwks-rsa
 * tolerates, fails loudly here instead of only on a deployed preview.
 */

const require = createRequire(import.meta.url);

interface JosePackageJson {
  version: string;
  exports?: Record<string, unknown>;
}

function findPackageRoot(startFile: string): string {
  let dir = path.dirname(startFile);
  while (!existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate a package.json above ${startFile}`);
    }
    dir = parent;
  }
  return dir;
}

function resolveJosePackageJson(): JosePackageJson {
  const firebaseAdminRoot = findPackageRoot(require.resolve("firebase-admin"));
  const jwksRsaEntry = require.resolve("jwks-rsa", { paths: [firebaseAdminRoot] });
  const jwksRsaRoot = findPackageRoot(jwksRsaEntry);
  const joseEntry = require.resolve("jose", { paths: [jwksRsaRoot] });
  const joseRoot = findPackageRoot(joseEntry);
  return JSON.parse(readFileSync(path.join(joseRoot, "package.json"), "utf8")) as JosePackageJson;
}

describe("jose CJS interop (firebase-admin -> jwks-rsa -> jose)", () => {
  it("resolves the jwks-rsa dependency chain's jose to major version 5", () => {
    const josePkg = resolveJosePackageJson();
    const major = Number(josePkg.version.split(".")[0]);

    expect(major).toBe(5);
  });

  it("exposes a `require` export condition on jose's main entry point", () => {
    // jose@6 dropped the `require` condition entirely (ESM-only), which is
    // exactly what breaks `jwks-rsa/src/utils.js`'s `require('jose')` on the
    // Vercel serverless runtime. jose@5 keeps a dual `import`/`require` map.
    const josePkg = resolveJosePackageJson();
    const mainExport = josePkg.exports?.["."];

    expect(mainExport).toEqual(
      expect.objectContaining({ require: expect.stringContaining(".js") }),
    );
  });
});
