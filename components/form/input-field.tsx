import React from "react";
import { Control, Controller, FieldValues, Path } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

type InputFieldProps<T extends FieldValues> = {
  name: Path<T>;
  id: string;
  control: Control<T>;
  placeholder?: string;
  label?: string;
  description?: string;
  type?: "number" | "email" | "text" | "password";
  className?: string;
  
};

export default function InputField<T extends FieldValues>({
  name,
  control,
  id,
  placeholder,
  description,
  type,
  label,
  className,
  ...props
}: InputFieldProps<T> & React.ComponentProps<"input">) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
          
          <Input
            {...field}
            id={id}
            type={type}
            aria-invalid={fieldState.invalid}
            placeholder={placeholder}
            autoComplete={String(name)}
            className={className}
            {...props}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
