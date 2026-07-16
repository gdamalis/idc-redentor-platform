// design-sync bundle entry for @idcr/web.
//
// This repo has no design-system package: the components live inside the Next
// app and there is no dist/ and no top-level ui/index.ts, so the converter has
// nothing to discover. This barrel is the explicit component scope — it is the
// one file to edit when adding/removing a component from the design system.
//
// Imports point at INDIVIDUAL FILES, never the dirs' own index.ts barrels:
// several of those re-export excluded components (async RSC, *Live preview
// wrappers) and would drag them into the bundle.
//
// Excluded on purpose (see .design-sync/NOTES.md):
//   - SermonDetails, KeywordTags .... async RSC (next-intl/server); cannot run
//                                     in a browser bundle. KeywordTags is also
//                                     dead code — its only call site is
//                                     commented out in BlogPostContent.tsx:39-41.
//   - *Live (5) ..................... Contentful live-preview wrappers around the
//                                     base component (useLivePreview); infra, not
//                                     design system.
//   - Portal, JsonLd, ContentfulPreviewProvider ... non-visual infrastructure.
//   - Content (ui/content) .......... dead code + trivial wrapper.

/* ---------------------------------- ui ---------------------------------- */
export { Button, buttonVariants } from "@src/components/ui/button/Button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "@src/components/ui/card";
export { Container } from "@src/components/ui/container/Container";
export { Divider } from "@src/components/ui/divider/Divider";
export { Dropdown } from "@src/components/ui/dropdown/Dropdown";
export {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
} from "@src/components/ui/form";
export { IconCard } from "@src/components/ui/icon-card/IconCard";
export { Input } from "@src/components/ui/input";
export { Label } from "@src/components/ui/label";
// default-only export — must be named here or the converter silently drops it
export { default as LoadingSpinner } from "@src/components/ui/LoadingSpinner";
export { SectionHeader } from "@src/components/ui/section-header/SectionHeader";
export { Textarea } from "@src/components/ui/textarea";
export {
  Toast,
  ToastProvider,
  ToastViewport,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from "@src/components/ui/toast";
export { Toaster } from "@src/components/ui/toaster";
export { Typography } from "@src/components/ui/typography/Typography";

/* -------------------------------- shared -------------------------------- */
export { default as BibleVerse } from "@src/components/shared/bible-verse/BibleVerse";
export { ConsentBanner } from "@src/components/shared/consent-banner/ConsentBanner";
export { Footer } from "@src/components/shared/footer/Footer";
export { Header } from "@src/components/shared/header/Header";
export { default as LanguageSwitcher } from "@src/components/shared/language-switcher/LanguageSwitcher";
export { MainMenuDesktop } from "@src/components/shared/main-menu/MainMenuDesktop";
export { MainMenuMobile } from "@src/components/shared/main-menu/MainMenuMobile";
export { Navbar } from "@src/components/shared/navbar/Navbar";
export { NavbarWrapper } from "@src/components/shared/navbar/NavbarWrapper";
export { default as SocialLinks } from "@src/components/shared/social-links/SocialLinks";
export { SubscribeBanner } from "@src/components/shared/subscribe-banner/SubscribeBanner";

/* ------------------------------- features ------------------------------- */
export { AuthorInfo } from "@src/components/features/blog-post-details/AuthorInfo";
export { BlogPostContent } from "@src/components/features/blog-post-details/BlogPostContent";
export { default as BlogPostDetails } from "@src/components/features/blog-post-details/BlogPostDetails";
export { BlogPostHeader } from "@src/components/features/blog-post-details/BlogPostHeader";
export { FeaturedImage } from "@src/components/features/blog-post-details/FeaturedImage";
export { LikeButton } from "@src/components/features/blog-post-details/LikeButton";
export { PostActions } from "@src/components/features/blog-post-details/PostActions";
export { RelatedArticleLink } from "@src/components/features/blog-post-details/RelatedArticleLink";
export { RelatedArticles } from "@src/components/features/blog-post-details/RelatedArticles";
export { ShareButton } from "@src/components/features/blog-post-details/ShareButton";

export { BlogPostCard } from "@src/components/features/blog-section/BlogPostCard";
export { BlogSection } from "@src/components/features/blog-section/BlogSection";
export { CommunityEvent } from "@src/components/features/community-event/CommunityEvent";
export { ComponentCta } from "@src/components/features/component-cta/ComponentCta";
export { ContactForm } from "@src/components/features/contact-form/ContactForm";
export { CreedSection } from "@src/components/features/creed-section/CreedSection";
export { default as InfoCommunity } from "@src/components/features/info-community/InfoCommunity";
export { InfoConnect } from "@src/components/features/info-connect/InfoConnect";
export { OurMissionCta } from "@src/components/features/our-mission-cta/OurMissionCta";
export { OurMissionSection } from "@src/components/features/our-mission-section/OurMissionSection";
export { PhotoGrid } from "@src/components/features/photo-grid/PhotoGrid";

export { PdfDownloadButton } from "@src/components/features/sermon-details/PdfDownloadButton";
export { RelatedSermons } from "@src/components/features/sermon-details/RelatedSermons";
export { ScriptureReferences } from "@src/components/features/sermon-details/ScriptureReferences";
export { SermonAudioPlayer } from "@src/components/features/sermon-details/SermonAudioPlayer";
export { SermonByline } from "@src/components/features/sermon-details/SermonByline";
export { SermonContent } from "@src/components/features/sermon-details/SermonContent";
export { SermonHeader } from "@src/components/features/sermon-details/SermonHeader";
export { SermonInterpreter } from "@src/components/features/sermon-details/SermonInterpreter";
export { SermonCard } from "@src/components/features/sermon-section/SermonCard";
export { SermonSection } from "@src/components/features/sermon-section/SermonSection";
