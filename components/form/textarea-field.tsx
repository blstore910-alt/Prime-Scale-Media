import { Control, Controller, FieldValues, Path } from "react-hook-form";
import { useT } from "@/hooks/use-t";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Textarea } from "../ui/textarea";

type TextAreaFieldProps<T extends FieldValues> = {
  name: Path<T>;
  id: string;
  control: Control<T>;
  placeholder?: string;
  label?: string;
  description?: string;
};

export default function TextareaField<T extends FieldValues>({
  name,
  control,
  id,
  placeholder,
  description,
  label,
}: TextAreaFieldProps<T>) {
  const { tx } = useT();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label ? tx(label) : label}</FieldLabel>
          <Textarea
            {...field}
            id={id}
            aria-invalid={fieldState.invalid}
            placeholder={placeholder ? tx(placeholder) : placeholder}
            className="min-h-[120px]"
          />
          {description && <FieldDescription>{description}</FieldDescription>}
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
