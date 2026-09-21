import { Control, Controller, FieldValues, Path } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type Option = { value: string; label: string | React.ReactNode };

type SelectFieldProps<T extends FieldValues> = {
  name: Path<T>;
  id: string;
  control: Control<T>;
  placeholder?: string;
  label?: string;
  description?: string;
  options: Option[];
  disabled?: boolean;
};

export default function SelectField<T extends FieldValues>({
  name,
  control,
  id,
  placeholder,
  description,
  label,
  options,
  disabled,
}: SelectFieldProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Select
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
            disabled={disabled}
          >
            {/* ── THE REF, SO A FAILED SUBMIT CAN SAY SO ──────────────
                react-hook-form's default shouldFocusError focuses and
                scrolls to the first invalid field -- but only if it has
                that field's ref. This component never forwarded one,
                while its sibling input-field.tsx spreads {...field} and
                therefore does.

                What that cost, on the ad-account request dialog:
                `timezone` is the only required field with no default,
                the fields live in an inner `max-h-[70dvh]` scroller and
                the submit button sits outside it. So a customer who did
                not open the timezone dropdown filled everything in,
                scrolled to the bottom, pressed "Send the request" --
                and NOTHING HAPPENED. No confirmation, no visible error,
                no scroll to the field. Walked and reproduced on
                production.

                onBlur as well, so the error appears when they leave the
                field rather than only on submit. */}
            <SelectTrigger
              id={id}
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
              className="w-full min-w-0"
            >
              <SelectValue
                className="truncate max-w-60"
                placeholder={placeholder}
              />
            </SelectTrigger>
            <SelectContent position="item-aligned">
              {options.map((option: Option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
