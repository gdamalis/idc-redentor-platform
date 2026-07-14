# ICR-137 — Fix the published privacy policy

> **The live privacy policy makes statements about our data handling that are false.** This ticket
> rewrites both locales so the policy describes what the site _actually_ does — verified against the
> source, not against the ticket. The PR's substance is `docs/product/privacy-policy.md` (the canonical,
> reviewable, version-controlled copy). A **human** then pastes both locales into Contentful and publishes.

- **Jira:** [ICR-137](https://divinelab.atlassian.net/browse/ICR-137) · Bug · Priority **Highest**
- **Commit type:** `fix` · **Branch:** `fix/ICR-137-fix-published-privacy-policy`
- **QA depth:** standard · **QA type:** `chore` (docs-only diff; see § Testing)
- **Sensitive areas:** `form-pii-spam`, `likes-mongo`, `email-services` — **referenced, not modified.**
  This ticket changes **no** data-handling behaviour. It only changes what we _say_ about it.

## 1. Dependencies Check

Everything this policy describes already exists on `main` (worktree base `ea8d799`). Nothing to build first.

| Must exist                                | Status | Evidence                                                                                              |
| ----------------------------------------- | :----: | ----------------------------------------------------------------------------------------------------- |
| Contentful entry `2nFd6sF9w0BbrhWrYklPVD` |   ✅   | Read live from the `production` env; `churchInfoTopic`, both locales published (`publishedVersion` 6) |
| `[locale]/[topic]` route renders it       |   ✅   | `apps/web/src/app/[locale]/[topic]/page.tsx` — h1 = `name`, body = rich text                          |
| Canonical email `info@idcredentor.org`    |   ✅   | Only address in source: `Footer.tsx:120`, `lib/metadata.ts:167`, `resendBroadcast.ts:6`               |
| Sentry live (new processor)               |   ✅   | ICR-117 merged in `ea8d799`; `instrumentation-client.ts` inits unconditionally                        |
| `docs/product/` house style               |   ✅   | `docs/product/README.md` — H1, bolded lede blockquote, `**Last reviewed:**` footer                    |

## 2. Verified factual basis (the whole point of this ticket)

Every claim in the new copy traces to a line of source. **Where the ticket disagreed with the code, the
code wins** — three corrections are folded in below.

### 2.1 What we actually collect

| Surface                                                       | Fields                                                                          | Stored where                                                                                      |              IP / user-agent?               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | :-----------------------------------------: |
| Contact form                                                  | `name`, `email`, `subject`, `message`                                           | Mongo `website.contact` + `createdAt` (`contact.service.ts:11-18`); also emailed to us via Resend |                   **No**                    |
| Newsletter                                                    | `email` only                                                                    | **Not in our database at all** — sent straight to a Resend Audience (`subscribe.service.ts:29`)   |                   **No**                    |
| Likes (blog **and sermons**)                                  | A server-generated random UUID (`crypto.randomUUID()`, `api/likes/route.ts:64`) | Mongo `website.likes.visitors[]`, alongside the item's slug (`like.service.ts:41-42`)             |                   **No**                    |
| **Automatic telemetry** (every visitor, no submission needed) | Usage/performance events + error diagnostics + request metadata (IP, browser)   | Google (GTM/GA4), Vercel (Analytics/Speed Insights), Sentry — **not** our own DB                  | **IP reaches the processors**, never our DB |

> **Correction to the ticket (1/3):** the ticket implies newsletter emails are ours to hold. They are
> not — we never store a subscriber's email; Resend does. The copy must say so.

> **Correction (4/4) — added at code review (Codex, PR #95).** Two gaps in the first draft of the copy,
> both confirmed against the source:
>
> 1. **Likes are not blog-only.** Sermons reuse the blog's like path — `predicas/[slug]/page.tsx:61-63`
>    reads `_visitor_id` and calls `getLikes("predicas/<slug>")`, and `SermonDetails.tsx:69-71` renders the
>    blog's `PostActions` with `basePath="predicas"`. Copy saying "blog likes" leaves a visitor who likes a
>    **prédica** undisclosed. (This is the ICR-39 shared-component trap, again.)
> 2. **§1 must disclose AUTOMATIC collection.** The first draft opened "we collect only what you send us",
>    but GTM/GA4, Vercel Analytics/Speed Insights and Sentry all load for a visitor who never submits a
>    form, subscribes, or likes anything (`layout.tsx:108-109,122`, `instrumentation-client.ts`). §3/§5
>    disclosed the processors, but §1 — the section a reader trusts for "what do you collect" — stated a
>    falsehood. §1 now has two parts: _what you send us_ and _what is collected automatically_ (usage,
>    errors, request metadata), with the "we don't store your IP" claim narrowed to **our own database**.

### 2.2 Processors that actually receive visitor data today

Per the design gate, **all** of these are named in the policy — including Sentry, which the ticket
predates.

| Processor         | What it receives                                                                 |     Consent-gated?      |
| ----------------- | -------------------------------------------------------------------------------- | :---------------------: |
| **Resend**        | Contact-form contents (email delivery) + newsletter subscriber emails (Audience) |   n/a (you submit it)   |
| **Google**        | GTM/GA4 analytics events; the Maps `<iframe>` on come-meet-us loads from Google  | **Partially** — see 2.4 |
| **Vercel**        | Hosting (every request); Analytics; Speed Insights                               |   **No** — always on    |
| **MongoDB Atlas** | The `website` database (contact messages, like records)                          |           n/a           |
| **Sentry**        | Error/performance telemetry from the browser and server                          |   **No** — always on    |
| **Contentful**    | Serves page content + images from its CDN, so it sees the request's IP           |           n/a           |

> **Correction to the ticket (2/3):** the ticket lists **SendGrid** as a processor "while `MAIL_PROVIDER`
> supports it". `SENDGRID_API_KEY` is set in **no** Vercel environment (Production, Preview, staging,
> Development — verified via `vercel env ls`), so the SendGrid adapter cannot send: it is dead config.
> Naming it would disclose a data flow that **does not occur**. Per the design gate: **name Resend only.**
> If the provider ever changes, the policy must change with it.

> **Correction to the ticket (3/3):** **Sentry** is a real processor as of ICR-117 (merged hours before
> this ticket started) and the ticket does not mention it. Its PII posture is deliberately locked
> (`sendDefaultPii: false`, `dataCollection.userInfo: false`, no HTTP bodies — `src/utils/sentry/options.ts:91-92`),
> so it receives diagnostics, **not** identities or form contents. That distinction is stated in the copy
> rather than glossed.

### 2.3 Cookies and client-side storage actually set

| Name                | Type                                                   | Set when                                                 | Lifetime                    | Purpose                                                                         |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `_visitor_id`       | Cookie, **httpOnly**, `sameSite=lax`, `secure` in prod | Only on your **first like** (`api/likes/route.ts:82-88`) | **1 year** (`60*60*24*365`) | Stops the same visitor liking a post twice                                      |
| `_ga`, `_ga_*`      | Cookie (Google)                                        | Only **after you accept**                                | Google-controlled           | Google Analytics                                                                |
| `analytics-consent` | `localStorage`                                         | When you choose on the banner                            | Until cleared               | Remembers your choice (`"granted"` / `"denied"`) — `src/lib/consent.ts:1,17-19` |

### 2.4 What "Decline" actually does — and does not do

This is the claim most likely to be quietly overstated, so it is pinned precisely:

- Declining sets `analytics_storage: denied` **before GTM loads** (`[locale]/layout.tsx:26-40`) → Google
  **does not set analytics cookies**.
- Declining does **not** stop GTM from loading, and Google still receives **cookieless pings**
  (`docs/architecture/gtm-ga4-setup.md:509`).
- **Vercel Analytics + Speed Insights are never gated** — they load on every page regardless
  (`[locale]/layout.tsx:108-109`).
- **Sentry is never gated** — it initialises on every page load (`instrumentation-client.ts`).

The policy therefore says declining stops analytics **cookies**, not "all tracking". Claiming otherwise
would be a fresh false statement in a ticket whose entire purpose is removing one.

### 2.5 Retention — there is none

Grepped `apps/web/src` for `expireAfterSeconds`, `deleteMany`, `deleteOne`, TTL: **zero** hits against
`website.contact` or `website.likes`. The only `createIndex` calls are unrelated uniqueness indexes
(`predica/pdfJobs.ts:28`, `broadcast/broadcastLog.ts:27`). **Nothing is ever automatically deleted.**
The policy must state that plainly and offer the deletion route we can actually honour (email us; we
remove it by hand). A promised retention window would be unimplementable today — i.e. another lie.

## 3. Requirements

1. **R1** — Author `docs/product/privacy-policy.md` holding the canonical **bilingual** copy (es-AR
   primary, en-US secondary), in `docs/product/` house style, with a paste-into-Contentful runbook.
2. **R2** — Copy contains **no** `[...]` placeholders, in either locale.
3. **R3** — The **only** email in the copy is `info@idcredentor.org`. `idcredentor@gmail.com` appears
   nowhere.
4. **R4** — An explicit, editor-controlled **effective date** appears in both locales, as the first line
   of the body. It is **never** derived from `sys.publishedAt` (a typo fix must not silently move a legal
   date). Doc ships the placeholder-free `2026-07-14` and the runbook tells the publisher to set it to the
   real publish date if it slips.
5. **R5** — The body does **not** repeat the page title (the h1 already renders `name`) and carries no
   "(Español)" language tag.
6. **R6** — The `name` field is corrected to `Política de Privacidad` (accent) — a **human** edit in
   Contentful, captured in the runbook.
7. **R7** — The sharing section names every real processor (§2.2) and the false "no compartimos / we do
   not share" claim is deleted.
8. **R8** — Cookies (§2.3), consent reality (§2.4) and retention (§2.5) are disclosed accurately.
9. **R9** — Copy uses **only** rich-text nodes the renderer styles: `HEADING_2`, `PARAGRAPH`, `UL_LIST`,
   `LIST_ITEM`, `BOLD` (`lib/contentful/rich-text-options.tsx:27-69`). **No hyperlinks** (unstyled by the
   renderer) — emails are plain text. **No `HEADING_1`** (reserved for `name`).
10. **R10** — Asserts **no** compliance status (no Ley 25.326 / AAIP / GDPR citations) — per the design
    gate, truthful plain language only, pending a real legal review.

## 4. Data Model Changes

**None.** No Contentful content-type or field change; no Mongo schema change; no index. This is a
**CONTENT** edit to an existing entry, performed live in `master`/`production` **by a human**.
The Contentful model-change gate does **not** apply.

## 5. API Changes

**None.** No route, server action, or Zod schema is touched.

## 6. New / Modified Files

| File                                | Change  | Purpose                                                      |
| ----------------------------------- | ------- | ------------------------------------------------------------ |
| `docs/product/privacy-policy.md`    | **new** | Canonical bilingual copy + the Contentful publish runbook    |
| `docs/product/README.md`            | edit    | Add the policy to the reading order (keeps the index honest) |
| `tasks/specs/ICR-137-*.md/.plan.md` | new     | Spec + plan (ride the PR)                                    |

**No `apps/web/**` source file changes.\*\* If the implementer finds itself editing app code, the plan is wrong.

## 7. Rendered structure (what the page becomes)

```
<h1>            ← Contentful `name`   "Política de Privacidad" / "Privacy Policy"
<p><strong>     ← effective date line
<p>             ← intro
<h2> … <p>/<ul> ← §1 … §10   (HEADING_2 sections)
```

## 8. Edge Cases

1. **Publish slips past the effective date** → the runbook makes the publisher set the date at paste
   time; the doc's value is a default, not a hardcoded truth.
2. **Publisher pastes markdown into a rich-text field** → Contentful's editor converts `##` to H2 and
   `**` to bold on paste, but the runbook says to verify the H2s rendered as _headings_ (not literal `##`).
3. **Only one locale gets pasted** → the page would go half-stale. The runbook requires both locales be
   pasted **and published together** (one publish action covers both, `fieldStatus.*` is per-locale).
4. **`MAIL_PROVIDER` changes to SendGrid later** → the policy becomes wrong. Noted in the doc as a
   maintenance trigger.
5. **A future ticket consent-gates Vercel Analytics / adds a TTL** → §2.4/§2.5 copy becomes _understated_
   (safe direction), but must still be updated. Listed as maintenance triggers in the doc.
6. **Renderer lacks hyperlink styling** → emails stay plain text; no `<a>` nodes (R9).

## 9. i18n

Not `public/locales/*.json` — this is **CMS content**, not UI strings. Both locales live in the one
Contentful entry (`body.es-AR`, `body.en-US`) and in the canonical doc. es-AR uses the formal **usted**
register (matching the existing policy and appropriate to a legal text), **not** the voseo used in
marketing copy.

## 10. Testing Strategy

The diff is documentation. It has no runtime surface, so there is nothing meaningful to unit-test —
adding a test that greps our own markdown would be a green rubber stamp (cf. the ICR-148 lesson: a
structural invariant is proven by inspection, not by a tautological test).

- **Verifier stack** (`type-check` + `lint` + `test` + `build`) must stay green — proving the docs-only
  change breaks nothing. Test count must be **unchanged** vs base.
- **Content assertions** (run against the authored doc, the ACs made binary):
  - no `[` … `]` placeholder tokens; no `idcredentor@gmail.com`; `info@idcredentor.org` present in both locales
  - `Política de Privacidad` carries its accent; no `(Español)` tag; no `# `-level heading inside a body section
  - both locales name: Resend, Google, Vercel, MongoDB Atlas, Sentry — and **not** SendGrid/Mailchimp
- **Rendered-page QA is NOT possible pre-merge.** The Vercel preview reads the **live** Contentful entry,
  which still holds the old copy until a human publishes. So AC "both locales render correctly" is
  **deferred to the human publish**, not silently claimed. (Per the ICR-111 lesson: a deferral must land
  somewhere real → it lands on the follow-up ticket in §12.)

## 11. Implementation Checkpoints

### CP1 — Author the canonical policy doc

- **Files:** `docs/product/privacy-policy.md` (new), `docs/product/README.md` (reading order)
- **Verify:** content assertions in §10 pass; `pnpm type-check && pnpm lint && pnpm test` green;
  `prettier --check` clean on the two touched files (repo-wide `format:check` is pre-existing-dirty — do
  not "fix" 163 unrelated files, cf. ICR-109)
- **Commit:** `fix(ICR-137): rewrite the privacy policy to describe real data handling`

### CP2 — Full verify + build

- **Files:** none
- **Verify:** `pnpm build` green; test count unchanged vs `origin/main`
- **Commit:** none (verification only)

## 12. Deferred production action (MUST be ticketed)

Publishing is a **human** step performed after merge, and per the standing rule ("any action required in
production beyond the merge itself must be recorded as its own Jira ticket") it gets its own issue:

> **New Jira issue — "Publish the corrected privacy policy to Contentful"** (`deferred-prod-action`,
> `runbook`), blocked by ICR-137. Steps: fix `name` accent (es-AR) → paste `body` es-AR + en-US → set the
> effective date → publish both locales → verify `/es-AR/privacidad` + `/en-US/privacy` render and the
> footer links resolve.

Without this ticket the merge would leave the live page **still wrong** with nothing tracking it.

## 13. Open Questions

1. **Effective date** — doc ships `2026-07-14`; publisher confirms/adjusts at paste time (design-gate decision).
2. **Legal review** — the copy is truthful but **not lawyer-reviewed**. It asserts no compliance status
   (R10). A real Ley 25.326 / AAIP framing is a separate, human-owned follow-up.
3. **The policy is honest about un-gated analytics** — that honesty may make leadership _want_ to change
   the behaviour (consent-gate Vercel/Sentry, add a TTL). That is explicitly **out of scope** here and is
   the right instinct for a follow-up; this ticket only stops the page from lying.

---

## Appendix A — The copy (es-AR)

> **h1 (Contentful `name`, es-AR):** `Política de Privacidad`

**Fecha de vigencia: 14 de julio de 2026**

En la Iglesia de Cristo Redentor queremos que sepa exactamente qué información recopila este sitio web,
para qué la usamos y con quién la compartimos. Esta política describe lo que el sitio realmente hace hoy.
Si algo cambia, actualizaremos esta página y su fecha de vigencia.

## 1. Qué información recopilamos

Recopilamos dos clases de información: la que usted nos envía, y la que se recopila automáticamente por
el solo hecho de visitar el sitio.

**Lo que usted nos envía**

- **Formulario de contacto:** su nombre, su correo electrónico, el asunto y el mensaje que escribe.
- **Suscripción al boletín:** únicamente su correo electrónico.
- **"Me gusta":** cuando marca por primera vez un contenido del sitio — un artículo del blog o una
  prédica — generamos un identificador aleatorio (por ejemplo `a3f8c1e2-…`) y lo guardamos en una cookie
  llamada `_visitor_id`. Ese identificador no contiene su nombre, su correo ni su dirección IP: sirve solo
  para que un mismo visitante no cuente dos veces el mismo "me gusta".

**Lo que se recopila automáticamente**

Aunque usted no complete ningún formulario ni marque ningún "me gusta", su visita genera datos técnicos:

- **Uso y rendimiento:** las herramientas de analítica y de rendimiento registran, de forma general, qué
  páginas se visitan y cuán rápido cargan.
- **Errores:** si algo falla, se envía un informe técnico del error para que podamos repararlo.
- **Datos de la solicitud:** como en cualquier sitio web, los servidores que le entregan estas páginas
  reciben su dirección IP y datos básicos de su navegador. Esto es inevitable para poder mostrarle el
  sitio.

Todos los proveedores que reciben estos datos están nombrados en la sección 3, y en la sección 5
explicamos con precisión qué detiene y qué **no** detiene el rechazo de las cookies de analítica.

No le pedimos que cree una cuenta y no guardamos contraseñas. Tampoco guardamos su dirección IP ni su
navegador **en nuestra propia base de datos**, junto a los mensajes o los "me gusta".

## 2. Cómo usamos su información

- Para responder sus consultas y ponernos en contacto con usted.
- Para enviarle el boletín, si usted lo pidió.
- Para contar los "me gusta" de cada artículo y de cada prédica.
- Para entender de forma general cómo se usa el sitio y detectar errores.

No vendemos su información y no la usamos para publicidad.

## 3. Con quién compartimos su información

Para que el sitio funcione dependemos de proveedores externos, y algunos de ellos reciben datos suyos.
Estos son todos:

- **Resend** — entrega los correos del formulario de contacto y administra la lista del boletín. Si se
  suscribe, su correo electrónico queda guardado en Resend, no en nuestra base de datos.
- **MongoDB Atlas** — es la base de datos donde guardamos los mensajes del formulario de contacto y los
  registros de "me gusta".
- **Vercel** — aloja el sitio, por lo que recibe cada solicitud que su navegador hace. También provee las
  herramientas de estadísticas de uso y de rendimiento que el sitio utiliza.
- **Google** — provee las herramientas de analítica del sitio (Google Tag Manager y Google Analytics), y
  el mapa de la página "Vení a conocernos" se carga desde Google Maps, por lo que Google recibe esa
  solicitud cuando usted visita esa página.
- **Sentry** — recibe informes técnicos de errores y de rendimiento cuando algo falla. Está configurado
  para **no** enviarle datos personales: no recibe el contenido de los formularios ni su identidad, solo
  información técnica del error.
- **Contentful** — provee los textos y las imágenes del sitio desde su red de distribución de contenidos.

Cualquier proveedor que le entrega contenido a su navegador (Vercel, Contentful, Google Maps) recibe
inevitablemente su dirección IP y datos básicos de su navegador como parte de esa entrega técnica.

Además, podemos compartir información si la ley nos obliga a hacerlo.

## 4. Cookies y almacenamiento local

- **`_visitor_id`** — cookie que se crea solo cuando usted marca su primer "me gusta". Dura **un año**, no
  es accesible desde JavaScript y solo evita los "me gusta" duplicados.
- **`_ga` y `_ga_*`** — cookies de Google Analytics. Se crean **solo si usted acepta** las cookies de
  analítica en el aviso del sitio.
- **`analytics-consent`** — se guarda en el almacenamiento local de su navegador para recordar la
  elección que hizo en ese aviso.

## 5. Analítica y su elección de consentimiento

Cuando usted visita el sitio le mostramos un aviso para aceptar o rechazar las cookies de analítica.
Queremos ser precisos sobre qué hace y qué no hace ese botón:

- **Si rechaza:** Google **no guarda cookies de analítica** en su navegador.
- **Aun si rechaza:** Google sigue recibiendo señales básicas y anónimas de la visita (sin cookies), y las
  herramientas de estadísticas y rendimiento de **Vercel** y el monitoreo de errores de **Sentry** siguen
  funcionando, porque no dependen de cookies.

En otras palabras: rechazar detiene las **cookies** de analítica, pero no detiene toda la medición. Se lo
decimos claramente en lugar de prometerle algo que el sitio no hace.

## 6. Cuánto tiempo conservamos su información

Hoy **no borramos automáticamente** los mensajes del formulario de contacto ni los registros de "me
gusta": se conservan hasta que los eliminamos manualmente. Preferimos decirle esto antes que prometerle un
plazo de eliminación que hoy no podríamos cumplir.

Si se suscribió al boletín, su correo permanece en la lista hasta que usted se da de baja.

## 7. Sus derechos y cómo eliminar sus datos

Usted puede pedirnos en cualquier momento que le mostremos, corrijamos o eliminemos la información que
tenemos sobre usted. Escríbanos a **info@idcredentor.org** y lo hacemos manualmente.

Para dejar de recibir el boletín, use el enlace para darse de baja que aparece al pie de cada correo, o
escríbanos a la misma dirección.

Para borrar la cookie `_visitor_id` puede eliminar las cookies de este sitio desde su navegador.

## 8. Seguridad

Usamos conexiones cifradas y proveedores con acceso restringido para proteger su información. Aun así,
ningún método de transmisión o de almacenamiento es completamente seguro, y no podemos garantizar una
protección absoluta.

## 9. Cambios en esta política

Podemos actualizar esta política. Cuando lo hagamos, publicaremos la nueva versión en esta página y
cambiaremos la fecha de vigencia que aparece arriba.

## 10. Contacto

Si tiene preguntas sobre esta política o sobre cómo tratamos su información, escríbanos:

Iglesia de Cristo Redentor
Tte. Gral. Juan Domingo Perón 4385, Buenos Aires, Argentina
info@idcredentor.org

---

## Appendix B — The copy (en-US)

> **h1 (Contentful `name`, en-US):** `Privacy Policy`

**Effective date: July 14, 2026**

At Iglesia de Cristo Redentor we want you to know exactly what information this website collects, what we
use it for, and who we share it with. This policy describes what the site actually does today. If that
changes, we will update this page and its effective date.

## 1. What information we collect

We collect two kinds of information: what you send us, and what is collected automatically simply because
you visited the site.

**What you send us**

- **Contact form:** your name, your email address, the subject, and the message you write.
- **Newsletter signup:** your email address only.
- **Likes:** the first time you like anything on the site — a blog article or a sermon — we generate a
  random identifier (for example `a3f8c1e2-…`) and store it in a cookie called `_visitor_id`. That
  identifier contains no name, email, or IP address — it exists only so the same visitor cannot like the
  same item twice.

**What is collected automatically**

Even if you never fill in a form or like anything, your visit produces technical data:

- **Usage and performance:** the site's analytics and performance tools record, in general terms, which
  pages are visited and how quickly they load.
- **Errors:** if something goes wrong, a technical report about the error is sent so that we can fix it.
- **Request data:** as with any website, the servers that deliver these pages receive your IP address and
  basic information about your browser. This is unavoidable in order to show you the site.

Every provider that receives this data is named in section 3, and section 5 explains precisely what
declining analytics cookies does — and does **not** — stop.

We do not ask you to create an account and we do not store passwords. We also do not store your IP address
or browser **in our own database**, alongside your messages or your likes.

## 2. How we use your information

- To answer your questions and get back to you.
- To send you the newsletter, if you asked for it.
- To count the likes on each article and each sermon.
- To understand in general terms how the site is used, and to detect errors.

We do not sell your information and we do not use it for advertising.

## 3. Who we share your information with

Running this site depends on outside providers, and some of them receive your data. These are all of them:

- **Resend** — delivers the emails from the contact form and manages the newsletter list. If you
  subscribe, your email address is stored at Resend, not in our own database.
- **MongoDB Atlas** — the database where we store contact-form messages and like records.
- **Vercel** — hosts the site, so it receives every request your browser makes. It also provides the
  usage-statistics and performance tools the site uses.
- **Google** — provides the site's analytics tools (Google Tag Manager and Google Analytics), and the map
  on our "Come meet us" page loads from Google Maps, so Google receives that request when you visit that
  page.
- **Sentry** — receives technical error and performance reports when something goes wrong. It is
  configured **not** to send it personal data: it does not receive your form contents or your identity,
  only technical information about the error.
- **Contentful** — serves the site's text and images from its content delivery network.

Any provider that delivers content to your browser (Vercel, Contentful, Google Maps) necessarily receives
your IP address and basic browser information as part of that technical delivery.

We may also share information if the law requires us to.

## 4. Cookies and local storage

- **`_visitor_id`** — a cookie created only when you give your first like. It lasts **one year**, is not
  readable by JavaScript, and only prevents duplicate likes.
- **`_ga` and `_ga_*`** — Google Analytics cookies. They are created **only if you accept** analytics
  cookies in the site's banner.
- **`analytics-consent`** — stored in your browser's local storage to remember the choice you made in that
  banner.

## 5. Analytics and your consent choice

When you visit the site we show a banner asking you to accept or decline analytics cookies. We want to be
precise about what that button does and does not do:

- **If you decline:** Google does **not** store analytics cookies in your browser.
- **Even if you decline:** Google still receives basic, anonymous signals about the visit (without
  cookies), and **Vercel**'s usage and performance tools and **Sentry**'s error monitoring keep running,
  because they do not rely on cookies.

In other words: declining stops analytics **cookies**, but it does not stop all measurement. We would
rather tell you that plainly than promise something the site does not do.

## 6. How long we keep your information

Today we do **not** automatically delete contact-form messages or like records: they are kept until we
remove them by hand. We would rather tell you this than promise a deletion window we could not currently
honour.

If you subscribed to the newsletter, your email stays on the list until you unsubscribe.

## 7. Your rights and how to delete your data

You can ask us at any time to show you, correct, or delete the information we hold about you. Write to
**info@idcredentor.org** and we will do it manually.

To stop receiving the newsletter, use the unsubscribe link at the bottom of any newsletter email, or write
to the same address.

To remove the `_visitor_id` cookie, you can clear this site's cookies in your browser.

## 8. Security

We use encrypted connections and access-restricted providers to protect your information. Even so, no
method of transmission or storage is completely secure, and we cannot guarantee absolute protection.

## 9. Changes to this policy

We may update this policy. When we do, we will publish the new version on this page and change the
effective date shown above.

## 10. Contact

If you have questions about this policy or about how we handle your information, write to us:

Iglesia de Cristo Redentor
Tte. Gral. Juan Domingo Perón 4385, Buenos Aires, Argentina
info@idcredentor.org
