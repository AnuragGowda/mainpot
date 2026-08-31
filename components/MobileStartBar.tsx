import Link from "next/link";

export default function MobileStartBar() {
  return (
    <div className="pointer-events-none sticky top-[calc(100svh_-_4rem_-_env(safe-area-inset-bottom))] z-20 h-0 px-4 sm:hidden">
      <Link href="/create" className="pointer-events-auto flex h-12 items-center justify-center rounded-xl bg-gray-950 text-sm font-semibold text-white shadow-xl shadow-gray-950/20">Start a game</Link>
    </div>
  );
}
