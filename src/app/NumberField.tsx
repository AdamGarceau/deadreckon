"use client";

import { useEffect, useState } from "react";

/**
 * A numeric input that lets you actually type a decimal point. Binding an
 * <input> directly to a number reformats mid-keystroke ("12." -> 12), which
 * eats the period. This keeps a string buffer and only pushes finite numbers up.
 */
export default function NumberField({
  value,
  onChange,
  className,
  placeholder,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(String(value));

  // Resync the buffer only when the external value diverges from what's typed.
  useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      className={className}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        const n = parseFloat(v);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
