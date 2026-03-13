import * as React from "react";
import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";

function formatMoney(value: string): string {
  if (value === "" || value === "-") return "";
  const num = parseFloat(value);
  if (isNaN(num)) return "";
  const formatted = num.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  });
  return `${formatted}\u202F€`;
}

interface MoneyInputProps extends Omit<
  React.ComponentProps<"input">,
  "onChange" | "value" | "type"
> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function MoneyInput({ value, onChange, className, ...props }: MoneyInputProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow: digits, decimal point, minus, backspace, delete, tab, arrows, home, end
    const allowed = /^[0-9.\-]$/;
    if (
      !allowed.test(e.key) &&
      !["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) &&
      !(e.metaKey || e.ctrlKey)
    ) {
      e.preventDefault();
    }
  }, []);

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={focused ? value : formatMoney(value)}
      onChange={onChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={focused ? handleKeyDown : undefined}
      readOnly={!focused}
      className={className}
      {...props}
    />
  );
}

export { MoneyInput, formatMoney };
