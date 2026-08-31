import Link from "next/link";
import { Code2 } from "lucide-react";
import { GITHUB_URL } from "@/lib/product";
import SuitIcon from "@/components/SuitIcon";

export default function SiteFooter() {
  const footerLink = "inline-flex min-h-11 items-center transition hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2";

  return (
    <footer className="relative border-t border-gray-200 bg-white/60 px-4 py-8 text-sm text-gray-500 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-8 w-7 place-items-center rounded-md border border-gray-200 bg-white text-gray-900 shadow-sm"><SuitIcon className="h-3.5 w-3.5" suit="spade" /></span>
          <div>
            <p className="font-medium text-gray-700">Built for home games.</p>
            <p className="mt-1 text-xs">© {new Date().getFullYear()} Mainpot contributors · Open source under the MIT License.</p>
          </div>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/self-host" className={footerLink}>Self-host</Link>
          <Link href="/feedback" className={footerLink}>Feedback</Link>
          <Link href="/terms" className={footerLink}>Terms</Link>
          <Link href="/privacy" className={footerLink}>Privacy</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={`${footerLink} gap-1.5`}>
            <Code2 aria-hidden size={16} /> Open source
          </a>
        </nav>
      </div>
    </footer>
  );
}
