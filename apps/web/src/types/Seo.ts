export interface SeoImage {
  url: string;
  title: string;
  width: number;
  height: number;
}

export interface SeoContent {
  title: string;
  description: string;
  keywords: string[];
  image: SeoImage;
  siteName: string;
  type: string;
  sys: { id: string };
}
