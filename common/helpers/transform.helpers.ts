import { Transform } from 'class-transformer';

// Upper-cases string input before validation, e.g. "usd" -> "USD", so codes
// are accepted case-insensitively but stored in canonical form.
export const UpperCase = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  );
