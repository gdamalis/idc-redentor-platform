// design-sync shim for `next/image`.
//
// The DS bundle runs in a plain browser, with no Next.js build pipeline to do
// the optimization/srcset work `next/image` normally performs. This renders the
// plain <img> that next/image itself resolves to in the browser, so component
// markup stays truthful — only the framework primitive is replaced.
//
// Wired via .design-sync/tsconfig.ds.json compilerOptions.paths.
import * as React from "react";

type StaticImport = { src: string; height?: number; width?: number };

export interface ImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> {
  src: string | StaticImport;
  alt?: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  sizes?: string;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
  unoptimized?: boolean;
  onLoadingComplete?: () => void;
}

const resolveSrc = (src: ImageProps["src"]): string =>
  typeof src === "string" ? src : (src?.src ?? "");

export const Image = React.forwardRef<HTMLImageElement, ImageProps>(function Image(
  {
    src,
    alt,
    width,
    height,
    fill,
    style,
    // Next-only props with no meaning outside the framework — dropped so they
    // never reach the DOM and trigger unknown-attribute warnings.
    priority: _priority,
    quality: _quality,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    loader: _loader,
    unoptimized: _unoptimized,
    onLoadingComplete: _onLoadingComplete,
    ...rest
  },
  ref
) {
  // `fill` makes next/image absolutely fill its positioned parent; mirror that
  // so layouts relying on it don't collapse.
  const fillStyle: React.CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }
    : {};

  return (
    <img
      ref={ref}
      src={resolveSrc(src)}
      alt={alt ?? ""}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={{ ...fillStyle, ...style }}
      {...rest}
    />
  );
});

export default Image;
