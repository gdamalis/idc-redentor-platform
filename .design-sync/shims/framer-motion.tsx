// design-sync shim for `framer-motion`.
//
// WHY THIS EXISTS — this is not a cosmetic simplification:
// IconCard, SermonCard, OurMissionSection and BlogPostCard animate in with
//     <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1 }} …>
// `whileInView` only fires when an IntersectionObserver reports the element on
// screen. In a static preview/screenshot that never happens, so the element is
// stuck at its `initial` state — opacity: 0 — and the card renders INVISIBLE.
// (SermonCard's preview came back fully blank; IconCard tripped [RENDER_THIN].)
//
// Rendering the FINAL state is both the honest and the useful choice: it is what
// the component settles to on the real site, and a design tool shows static
// compositions. The repo's own tests mock framer-motion exactly this way — see
// apps/web/src/components/features/sermon-section/SermonCard.test.tsx.
//
// Animation is therefore NOT represented in the DS previews. Engineers shipping
// a design get the real animated component from the repo; only the preview and
// the design-agent's render are static.
//
// Wired via .design-sync/tsconfig.ds.json compilerOptions.paths.
import * as React from "react";

/** Props that are framer-motion's own — they must never reach the DOM. */
const MOTION_PROPS = new Set([
  "initial",
  "animate",
  "exit",
  "variants",
  "transition",
  "viewport",
  "whileInView",
  "whileHover",
  "whileTap",
  "whileFocus",
  "whileDrag",
  "drag",
  "dragConstraints",
  "dragElastic",
  "dragMomentum",
  "layout",
  "layoutId",
  "custom",
  "transformTemplate",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
  "onDrag",
  "onDragStart",
  "onDragEnd",
  "onViewportEnter",
  "onViewportLeave",
]);

const stripMotionProps = (props: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(props).filter(([k]) => !MOTION_PROPS.has(k)));

// Cache one component per tag: a fresh component identity on every property
// access would remount the subtree on each render.
const cache = new Map<string, React.ComponentType<Record<string, unknown>>>();

const motionComponent = (tag: string) => {
  let C = cache.get(tag);
  if (!C) {
    C = React.forwardRef<unknown, Record<string, unknown>>(function Motion(props, ref) {
      return React.createElement(tag, { ref, ...stripMotionProps(props) });
    }) as unknown as React.ComponentType<Record<string, unknown>>;
    (C as { displayName?: string }).displayName = `motion.${tag}`;
    cache.set(tag, C);
  }
  return C;
};

/** `motion.div`, `motion.h2`, `motion.button`, … — any intrinsic tag. */
export const motion: Record<string, React.ComponentType<Record<string, unknown>>> =
  new Proxy({} as Record<string, React.ComponentType<Record<string, unknown>>>, {
    get: (_t, tag) => (typeof tag === "string" ? motionComponent(tag) : undefined),
  });

/** No enter/exit choreography in a static preview — render children as-is. */
export const AnimatePresence = ({ children }: { children?: React.ReactNode }) => (
  <>{children}</>
);

/** Previews are static; claiming "reduced motion" is the honest answer. */
export const useReducedMotion = (): boolean => true;
