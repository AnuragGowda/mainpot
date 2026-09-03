const faqs = [
  {
    question: "Do I need to create an account?",
    answer: "No. Start or join a game as a guest—just share the room link, QR code, or six-character room code. Create an account when you want to keep settled games, find regular players, and track your record over time.",
  },
  {
    question: "Who can change the ledger?",
    answer: "Players add their own buy-ins and rebuys, then enter their own final stacks. The host can verify buy-ins, correct ledger entries, and edit any final stack.",
  },
  {
    question: "What if the bank does not balance?",
    answer: "Mainpot shows the exact difference between money in and final stacks before settlement. The host can correct the ledger, adjust all affected results proportionally, choose specific players, or record exact agreed amounts. Every adjustment appears in the settlement record.",
  },
];

export default function LandingFaq() {
  return (
    <section className="relative px-4 pb-16 sm:px-6 md:pb-24">
      <div className="relative z-10 mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Built-in guardrails</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">Know whether the table is balanced before anyone pays.</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-gray-600">The shared ledger makes the money in and final stacks visible to the whole table before the payment list appears.</p>
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
