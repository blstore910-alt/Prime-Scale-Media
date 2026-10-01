import React from "react";
import { Control, Controller, FieldValues, Path } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { useT } from "@/hooks/use-t";

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
  // Label, placeholder en foutmelding volgen de taal van wie kijkt. Een
  // tekst die niet in het woordenboek staat, komt ongewijzigd terug.
  const { tx } = useT();
  return (
    <Controller
      name={name}
      control={control}
      // ── AND react-hook-form HAS TO KNOW ─────────────────────────
      //
      // `disabled` arrived in ...props and was spread onto the DOM node
      // only, so the form kept the value and submitted it anyway --
      // which is how a "disabled" fee field still reached the server.
      // useController's own `disabled` is what stops that.
      disabled={(props as { disabled?: boolean }).disabled}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {label && <FieldLabel htmlFor={id}>{tx(label)}</FieldLabel>}
          
          <Input
            {...field}
            id={id}
            type={type}
            aria-invalid={fieldState.invalid}
            placeholder={placeholder ? tx(placeholder) : placeholder}
            autoComplete={String(name)}
            className={className}
            {...props}
          />
          {description && <FieldDescription>{tx(description)}</FieldDescription>}
          {fieldState.invalid && (
            <FieldError
              errors={[
                fieldState.error
                  ? { ...fieldState.error, message: tx(fieldState.error.message ?? "") }
                  : undefined,
              ]}
            />
          )}
        </Field>
      )}
    />
  );
}
