'use client';

// TotpInput — 6 inputs single-digit avec focus auto-advance + collage
// du code complet + navigation clavier (Tab / Backspace / flèches).
// Accessible : aria-describedby, label visible.

import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

export interface TotpInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly inputId?: string;
  readonly describedById?: string;
}

const SLOT_COUNT = 6;
const SLOT_IDS: readonly string[] = ['s0', 's1', 's2', 's3', 's4', 's5'];

export function TotpInput({
  value,
  onChange,
  disabled,
  autoFocus,
  inputId,
  describedById,
}: TotpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [slots, setSlots] = useState<string[]>(() => valueToSlots(value));

  useEffect(() => {
    setSlots(valueToSlots(value));
  }, [value]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      inputsRef.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  const focusSlot = (idx: number): void => {
    const clamped = Math.max(0, Math.min(idx, SLOT_COUNT - 1));
    inputsRef.current[clamped]?.focus();
  };

  const updateSlot = (idx: number, digit: string): void => {
    const next = [...slots];
    next[idx] = digit;
    setSlots(next);
    onChange(next.join(''));
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: gestion saisie + collage multi-slot — extraire diviserait artificiellement la logique
  const handleChange = (idx: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length === 0) {
      updateSlot(idx, '');
      return;
    }
    if (raw.length === 1) {
      updateSlot(idx, raw);
      focusSlot(idx + 1);
      return;
    }
    // Collage potentiel — distribuer sur les slots à partir de idx.
    const next = [...slots];
    for (let i = 0; i < raw.length && idx + i < SLOT_COUNT; i++) {
      next[idx + i] = raw[i] ?? '';
    }
    setSlots(next);
    onChange(next.join(''));
    focusSlot(idx + raw.length);
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: gestion Backspace + flèches — extraire diviserait artificiellement
  const handleKeyDown = (idx: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!slots[idx]) {
        e.preventDefault();
        focusSlot(idx - 1);
        updateSlot(idx - 1, '');
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusSlot(idx - 1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusSlot(idx + 1);
    }
  };

  return (
    <fieldset
      className="flex items-center gap-2 border-0 p-0"
      aria-label="Code à 6 chiffres affiché par votre application TOTP"
    >
      {SLOT_IDS.map((slotId, i) => (
        <input
          key={slotId}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          id={i === 0 ? inputId : undefined}
          aria-describedby={i === 0 ? describedById : undefined}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          pattern="[0-9]"
          value={slots[i] ?? ''}
          onChange={handleChange(i)}
          onKeyDown={handleKeyDown(i)}
          disabled={disabled}
          className="h-12 w-10 rounded border border-slate-300 bg-white text-center text-lg font-medium tabular-nums focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-100"
        />
      ))}
    </fieldset>
  );
}

function valueToSlots(value: string): string[] {
  const digits = value.replace(/\D/g, '').slice(0, SLOT_COUNT).split('');
  while (digits.length < SLOT_COUNT) digits.push('');
  return digits;
}
