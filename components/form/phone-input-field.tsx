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
  /**
   * ISO-2, lowercase. Defaults to "nl": this is a Netherlands-based business
   * whose customers are billed in EUR and asked for a VAT number, so landing
   * on the US flag and "+1" meant almost everyone had to change it before
   * they could type their own number. Pass another code where that is wrong.
   */
  defaultCountry?: string;
};

export default function PhoneInputField<T extends FieldValues>({
  name,
  control,
  id,
  placeholder,
  description,
  label,
  className,
  defaultCountry = "nl",
}: PhoneInputFieldProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
          <div className={cn("phone-input-container", className)}>
            {/* ── IT FIRES ONCE BEFORE ANYBODY TYPES ────────────────
                react-international-phone runs an effect on mount:
                `if (!initialized) { …; value !== phone && onChange(…) }`.
                With an empty value and defaultCountry="nl" its initial
                state is "+31", so "" !== "+31" and onChange("+31")
                fires before the field has been touched.

                Through react-hook-form that marks the form DIRTY on
                first paint, and two things this app relies on are
                wired to `isDirty`:

                  - the beforeunload warning, so pressing Back gave
                    "Leave site? Changes you made may not be saved" to
                    somebody who had typed nothing;
                  - the draft autosave (`saveWhen: isDirty`), which then
                    wrote the SERVER'S OWN prefilled row into IndexedDB.
                    Next visit offered "Unsaved changes from earlier"
                    about values nobody typed — and Restore overwrote
                    anything typed since. That is exactly the lost
                    typing CLAUDE.md names this form for.

                So: the mount-time echo is swallowed. A bare dial code
                against an empty field is not an edit. Anything else —
                including the person actually picking a country — goes
                straight through. */}
            <PhoneInput
              defaultCountry={defaultCountry}
              value={field.value}
              onChange={(phone) => {
                const next = String(phone ?? "");
                const current = String(field.value ?? "");
                const bare = /^\+\d{1,4}$/.test(next.replace(/[\s-]/g, ""));
                if (current === "" && bare) return;
                field.onChange(phone);
              }}
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
