import { forwardRef } from "react";
import { getRecapPersona, type RecapPersona } from "@/lib/recap-personality";
import {
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

type Suit = "heart" | "spade";

const SUIT_PATHS: Record<Suit, string> = {
  heart: "M12 21.25 10.48 19.87C5.08 15 1.5 11.77 1.5 7.8A5.3 5.3 0 0 1 6.85 2.5 5.8 5.8 0 0 1 12 5.48 5.8 5.8 0 0 1 17.15 2.5 5.3 5.3 0 0 1 22.5 7.8c0 3.97-3.58 7.2-8.98 12.08L12 21.25Z",
  spade: "M12 2C9.95 5.6 4 9.02 4 14.13A4.12 4.12 0 0 0 8.12 18.25c1.14 0 2.18-.47 2.94-1.23-.23 1.82-.97 3.23-2.31 4.98h6.5c-1.34-1.75-2.08-3.16-2.31-4.98a4.15 4.15 0 0 0 7.06-2.89C20 9.02 14.05 5.6 12 2Z",
};

const C = {
  ink: "#111512",
  paper: "#f7f6ef",
  white: "#fdfdf7",
  muted: "#69716b",
  line: "#d5d3c9",
  coral: "#ef7965",
  mint: "#b8ddcd",
  lavender: "#aab5ff",
  yellow: "#f4d889",
};

function clip(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function wrapWords(value: string, maxLineLength: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];

  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && `${lines[last]} ${word}`.length <= maxLineLength) {
      lines[last] = `${lines[last]} ${word}`;
    } else if (lines.length < maxLines) {
      lines.push(word);
    } else {
      lines[maxLines - 1] = clip(`${lines[maxLines - 1]} ${word}`, maxLineLength + 3);
    }
  }

  return lines.length > 0 ? lines : ["POKER NIGHT"];
}

function headlineFontSize(lines: string[]): number {
  const longest = Math.max(...lines.map((line) => line.length));
  if (longest <= 8) return 150;
  if (longest <= 10) return 136;
  if (longest <= 12) return 120;
  if (longest <= 15) return 104;
  return 90;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "GAME COMPLETE";
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase();
  return `${month} ${date.getDate()} · ${date.getFullYear()}`;
}

function formatCardCurrency(value: number, signed = false): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return "$0";
  const absolute = Math.abs(value);
  const sign = signed ? (value > 0 ? "+" : "−") : "";

  if (absolute >= 1_000_000) {
    return `${sign}$${(absolute / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
  }
  if (absolute >= 10_000) {
    return `${sign}$${(absolute / 1_000).toFixed(absolute >= 100_000 ? 0 : 1)}K`;
  }

  return `${sign}${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(absolute) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(absolute)}`;
}

function formatClockDuration(minutes: number | undefined): string {
  if (!minutes || minutes < 1) return "—";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours === 0 ? `${remainder}M` : `${hours}:${String(remainder).padStart(2, "0")}`;
}

function SuitMark({ suit, x, y, size, color }: {
  suit: Suit;
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  return (
    <path
      d={SUIT_PATHS[suit]}
      fill={color}
      transform={`translate(${x} ${y}) scale(${size / 24})`}
    />
  );
}

function LogoLockup() {
  return (
    <g transform="translate(64 58)">
      <rect width="58" height="58" rx="17" fill={C.ink} />
      <SuitMark suit="spade" x={13} y={13} size={32} color={C.white} />
      <text x="78" y="41" fill={C.ink} fontSize="35" fontWeight="850" letterSpacing="3.5">MAINPOT</text>
    </g>
  );
}

function PlayingCard({ rank, suit, x, y, rotate }: {
  rank: "A" | "K";
  suit: Suit;
  x: number;
  y: number;
  rotate: number;
}) {
  const suitColor = suit === "heart" ? C.white : C.ink;
  const cardColor = suit === "heart" ? C.coral : C.white;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate} 111 163)`}>
      <rect x="10" y="14" width="222" height="326" rx="26" fill="#000" opacity="0.2" />
      <rect width="222" height="326" rx="26" fill={cardColor} stroke={C.white} strokeOpacity="0.18" strokeWidth="2" />
      <text x="39" y="72" fill={suitColor} fontSize="54" fontWeight="800">{rank}</text>
      <SuitMark suit={suit} x={66} y={122} size={104} color={suitColor} />
    </g>
  );
}

function PokerChip({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="39" cy="39" r="38" fill="#000" opacity="0.18" transform="translate(4 6)" />
      <circle cx="39" cy="39" r="38" fill={color} stroke={C.white} strokeWidth="3" />
      <circle cx="39" cy="39" r="30" fill="none" stroke={C.white} strokeWidth="5" strokeDasharray="12 10" />
      <circle cx="39" cy="39" r="11" fill={C.white} opacity="0.9" />
    </g>
  );
}

