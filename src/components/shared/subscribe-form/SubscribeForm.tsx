"use client";

import LoadingSpinner from "@src/components/ui/LoadingSpinner";
import { Typography } from "@src/components/ui/typography";
import { subscribe } from "@src/service/subscribe";
import { useActionState } from "react";

type SubscribeFormProps = {
  title?: string;
  description?: string;
  ctaText: string;
  placeholder: string;
  ctaSrLabel: string;
  size?: "sm" | "lg";
  className?: string;
  successMessage: string;
};

const getSizeClasses = (size: "sm" | "lg") => {
  switch (size) {
    case "sm":
      return {
        input: "sm:w-56 sm:text-sm sm:leading-6",
        button: "sm:w-32 sm:px-4 sm:py-2 sm:text-sm sm:font-semibold",
      };
    case "lg":
      return {
        input: "sm:w-96 text-lg leading-8",
        button: "sm:w-36 px-6 py-3 text-lg sm:font-semibold",
      };
  }
};

export const SubscribeForm = ({
  title,
  description,
  ctaText,
  ctaSrLabel,
  placeholder,
  size = "sm",
  className = "",
  successMessage,
}: SubscribeFormProps) => {
  const sizeClasses = getSizeClasses(size);

  const [state, formAction, isPending] = useActionState<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    FormData
  >(async (currentState, formData) => {
    const email = formData.get("email") as string;
    const data = await subscribe(email);
    return data;
  }, null);

  return (
    <div className={`mt-10 xl:mt-0 ${className}`}>
      {title && (
        <Typography
          component="h3"
          variant="h3"
          className="text-sm font-semibold leading-6 text-gray-900"
        >
          {title}
        </Typography>
      )}
      {description && (
        <Typography
          component="p"
          variant="body1"
          className="mt-2 text-sm leading-6 text-gray-900"
        >
          {description}
        </Typography>
      )}
      <form action={formAction} className="flex flex-col">
        <div className="flex self-center sm:max-w-md">
          <label htmlFor="email" className="sr-only">
            {ctaSrLabel}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder={placeholder}
            autoComplete="email"
            className={`w-full min-w-0 appearance-none rounded-l-2xl rounded-r-none border-0 bg-white px-3 py-1.5 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-1 focus:ring-inset focus:ring-blue-600 sm:w-56 ${sizeClasses.input}`}
          />
          <div className="text-center sm:flex-shrink-0">
            <button
              type="submit"
              className={`flex w-full text-nowrap items-center justify-center rounded-r-2xl bg-blue-600 px-6 py-2 font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${sizeClasses.button}`}
            >
              {isPending ? <LoadingSpinner size={size} /> : ctaText}
            </button>
          </div>
        </div>
        {state?.success && (
          <span className="text-sm text-center mt-2">{successMessage}</span>
        )}
        {!state?.success && (
          <span className="text-sm text-center mt-2">{state?.message}</span>
        )}
      </form>
    </div>
  );
};
