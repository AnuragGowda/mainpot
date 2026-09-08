const faqs = [
  {
    question: "Do I need to create an account?",
    answer: "No. Start or join as a guest. An optional account keeps your game history and helps you find regular players.",
  },
  {
    question: "Who can change the ledger?",
    answer: "Players can add their own buy-ins and final stacks, or the host can add players and record everything from one phone. The host verifies buy-ins and can correct any entry.",
  },
  {
    question: "What if the bank does not balance?",
    answer: "The host can correct an entry or allocate the difference by agreement: proportionally, to selected players, or with exact amounts. Every adjustment stays in the game record.",
  },
];

export default function LandingFaq() {
  return (
    <section className="relative px-4 pb-12 sm:px-6 md:pb-16">
      <div className="relative z-10 mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
        <div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">Before you deal.</h2>
        </div>
        <div className="border-y border-gray-200">
          {faqs.map((faq, index) => (
            <details key={faq.question} className="ante-faq group border-b border-gray-200 last:border-0" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-gray-950">
                <span className="min-w-0 flex-1">{faq.question}</span>
                <span aria-hidden="true" className="ante-faq-toggle h-6 w-6 shrink-0 rounded-full border border-gray-200 transition group-open:border-gray-300 group-open:bg-gray-50" />
              </summary>
              <p className="max-w-2xl pb-5 text-sm leading-6 text-gray-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