function ChipStack() {
  const chips = [
    { x: 692, y: 476, color: C.lavender },
    { x: 742, y: 500, color: C.mint },
    { x: 792, y: 470, color: C.coral },
    { x: 842, y: 498, color: C.yellow },
  ];

  return (
    <g>
      {chips.map((chip) => (
        <PokerChip key={chip.x} {...chip} />
      ))}
    </g>
  );
}

function PlayerPanel({ result, resultIsPrivate, eyebrow, persona }: {
  result: string;
  resultIsPrivate: boolean;
  eyebrow: string;
  persona: RecapPersona;
}) {
  const resultSize = resultIsPrivate ? 64 : result.length <= 6 ? 142 : result.length <= 8 ? 122 : 98;
  const quoteLines = wrapWords(persona.line, 30, 2);

  return (
    <g transform="translate(64 860)">
      <rect x="10" y="12" width="952" height="600" rx="40" fill="#000" opacity="0.18" />
      <rect width="952" height="600" rx="40" fill={C.ink} />

      <text x="40" y="62" fill={C.lavender} fontSize="20" fontWeight="850" letterSpacing="3.5">
        {eyebrow}
      </text>
      <text x="40" y="200" fill={C.mint} fontSize={resultSize} fontWeight="900" letterSpacing="-6">
        {result}
      </text>
      {quoteLines.map((line, index) => (
        <text key={line} x="40" y={456 + index * 42} fill={C.white} fontSize="32" fontWeight="600">
          {line}
        </text>
      ))}

      <PlayingCard rank="K" suit="heart" x={712.07} y={35.83} rotate={11} />
      <PlayingCard rank="A" suit="spade" x={600} y={120} rotate={-4} />
      <ChipStack />
    </g>
  );
}

function TablePanel({ data, privacy, mode }: {
  data: RecapData;
  privacy: RecapPrivacy;
  mode: Exclude<RecapMode, "summary">;
}) {
  const players = getRecapDisplayPlayers(data, privacy).slice(0, 5);
  const heading = mode === "full" ? "GAME LEDGER" : "FINAL TABLE";

  return (
    <g transform="translate(64 860)">
      <rect width="952" height="600" rx="38" fill={C.ink} />
      <text x="52" y="76" fill={C.white} opacity="0.62" fontSize="20" fontWeight="850" letterSpacing="4">{heading}</text>
      {mode === "full" && privacy.showDollarAmounts ? (
        <text x="900" y="78" textAnchor="end" fill={C.mint} fontSize="30" fontWeight="850">
          {formatCardCurrency(data.totalBuyIn)} IN PLAY
        </text>
      ) : null}
      {players.length > 0 ? players.map((player, index) => {
        const y = 148 + index * 82;
        return (
          <g key={player.id} transform={`translate(52 ${y})`}>
            <text x="0" y="28" fill={index === 0 ? C.mint : C.white} fontSize="26" fontWeight="850">
              {String(player.rank).padStart(2, "0")}
            </text>
            <text x="74" y="28" fill={C.white} fontSize="32" fontWeight="750">
              {clip(player.displayLabel, 23)}
            </text>
            <text x="848" y="28" textAnchor="end" fill={player.showNet ? C.mint : C.white} opacity={player.showNet ? 1 : 0.42} fontSize="32" fontWeight="850">
              {player.showNet ? formatCardCurrency(player.net, true) : "RESULT HIDDEN"}
            </text>
            {index < players.length - 1 ? <line x1="0" x2="848" y1="58" y2="58" stroke={C.white} strokeWidth="2" opacity="0.12" /> : null}
          </g>
        );
      }) : (
        <text x="476" y="322" textAnchor="middle" fill={C.white} opacity="0.6" fontSize="30" fontWeight="700">No public results selected</text>
      )}
    </g>
  );
}

