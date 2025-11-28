import { Dropdown, DropDownOption } from "@src/components/ui/dropdown";
import { Typography } from "@src/components/ui/typography";
import { Input } from "@src/components/ui/input";
import { Textarea } from "@src/components/ui/textarea";
import { Label } from "@src/components/ui/label";

export type Field = {
  name: string;
  inputId: string;
  required: boolean;
  type: string;
  values: string[];
  placeholder: string;
};

/**
 * Renders a short text input field
 */
export function getShortTextInput(data: Field) {
  return (
    <div key={data.inputId} className="space-y-2">
      <Label htmlFor={data.inputId}>{data.name}</Label>
      <Input
        id={data.inputId}
        required={data.required}
        name={data.inputId}
        type="text"
        autoComplete="given-name"
        placeholder={data.placeholder}
        className="bg-background"
      />
    </div>
  );
}

/**
 * Renders an email input field
 */
export function getEmailInput(data: Field) {
  return (
    <div key={data.inputId} className="space-y-2">
      <Label htmlFor={data.inputId}>{data.name}</Label>
      <Input
        id={data.inputId}
        required={data.required}
        name={data.inputId}
        type="email"
        autoComplete="email"
        pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
        placeholder={data.placeholder}
        className="bg-background"
      />
    </div>
  );
}

/**
 * Renders a long text (textarea) input field
 */
export function getLongTextInput(data: Field) {
  return (
    <div className="col-span-full" key={data.inputId}>
      <Label htmlFor={data.inputId}>{data.name}</Label>
      <Textarea
        id={data.inputId}
        required={data.required}
        name={data.inputId}
        rows={4}
        placeholder={data.placeholder}
        className="bg-background resize-none mt-2"
      />
    </div>
  );
}

/**
 * Renders a dropdown field
 */
export function getDropdownField(data: Field) {
  const DropDownOptions: DropDownOption[] = data.values.map((value, index) => ({
    id: String(index),
    value,
  }));

  return (
    <div key={data.inputId} className="space-y-2">
      <Label htmlFor={data.inputId}>{data.name}</Label>
      <Dropdown 
        options={DropDownOptions} 
        placeholder={data.placeholder} 
        name={data.inputId}
        id={data.inputId}
      />
    </div>
  );
}

/**
 * Processes text with highlight tags into styled components
 */
export function getTextWithHighlights(text: string) {
  const styledText = text.split(/<highlight>(.*?)<\/highlight>/g);

  styledText.forEach((value, index) => {
    if (value.includes("@")) {
      styledText[index] = (
        <span
          key={value}
          className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20"
        >
          {value}
        </span>  
      ) as any;
      return true;
    }

    styledText[index] = (
      <Typography component="span" variant="body1" key={value}>
        {value}
      </Typography>  
    ) as any;
  });

  return styledText;
}
