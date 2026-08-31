const faqs = [
  {
    question: "Who can update the ledger?",
    answer: "Players can request buy-ins and enter their own cash-out. The host verifies purchases, can correct any entry, and controls when the table moves to settlement.",
  },
  {
    question: "What if an entry is wrong?",
    answer: "The activity history keeps changes visible, and the host can edit or remove an incorrect buy-in before the final payments are created.",
  },
  {
    question: "What if the bank does not balance?",
    answer: "Mainpot shows the exact difference and keeps final payments disabled until total buy-ins and cash-outs match.",
  },
];

export default function LandingFaq() {
  return (
    <section className="relative px-4 pb-16 sm:px-6 md:pb-24">
      <div className="relative z-10 mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Know before you play</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">Clear rules for the ledger.</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-gray-600">The details hosts and players usually need once chips start moving.</p>
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
