import { Spade } from "lucide-react";
import type { HTMLAttributes } from "react";

export default function BrandMark({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center rounded-[28%] bg-gray-950 text-white ${className}`}
      {...props}
    >
      <Spade aria-hidden="true" size="50%" strokeWidth={1.8} fill="currentColor" />
    </span>
  );
}
