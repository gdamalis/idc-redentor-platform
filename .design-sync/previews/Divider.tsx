import { Divider } from "@idcr/web";

// Divider is an <hr> — `border-gray-200 dark:border-gray-700`, plus
// `my-4 w-full` (horizontal). It is invisible without content on both sides, so
// every story gives it real neighbours. Callers always pass a `my-*` override.
//
// Only the horizontal variant is previewed. `variant="vertical"` is a dead
// branch: it sets `mx-2 h-full` with no width and no left border, so the <hr>
// draws a 1px *top* border on a zero-width box and renders nothing at all.
// Nothing in the repo uses it (grep for `variant="vertical"` → no call sites).
// Flagged in .design-sync/learnings/ui-primitives.md for the component owner —
// a blank cell here would document the bug, not the component.

/** The default rule, separating a sermon byline from the body — SermonHeader's shape. */
export const Default = () => (
  <div className="max-w-2xl">
    <h2 className="font-serif text-2xl font-bold">La gracia de Dios</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Pastor Juan · 1 de junio de 2025
    </p>
    <Divider className="my-6" />
    <p className="text-sm leading-relaxed text-muted-foreground">
      La gracia es suficiente: no llegamos a Dios por nuestro mérito, sino por
      su favor inmerecido.
    </p>
  </div>
);

/** Repeated rules structuring a list — the `my-4` override callers actually pass. */
export const SectionBreaks = () => (
  <div className="max-w-2xl">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">
      Predicaciones recientes
    </h3>
    <Divider className="my-4" />
    <p className="text-sm">La gracia de Dios · Pastor Juan</p>
    <Divider className="my-4" />
    <p className="text-sm">Vivir en comunidad · Pastor Martín</p>
    <Divider className="my-4" />
    <p className="text-sm">Volver al Padre · Pastor Martín</p>
  </div>
);

/**
 * A leading rule opening a trailing block — ported from the repo's
 * KeywordTags.tsx, where `<Divider className="my-4" />` is the first child and
 * separates the article body above from its tag list.
 */
export const LeadingRule = () => (
  <div className="max-w-2xl">
    <p className="text-sm leading-relaxed text-muted-foreground">
      …y por eso volvemos cada domingo a la misma mesa: no porque seamos dignos,
      sino porque fuimos invitados.
    </p>
    <Divider className="my-4" />
    <h3 className="text-sm font-semibold">Temas</h3>
    <div className="mt-3 flex flex-wrap gap-2">
      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
        Gracia
      </span>
      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
        Evangelio
      </span>
      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
        Lucas 15
      </span>
      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
        Comunidad
      </span>
    </div>
  </div>
);
