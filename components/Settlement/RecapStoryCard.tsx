import { forwardRef } from "react";
import { formatCurrency, formatSignedNet } from "@/lib/format";
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
  { data, privacy, mode },
  ref
) {
  const players = getRecapDisplayPlayers(data, privacy).slice(0, 6);
  const title = clip(data.gameName || "Poker night", 30);
  const showLeaderboard = mode !== "summary" && players.length > 0;
  const showMoney = privacy.showDollarAmounts;
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
      role="img"
      aria-label={`${data.gameName} game recap`}
      className="h-auto w-full overflow-hidden rounded-[22px] shadow-2xl"
    >
      <rect width="1080" height="1920" fill="#121614" />
      <circle cx="1000" cy="110" r="310" fill="#284237" opacity="0.82" />
      <circle cx="-60" cy="1760" r="430" fill="#1d3028" opacity="0.9" />
      <path d="M0 405C247 326 402 525 655 445S988 336 1080 385V0H0Z" fill="#17251f" opacity="0.8" />
      <rect x="58" y="58" width="964" height="1804" rx="42" fill="#171b19" stroke="#4b5d52" strokeWidth="2" />

      <g transform="translate(118 158)">
        <circle cx="18" cy="-8" r="18" fill="#d9e7be" />
        <text x="52" y="0" fill="#d9e7be" fontSize="26" fontWeight="800" letterSpacing="5">MAINPOT</text>
        <text x="0" y="92" fill="#a3a3a3" fontSize="22" fontWeight="700" letterSpacing="4">GAME RECAP</text>
        <text x="0" y="165" fill="#fafaf9" fontSize="58" fontWeight="750">{title}</text>
        <text x="0" y="214" fill="#a3a3a3" fontSize="24" fontWeight="600" letterSpacing="2">{dateLabel(data.playedAt)}</text>
      </g>

      <rect x="118" y="470" width="844" height="250" rx="30" fill="#202723" stroke="#4b5d52" strokeWidth="2" />
      <g transform="translate(168 560)">
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
        <g transform="translate(118 920)">
          <text x="0" y="0" fill="#d9e7be" fontSize="72" fontWeight="750">Game complete.</text>
          <text x="0" y="60" fill="#d6d3d1" fontSize="30">The table is balanced and ready to settle.</text>
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
