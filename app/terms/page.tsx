import type { Metadata } from "next";
import LegalPage, { LegalSection } from "@/components/LegalPage";
import { GITHUB_URL } from "@/lib/product";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Plain-language terms for using Mainpot.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of use"
      intro="Mainpot is a shared record for friendly home poker games. These terms explain what the service does—and what it does not do."
    >
      <LegalSection title="Using Mainpot">
        <p>By using Mainpot, you agree to these terms. You must be legally able to enter this agreement and use the service only in ways permitted where you live.</p>
        <p>Mainpot is intended for adults organizing lawful, private games. It is not designed for real-money online gambling, wagering with strangers, or commercial casino operations.</p>
      </LegalSection>

      <LegalSection title="A ledger, not a payment service">
        <p>Mainpot records buy-ins, cash-outs, and suggested settlement transfers. It does not hold funds, process payments, extend credit, determine winners, or guarantee that anyone pays. Payment handles are optional notes shared with people in a game.</p>
      </LegalSection>

      <LegalSection title="Your games and invite links">
        <p>You are responsible for the accuracy of information you enter and for deciding who can access a game. Anyone with a room code or invite link may be able to join or view game details, so share them only with people you trust.</p>
        <p>Hosts can manage participants and ledger entries. Players can enter their own cash-out amount, while hosts can correct any player&apos;s amount so the table reconciles.</p>
      </LegalSection>

      <LegalSection title="Accounts and acceptable use">
        <p>You may use guest mode or create an account where available. Do not interfere with the service, access another person&apos;s account or game without permission, upload unlawful content, or use Mainpot to facilitate illegal activity.</p>
      </LegalSection>

      <LegalSection title="Open-source software">
        <p>The Mainpot source code is available under the MIT License. That license governs your use of the code; these terms govern your use of the hosted service.</p>
      </LegalSection>

      <LegalSection title="Availability and liability">
        <p>The service is provided “as is” and may change, become unavailable, or contain errors. To the extent permitted by law, Mainpot&apos;s contributors are not liable for losses arising from incorrect entries, settlements, payments, game activity, or use of the service.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>We may update these terms as the product evolves. Material changes will be reflected by a new effective date. Questions can be raised through the <a className="font-medium text-gray-950 underline underline-offset-4" href={GITHUB_URL} target="_blank" rel="noreferrer">public project repository</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
