#!/usr/bin/env node
// post-jira-result.mjs — post a /qa acceptance result to a Jira issue with the screenshots
// rendered INLINE in the comment. Ported from this repo's former Trello result poster (Trello →
// Jira); adapted from foodista-web's post-jira-result.mjs for the Jira REST + ADF mechanics.
//
// The Atlassian MCP can only post a comment *body* (no attachment tool), so embedding the actual
// PNGs requires the Jira REST API: upload each screenshot as an issue attachment, then post a
// comment whose ADF body references each attachment as a `media` node. This script is invoked by
// the /qa, /work, and /merge orchestrators; it runs on the same filesystem as the qa-acceptance
// agent, so the agent's absolute screenshot paths are readable.
//
// Usage:   node .claude/scripts/qa/post-jira-result.mjs <payload.json>
//
// Payload (written by /qa, /work, or /merge to a 0600 temp file) — note: Jira issue **key**
// ("ICR-N"), NO Trello cardId/cardShortLink:
//   { ticketKey:"ICR-45", qaEnvPath, configPath, dryRun,
//     meta:{title,testedAt,envName,host,targetUrl,previewUrl,testType,buildUnderTest,mode,runId,postedBy},
//     result:{...agent block 1...}, evidence:[{path,caption,ac}] }
//   meta.envName is REQUIRED ("preview" | "staging") — no silent default; the run exits 2 if absent.
//   meta.postedBy ("/qa" | "/work" | "/merge") sets the footer provenance; defaults to "/qa".
//   meta.targetUrl is the env's base URL (preview OR staging); previewUrl is kept as a back-compat alias.
//
// Creds + site:
//   - jira.{email,apiToken} from qa-env.json (path = payload.qaEnvPath). qa-env.json is gitignored.
//   - jira.site (falling back to tracker.site) from .claude/config.json (path = payload.configPath).
//     This repo's config carries the site under `tracker.site` (e.g. "divinelab.atlassian.net").
//   Auth is Jira REST v3 Basic auth: Authorization: Basic base64(email:apiToken), over HTTPS, never logged.
//
// Exit codes:
//   0  posted (or dry-run printed)
//   2  bad usage / unreadable payload / missing ticketKey / missing meta.envName / missing site
//   3  Jira credentials absent  → orchestrator falls back to mcp__atlassian-divinelab__addCommentToJiraIssue
//   1  a Jira REST call failed   → orchestrator falls back / surfaces the error
//
// Secret hygiene: the API token is read from qa-env.json by path, used only in an Authorization
// header, and never printed. All rendered text is scrubbed (Mongo URIs / JWTs / KEY=secret /
// Contentful / SendGrid / Resend / Mailchimp keys).

import { readFile } from "node:fs/promises";

const PLACEHOLDER = /^<.*>$/s; // an un-filled "<…>" template value counts as absent

