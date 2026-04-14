"use client";

import React from "react";
import { Control, Controller, FieldValues, Path } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { cn } from "@/lib/utils";

type PhoneInputFieldProps<T extends FieldValues> = {
  name: Path<T>;
  id: string;
  control: Control<T>;
  placeholder?: string;
  label?: string;
  description?: string;
  className?: string;
};

export default function PhoneInputField<T extends FieldValues>({
  name,
  control,
  id,
  placeholder,
  description,
  label,
  className,
}: PhoneInputFieldProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
          <div className={cn("phone-input-container", className)}>
            <PhoneInput
              defaultCountry="us"
              value={field.value}
              onChange={(phone) => field.onChange(phone)}
              inputProps={{
                id: id,
                placeholder: placeholder,
                className: cn(
                  "flex h-9 w-full rounded-md rounded-l-none border border-input bg-transparent px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                  fieldState.invalid &&
                    "border-destructive focus-visible:ring-destructive",
                ),
              }}
              style={
                {
                  "--react-international-phone-border-radius":
                    "calc(var(--radius) - 2px)",
                  "--react-international-phone-border-color": "var(--input)",
                  "--react-international-phone-background-color": "transparent",
                  "--react-international-phone-text-color": "var(--foreground)",
                  "--react-international-phone-selected-country-background-color":
                    "var(--accent)",
                  "--react-international-phone-dropdown-item-background-color":
                    "var(--popover)",
                } as React.CSSProperties
              }
            />
          </div>
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
