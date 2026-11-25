# Privacy Policy — canonical copy

> **This file is the source of truth for the privacy policy published at `/es-AR/privacidad` and
> `/en-US/privacy`.** The live page is a protected legal topic (`topics` collection, slug
> `privacidad` / `privacy`) managed in the Ministry Admin Panel (`ministerio.idcredentor.org`), which
> requires the `content:publish-protected` permission to publish — so this doc is where the policy gets
> reviewed, diffed, and versioned. When the policy changes, change it _here_ first, then publish (see
> § Publishing runbook). The copy below is deliberately, verifiably true about what the site does — see
> § Why this copy says what it says.

## Publishing runbook (protected publish — human-only)

1. Open `https://ministerio.idcredentor.org` → **Contenido → Temas / Páginas legales** → open
   **Política de Privacidad** (`privacidad` / `privacy`).
2. **es-AR (`Política de Privacidad`):** update the Spanish body with the **es-AR** copy below. Do not
   duplicate the `Política de Privacidad` H1 inside the body — the page renders its title from `title`.
3. **en-US (`Privacy Policy`):** update the English body with the **en-US** copy below. Protected topics
   require both locales before publishing.
4. **Set the effective date** in both locales to the publication date (Buenos Aires local date).
5. **Preview** both `/es-AR/privacidad` and `/en-US/privacy` via the admin Preview button and confirm
   headings, bold emphasis, and links render cleanly (no literal markdown characters).
6. **Publish** using an account holding the `content:publish-protected` permission (anyone without it can
   save a draft only). Publishing records a `content.publish-protected` audit entry and revalidates
   `https://www.idcredentor.org` within 10 seconds.
7. Load `/es-AR/privacidad` and `/en-US/privacy` live and confirm the updated copy, effective date, and
   footer links all resolve.

> **Note:** paste clean formatted text into the rich-text editor; do not leave literal `##` or `**`
> markdown characters in the field.

## Why this copy says what it says

Every claim below traces to a line of source. Where an earlier draft of the ticket disagreed with the
code, the code wins.

| Claim                                                                                                                | Source                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact form stores `name`/`email`/`subject`/`message`                                                               | `apps/web/src/service/contact.service.ts:11-18` (Mongo `website.contact` + `createdAt`)                                                                                                                  |
| Newsletter email lives at **Resend**, not in our database                                                            | `apps/web/src/service/subscribe.service.ts:29`                                                                                                                                                           |
| Likes generate a random UUID, not tied to identity                                                                   | `apps/web/src/app/api/likes/route.ts:64` (`crypto.randomUUID()`)                                                                                                                                         |
| Likes cover **sermons too**, not just blog posts — the copy must not say "blog"                                      | `predicas/[slug]/page.tsx:61-63` reads `_visitor_id` + `getLikes("predicas/<slug>")`; `SermonDetails.tsx:69-71` reuses the blog's `PostActions` with `basePath="predicas"`                               |
| §1 must disclose AUTOMATIC collection, not only user-submitted data                                                  | `layout.tsx:108-109,122` (Vercel Analytics/Speed Insights + GTM mount unconditionally) and `instrumentation-client.ts` (Sentry) run for a visitor who never submits anything                             |
| Five named processors: Resend, MongoDB Atlas, Vercel, Google, Sentry                                                 | See table below                                                                                                                                                                                          |
| `_visitor_id` cookie is httpOnly, set only on first like, 1-year lifetime                                            | `apps/web/src/app/api/likes/route.ts:82-88` (`60*60*24*365`)                                                                                                                                             |
| Declining analytics stops GA **cookies** only — not GTM cookieless pings, Vercel Analytics/Speed Insights, or Sentry | `apps/web/src/app/[locale]/layout.tsx:26-40,108-109`; `apps/web/instrumentation-client.ts`; `docs/architecture/gtm-ga4-setup.md:509`                                                                     |
| Nothing is ever auto-deleted (no TTL, no purge path)                                                                 | Grep of `apps/web/src` for `expireAfterSeconds`/`deleteMany`/`deleteOne` against `website.contact`/`website.likes`: zero hits                                                                            |
| Sentry's PII posture is locked (no identities, no form contents)                                                     | `apps/web/src/utils/sentry/options.ts:91-92` (`sendDefaultPii: false`, `dataCollection.userInfo: false`)                                                                                                 |
| Sentry also receives **sampled performance/navigation** data on ordinary visits, not only on errors                  | `apps/web/src/utils/sentry/options.ts:93` (`tracesSampleRate`, always non-zero); `instrumentation-client.ts:8` (`onRouterTransitionStart = Sentry.captureRouterTransitionStart`)                         |
| Vercel Blob serves site images, sermon **audio + PDFs** direct to the browser; MongoDB Atlas stores site text        | `apps/web/lib/content/getSermons.ts` (`audio.url`, `pdfSummary.url` served from Vercel Blob `*.public.blob.vercel-storage.com`) → `SermonDetails.tsx` `src={sermon.audio.url}`, `PdfDownloadButton.tsx` `href={pdfSummary.url}` |

