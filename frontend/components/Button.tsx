"use client";

import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-amber-400 text-ink-950 hover:bg-amber-500 font-medium",
  secondary: "bg-ink-700 text-paper hover:bg-ink-600",
  ghost: "bg-transparent text-slate-300 hover:text-paper hover:bg-ink-800",
  danger: "bg-transparent text-rose-400 hover:bg-ink-800",
};

export function Button({ variant = "primary", className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
