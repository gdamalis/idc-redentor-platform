import { Typography } from "@src/components/ui/typography";
import { Divider } from "@src/components/ui/divider";

type KeywordTagsProps = Readonly<{
  keywords: string[];
}>;

export function KeywordTags({ keywords }: KeywordTagsProps) {
  if (!keywords || keywords.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Divider className="my-4" />
      
      <div className="flex flex-col gap-y-3">
        <Typography
          component="h3"
          variant="h6"
          className="text-foreground/70"
        >
          Tags
        </Typography>
        
        <div className="flex flex-wrap gap-2">
          {keywords.map((keyword, index) => (
            <span
              key={`${keyword}-${index}`}
              className="inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground ring-1 ring-inset ring-muted-foreground/20 hover:bg-muted/80 transition-colors cursor-pointer"
            >
              {keyword}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

