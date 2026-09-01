import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Code2,
  Database,
  ExternalLink,
  HardDrive,
  Server,
  ShieldCheck,
} from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import SuitIcon from "@/components/SuitIcon";
import { GITHUB_URL } from "@/lib/product";

export const metadata: Metadata = {
  title: "Self-Host Mainpot",
  description:
    "Run Mainpot yourself with local browser storage, a local Supabase stack, or your own hosted Next.js and Supabase deployment.",
  alternates: { canonical: "/self-host" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "Self-Host Mainpot | Open-Source Poker Ledger",
    description:
      "Choose a private local setup or deploy your own shared Mainpot instance with the MIT-licensed source.",
    url: "/self-host",
  },
  twitter: {
    title: "Self-Host Mainpot | Open-Source Poker Ledger",
    description:
      "Choose a private local setup or deploy your own shared Mainpot instance with the MIT-licensed source.",
  },
};

const setupGuideUrl = `${GITHUB_URL}/blob/main/SETUP.md`;

const deploymentModels = [
  {
    label: "Simplest",
    title: "Single-browser mode",
    description:
      "Run only the web app with no Supabase variables. Games stay in that browser’s local storage, so there is no account system or cross-device sync.",
    needs: "Node.js 22+",
    command: "npm run dev:app",
    icon: HardDrive,
  },
  {
    label: "Fully local",
    title: "Local full stack",
    description:
      "Run Mainpot with the bundled Supabase development stack for PostgreSQL, authentication, Realtime, and a local email inbox.",
    needs: "Node.js 22+ and Docker",
    command: "npm run dev",
    icon: Database,
  },
  {
    label: "Shared instance",
    title: "Your own deployment",
    description:
      "Host the Next.js application and connect it to a Supabase project you control for accounts, shared rooms, and live multi-device updates.",
    needs: "A Node host and Supabase",
    command: "Follow the production guide",
    icon: Server,
  },
] as const;

const faqs = [
  {
    question: "Is Mainpot free and open source?",
    answer:
      "Yes. Mainpot is published under the MIT License. You can inspect, run, modify, and deploy the source subject to that license.",
  },
  {
    question: "Can Mainpot run without Supabase?",
    answer:
      "Yes, in single-browser mode. Without Supabase environment variables, Mainpot stores game data in that browser’s local storage. That mode does not provide accounts, Realtime, or cross-device synchronization.",
  },
  {
    question: "Is Docker required to self-host Mainpot?",
    answer:
      "Docker is required for the bundled local Supabase stack. It is not required for single-browser mode, and a hosted deployment can use a managed Supabase project instead of local containers.",
  },
  {
    question: "Can I run Mainpot on a home server?",
    answer:
      "Yes. The repository includes a Node-based production service example. If other devices will connect, you are responsible for HTTPS, network access, authentication redirects, database security, backups, and updates.",
  },
  {
    question: "Does a self-hosted instance process poker payments?",
    answer:
      "No. Mainpot records the ledger and suggests settlement transfers. It does not hold funds, send money, or connect directly to a bank account.",
  },
  {
    question: "Is the bundled local stack ready to expose to the internet?",
    answer:
      "No. The bundled Supabase stack is designed for local development. An internet-facing instance needs a production database, reviewed row-level security, HTTPS, backups, monitoring, and correctly configured authentication URLs.",
  },
] as const;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      headline: "How to self-host Mainpot",
      description:
        "An overview of local and hosted deployment options for the open-source Mainpot poker ledger.",
      mainEntityOfPage: "https://mainpot.app/self-host",
      author: { "@type": "Organization", name: "Mainpot contributors" },
      publisher: { "@type": "Organization", name: "Mainpot" },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ],
};

const sectionHeading =
  "text-3xl font-semibold tracking-[-0.035em] text-gray-950 sm:text-4xl";