**Only these five are named — deliberately, and two others are not.** SendGrid and Mailchimp both exist in
the codebase, and both are excluded from the policy on purpose:

- **SendGrid** — the alternate transactional-email adapter (`apps/web/src/service/mailing/sendgrid.adapter.ts`).
  `SENDGRID_API_KEY` is set in **no** Vercel environment (Production, Preview, staging, Development), so the
  adapter physically cannot send mail: it is dead config. The live provider is Resend.
- **Mailchimp** — the legacy newsletter integration. No code path reads it any more, and the dependency plus
  its `MAILCHIMP_*` env vars were **removed in ICR-110**. It is gone, not merely unused.

Naming either in the policy would disclose a data flow that **does not occur** — the same category of false
statement this document exists to remove. If SendGrid is ever given a live API key, the policy must name it
**before** that key is set.

## Maintenance triggers

This copy becomes wrong — and must be revised — if any of the following happen:

- The mail provider changes away from **Resend** — e.g. SendGrid is given a live `SENDGRID_API_KEY`, or a
  new provider is added.
- A TTL or purge path is added to `website.contact` or `website.likes` (today, nothing is auto-deleted).
- **Vercel Analytics/Speed Insights** or **Sentry** become consent-gated (today, both are always on).
- A new third-party script or processor is added to the site.
- Sentry's `sendDefaultPii` is flipped on (today it is locked `false`).

---

# es-AR

> **h1 (Admin Panel `title`, es-AR):** `Política de Privacidad`

**Fecha de vigencia: 24 de noviembre de 2026**

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
- **MongoDB Atlas** — es la base de datos donde guardamos el contenido del sitio, los mensajes del
  formulario de contacto y los registros de "me gusta".
- **Vercel** — aloja el sitio y sus archivos multimedia (Vercel Blob), por lo que recibe cada solicitud
  que su navegador hace — incluidas las imágenes, el audio y los resúmenes en PDF de las prédicas.
  También provee las herramientas de estadísticas de uso y de rendimiento que el sitio utiliza.
- **Google** — provee las herramientas de analítica del sitio (Google Tag Manager y Google Analytics), y
  el mapa de la página "Vení a conocernos" se carga desde Google Maps, por lo que Google recibe esa
  solicitud cuando usted visita esa página.
- **Sentry** — recibe informes técnicos cuando algo falla y, además, una muestra de datos de rendimiento
  y de navegación durante visitas normales, aunque no ocurra ningún error. Está configurado para **no**
  enviarle datos personales: no recibe el contenido de los formularios ni su identidad, solo información
  técnica.

Cualquier proveedor que le entrega contenido a su navegador (Vercel, Google Maps) recibe
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

# en-US

> **h1 (Admin Panel `title`, en-US):** `Privacy Policy`

**Effective date: November 24, 2026**

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
- **MongoDB Atlas** — the database where we store the site's content, contact-form messages, and like
  records.
- **Vercel** — hosts the site and its media files (Vercel Blob), so it receives every request your
  browser makes — including images, sermon audio, and PDF summaries. It also provides the
  usage-statistics and performance tools the site uses.
- **Google** — provides the site's analytics tools (Google Tag Manager and Google Analytics), and the map
  on our "Come meet us" page loads from Google Maps, so Google receives that request when you visit that
  page.
- **Sentry** — receives technical reports when something goes wrong, and also a sample of performance and
  navigation data during ordinary visits, even when nothing fails. It is configured **not** to send it
  personal data: it does not receive your form contents or your identity, only technical information.

Any provider that delivers content to your browser (Vercel, Google Maps) necessarily receives
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

---

**Last reviewed:** 2026-11-24
