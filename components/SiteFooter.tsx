import Link from "next/link";
import { Code2 } from "lucide-react";
import { GITHUB_URL } from "@/lib/product";

export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white/60 px-4 py-8 text-sm text-gray-500">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-gray-700">Mainpot</p>
          <p className="mt-1 text-xs">© {new Date().getFullYear()} Mainpot contributors · Open source under the MIT License.</p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/feedback" className="transition hover:text-gray-950">Feedback</Link>
          <Link href="/terms" className="transition hover:text-gray-950">Terms</Link>
          <Link href="/privacy" className="transition hover:text-gray-950">Privacy</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition hover:text-gray-950">
            <Code2 aria-hidden size={16} /> Open source
          </a>
        </nav>
      </div>
    </footer>
  );
}
