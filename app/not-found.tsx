import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <SiteNav />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl px-4 py-16 text-center focus:outline-none sm:py-24">
        <p className="font-mono text-sm text-gray-500">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950">This page isn’t at the table.</h1>
        <p className="mt-4 text-base leading-7 text-gray-600">Check the link, or join a game with its six-character code.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/join" className="inline-flex min-h-11 items-center rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white hover:bg-gray-800">Join a game</Link>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-950 hover:bg-gray-50">Back home</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
