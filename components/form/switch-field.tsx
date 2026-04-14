import React from "react";
import { Control, Controller, FieldValues, Path } from "react-hook-form";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../ui/field";
import { Switch } from "../ui/switch";

type SwitchFieldProps<T extends FieldValues> = {
  name: Path<T>;
  id: string;
  control: Control<T>;
  label?: string;
  description?: string;
};

export default function SwitchField<T extends FieldValues>({
  name,
  control,
  id,
  description,
  label,
}: SwitchFieldProps<T> & React.ComponentProps<"input">) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field orientation="horizontal" data-invalid={fieldState.invalid}>
          <FieldContent>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <FieldDescription>{description}</FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </FieldContent>
          <Switch
            id={id}
            name={field.name}
            checked={field.value}
            onCheckedChange={field.onChange}
            aria-invalid={fieldState.invalid}
          />
        </Field>
      )}
    />
  );
}
