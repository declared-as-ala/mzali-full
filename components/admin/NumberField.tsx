'use client';
import { forwardRef, useEffect, useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onChange: (v: number) => void;
  /** Show empty string instead of "0" when the value is 0. Default: true. */
  blankOnZero?: boolean;
  /** Minimum value, default 0. Pass -Infinity to disable the clamp. */
  min?: number;
  /** Max value, default Infinity. */
  max?: number;
  /** Number of decimals to keep on blur. Defaults to "auto" — honors `step`. */
  decimals?: number;
  /** Push valid numeric edits to the parent while typing, not only on blur. */
  live?: boolean;
};

/**
 * Smart number input:
 *  • Displays empty string when value === 0 (so the placeholder shows).
 *  • Selects all text on focus → typing immediately replaces what's there.
 *  • Commits the number on blur, clamped to [min, max].
 *  • Lets the user type freely in between (intermediate empty / partial states OK).
 */
const NumberField = forwardRef<HTMLInputElement, Props>(function NumberField(
  { value, onChange, blankOnZero = true, min = 0, max = Infinity, decimals, live = false, step = 1, className = '', onFocus, onBlur, placeholder = '0', ...rest },
  ref,
) {
  const display = (v: number): string => (blankOnZero && v === 0 ? '' : String(v));
  const [text, setText] = useState<string>(display(value));

  // Sync from outside when the parent updates value (e.g. bundle switch).
  useEffect(() => { setText(display(value)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value]);

  function commit(raw: string) {
    if (raw.trim() === '' || raw === '-' || raw === '.') {
      if (value !== 0) onChange(0);
      setText('');
      return;
    }
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setText(display(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    const factor = typeof decimals === 'number'
      ? 10 ** decimals
      : typeof step === 'number' && step !== Math.floor(step)
        ? 100
        : 1;
    const rounded = Math.round(clamped * factor) / factor;
    if (rounded !== value) onChange(rounded);
    setText(display(rounded));
  }

  function preview(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === ',' || /[.,]$/.test(trimmed)) return;
    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(max, Math.max(min, parsed));
    const factor = typeof decimals === 'number'
      ? 10 ** decimals
      : typeof step === 'number' && step !== Math.floor(step)
        ? 100
        : 1;
    const rounded = Math.round(clamped * factor) / factor;
    if (rounded !== value) onChange(rounded);
  }

  return (
    <input
      ref={ref}
      type="text"           // text + inputMode=decimal — avoids the spin arrows and lets us control display
      inputMode="decimal"
      pattern="-?[0-9]*[.,]?[0-9]*"
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        // Show the real value while editing AND select-all so typing replaces the 0.
        if (blankOnZero && value === 0) setText('');
        else e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        const v = e.target.value;
        // Allow only numeric-ish characters
        if (!/^-?[0-9]*([.,][0-9]*)?$/.test(v)) return;
        setText(v);
        if (live) preview(v);
      }}
      onBlur={(e) => {
        commit(e.target.value);
        onBlur?.(e);
      }}
      className={className}
      {...rest}
    />
  );
});

export default NumberField;
