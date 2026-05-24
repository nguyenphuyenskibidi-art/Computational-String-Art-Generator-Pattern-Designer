import type { ReactNode } from 'react';

interface FieldShellProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

export function FieldShell({ title, hint, children }: FieldShellProps) {
  return (
    <div className="field-shell">
      <div className="field-shell__header">
        <div>
          <div className="field-shell__title">{title}</div>
          {hint ? <div className="field-shell__hint">{hint}</div> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  suffix?: string;
  helper?: string;
}

export function SliderField({ label, value, min, max, step, onChange, suffix, helper }: SliderFieldProps) {
  return (
    <label className="slider-field">
      <div className="slider-field__row">
        <span>{label}</span>
        <strong>
          {value.toFixed(step < 1 ? 2 : 0)}{suffix ?? ''}
        </strong>
      </div>
      <input
        className="slider-field__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {helper ? <div className="slider-field__helper">{helper}</div> : null}
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  suffix?: string;
}

export function NumberField({ label, value, min, max, step, onChange, suffix }: NumberFieldProps) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="number-field__row">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix ? <span className="number-field__suffix">{suffix}</span> : null}
      </div>
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

export function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
