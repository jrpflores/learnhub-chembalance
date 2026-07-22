"use client";

import AsyncSelect from "react-select/async";
import type { StylesConfig } from "react-select";

export type Select2Option = {
  value: string;
  label: string;
};

const selectStyles: StylesConfig<Select2Option, boolean> = {
  control: (base, state) => ({
    ...base,
    minHeight: 40,
    borderRadius: 10,
    borderColor: state.isFocused ? "var(--brand-500)" : "var(--line-300)",
    boxShadow: state.isFocused ? "0 0 0 1px var(--brand-500)" : "none",
    backgroundColor: "white",
    "&:hover": {
      borderColor: state.isFocused ? "var(--brand-500)" : "var(--line-400)",
    },
  }),
  valueContainer: (base) => ({
    ...base,
    paddingTop: 2,
    paddingBottom: 2,
  }),
  input: (base) => ({
    ...base,
    color: "var(--ink-900)",
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--ink-500)",
  }),
  menu: (base) => ({
    ...base,
    zIndex: 70,
    borderRadius: 12,
    border: "1px solid var(--line-200)",
    overflow: "hidden",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 90,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "var(--line-100)" : "white",
    color: "var(--ink-900)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--ink-900)",
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 8,
    backgroundColor: "var(--line-100)",
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "var(--ink-800)",
    fontSize: 12,
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "var(--ink-600)",
    ":hover": {
      backgroundColor: "var(--danger-100)",
      color: "var(--danger-700)",
    },
  }),
};

type Select2AsyncSingleProps = {
  inputId?: string;
  value: Select2Option | null;
  onChange: (option: Select2Option | null) => void;
  loadOptions: (inputValue: string) => Promise<Select2Option[]>;
  defaultOptions?: Select2Option[];
  placeholder?: string;
  isDisabled?: boolean;
};

type Select2AsyncMultiProps = {
  inputId?: string;
  value: Select2Option[];
  onChange: (options: Select2Option[]) => void;
  loadOptions: (inputValue: string) => Promise<Select2Option[]>;
  defaultOptions?: Select2Option[];
  placeholder?: string;
  isDisabled?: boolean;
};

export function Select2AsyncSingle({
  inputId,
  value,
  onChange,
  loadOptions,
  defaultOptions,
  placeholder,
  isDisabled,
}: Select2AsyncSingleProps) {
  const menuPortalTarget = typeof window === "undefined" ? undefined : document.body;

  return (
    <AsyncSelect<Select2Option, false>
      inputId={inputId}
      isClearable={false}
      cacheOptions
      defaultOptions={defaultOptions}
      loadOptions={loadOptions}
      value={value}
      onChange={(next) => onChange(next ?? null)}
      placeholder={placeholder}
      isDisabled={isDisabled}
      menuPortalTarget={menuPortalTarget}
      menuPosition="fixed"
      styles={selectStyles}
      noOptionsMessage={() => "No results"}
      loadingMessage={() => "Searching..."}
    />
  );
}

export function Select2AsyncMulti({
  inputId,
  value,
  onChange,
  loadOptions,
  defaultOptions,
  placeholder,
  isDisabled,
}: Select2AsyncMultiProps) {
  const menuPortalTarget = typeof window === "undefined" ? undefined : document.body;

  return (
    <AsyncSelect<Select2Option, true>
      inputId={inputId}
      isMulti
      closeMenuOnSelect={false}
      cacheOptions
      defaultOptions={defaultOptions}
      loadOptions={loadOptions}
      value={value}
      onChange={(next) => onChange([...next])}
      placeholder={placeholder}
      isDisabled={isDisabled}
      menuPortalTarget={menuPortalTarget}
      menuPosition="fixed"
      styles={selectStyles}
      noOptionsMessage={() => "No results"}
      loadingMessage={() => "Searching..."}
    />
  );
}
