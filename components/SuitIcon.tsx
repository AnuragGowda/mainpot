type Suit = "club" | "diamond" | "heart" | "spade";

type SuitIconProps = {
  className?: string;
  suit: Suit;
};

const suitPaths: Record<Suit, string> = {
  club: "M12 2.5a4.25 4.25 0 0 0-3.98 5.74 4.5 4.5 0 1 0 2.66 7.52c-.2 2.08-.88 3.77-2.18 5.74h7c-1.3-1.97-1.98-3.66-2.18-5.74a4.5 4.5 0 1 0 2.66-7.52A4.25 4.25 0 0 0 12 2.5Z",
  diamond: "M12 2 20.25 12 12 22 3.75 12 12 2Z",
  heart: "M12 21.25 10.48 19.87C5.08 15 1.5 11.77 1.5 7.8A5.3 5.3 0 0 1 6.85 2.5 5.8 5.8 0 0 1 12 5.48 5.8 5.8 0 0 1 17.15 2.5 5.3 5.3 0 0 1 22.5 7.8c0 3.97-3.58 7.2-8.98 12.08L12 21.25Z",
  spade: "M12 2C9.95 5.6 4 9.02 4 14.13A4.12 4.12 0 0 0 8.12 18.25c1.14 0 2.18-.47 2.94-1.23-.23 1.82-.97 3.23-2.31 4.98h6.5c-1.34-1.75-2.08-3.16-2.31-4.98a4.15 4.15 0 0 0 7.06-2.89C20 9.02 14.05 5.6 12 2Z",
};

export default function SuitIcon({ className, suit }: SuitIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d={suitPaths[suit]} />
    </svg>
  );
}
