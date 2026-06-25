# Claude Design Prompt — IDCR Ministry Admin Panel

> **Purpose:** A ready-to-paste prompt for **Claude Design** to generate the UI of the IDC Redentor Ministry Admin Panel (`apps/admin`), reusing the **existing website design system** (colors, fonts, radius, dark mode) so the two products feel like one family.
>
> **How to use:** Open a Claude Design project and paste the prompt in §B. The design tokens in §A are lifted verbatim from the live site (`src/app/globals.css` + `[locale]/layout.tsx`) — hand them to Claude Design as the source of truth. Start with the MVP screens (People + Calendar); the rest can follow.

---

## A. Design system to reuse (verbatim from the website)

**Fonts (Google Fonts, via `next/font`):**

- **Body / UI — `Outfit`** (sans). Tailwind `font-sans`. CSS var `--font-outfit`.
- **Headings — `Playfair Display`** (serif). Tailwind `font-serif`. CSS var `--font-playfair`.
- Heading treatment: `font-serif font-bold tracking-tight` (h1–h6). Body: `Outfit`, antialiased.

**Tailwind v4, CSS-first, shadcn/ui-compatible token architecture.** Dark mode via a `.dark` class (`next-themes`, default light, system-enabled). Radius base `0.75rem`. Paste this token block as the palette source:

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --color-sidebar: hsl(var(--sidebar));
  --color-sidebar-foreground: hsl(var(--sidebar-foreground));
  --color-sidebar-primary: hsl(var(--sidebar-primary));
  --color-sidebar-primary-foreground: hsl(var(--sidebar-primary-foreground));
  --color-sidebar-accent: hsl(var(--sidebar-accent));
  --color-sidebar-accent-foreground: hsl(var(--sidebar-accent-foreground));
  --color-sidebar-border: hsl(var(--sidebar-border));
  --color-sidebar-ring: hsl(var(--sidebar-ring));
  --font-sans: var(--font-outfit), "Outfit", sans-serif;
  --font-serif: var(--font-playfair), "Playfair Display", serif;
  --letter-spacing-snug: -0.011em;
  --font-size-2xs: 0.625rem;
  --font-size-3xl: 1.75rem;
  --font-size-4xl: 2.5rem;
  --line-height-tighter: 1.1;
}

/* LIGHT */
:root {
  --background: 210 20% 98%;
  --foreground: 222 47% 11%;
  --primary: 210 100% 35%;
  --primary-foreground: 210 40% 98%; /* sophisticated blue */
  --secondary: 35 30% 90%;
  --secondary-foreground: 24 10% 10%; /* warm sand / gold */
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 210 100% 35%;
  --radius: 0.75rem;
  --sidebar: 0 0% 98%;
  --sidebar-foreground: 240 5.3% 26.1%;
  --sidebar-primary: 240 5.9% 10%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 240 4.8% 95.9%;
  --sidebar-accent-foreground: 240 5.9% 10%;
  --sidebar-border: 220 13% 91%;
  --sidebar-ring: 217.2 91.2% 59.8%;
}

