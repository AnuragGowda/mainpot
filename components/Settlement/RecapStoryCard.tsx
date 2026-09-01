import { forwardRef } from "react";
import { formatCurrency, formatSignedNet } from "@/lib/format";
import { getRecapPersona, type RecapPersona } from "@/lib/recap-personality";
import {
  formatDuration,
  getRecapDisplayPlayers,
  type RecapData,
  type RecapMode,
  type RecapPrivacy,
} from "@/lib/recap";

interface RecapStoryCardProps {
  data: RecapData;
  privacy: RecapPrivacy;
  mode: RecapMode;
  decorative?: boolean;
  featuredPlayerId?: string;
  persona?: RecapPersona;
}

function clip(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Finished game";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }).format(date).toUpperCase();
}

function statLabel(value: string, label: string, x: number) {
  return (
    <g key={label} transform={`translate(${x} 0)`}>
      <text x="0" y="0" fill="#a3a3a3" fontSize="22" fontWeight="600" letterSpacing="3">{label.toUpperCase()}</text>
      <text x="0" y="46" fill="#f5f5f4" fontSize="38" fontWeight="700">{value}</text>
    </g>
  );
}

/** A self-contained SVG so preview and exported PNG always match exactly. */
const RecapStoryCard = forwardRef<SVGSVGElement, RecapStoryCardProps>(function RecapStoryCard(
  { data, privacy, mode, decorative = false, featuredPlayerId, persona },
  ref
) {
  const players = getRecapDisplayPlayers(data, privacy).slice(0, 6);
  const featuredPlayer = data.players.find((player) => player.id === featuredPlayerId)
    ?? data.players[0]
    ?? null;
  const cardPersona = persona ?? getRecapPersona(
    data,
    featuredPlayer?.id,
    0,
    privacy.showPlayerNames
  );
  const title = clip(data.gameName || "Poker night", 30);
  const showLeaderboard = mode !== "summary" && players.length > 0;
  const showMoney = privacy.showDollarAmounts;
  const outcomeAccent = cardPersona.outcome === "big_win" || cardPersona.outcome === "win"
    ? "#dceabf"
    : cardPersona.outcome === "even"
      ? "#eadfb7"
      : "#efb9ae";
  const footerText = mode === "summary"
    ? "Every entry reconciled before settlement."
    : "A shared ledger for poker night.";
  const stats = [
    { label: "Players", value: String(data.playerCount) },
    ...(data.durationMinutes ? [{ label: "Session", value: formatDuration(data.durationMinutes) }] : []),
    { label: "Rebuys", value: String(data.rebuyCount) },
    { label: "Payments", value: String(data.settlementPaymentCount) },
  ].slice(0, 3);

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1080 1920"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${data.gameName} game recap`}
      focusable="false"
      fontFamily="Inter, Arial, sans-serif"
      className="h-auto w-full overflow-hidden rounded-[22px] shadow-2xl"
    >
      <rect width="1080" height="1920" fill="#111512" />
      <g fill="#dfe7db" opacity="0.055">
        <path d="M926 116l42 52-42 52-42-52z" />
        <path d="M128 1680l56 69-56 69-56-69z" />
        <circle cx="965" cy="1530" r="34" />
        <circle cx="932" cy="1566" r="34" />
        <circle cx="998" cy="1566" r="34" />
        <path d="M965 1572l-35 76h70z" />
      </g>
      <rect x="58" y="58" width="964" height="1804" rx="42" fill="#151916" stroke="#59635b" strokeWidth="2" />

      <g transform="translate(118 158)">
        <rect x="0" y="-28" width="36" height="36" rx="8" fill="#dceabf" />
        <circle cx="18" cy="-16" r="7" fill="#182019" />
        <circle cx="11" cy="-7" r="7" fill="#182019" />
        <circle cx="25" cy="-7" r="7" fill="#182019" />
        <path d="M18-7L10 8H26Z" fill="#182019" />
        <text x="54" y="0" fill="#dceabf" fontSize="26" fontWeight="800" letterSpacing="5">MAINPOT</text>
        <text x="0" y="92" fill="#a3a3a3" fontSize="22" fontWeight="700" letterSpacing="4">GAME RECAP</text>
        <text x="0" y="165" fill="#fafaf9" fontSize="58" fontWeight="750">{title}</text>
        <text x="0" y="214" fill="#a3a3a3" fontSize="24" fontWeight="600" letterSpacing="2">{dateLabel(data.playedAt)}</text>
      </g>

      <line x1="118" x2="962" y1="468" y2="468" stroke="#4b544d" strokeWidth="2" />
      <line x1="118" x2="962" y1="702" y2="702" stroke="#4b544d" strokeWidth="2" />
      <g transform="translate(142 560)">
        {stats.map((stat, index) => statLabel(stat.value, stat.label, index * 255))}
      </g>

      {mode === "full" && showMoney ? (
        <g transform="translate(118 818)">
          <text x="0" y="0" fill="#a3a3a3" fontSize="22" fontWeight="700" letterSpacing="4">TOTAL ACTION</text>
          <text x="0" y="78" fill="#d9e7be" fontSize="72" fontWeight="750">{formatCurrency(data.totalBuyIn)}</text>
        </g>
      ) : null}

      {showLeaderboard ? (
        <g transform={`translate(118 ${mode === "full" && showMoney ? 1010 : 850})`}>
          <text x="0" y="0" fill="#a3a3a3" fontSize="22" fontWeight="700" letterSpacing="4">FINAL TABLE</text>
          {players.map((player, index) => {
            const y = 70 + index * 112;
            const isWinner = player.net > 0.005;
            return (
              <g key={player.id} transform={`translate(0 ${y})`}>
                <line x1="0" x2="844" y1="42" y2="42" stroke="#38453e" strokeWidth="1" />
                <text x="0" y="0" fill={isWinner ? "#d9e7be" : "#d6d3d1"} fontSize="31" fontWeight="750">{String(player.rank).padStart(2, "0")}</text>
                <text x="83" y="0" fill="#f5f5f4" fontSize="31" fontWeight="650">{clip(player.displayLabel, 27)}</text>
                {player.showNet ? (
                  <text x="844" y="0" textAnchor="end" fill={isWinner ? "#d9e7be" : "#d6d3d1"} fontSize="31" fontWeight="750">{formatSignedNet(player.net)}</text>
                ) : null}
              </g>
            );
          })}
        </g>
      ) : (
        <g transform="translate(118 830)">
          <text x="0" y="0" fill={outcomeAccent} fontSize="22" fontWeight="750" letterSpacing="4">{cardPersona.eyebrow}</text>
          <text x="0" y="92" fill="#fafaf9" fontSize="56" fontWeight="760">
            {clip(cardPersona.title, 30)}
          </text>
          <text x="0" y="148" fill="#c4cac5" fontSize="27" fontWeight="550">
            {clip(cardPersona.line, 60)}
          </text>
          <line x1="0" x2="844" y1="214" y2="214" stroke="#3c443e" strokeWidth="2" />
          {featuredPlayer ? (
            <>
              <text x="0" y="282" fill="#929a94" fontSize="21" fontWeight="700" letterSpacing="3">
                {privacy.showPlayerNames ? "PLAYER" : "TABLE RESULT"}
              </text>
              <text x="0" y="338" fill="#f5f5f4" fontSize="36" fontWeight="700">
                {privacy.showPlayerNames ? clip(featuredPlayer.displayName, 25) : `FINISHED #${featuredPlayer.rank}`}
              </text>
              {showMoney ? (
                <text x="844" y="338" textAnchor="end" fill={outcomeAccent} fontSize="54" fontWeight="780">
                  {formatSignedNet(featuredPlayer.net)}
                </text>
              ) : null}
            </>
          ) : null}
        </g>
      )}

      <g transform="translate(118 1700)">
        <line x1="0" x2="844" y1="0" y2="0" stroke="#4b5d52" strokeWidth="2" />
        <text x="0" y="58" fill="#d6d3d1" fontSize="25" fontWeight="600">{footerText}</text>
        <text x="0" y="113" fill="#a3a3a3" fontSize="23" fontWeight="700" letterSpacing="3">MAINPOT.APP</text>
      </g>
    </svg>
  );
});

export default RecapStoryCard;
