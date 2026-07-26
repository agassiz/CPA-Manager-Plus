import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { IconEye, IconEyeOff } from './icons';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  rightElement?: ReactNode;
  revealable?: boolean;
  revealLabel?: string;
  hideLabel?: string;
}

export function Input({
  label,
  hint,
  error,
  rightElement,
  revealable = false,
  revealLabel = 'Show value',
  hideLabel = 'Hide value',
  className = '',
  id,
  type,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const [revealed, setRevealed] = useState(false);
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [rest['aria-describedby'], errorId, hintId].filter(Boolean).join(' ') || undefined;
  const revealControl = revealable ? (
    <button
      type="button"
      className="input-reveal-button"
      onClick={() => setRevealed((current) => !current)}
      disabled={rest.disabled}
      aria-label={revealed ? hideLabel : revealLabel}
      title={revealed ? hideLabel : revealLabel}
    >
      {revealed ? <IconEyeOff size={16} /> : <IconEye size={16} />}
    </button>
  ) : null;
  const effectiveRightElement = revealControl ?? rightElement;
  const inputClassName = [
    'input',
    effectiveRightElement ? 'input-with-right-element' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="form-group">
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className="input-wrapper">
        <input
          id={inputId}
          className={inputClassName}
          aria-invalid={Boolean(error) || rest['aria-invalid']}
          aria-describedby={describedBy}
          type={revealable ? (revealed ? 'text' : 'password') : type}
          {...rest}
        />
        {effectiveRightElement && (
          <div className="input-right-element">{effectiveRightElement}</div>
        )}
      </div>
      {hint && (
        <div id={hintId} className="hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} className="error-box">
          {error}
        </div>
      )}
    </div>
  );
}