/* DARK */
.dark {
  --background: 222 47% 11%;
  --foreground: 210 40% 98%;
  --primary: 210 90% 60%;
  --primary-foreground: 222 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --card: 222 47% 14%;
  --card-foreground: 210 40% 98%;
  --popover: 222 47% 11%;
  --popover-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 210 90% 60%;
  --sidebar: 240 5.9% 10%;
  --sidebar-foreground: 240 4.8% 95.9%;
  --sidebar-primary: 224.3 76.3% 48%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 240 3.7% 15.9%;
  --sidebar-accent-foreground: 240 4.8% 95.9%;
  --sidebar-border: 240 3.7% 15.9%;
  --sidebar-ring: 217.2 91.2% 59.8%;
}
```

---

## B. The prompt (paste into Claude Design)

> You are designing the **IDC Redentor Ministry Admin Panel** — the internal, web-based administration tool for the leadership team of _Iglesia de Cristo Redentor_, a bilingual (Argentine-Spanish-first, English-second) church in Buenos Aires. This is a private, authenticated **internal tool**, not a marketing site: prioritize clarity, density, and efficiency for people doing real data work, while keeping the warm, trustworthy feeling of the church's public website.
>
> **Reuse the existing website design system exactly** — do not invent a new palette or typography. Use the tokens, fonts, radius, and light/dark themes provided alongside this prompt (the `@theme` + `:root`/`.dark` CSS block):
>
> - **Type:** headings in **Playfair Display** (serif, bold, tight tracking); all UI/body text in **Outfit** (sans). Nothing else.
> - **Color:** blue **primary** (`--primary`), warm sand/gold **secondary**, slate neutrals, the dedicated **sidebar** tokens for the nav. Base **radius 0.75rem**. Support **light and dark** (`.dark` class).
> - Build with a **shadcn/ui-compatible** component vocabulary (cards, buttons, inputs, dialogs, tables, badges, dropdowns, tabs, switches/checkboxes) — the live site already uses this token architecture with Radix primitives, so match it.
>
> **Product context (so the screens are real, not filler):** the panel will grow feature-by-feature; design only the **MVP** now — _People/Membership_ and a _printable monthly calendar_. Future pillars (finances, worship-service planning) exist but are **out of scope for this pass** — you may show them as disabled/"coming soon" nav items, nothing more. Access is **invite-only** with **granular role-based permissions** (a real screen below). The church has ~40–60 people; there is **no formal membership** concept — the People list is simply the people in the life of the church.
>
> **Screens to design (MVP), high fidelity, light + dark:**
>
> 1. **Sign-in** — invite-only login: "Continue with Google" + email/password, plus a "forgot password" path. Calm, centered, church-warm; small IDC Redentor logo. (No public sign-up.)
> 2. **App shell** — left **sidebar** (using the sidebar tokens) with nav: Dashboard, People, Families, Activities, Calendar, Users, Roles, Settings (gate items by permission; show finances/worship as disabled "coming soon"). **Topbar** with the page title, a **locale switcher (ES/EN)**, **dark-mode toggle**, and a user menu. Content area is data-first.
> 3. **Dashboard** — this month's **birthdays** at a glance + quick links/counts. Minimal, no data-slop.
> 4. **People — list** — a dense, sortable **data table** (name, family, age/birthday, country, participation tag), with search and filters (by family, by participation). "New person" action. Empty state.
> 5. **Person — detail/edit** — a clean form: name, contact (phone/email — show how **permission-gated/sensitive fields** look when hidden/masked), date of birth (support birthday-without-year), country of origin, **family group** picker, **relationships** editor (spouse/parent/child/sibling), **participation-area tags**, soft participation status, notes. Show audit metadata subtly.
> 6. **Families** — list of family groups → a family detail showing members and relationships.
> 7. **Activities** — a simple list + a create/edit form (title, date, time, type, location note) — these populate the calendar.
> 8. **Calendar — screen + A4 print** — a **monthly grid** overlaying **birthdays** (from People) and **activities**, with month navigation and a prominent **Print** action. Then design the **print sheet**: **A4, print-optimized, Argentine-Spanish month/day names**, clean enough to pin on a wall. The print layout is a first-class deliverable, not an afterthought.
> 9. **Users** — table of users + an **invite** dialog (email + role) — invite-only provisioning.
> 10. **Roles & permissions** — a **permission matrix** (roles × permissions, checkboxes) so an admin can tune granular, per-feature access; plus create/edit role. This is the heart of the RBAC system — make it legible, not overwhelming.
>
> **Bilingual:** the product ships in **es-AR (primary)** and **en-US**. Design with Spanish copy as the default; keep labels short and translatable, and show the ES/EN switcher. Real, plausible Spanish labels — not lorem.
>
> **Quality bar / avoid AI slop:** no gradient-wash backgrounds, no emoji (the brand doesn't use them), no Inter/Roboto, no rounded-card-with-left-border-accent cliché. Use the brand palette; if you need extra hues, derive harmonious ones in oklch from the existing palette. Generous whitespace, real tables with proper density, accessible contrast in both themes, hit targets ≥44px, `text-wrap: pretty`, fl/grid with `gap` over ad-hoc margins. Calm, efficient, trustworthy — a tool the leadership team will enjoy using weekly.
>
> **Output:** high-fidelity HTML mockups (`.dc.html`), starting with **People list, Person detail, and the Calendar (screen + A4 print)** since those are the MVP's beating heart, then the shell, auth, users, and roles. Show **light and dark** for the shell and at least one data screen. Ask me before adding any screen or content beyond this list.

---

## C. Notes for whoever runs this

- The **logo** and any brand imagery should be supplied as real assets (Claude Design shouldn't draw them in SVG). Point it at the church logo from `@idcr/ui` / `public/assets` when available.
- Once mockups are approved, they inform `apps/admin`'s component build in `tasks/specs/admin-mvp.md` (CP1 shell, CP4 People, CP6 calendar). The implementation uses shadcn/ui with these exact tokens, so the mockups should translate closely.
- Keep the **A4 print calendar** honest to real paper dimensions — it's a primary church deliverable ("print it and pin it").

---

## D. Status & next steps

- **v1 (accepted 2026-06-23):** a static, self-contained HTML mockup of the **app shell + People list** at `tasks/specs/design-mockups/people-list.html`, built directly from the §A tokens (Outfit/Playfair, the HSL palette, sidebar tokens, light+dark). Approved as the starting direction for the admin panel. Built as static HTML because the Claude Design MCP was unavailable at the time.
- **Next iteration:** use **Claude Design** to build a proper **shared design system covering both the public website and the ministry admin panel** — one set of tokens + components as the source of truth for both products — iterating from this v1. The admin-only prompt in §B seeds the admin side; the design-system pass should generalize it (tokens, primitives, light/dark) across `apps/web` + `apps/admin`, landing in `@idcr/ui` (see `monorepo-migration.md` CP3).
- Remaining MVP screens to mock (static or via Claude Design): Person detail, Calendar (month view), A4 print calendar, Sign-in, Users, Roles permission matrix.
