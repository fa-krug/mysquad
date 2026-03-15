// Input validation functions — return an error string or null if valid

export function required(label: string) {
  return (value: string | null): string | null => {
    if (!value || value.trim() === "") return `${label} is required`;
    return null;
  };
}

export function email(value: string | null): string | null {
  if (!value || value === "") return null; // optional by default
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email address";
  return null;
}

export function requiredEmail(label: string) {
  return (value: string | null): string | null => {
    const req = required(label)(value);
    if (req) return req;
    return email(value);
  };
}

export function phone(value: string | null): string | null {
  if (!value || value === "") return null; // optional
  // Allow digits, spaces, dashes, parens, plus sign
  if (!/^[+\d\s().-]{6,}$/.test(value)) return "Invalid phone number";
  return null;
}

export function zip(value: string | null): string | null {
  if (!value || value === "") return null; // optional
  // Accept common formats: 5-digit, 5+4 US, or alphanumeric for international
  if (!/^[A-Za-z0-9\s-]{3,10}$/.test(value)) return "Invalid ZIP/postal code";
  return null;
}

export function positiveInteger(value: string | null): string | null {
  if (!value || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return "Must be a positive whole number";
  return null;
}

export function positiveNumber(value: string | null): string | null {
  if (!value || value === "") return null;
  const n = Number(value);
  if (isNaN(n) || n < 0) return "Must be a positive number";
  return null;
}

/** Compose multiple validators — returns the first error or null */
export function compose(
  ...fns: Array<(value: string | null) => string | null>
): (value: string | null) => string | null {
  return (value) => {
    for (const fn of fns) {
      const err = fn(value);
      if (err) return err;
    }
    return null;
  };
}
