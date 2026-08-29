import Link from "next/link";
import ResumeBanner from "@/components/ResumeBanner";

const linkBaseClasses =
  "inline-flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

const steps = [
  {
    number: 1,
    title: "Create",
    description: "Host creates a game and sets the buy-in.",
  },
  {
    number: 2,
    title: "Play",
    description: "Everyone logs buy-ins and rebuys in realtime.",
  },
  {
    number: 3,
    title: "Settle",
    description: "Cash out, reconcile, and see who owes whom.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 sm:px-6">
      <ResumeBanner />
      <section className="flex flex-1 flex-col items-center justify-center py-24 text-center sm:py-32">
        <p className="mb-5 text-xs font-medium uppercase tracking-widest text-gray-500">
          Poker money tracking
        </p>
        <h1 className="text-5xl font-semibold tracking-tight text-gray-900 sm:text-6xl">
          Ante
        </h1>
        <p className="mt-5 text-xl text-gray-500">
          Track buy-ins. Settle up. Square everyone.
        </p>
        <div className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:gap-4">
          <Link
            href="/create"
            className={`${linkBaseClasses} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            Create a game
          </Link>
          <Link
            href="/join"
            className={`${linkBaseClasses} border border-gray-300 bg-white text-gray-900 hover:bg-gray-50`}
          >
            Join a game
          </Link>
        </div>
      </section>

      <section aria-label="How it works" className="pb-24">
        <h2 className="text-center text-sm font-medium uppercase tracking-widest text-gray-500">
          How it works
        </h2>
        <div className="mt-10 grid gap-12 sm:grid-cols-3 sm:gap-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className="flex flex-col items-center text-center"
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-sm font-semibold text-emerald-600"
              >
                {step.number}
              </span>
              <h3 className="mt-4 text-base font-semibold text-gray-900">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="pb-8 text-center text-sm text-gray-400">
        Ante — keep the math honest at your next game night.
      </footer>
    </main>
  );
}