function present(v) {
  return typeof v === "string" && v.trim() !== "" && !PLACEHOLDER.test(v.trim());
}

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── secret scrub (mirrors the pr-author safety net; extended for ICR providers) ─
const SCRUBBERS = [
  [/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[redacted-mongo-uri]"],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]"],
  // ICR email / CMS provider keys
  [/SG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}/g, "[redacted-sendgrid]"],
  [/re_[A-Za-z0-9]{20,}/g, "[redacted-resend]"],
  [/\b[0-9a-f]{32}-us[0-9]{1,2}\b/g, "[redacted-mailchimp]"],
  [/CFPAT-[A-Za-z0-9_\-]{20,}/g, "[redacted-contentful]"],
  // KEY=secret / SECRET: value style assignments (uppercase env-ish keys only)
  [/\b([A-Z][A-Z0-9_]{2,}(?:SECRET|TOKEN|KEY|PASSWORD|PASS|URI))\s*[=:]\s*[^\s"'<>]+/g, "$1=[redacted]"],
];
function scrub(s) {
  if (typeof s !== "string") return s;
  let out = s;
  for (const [re, rep] of SCRUBBERS) out = out.replace(re, rep);
  return out;
}

// ── minimal PNG dimension reader (for media aspect ratio) ─────────────────────
function pngSize(buf) {
  // PNG signature (8 bytes) + IHDR length(4)+type(4); width@16, height@20 (big-endian).
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function mimeFor(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return "image/png";
}

// ── ADF builders ──────────────────────────────────────────────────────────────
const text = (t, marks) => {
  const node = { type: "text", text: scrub(String(t ?? "")) || " " };
  if (marks) node.marks = marks;
  return node;
};
const strong = (t) => text(t, [{ type: "strong" }]);
const em = (t) => text(t, [{ type: "em" }]);
const para = (...content) => ({ type: "paragraph", content: content.length ? content : [text(" ")] });
const cellOf = (type, t) => ({ type, attrs: {}, content: [para(text(t))] });

function table(headers, rows) {
  const headerRow = { type: "tableRow", content: headers.map((h) => cellOf("tableHeader", h)) };
  const bodyRows = rows.map((cells) => ({
    type: "tableRow",
    content: cells.map((c) => cellOf("tableCell", c)),
  }));
  return {
    type: "table",
    attrs: { isNumberColumnEnabled: false, layout: "default" },
    content: [headerRow, ...bodyRows],
  };
}

const STATUS_EMOJI = { PASS: "✅ PASS", PARTIAL: "⚠️ PARTIAL", FAIL: "❌ FAIL", BLOCKED: "🚫 BLOCKED" };
const RESULT_EMOJI = { pass: "✅ Pass", fail: "❌ Fail", partial: "⚠️ Partial", blocked: "🚫 Blocked" };
const TYPE_EMOJI = { ui: "🖥️ UI", api: "🔌 API", both: "🖥️+🔌 Both" };

// Build the full QA-result comment as an ADF doc.
// `attached` = [{ attachmentId, filename, size?, ac, caption }] for screenshots already uploaded
// (or, in dry-run, synthetic placeholders without a real attachmentId/size).
function buildAdf({ ticketKey, meta, result, attached }) {
  const content = [];
  const m = meta ?? {};
  const r = result ?? {};
  const sum = r.summary ?? {};

  // Provenance: which command posted this. Valid: "/qa" | "/work" | "/merge"; default "/qa".
  const postedBy = present(m.postedBy) ? m.postedBy : "/qa";
  // Env-aware URL label: "Staging:" for staging, else "Preview:".
  const envName = String(m.envName ?? "");
  const urlLabel = envName === "staging" ? "Staging" : "Preview";
  // The target URL is the active env's base URL; previewUrl is the back-compat alias.
  const targetUrl = m.targetUrl ?? m.previewUrl ?? r.previewUrl;

  content.push(para(strong(`🔎 QA Report — ${ticketKey}: ${m.title ?? r.summaryTitle ?? ""}`)));

  content.push(para(strong("Status: "), text(STATUS_EMOJI[r.status] ?? r.status ?? "—")));
  content.push(
    para(
      strong("Tested: "),
      text(`${m.testedAt ?? ""} · env: ${m.envName ?? ""} (${m.host ?? ""}) · type: ${m.testType ?? r.testType ?? ""}`),
    ),
  );
  if (present(targetUrl)) content.push(para(strong(`${urlLabel}: `), text(targetUrl)));
  content.push(para(strong("Build under test: "), text(m.buildUnderTest ?? r.buildUnderTest ?? "")));
  content.push(para(strong("Mode: "), text(`${m.mode ?? ""} · `), strong("Run: "), text(m.runId ?? "")));

  // Acceptance criteria table
  content.push(para(strong("Acceptance criteria")));
  const perAC = Array.isArray(r.perAC) ? r.perAC : [];
  if (perAC.length) {
    content.push(
      table(
        ["#", "Criterion", "Type", "Result", "Notes"],
        perAC.map((ac) => [
          String(ac.n ?? ""),
          ac.text ?? "",
          TYPE_EMOJI[ac.type] ?? ac.type ?? "",
          RESULT_EMOJI[ac.result] ?? ac.result ?? "",
          ac.notes ?? "",
        ]),
      ),
    );
  } else {
    content.push(para(em("No per-AC breakdown returned.")));
  }

  content.push(
    para(
      strong("Summary: "),
      text(`${sum.passed ?? 0} passed · ${sum.failed ?? 0} failed · ${sum.partial ?? 0} partial · ${sum.blocked ?? 0} blocked`),
    ),
  );

  // BLOCKED detail
  const blockers = Array.isArray(r.blockers) ? r.blockers.filter(Boolean) : [];
  if (blockers.length) {
    content.push(para(strong("Test data / config required:")));
    content.push({ type: "bulletList", content: blockers.map((b) => ({ type: "listItem", content: [para(text(b))] })) });
  }
  const seeded = Array.isArray(r.seeded) ? r.seeded.filter((s) => s && s.collection) : [];
  if (seeded.length) {
    content.push(
      para(em(`Seeded automatically on staging — ${seeded.map((s) => `${s.collection}×${s.count}`).join(", ")}; cleaned up after run.`)),
    );
  }

  // Remediation summary (Phase 2/3) — passed through verbatim if the orchestrator set it
  if (present(m.remediation)) content.push(para(strong("🔧 Remediation: "), text(m.remediation)));

  // Evidence — actual screenshots, embedded inline
  content.push(para(strong("Evidence")));
  const ev = Array.isArray(attached) ? attached : [];
  if (ev.length) {
    for (const a of ev) {
      const label = a.ac != null ? `AC${a.ac}` : "Screenshot";
      content.push(para(strong(`${label} — `), text(a.caption ?? a.filename ?? "")));
      content.push({
        type: "mediaSingle",
        attrs: { layout: "align-start", width: 75 },
        content: [
          {
            type: "media",
            attrs: {
              type: "file",
              id: a.attachmentId,
              collection: "",
              ...(a.size ? { width: a.size.width, height: a.size.height } : {}),
            },
          },
        ],
      });
    }
  } else {
    content.push(para(text("none")));
  }

  // Out-of-scope observations
  const obs = Array.isArray(r.observations) ? r.observations.filter(Boolean) : [];
  content.push(para(strong("Out-of-scope observations: "), text(obs.length ? "" : "none (logged to backlog)")));
  if (obs.length) {
    content.push({ type: "bulletList", content: obs.map((o) => ({ type: "listItem", content: [para(text(o))] })) });
  }

  content.push(para(em(`Posted by ${postedBy} · do not edit — re-run ${postedBy} to refresh.`)));

  return { version: 1, type: "doc", content };
}

// ── Jira REST v3 ──────────────────────────────────────────────────────────────
function authHeader(email, apiToken) {
  return `Basic ${Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64")}`;
}

// fetch wrapper: on HTTP 429, honor Retry-After (seconds) with a short, capped backoff and retry a
// few times. Reused FormData/Blob bodies are backed by in-memory bytes, so they replay safely.
async function fetchWithRetry(url, opts, { retries = 3, capMs = 8000 } = {}) {
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, opts);
    if (res.status !== 429 || attempt >= retries) return res;
    const raw = res.headers.get("retry-after");
    const seconds = Number(raw);
    const waitMs = Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000 * (attempt + 1), capMs);
    await res.text().catch(() => {}); // drain so the socket frees before we wait
    process.stderr.write(`429 from Jira — retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})\n`);
    await sleep(waitMs);
    attempt++;
  }
}

