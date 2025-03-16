import { Dropdown, DropDownOption } from "@src/components/ui/dropdown";
import { Typography } from "@src/components/ui/typography";

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
    <div key={data.inputId}>
      <label
        htmlFor={data.inputId}
        className="block text-sm/6 font-semibold text-gray-900 dark:text-gray-100"
      >
        {data.name}
      </label>
      <div className="mt-2.5">
        <input
          id={data.inputId}
          required={data.required}
          name={data.inputId}
          type="text"
          autoComplete="given-name"
          className="block w-full rounded-md bg-white dark:bg-gray-900 px-3.5 py-2 text-base text-gray-900 dark:text-gray-100 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600"
          placeholder={data.placeholder}
        />
      </div>
    </div>
  );
}

/**
 * Renders an email input field
 */
export function getEmailInput(data: Field) {
  return (
    <div key={data.inputId}>
      <label
        htmlFor={data.inputId}
        className="block text-sm/6 font-semibold text-gray-900 dark:text-gray-100"
      >
        {data.name}
      </label>
      <div className="mt-2.5">
        <input
          id={data.inputId}
          required={data.required}
          name={data.inputId}
          type="email"
          autoComplete="email"
          pattern="[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
          className="block w-full rounded-md bg-white dark:bg-gray-900 px-3.5 py-2 text-base text-gray-900 dark:text-gray-100 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600"
          placeholder={data.placeholder}
        />
      </div>
    </div>
  );
}

/**
 * Renders a long text (textarea) input field
 */
export function getLongTextInput(data: Field) {
  return (
    <div className="sm:col-span-2" key={data.inputId}>
      <label
        htmlFor={data.inputId}
        className="block text-sm/6 font-semibold text-gray-900 dark:text-gray-100"
      >
        {data.name}
      </label>
      <div className="mt-2.5">
        <textarea
          id={data.inputId}
          required={data.required}
          name={data.inputId}
          rows={4}
          className="block w-full rounded-md bg-white dark:bg-gray-900 px-3.5 py-2 text-base text-gray-900 dark:text-gray-100 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600"
          placeholder={data.placeholder}
        />
      </div>
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
    <div key={data.inputId}>
      <label
        htmlFor={data.inputId}
        className="block text-sm/6 font-semibold text-gray-900 dark:text-gray-100"
      >
        {data.name}
      </label>
      <div className="mt-2.5">
        <Dropdown 
          options={DropDownOptions} 
          placeholder={data.placeholder} 
          name={data.inputId}
        />
      </div>
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
          className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 text-sm font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10"
        >
          {value}
        </span> // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;
      return true;
    }

    styledText[index] = (
      <Typography component="p" variant="body1" key={value}>
        {value}
      </Typography> // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
  });

  return styledText;
}
