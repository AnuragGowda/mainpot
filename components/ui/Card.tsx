import type { HTMLAttributes } from "react";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export default function Card({
  padding = "md",
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-gray-200/90 bg-white shadow-[0_1px_2px_rgba(16,24,16,0.04)]",
        paddingClasses[padding],
        className ?? "",
      ].join(" ")}
      {...rest}
    />
  );
}