function StatsStrip({ data, privacy }: { data: RecapData; privacy: RecapPrivacy }) {
  const stats = [
    { label: "PLAYERS", value: String(data.playerCount), color: C.lavender },
    { label: "TOTAL BUY-IN", value: privacy.showDollarAmounts ? formatCardCurrency(data.totalBuyIn) : "PRIVATE", color: C.coral },
    { label: "SESSION", value: formatClockDuration(data.durationMinutes), color: C.ink },
    { label: "PAYMENTS", value: String(data.settlementPaymentCount), color: C.coral },
  ];

  return (
    <g transform="translate(64 1530)">
      <rect width="952" height="160" rx="32" fill="#ffffff" stroke={C.ink} strokeWidth="2" />
      {stats.map((stat, index) => {
        const columnWidth = 238;
        const center = index * columnWidth + columnWidth / 2;
        const valueSize = stat.value.length > 7 ? 43 : stat.value.length > 5 ? 52 : 70;
        return (
          <g key={stat.label}>
            <text x={center} y="85" textAnchor="middle" fill={stat.color} fontSize={valueSize} fontWeight="900" letterSpacing="-2">{stat.value}</text>
            <text x={center} y="124" textAnchor="middle" fill={C.muted} fontSize="18" fontWeight="850" letterSpacing="2.2">{stat.label}</text>
          </g>
        );
      })}
    </g>
  );
}

/** A self-contained SVG so the in-app preview and exported PNG match exactly. */
const RecapStoryCard = forwardRef<SVGSVGElement, RecapStoryCardProps>(function RecapStoryCard(
  { data, privacy, mode, decorative = false, featuredPlayerId, persona },
  ref
) {
  const featuredPlayer = data.players.find((player) => player.id === featuredPlayerId)
    ?? data.players[0]
    ?? null;
  const cardPersona = persona ?? getRecapPersona(data, featuredPlayer?.id, 0, privacy.showPlayerNames);
  const headline = mode === "summary"
    ? cardPersona.title.toUpperCase()
    : mode === "full"
      ? "THE FULL STORY"
      : "FINAL TABLE";
  const headlineLines = wrapWords(headline, mode === "summary" ? 12 : 16, 3);
  const headlineSize = headlineFontSize(headlineLines);
  const lineHeight = headlineSize * 0.94;
  const headlineHeight = headlineLines.length * lineHeight;
  const firstBaseline = 350 + (430 - headlineHeight) / 2 + headlineSize * 0.82;
  const resultIsPrivate = !featuredPlayer || !privacy.showDollarAmounts;
  const result = featuredPlayer && privacy.showDollarAmounts
    ? formatCardCurrency(featuredPlayer.net, true)
    : featuredPlayer
      ? `FINISHED #${featuredPlayer.rank}`
      : "TABLE SETTLED";
  const panelEyebrow = featuredPlayer?.rank === 1 ? "TOP STACK" : cardPersona.eyebrow;
  const gameNameSize = data.gameName.length > 34 ? 23 : data.gameName.length > 25 ? 26 : 30;

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
      <rect width="1080" height="1920" fill={C.paper} />
      <rect width="24" height="1920" fill={C.coral} />
      <rect x="24" width="6" height="1920" fill={C.ink} opacity="0.06" />
      <circle cx="1010" cy="94" r="220" fill={C.lavender} opacity="0.5" />
      <circle cx="880" cy="52" r="142" fill={C.lavender} opacity="0.3" />
      <g opacity="0.04">
        <SuitMark suit="spade" x={840} y={118} size={250} color={C.ink} />
      </g>
      <circle cx="20" cy="1584" r="190" fill={C.mint} opacity="0.55" />

      <LogoLockup />
      <g transform="translate(790 42)">
        <rect width="230" height="68" rx="34" fill={C.ink} />
        <text x="115" y="45" textAnchor="middle" fill={C.white} fontSize="27" fontWeight="800" letterSpacing="1.2">
          {dateLabel(data.playedAt)}
        </text>
      </g>

      <text x="64" y="260" fill={C.muted} fontSize={gameNameSize} fontWeight="850" letterSpacing="3.4">
        {clip(data.gameName.toUpperCase(), 42)}
      </text>

      {headlineLines.map((line, index) => (
        <text
          key={`${line}-${index}`}
          x="64"
          y={firstBaseline + index * lineHeight}
          fill={C.ink}
          fontFamily="Arial Black, Inter, sans-serif"
          fontSize={headlineSize}
          fontWeight="900"
          letterSpacing="-7"
        >
          {line}
        </text>
      ))}

      {mode === "summary" ? (
        <PlayerPanel result={result} resultIsPrivate={resultIsPrivate} eyebrow={panelEyebrow} persona={cardPersona} />
      ) : (
        <TablePanel data={data} privacy={privacy} mode={mode} />
      )}

      <StatsStrip data={data} privacy={privacy} />

      <g transform="translate(64 1762)">
        <text x="476" y="28" textAnchor="middle" fill={C.ink} fontSize="25" fontWeight="700" letterSpacing="0.2">
          Track your home games and create memorable recaps
        </text>
        <text x="476" y="82" textAnchor="middle" fill={C.ink} fontSize="27" fontWeight="900" letterSpacing="1.4">mainpot.app</text>
      </g>
    </svg>
  );
});

export default RecapStoryCard;
