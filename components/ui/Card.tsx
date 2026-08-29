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
        "rounded-lg border border-gray-200 bg-white shadow-sm",
        paddingClasses[padding],
        className ?? "",
      ].join(" ")}
      {...rest}
    />
  );
}