import type { HTMLAttributes } from "react";

export type BadgeVariant = "green" | "gray" | "red" | "amber";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  gray: "bg-gray-100 text-gray-700 ring-gray-500/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

export default function Badge({
  variant = "gray",
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        variantClasses[variant],
        className ?? "",
      ].join(" ")}
      {...rest}
    />
  );
}