export default function SelfHostPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#f7f8f6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteNav />
      <main>
        <section className="relative overflow-hidden border-b border-gray-200 px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
          <div aria-hidden="true" className="ante-page-washes absolute inset-0" />
          <div aria-hidden="true" className="ante-page-glow absolute inset-x-0 top-0" />
          <div aria-hidden="true" className="ante-page-dot-arch absolute inset-x-0 top-0" />
          <div className="relative mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-16">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700 shadow-sm backdrop-blur-xl">
                <SuitIcon className="h-3 w-3" suit="club" />
                Open source · MIT licensed
              </p>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.055em] text-gray-950 sm:text-6xl lg:text-7xl">
                Your game. Your server. Your data.
              </h1>
              <p className="mt-6 max-w-3xl text-xl leading-9 text-gray-700">
                Mainpot can run privately in one browser, as a complete local stack, or as a shared deployment connected to infrastructure you control.
              </p>
              <p className="mt-4 max-w-3xl text-base leading-8 text-gray-600">
                Self-hosting gives you control over where the application and game records live. It also makes you responsible for security, availability, backups, and upgrades when other people depend on the instance.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gray-950 px-6 text-sm font-semibold text-white shadow-lg shadow-gray-950/10 transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
                >
                  <Code2 aria-hidden className="h-4 w-4" />
                  View the source
                </a>
                <a
                  href={setupGuideUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-6 text-sm font-semibold text-gray-900 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
                >
                  Technical setup guide
                  <ExternalLink aria-hidden className="h-4 w-4" />
                </a>
              </div>
            </div>

            <aside className="overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-[0_18px_50px_rgba(17,24,20,0.08)]">
              <div className="bg-gray-950 px-5 py-4 text-white sm:px-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Mainpot stack</p>
                    <p className="mt-1 font-semibold">One application, three deployment models</p>
                  </div>
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-gray-300">MIT</span>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {[
                  ["Web application", "Next.js 16 · Node.js 22+"],
                  ["Shared data", "PostgreSQL · Supabase Realtime"],
                  ["Identity", "Supabase Auth · anonymous rooms supported"],
                  ["Payments", "Calculated only · never processed"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[7rem_1fr] gap-3 px-5 py-3.5 text-sm sm:px-6">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-900">{value}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Choose a model</p>
            <h2 className={`mt-3 ${sectionHeading}`}>Start with the amount of infrastructure you actually need.</h2>
            <p className="mt-5 text-base leading-8 text-gray-600">
              All three options use the same Mainpot interface. The difference is where data is stored and whether the game can synchronize across devices.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {deploymentModels.map((model, index) => {
              const Icon = model.icon;
              return (
                <article key={model.title} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-gray-100 text-gray-700">
                      <Icon aria-hidden className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-xs text-gray-400">0{index + 1}</span>
                  </div>
                  <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{model.label}</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-gray-950">{model.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-7 text-gray-600">{model.description}</p>
                  <dl className="mt-6 border-t border-gray-100 pt-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">Requires</dt>
                      <dd className="text-right font-medium text-gray-900">{model.needs}</dd>
                    </div>
                    <div className="mt-3 flex justify-between gap-4">
                      <dt className="text-gray-500">Start with</dt>
                      <dd className="text-right font-mono text-xs font-semibold text-gray-900">{model.command}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-gray-200 bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">What runs where</p>
              <h2 className={`mt-3 ${sectionHeading}`}>A small stack with clear boundaries.</h2>
              <p className="mt-5 text-base leading-8 text-gray-600">
                Mainpot’s web layer renders the room and settlement workflow. Supabase provides shared persistence, identity, authorization, and live updates. Payment transfers stay outside the application.
              </p>
              <p className="mt-4 text-sm leading-7 text-gray-500">
                In single-browser mode, local storage replaces the shared data layer. That is useful for a private test or one-device game, but it is not a server deployment.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-[#f3f5f2] p-5 sm:p-7">
              <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
                {[
                  { label: "Players", body: "Phones and browsers", icon: ShieldCheck },
                  { label: "Mainpot", body: "Next.js web application", icon: Code2 },
                  { label: "Data layer", body: "Supabase or local storage", icon: Database },
                ].map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="contents">
                      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <Icon aria-hidden className="h-4 w-4 text-gray-500" />
                        <p className="mt-4 text-sm font-semibold text-gray-950">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-gray-500">{item.body}</p>
                      </div>
                      {index < 2 ? (
                        <ArrowRight aria-hidden className="mx-auto h-4 w-4 rotate-90 self-center text-gray-400 md:rotate-0" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">$</span>
                <p>Mainpot calculates who should pay whom. The actual payment happens separately using whatever method the table chooses.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Local quick start</p>
            <h2 className={`mt-3 ${sectionHeading}`}>Clone, install, run.</h2>
            <p className="mt-5 text-base leading-8 text-gray-600">
              The default development command starts both the application and its local Supabase services. The first run downloads the required container images and applies the database migrations.
            </p>
            <pre className="mt-7 max-w-full overflow-x-auto rounded-2xl bg-gray-950 p-5 text-sm leading-7 text-gray-200 shadow-lg shadow-gray-950/10"><code>{`git clone ${GITHUB_URL}.git
cd mainpot
npm install
npm run dev`}</code></pre>
            <p className="mt-4 text-sm leading-7 text-gray-500">
              On macOS, the project uses OrbStack. Other platforms can use a compatible Docker runtime. No hosted Supabase account is required for the local stack.
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Production reality</p>
            <h2 className={`mt-3 ${sectionHeading}`}>Control comes with operational work.</h2>
            <div className="mt-7 space-y-3">
              {[
                "Use a production Supabase project or a hardened PostgreSQL and Supabase deployment.",
                "Apply the schema and migrations in order, then verify row-level security policies.",
                "Serve the application over HTTPS and configure authentication redirects for its real domain.",
                "Back up the database, monitor the health endpoint, and plan how updates will be applied.",
                "Keep service-role credentials out of the browser and separate production from development.",
              ].map((item) => (
                <div key={item} className="flex min-w-0 gap-3 rounded-xl border border-gray-200 bg-white p-4">
                  <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="min-w-0 text-sm leading-6 text-gray-700">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex min-w-0 gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <p className="min-w-0 text-sm leading-6 text-amber-950">
                Do not expose the bundled local Supabase development stack directly to the public internet.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-gray-200 px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto w-full max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Questions</p>
            <h2 className={`mt-3 ${sectionHeading}`}>Self-hosting, without the fine print hidden.</h2>
            <div className="mt-8 border-y border-gray-200">
              {faqs.map((faq, index) => (
                <details key={faq.question} className="group border-b border-gray-200 last:border-0" open={index === 0}>
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">
                    {faq.question}
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gray-200 text-gray-500 transition group-open:rotate-45 group-open:bg-white">+</span>
                  </summary>
                  <p className="max-w-3xl pb-6 text-sm leading-7 text-gray-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 overflow-hidden rounded-3xl bg-gray-950 px-6 py-10 text-white sm:px-10 sm:py-12 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Ready to inspect the stack?</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">The source and full deployment guide are public.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-400">
                Review the code, license, database migrations, and production checklist before deciding how you want to run Mainpot.
              </p>
            </div>
            <a
              href={setupGuideUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-semibold text-gray-950 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              Open the setup guide
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
