const faqs = [
  {
    question: "Who can change the ledger?",
    answer: "Players add their own buy-ins and cash-outs. The host can verify buy-ins, correct entries, and start settlement.",
  },
  {
    question: "Can the host fix a mistake?",
    answer: "Yes. The host can edit or remove an incorrect buy-in, and the activity history keeps the change visible.",
  },
  {
    question: "What if the bank does not balance?",
    answer: "Mainpot shows the exact difference and holds settlement until total buy-ins and cash-outs match.",
  },
];

export default function LandingFaq() {
  return (
    <section className="relative px-4 pb-16 sm:px-6 md:pb-24">
      <div className="relative z-10 mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Built-in guardrails</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">No more wondering why the table is $20 short.</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-gray-600">Everyone uses the same live ledger, so mistakes surface before settlement.</p>
        </div>
        <div className="border-y border-gray-200">
          {faqs.map((faq, index) => (
            <details key={faq.question} className="ante-faq group border-b border-gray-200 last:border-0" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-gray-950">
                {faq.question}
                <span aria-hidden="true" className="ante-faq-toggle h-6 w-6 shrink-0 rounded-full border border-gray-200 transition group-open:rotate-45 group-open:border-gray-300 group-open:bg-gray-50" />
              </summary>
              <p className="max-w-2xl pb-5 text-sm leading-6 text-gray-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
