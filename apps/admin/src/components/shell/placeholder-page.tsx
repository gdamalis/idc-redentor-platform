interface PlaceholderPageProps {
  readonly heading: string;
}

/** Minimal "coming soon" placeholder body shared by the route-group stub pages. */
export function PlaceholderPage({ heading }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{heading}</h1>
    </div>
  );
}
