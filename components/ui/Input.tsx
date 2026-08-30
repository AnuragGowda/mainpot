"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  prefix?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, prefix, id, className, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="w-full">
      {label ? (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
      ) : null}
      <div className="relative flex items-center">
        {prefix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 select-none text-gray-400"
          >
            {prefix}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={[
            "h-11 w-full rounded-lg border bg-white px-3 text-gray-900 shadow-[0_1px_1px_rgba(16,24,16,0.02)] placeholder-gray-400 transition",
            "focus:outline-none focus:border-gray-950 focus:ring-2",
            error
              ? "border-red-500 focus:ring-red-500/20"
              : "border-gray-300 focus:ring-gray-950/10",
            prefix ? "pl-8" : "",
            className ?? "",
          ].join(" ")}
          {...rest}
        />
      </div>
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});

Input.displayName = "Input";

export default Input;