async function uploadAttachment({ site, auth, ticketKey, path, filename }) {
  const buf = await readFile(path);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: mimeFor(filename) }), filename);
  const res = await fetchWithRetry(
    `https://${site}/rest/api/3/issue/${encodeURIComponent(ticketKey)}/attachments`,
    {
      method: "POST",
      headers: { Authorization: auth, Accept: "application/json", "X-Atlassian-Token": "no-check" },
      body: form,
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`attachment upload failed (${res.status}) for ${filename}: ${scrub(body).slice(0, 300)}`);
  }
  const json = await res.json();
  const att = Array.isArray(json) ? json[0] : json;
  return { attachmentId: att.id, filename: att.filename ?? filename, size: pngSize(buf) };
}

async function postComment({ site, auth, ticketKey, adf }) {
  const res = await fetchWithRetry(`https://${site}/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ body: adf }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`comment post failed (${res.status}): ${scrub(body).slice(0, 300)}`);
  }
  return res.json();
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) die(2, "usage: post-jira-result.mjs <payload.json>");

  let payload;
  try {
    payload = JSON.parse(await readFile(payloadPath, "utf8"));
  } catch (e) {
    die(2, `cannot read payload: ${e.message}`);
  }

  const { ticketKey, qaEnvPath, configPath, dryRun } = payload;
  if (!present(ticketKey)) die(2, "payload.ticketKey is required");
  if (!present(payload.meta?.envName))
    die(2, "payload.meta.envName is required (preview|staging) — no silent default");

  // Normalize evidence: a bare string is a path; otherwise {path,caption,ac}. Keep present paths.
  const evidence = (payload.evidence ?? payload.result?.evidence ?? [])
    .map((e) => (typeof e === "string" ? { path: e } : e))
    .filter((e) => e && present(e.path));

  // Dry-run makes no network calls (and reads no screenshot files), so it never needs creds.
  if (dryRun) {
    process.stdout.write(
      `[dry-run] would attach ${evidence.length} screenshot(s) to ${ticketKey} and post 1 comment:\n`,
    );
    for (const e of evidence) {
      process.stdout.write(`  - ${e.path}  (AC${e.ac ?? "?"}: ${scrub(e.caption ?? "")})\n`);
    }
    const adf = buildAdf({
      ticketKey,
      meta: payload.meta,
      result: payload.result,
      attached: evidence.map((e, i) => ({
        attachmentId: `dryrun-${i}`,
        filename: e.path.split("/").pop(),
        caption: e.caption,
        ac: e.ac,
      })),
    });
    process.stdout.write(`[dry-run] ADF preview (${adf.content.length} nodes); no Jira writes performed.\n`);
    if (process.env.QA_DEBUG_ADF) process.stdout.write(JSON.stringify(adf, null, 2) + "\n");
    process.exit(0);
  }

  // Resolve Jira creds from qa-env.json.
  let email, apiToken;
  try {
    const qaEnv = JSON.parse(await readFile(qaEnvPath, "utf8"));
    email = qaEnv?.jira?.email;
    apiToken = qaEnv?.jira?.apiToken;
  } catch (e) {
    die(3, `CREDS_ABSENT: cannot read jira creds from qa-env.json (${e.message})`);
  }

  // Resolve the Jira site from config — jira.site, falling back to tracker.site (this repo's shape).
  let site;
  try {
    const cfg = JSON.parse(await readFile(configPath, "utf8"));
    site = cfg?.jira?.site ?? cfg?.tracker?.site;
  } catch (e) {
    die(2, `cannot read jira/tracker.site from config: ${e.message}`);
  }
  if (!present(site)) die(2, "jira.site (or tracker.site) missing from .claude/config.json");

  if (!present(email) || !present(apiToken)) {
    die(
      3,
      "CREDS_ABSENT: fill qa-env.json → jira.{email,apiToken} to embed screenshots (falling back to the MCP comment).",
    );
  }

  const auth = authHeader(email, apiToken);

  // 1) upload screenshots as issue attachments
  const attached = [];
  for (const e of evidence) {
    const filename = e.path.split("/").pop();
    const up = await uploadAttachment({ site, auth, ticketKey, path: e.path, filename });
    attached.push({ ...up, ac: e.ac, caption: e.caption });
  }

  // 2) post the comment with inline media
  const adf = buildAdf({ ticketKey, meta: payload.meta, result: payload.result, attached });
  const comment = await postComment({ site, auth, ticketKey, adf });

  process.stdout.write(
    `posted comment ${comment.id} on ${ticketKey} with ${attached.length} inline screenshot(s)` +
      (attached.length ? ` [${attached.map((a) => a.attachmentId).join(", ")}]` : "") +
      "\n",
  );
  process.exit(0);
}

main().catch((e) => die(1, `ERROR: ${scrub(String(e?.message ?? e))}`));
