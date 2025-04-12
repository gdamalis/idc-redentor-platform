"use client";

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { CheckIcon } from "@heroicons/react/20/solid";
import { useState } from "react";

export type DropDownOption = {
  id: string;
  value: string;
};

type DropdownProps = {
  options: DropDownOption[];
  placeholder: string;
  name?: string;
  id?: string;
};

export const Dropdown = ({ options, placeholder, name, id }: DropdownProps) => {
  const [selected, setSelected] = useState({ id: "", value: placeholder });

  const placeholderStyle =
    selected.value === placeholder ? "text-gray-400" : "";

  return (
    <Listbox value={selected} onChange={setSelected}>
      <div className="relative mt-2">
        {name && (
          <input
            type="hidden"
            name={name}
            value={selected.value !== placeholder ? selected.value : ""}
            id={id}
          />
        )}

        <ListboxButton className="grid w-full cursor-default grid-cols-1 rounded-md bg-white dark:bg-gray-900 py-2 pl-3 pr-2 text-left text-gray-900 dark:text-gray-100 outline outline-1 -outline-offset-1 outline-gray-300 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6">
          <span
            className={`col-start-1 row-start-1 truncate pr-6 ${placeholderStyle}`}
          >
            {selected.value}
          </span>
          <ChevronUpDownIcon
            aria-hidden="true"
            className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 dark:text-gray-100 sm:size-4"
          />
        </ListboxButton>

        <ListboxOptions
          transition
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 py-1 text-base shadow-lg ring-1 ring-gray-700/5 focus:outline-none data-[closed]:data-[leave]:opacity-0 data-[leave]:transition data-[leave]:duration-100 data-[leave]:ease-in sm:text-sm"
        >
          {options.map((option) => (
            <ListboxOption
              key={option.id}
              value={option}
              className="group relative cursor-default select-none py-2 pl-8 pr-4 text-gray-900 dark:text-gray-100 data-[focus]:bg-blue-600 data-[focus]:text-white data-[focus]:outline-none"
            >
              <span className="block truncate font-normal group-data-[selected]:font-semibold">
                {option.value}
              </span>

              <span className="absolute inset-y-0 left-0 flex items-center pl-1.5 text-blue-600 dark:text-gray-100 group-[&:not([data-selected])]:hidden group-data-[focus]:text-white">
                <CheckIcon aria-hidden="true" className="size-5" />
              </span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
};
