import Link from "next/link";
import { Code2 } from "lucide-react";
import { GITHUB_URL } from "@/lib/product";

export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white/60 px-4 py-8 text-sm text-gray-500">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p>Keep the game friendly. Keep the money exact.</p>
        <nav aria-label="Footer navigation" className="flex items-center gap-5">
          <Link href="/feedback" className="transition hover:text-gray-950">Feedback</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition hover:text-gray-950">
            <Code2 aria-hidden size={16} /> Open source
          </a>
        </nav>
      </div>
    </footer>
  );
}
