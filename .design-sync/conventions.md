# Building with the IDC Redentor design system

These are the real components of **Iglesia de Cristo Redentor**'s website — a bilingual
(**es-AR** default, **en-US** secondary) church site. Copy you write should be **es-AR** unless asked
otherwise, and warm, plain and welcoming — this is a church speaking to its community and to
first-time visitors, not a product marketing to users.

## Wrapping: every screen needs `NextIntlClientProvider`

Most components (`Navbar`, `Footer`, `SermonCard`, `ContactForm`, `SubscribeBanner`,
`LanguageSwitcher`, `LoadingSpinner`, …) call next-intl's `useTranslations()` / `useLocale()`
internally. **Outside the provider they throw and the screen renders blank.** Wrap once, at the root:

```jsx
<NextIntlClientProvider locale="es-AR" messages={messages}>
  {/* your screen */}
</NextIntlClientProvider>
```

`messages` is the translation catalogue (namespaces include `navbar`, `footer`, `Sermons`,
`BlogPost`, `ContactForm`, `SubscribeBanner`, `Community`, `Connect`, `common`). Components read
their own strings from it — you don't pass labels in as props.

**Dark mode** is a `.dark` class on an ancestor (`<html class="dark">`), not a prop. Every token
below has a dark value already; you don't restyle for it.

## Styling idiom: Tailwind v4 utilities over semantic tokens

Style with **utility classes**, never raw hex or ad-hoc CSS. The palette is **semantic, not literal**
— use `bg-primary`, never `bg-blue-700`. Each surface token has a paired `-foreground` for text on it.

| Family           | Classes                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Surfaces         | `bg-background` `bg-card` `bg-popover` `bg-muted` `bg-accent`                                                           |
| Brand            | `bg-primary` (blue) · `bg-secondary` (warm sand) · `bg-destructive`                                                     |
| Text on surfaces | `text-foreground` `text-muted-foreground` `text-card-foreground`                                                        |
| Text on brand    | `text-primary-foreground` `text-secondary-foreground` `text-destructive-foreground`                                     |
| Opacity          | `bg-primary/10` … `bg-primary/90` (steps of 10)                                                                         |
| Borders          | `border` `border-border` `border-input` `ring`                                                                          |
| Radius           | `rounded-sm` `rounded-md` `rounded-lg` `rounded-xl` `rounded-2xl` `rounded-3xl` `rounded-full` (scaled from `--radius`) |
| Type             | `font-sans` (Outfit — body) · `font-serif` (Playfair Display — headings)                                                |
| Size             | `text-xs` `text-sm` `text-base` `text-lg` `text-xl` `text-2xl` `text-3xl` `text-4xl` `text-5xl` `text-6xl`              |
| Weight           | `font-normal` `font-medium` `font-semibold` `font-bold`                                                                 |
| Layout           | `flex` `grid` `grid-cols-1`…`grid-cols-6` `gap-*` `items-*` `justify-*` `max-w-*`                                       |
| Responsive       | `sm:` `md:` `lg:` prefixes on layout/spacing/type                                                                       |

**Pairing rule:** whenever you set a surface, take its `-foreground` for the text
(`bg-primary` → `text-primary-foreground`). That's what keeps contrast correct in both themes.

**Prefer a component over utilities.** Don't hand-roll a card out of `div` + `border` + `rounded-lg`
when `Card`/`CardHeader`/`CardContent` exist; don't hand-roll headings when `Typography` does the
type scale (`component` = the tag, `variant` = the style).

## Where the truth lives

- **`_ds/<folder>/styles.css`** and its `@import` closure — the compiled tokens and every component
  rule. Read it before inventing a class.
- **`components/<group>/<Name>/<Name>.prompt.md`** — per-component usage.
- **`components/<group>/<Name>/<Name>.d.ts`** — the real prop contract (`<Name>Props`). Trust it over
  any guess; it's generated from the shipped TypeScript.

## An idiomatic screen

```jsx
<NextIntlClientProvider locale="es-AR" messages={messages}>
  <main className="bg-background text-foreground min-h-screen">
    <Navbar menuItems={menu} />

    <Container>
      <SectionHeader title="Últimas predicaciones" />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {sermons.map((sermon, i) => (
          <SermonCard key={sermon.slug} sermon={sermon} index={i} />
        ))}
      </div>

      <div className="mt-12 rounded-2xl bg-secondary p-8">
        <Typography component="h2" variant="h2">
          Vení a conocernos
        </Typography>
        <Typography
          component="p"
          variant="body"
          className="text-muted-foreground"
        >
          Nos reunimos todos los domingos a las 11:00.
        </Typography>
        <Button variant="default" className="mt-6">
          Cómo llegar
        </Button>
      </div>
    </Container>

    <Footer content={footerContent} />
  </main>
</NextIntlClientProvider>
```

Note the split: **library components for the parts** (`Navbar`, `SermonCard`, `Typography`,
`Button`), **utilities over tokens for your own layout glue** (`grid gap-6 sm:grid-cols-2`,
`rounded-2xl bg-secondary p-8`).

## Known limits

- **Animation is not represented.** Several components animate in on scroll on the real site; here
  they render their final state.
- **`Dropdown`** shows only its closed state — it owns its selection internally.
- **Form submission is inert** (`ContactForm`): the real action runs in the church's app.
