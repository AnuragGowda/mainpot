import type { Metadata } from "next";
import LegalPage, { LegalSection } from "@/components/LegalPage";
import { GITHUB_URL } from "@/lib/product";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Mainpot handles account and game information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      intro="Mainpot collects only the information needed to keep a shared poker-night ledger working. It does not process payments or sell personal information."
    >
      <LegalSection title="Information we handle">
        <p>Game data can include display names, room details, buy-ins, rebuys, cash-outs, activity history, settlement transfers, and payment status. Optional profiles can include a username, bio, avatar, and payment handles.</p>
        <p>If you create an account or use Google sign-in, we receive basic account information such as your email address, name, avatar, and an authentication identifier. We do not receive your Google password.</p>
      </LegalSection>

      <LegalSection title="How we use information">
        <p>We use this information to authenticate you, synchronize games across devices, show the ledger to invited players, calculate settlements, prevent abuse, and improve reliability.</p>
      </LegalSection>

      <LegalSection title="Guest and local use">
        <p>Guest sessions use an anonymous identifier so participants can share a live game without creating an account. Hosted guest games are temporary: they expire within 48 hours after settlement and no later than seven days after creation. They are not attached to an account dashboard or permanent history.</p>
        <p>In self-hosted local mode, game information can remain in that browser&apos;s storage instead of being synchronized to a hosted database.</p>
      </LegalSection>

      <LegalSection title="Service providers and sharing">
        <p>Mainpot uses Supabase for database, synchronization, and authentication services. Google processes information when you choose Google sign-in. GitHub processes information you submit through public feedback or issue forms.</p>
        <p>Game information is shared with people who have access to that game. We do not sell personal information or use game data for targeted advertising.</p>
      </LegalSection>

      <LegalSection title="Retention, choices, and deletion">
        <p>Account game history is retained while needed to provide the service. Temporary request counters are retained briefly to prevent abuse, and unused anonymous authentication records are periodically removed. You can avoid optional profile fields and use guest mode where available.</p>
        <p>For an access or deletion request, contact the maintainers privately through the repository&apos;s security contact rather than posting personal information in a public issue.</p>
      </LegalSection>

      <LegalSection title="Security and age">
        <p>We use reasonable safeguards and access controls, but no online service can guarantee absolute security. Mainpot is not intended for children under 18.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>We may update this policy as features or providers change. Questions can be raised through the <a className="font-medium text-gray-950 underline underline-offset-4" href={`${GITHUB_URL}/security`} target="_blank" rel="noreferrer">repository security page</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
