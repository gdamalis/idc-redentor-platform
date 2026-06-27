"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  ArrowUpFromLine,
  Link2,
  Mail,
} from "lucide-react";
import Image from "next/image";
import { useLocale } from "next-intl";
import { useCallback, useState, useSyncExternalStore } from "react";
import { toast } from "@src/hooks/use-toast";
import { trackEvent } from "@src/lib/analytics";

interface ShareButtonProps {
  readonly slug: string;
  readonly basePath: string;
  readonly likeKey: string;
  readonly title: string;
  readonly featuredImageUrl: string;
}

interface BuildShareUrlParams {
  baseUrl: string | undefined;
  locale: string;
  basePath: string;
  slug: string;
}

/**
 * Pure helper that constructs the canonical share URL for a piece of content.
 * Exported so tests can verify URL construction without rendering the component.
 */
export function buildShareUrl({ baseUrl, locale, basePath, slug }: BuildShareUrlParams): string {
  return `${baseUrl}/${locale}/${basePath}/${slug}`;
}

function XSocialIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const SHARE_OPTIONS = [
  {
    id: "copy_link",
    label: "Copy link",
    icon: Link2,
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: FacebookIcon,
    getUrl: (url: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: WhatsAppIcon,
    getUrl: (url: string, title: string) => {
      const message = `${title} ${url}`;
      return `https://wa.me/?text=${encodeURIComponent(message)}`;
    },
  },
  {
    id: "x",
    label: "X",
    icon: XSocialIcon,
    getUrl: (url: string, title: string) =>
      `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
    getUrl: (url: string, title: string) =>
      `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
  },
] as const;

export function ShareButton({ slug, basePath, likeKey, title, featuredImageUrl }: ShareButtonProps) {
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  const canNativeShare = useSyncExternalStore(
    () => () => {},
    () => !!navigator.share,
    () => false,
  );

  const baseUrl =
    globalThis.window === undefined
      ? process.env.NEXT_PUBLIC_BASE_URL
      : globalThis.location.origin;

  const shareUrl = buildShareUrl({ baseUrl, locale, basePath, slug });

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({ title, url: shareUrl });
      trackEvent("blog_post_share", { slug: likeKey, method: "native" });
    } catch (error) {
      // User cancelled or share failed -- ignore AbortError
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Share failed:", error);
      }
    }
  }, [title, shareUrl, likeKey]);

  const handleSocialShare = useCallback(
    (optionId: string, url: string) => {
      if (optionId === "email") {
        globalThis.location.href = url;
      } else {
        globalThis.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
      }
      trackEvent("blog_post_share", { slug: likeKey, method: optionId });
      setIsOpen(false);
    },
    [likeKey],
  );

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied to clipboard" });
      trackEvent("blog_post_share", { slug: likeKey, method: "copy_link" });
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
      toast({ title: "Link copied to clipboard" });
      trackEvent("blog_post_share", { slug: likeKey, method: "copy_link" });
    }
    setIsOpen(false);
  }, [shareUrl, likeKey]);

  const handleOptionClick = useCallback(
    (optionId: string, getUrl?: (url: string, title: string) => string) => {
      if (optionId === "copy_link") {
        handleCopyLink();
      } else if (getUrl) {
        handleSocialShare(optionId, getUrl(shareUrl, title));
      }
    },
    [handleCopyLink, handleSocialShare, shareUrl, title],
  );

  const triggerButton = (
    <button
      type="button"
      onClick={canNativeShare ? handleNativeShare : () => setIsOpen(true)}
      className="group flex items-center gap-2 rounded-full border border-border px-4 py-2 cursor-pointer transition-colors hover:border-foreground/30 hover:bg-muted"
      aria-label="Share this post"
    >
      <ArrowUpFromLine className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
    </button>
  );

  // Mobile: just the trigger button (native share handles the rest)
  if (canNativeShare) {
    return triggerButton;
  }

  // Desktop: trigger button + modal dialog
  return (
    <>
      {triggerButton}

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className="relative z-50"
      >
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/50 transition-opacity data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150 data-enter:ease-out data-leave:ease-in"
        />

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl transition-all data-closed:scale-95 data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150 data-enter:ease-out data-leave:ease-in"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <DialogTitle className="text-base font-semibold text-foreground">
                Share this post
              </DialogTitle>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Post preview card */}
            <div className="relative mb-5 overflow-hidden rounded-xl aspect-video bg-muted">
              {featuredImageUrl && (
                <Image
                  src={featuredImageUrl}
                  alt={title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 384px) 100vw, 384px"
                />
              )}
              <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-sm font-semibold text-white line-clamp-2">
                  {title}
                </p>
              </div>
            </div>

            {/* Share options grid */}
            <div className="flex items-start justify-center gap-2">
              {SHARE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    handleOptionClick(
                      option.id,
                      "getUrl" in option ? option.getUrl : undefined,
                    )
                  }
                  className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 cursor-pointer hover:bg-muted transition-colors min-w-[56px]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/50">
                    <option.icon className="h-4 w-4 text-foreground" />
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight text-center">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
