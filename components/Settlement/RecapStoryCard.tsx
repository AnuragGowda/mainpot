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

type Suit = "club" | "diamond" | "heart" | "spade";

const SUIT_PATHS: Record<Suit, string> = {
  club: "M12 2.5a4.25 4.25 0 0 0-3.98 5.74 4.5 4.5 0 1 0 2.66 7.52c-.2 2.08-.88 3.77-2.18 5.74h7c-1.3-1.97-1.98-3.66-2.18-5.74a4.5 4.5 0 1 0 2.66-7.52A4.25 4.25 0 0 0 12 2.5Z",
  diamond: "M12 2 20.25 12 12 22 3.75 12 12 2Z",
  heart: "M12 21.25 10.48 19.87C5.08 15 1.5 11.77 1.5 7.8A5.3 5.3 0 0 1 6.85 2.5 5.8 5.8 0 0 1 12 5.48 5.8 5.8 0 0 1 17.15 2.5 5.3 5.3 0 0 1 22.5 7.8c0 3.97-3.58 7.2-8.98 12.08L12 21.25Z",
  spade: "M12 2C9.95 5.6 4 9.02 4 14.13A4.12 4.12 0 0 0 8.12 18.25c1.14 0 2.18-.47 2.94-1.23-.23 1.82-.97 3.23-2.31 4.98h6.5c-1.34-1.75-2.08-3.16-2.31-4.98a4.15 4.15 0 0 0 7.06-2.89C20 9.02 14.05 5.6 12 2Z",
};

const C = {
  ink: "#111512",
  canvas: "#d9def8",
  paper: "#fffdf7",
  muted: "#69716b",
  line: "#cfd5cf",
  blue: "#5265d8",
  periwinkle: "#8f9ce9",
  periwinkleLight: "#dfe3fb",
  mint: "#b8ddcd",
  mintLight: "#e5f1eb",
  coral: "#ef7965",
  yellow: "#f4d889",
};

function clip(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function wrapWords(value: string, maxLineLength: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const index = lines.length - 1;
    if (index >= 0 && `${lines[index]} ${word}`.length <= maxLineLength) {
      lines[index] = `${lines[index]} ${word}`;
    } else if (lines.length < maxLines) {
      lines.push(word);
    } else {
      lines[maxLines - 1] = clip(`${lines[maxLines - 1]} ${word}`, maxLineLength + 3);
    }
  }
  return lines.length > 0 ? lines : ["POKER NIGHT"];
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "FINISHED GAME";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date).toUpperCase();
}

function SuitMark({ suit, x, y, size, color, opacity = 1, rotate = 0 }: {
  suit: Suit;
  x: number;
  y: number;
  size: number;
  color: string;
  opacity?: number;
  rotate?: number;
}) {
  return (
    <path
      d={SUIT_PATHS[suit]}
      fill={color}
      opacity={opacity}
      transform={`translate(${x} ${y}) rotate(${rotate} ${size / 2} ${size / 2}) scale(${size / 24})`}
    />
  );
}

function LogoLockup() {
  return (
    <g transform="translate(86 92)">
      <rect width="58" height="58" rx="17" fill={C.ink} />
      <SuitMark suit="spade" x={13} y={13} size={32} color="white" />
      <text x="78" y="42" fill={C.ink} fontSize="37" fontWeight="850" letterSpacing="4">MAINPOT</text>
    </g>
  );
}

function TicketNotches({ y }: { y: number }) {
  return (
    <>
      <circle cx="56" cy={y} r="17" fill={C.canvas} stroke={C.ink} strokeWidth="3" />
      <circle cx="1024" cy={y} r="17" fill={C.canvas} stroke={C.ink} strokeWidth="3" />
    </>
  );
}

function StatsStrip({ data }: { data: RecapData }) {
  const stats = [
    { label: "PLAYERS", value: String(data.playerCount), color: C.periwinkleLight, suit: "club" as Suit },
    data.durationMinutes
      ? { label: "SESSION", value: formatDuration(data.durationMinutes), color: C.mint, suit: "diamond" as Suit }
      : { label: "REBUYS", value: String(data.rebuyCount), color: C.mint, suit: "diamond" as Suit },
    { label: "PAYMENTS", value: String(data.settlementPaymentCount), color: "#ffdcd5", suit: "heart" as Suit },
  ];

  return (
    <g transform="translate(86 826)">
      {stats.map((stat, index) => {
        const x = index * 303;
        const rotation = index === 0 ? -1.2 : index === 2 ? 1.2 : 0;
        return (
          <g key={stat.label} transform={`translate(${x} 0) rotate(${rotation} 142 101)`}>
            <rect x="8" y="11" width="276" height="194" rx="22" fill={C.ink} opacity="0.16" />
            <rect width="276" height="194" rx="22" fill={stat.color} stroke={C.ink} strokeWidth="3" />
            <circle cx="56" cy="59" r="30" fill={C.paper} stroke={C.ink} strokeWidth="2.5" />
            <SuitMark suit={stat.suit} x={42} y={45} size={28} color={C.ink} />
            <text x="106" y="74" fill={C.ink} fontSize="46" fontWeight="900">{stat.value}</text>
            <line x1="28" x2="248" y1="112" y2="112" stroke={C.ink} strokeWidth="2" strokeDasharray="4 7" opacity="0.65" />
            <text x="138" y="157" textAnchor="middle" fill={C.ink} fontSize="19" fontWeight="850" letterSpacing="3">{stat.label}</text>
          </g>
        );
      })}
    </g>
  );
}

function TableIllustration({ data, featuredPlayerId }: { data: RecapData; featuredPlayerId?: string }) {
  const players = data.players.slice(0, 6);
  const seats = [
    { x: 454, y: -10 },
    { x: 764, y: 105 },
    { x: 764, y: 310 },
    { x: 454, y: 420 },
    { x: 144, y: 310 },
    { x: 144, y: 105 },
  ];

  return (
    <g transform="translate(86 1101)">
      <rect x="10" y="13" width="908" height="508" rx="28" fill={C.ink} opacity="0.16" />
      <rect width="908" height="508" rx="28" fill={C.paper} stroke={C.ink} strokeWidth="3" />
      <text x="42" y="60" fill={C.ink} fontSize="20" fontWeight="850" letterSpacing="3">POT SETTLED</text>
      <g transform="translate(654 24) rotate(1.5 106 25)">
        <rect width="212" height="50" rx="12" fill={C.coral} />
        <text x="106" y="33" textAnchor="middle" fill="white" fontSize="16" fontWeight="850" letterSpacing="2">ALL CHIPS COUNTED</text>
      </g>
      <ellipse cx="464" cy="294" rx="271" ry="153" fill={C.ink} opacity="0.16" />
      <ellipse cx="454" cy="278" rx="271" ry="153" fill={C.mintLight} stroke={C.ink} strokeWidth="4" />
      <ellipse cx="454" cy="278" rx="225" ry="114" fill={C.mint} stroke={C.ink} strokeWidth="2.5" />
      <g transform="translate(381 214)">
        <g transform="rotate(-8 43 58)">
          <rect width="86" height="116" rx="10" fill={C.periwinkle} stroke={C.ink} strokeWidth="3" />
          <rect x="9" y="9" width="68" height="98" rx="7" fill="none" stroke={C.paper} strokeWidth="2" strokeDasharray="4 5" />
          <SuitMark suit="spade" x={27} y={38} size={32} color={C.paper} />
        </g>
        <g transform="translate(62 2) rotate(9 43 58)">
          <rect width="86" height="116" rx="10" fill={C.coral} stroke={C.ink} strokeWidth="3" />
          <rect x="9" y="9" width="68" height="98" rx="7" fill="none" stroke={C.paper} strokeWidth="2" strokeDasharray="4 5" />
          <SuitMark suit="heart" x={27} y={38} size={32} color={C.paper} />
        </g>
      </g>
      <g transform="translate(664 363)">
        <ellipse cx="0" cy="30" rx="48" ry="17" fill={C.ink} opacity="0.18" />
        {[{ y: 16, color: C.periwinkle }, { y: 0, color: C.yellow }, { y: -16, color: C.coral }].map((chip) => (
          <g key={chip.y} transform={`translate(0 ${chip.y})`}>
            <ellipse cx="0" cy="0" rx="44" ry="16" fill={chip.color} stroke={C.ink} strokeWidth="2.5" />
            <ellipse cx="0" cy="0" rx="18" ry="7" fill={C.paper} stroke={C.ink} strokeWidth="1.5" />
          </g>
        ))}
      </g>
      <text x="454" y="381" textAnchor="middle" fill={C.ink} fontSize="17" fontWeight="850" letterSpacing="3">ONE TABLE · ONE LEDGER</text>
      {players.map((player, index) => {
        const seat = seats[index];
        const featured = player.id === featuredPlayerId;
        const seatFill = featured ? C.coral : index % 2 === 0 ? C.periwinkleLight : C.paper;
        return (
          <g key={player.id} transform={`translate(${seat.x} ${seat.y})`}>
            <circle cx="6" cy="8" r="42" fill={C.ink} opacity="0.18" />
            <circle cx="0" cy="0" r="42" fill={seatFill} stroke={C.ink} strokeWidth={featured ? 4 : 3} />
            <text x="0" y="10" textAnchor="middle" fill={featured ? "white" : C.ink} fontSize="25" fontWeight="900">{String(player.rank).padStart(2, "0")}</text>
          </g>
        );
      })}
    </g>
  );
}

function ReceiptList({ data, privacy, mode }: { data: RecapData; privacy: RecapPrivacy; mode: RecapMode }) {
  const players = getRecapDisplayPlayers(data, privacy).slice(0, 6);
  return (
    <g transform="translate(86 1101)">
      <rect x="10" y="13" width="908" height="508" rx="28" fill={C.ink} opacity="0.16" />
      <rect width="908" height="508" rx="28" fill={C.paper} stroke={C.ink} strokeWidth="3" />
      <rect width="908" height="74" rx="28" fill={C.mint} />
      <rect y="45" width="908" height="29" fill={C.mint} />
      <text x="38" y="48" fill={C.ink} fontSize="20" fontWeight="850" letterSpacing="3">TABLE RECEIPT</text>
      {mode === "full" && privacy.showDollarAmounts ? (
        <text x="870" y="49" textAnchor="end" fill={C.ink} fontSize="22" fontWeight="900">{formatCurrency(data.totalBuyIn)} IN PLAY</text>
      ) : null}
      {players.map((player, index) => {
        const y = 118 + index * 64;
        return (
          <g key={player.id} transform={`translate(38 ${y})`}>
            {index % 2 === 0 ? <rect x="-14" y="-31" width="860" height="54" rx="12" fill={C.periwinkleLight} opacity="0.55" /> : null}
            <text x="0" y="9" fill={index === 0 ? C.coral : C.muted} fontSize="22" fontWeight="900">{String(player.rank).padStart(2, "0")}</text>
            <text x="74" y="9" fill={C.ink} fontSize="27" fontWeight="750">{clip(player.displayLabel, 25)}</text>
            {player.showNet ? (
              <text x="832" y="9" textAnchor="end" fill={player.net > 0.005 ? "#267458" : C.ink} fontSize="27" fontWeight="850">{formatSignedNet(player.net)}</text>
            ) : (
              <SuitMark suit={(["club", "diamond", "spade", "heart"] as Suit[])[index % 4]} x={803} y={-14} size={30} color={C.line} />
            )}
            {index < players.length - 1 ? <line x1="0" x2="832" y1="33" y2="33" stroke={C.line} strokeWidth="2" strokeDasharray="4 8" /> : null}
          </g>
        );
      })}
    </g>
  );
}

/** A self-contained SVG so preview and exported PNG always match exactly. */
const RecapStoryCard = forwardRef<SVGSVGElement, RecapStoryCardProps>(function RecapStoryCard(
  { data, privacy, mode, decorative = false, featuredPlayerId, persona },
  ref
) {
  const featuredPlayer = data.players.find((player) => player.id === featuredPlayerId)
    ?? data.players[0]
    ?? null;
  const cardPersona = persona ?? getRecapPersona(data, featuredPlayer?.id, 0, privacy.showPlayerNames);
  const isPlayerCard = mode === "summary";
  const headline = isPlayerCard ? cardPersona.title.toUpperCase() : mode === "full" ? "THE FULL STORY" : "FINAL TABLE";
  const headlineLines = wrapWords(headline, isPlayerCard ? 18 : 22, isPlayerCard ? 3 : 2);
  const headlineSize = headlineLines.some((line) => line.length > 17) ? 67 : headlineLines.length === 1 ? 102 : 86;
  const result = featuredPlayer && privacy.showDollarAmounts
    ? formatSignedNet(featuredPlayer.net)
    : featuredPlayer
      ? `FINISHED #${featuredPlayer.rank}`
      : "TABLE SETTLED";

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
      <rect width="1080" height="1920" fill={C.canvas} />
      <circle cx="70" cy="90" r="310" fill={C.blue} opacity="0.2" />
      <circle cx="1050" cy="1400" r="320" fill={C.mint} opacity="0.72" />
      <circle cx="870" cy="40" r="180" fill={C.yellow} opacity="0.58" />
      <SuitMark suit="heart" x={910} y={92} size={150} color={C.coral} opacity={0.68} rotate={8} />
      <SuitMark suit="spade" x={-46} y={1650} size={220} color={C.blue} opacity={0.74} rotate={-8} />
      {Array.from({ length: 7 }, (_, index) => (
        <circle key={index} cx={26 + index * 25} cy={620 + index * 22} r="4" fill={C.ink} opacity="0.28" />
      ))}

      <g transform="translate(-58 290) rotate(-11 116 170)">
        <rect x="12" y="18" width="232" height="340" rx="26" fill={C.ink} opacity="0.2" />
        <rect width="232" height="340" rx="26" fill={C.paper} stroke={C.ink} strokeWidth="4" />
        <text x="30" y="66" fill={C.ink} fontFamily="Georgia, serif" fontSize="48" fontWeight="800">A</text>
        <SuitMark suit="spade" x={28} y={76} size={38} color={C.ink} />
        <SuitMark suit="spade" x={64} y={118} size={112} color={C.periwinkle} />
      </g>
      <g transform="translate(928 1160) rotate(12 116 170)">
        <rect x="12" y="18" width="232" height="340" rx="26" fill={C.ink} opacity="0.2" />
        <rect width="232" height="340" rx="26" fill={C.paper} stroke={C.ink} strokeWidth="4" />
        <text x="30" y="66" fill={C.coral} fontFamily="Georgia, serif" fontSize="48" fontWeight="800">K</text>
        <SuitMark suit="heart" x={28} y={76} size={38} color={C.coral} />
        <SuitMark suit="heart" x={64} y={118} size={112} color={C.coral} opacity={0.74} />
      </g>

      <rect x="68" y="62" width="968" height="1816" rx="46" fill={C.ink} opacity="0.18" />
      <rect x="56" y="42" width="968" height="1836" rx="46" fill={C.paper} stroke={C.ink} strokeWidth="3" />
      <rect x="69" y="55" width="942" height="1810" rx="38" fill="none" stroke={C.ink} strokeWidth="1.5" strokeDasharray="5 8" opacity="0.65" />
      <LogoLockup />
      <g transform="translate(809 99)">
        <SuitMark suit="club" x={0} y={2} size={26} color={C.periwinkle} />
        <SuitMark suit="diamond" x={40} y={2} size={26} color={C.mint} />
        <SuitMark suit="heart" x={80} y={2} size={26} color={C.coral} />
        <SuitMark suit="spade" x={120} y={2} size={26} color={C.ink} />
      </g>

      <g transform="translate(86 194)">
        <rect x="8" y="10" width="908" height="88" rx="20" fill={C.ink} opacity="0.16" />
        <rect width="908" height="88" rx="20" fill={C.periwinkleLight} stroke={C.ink} strokeWidth="3" />
        <text x="40" y="55" fill={C.ink} fontSize="21" fontWeight="850" letterSpacing="3">TABLE RECEIPT</text>
        <text x="868" y="55" textAnchor="end" fill={C.ink} fontSize="19" fontWeight="750">{dateLabel(data.playedAt)}</text>
      </g>

      <g transform="translate(776 325) rotate(8 104 145)" opacity="0.9">
        <rect x="9" y="12" width="208" height="290" rx="24" fill={C.ink} opacity="0.17" />
        <rect width="208" height="290" rx="24" fill={C.periwinkleLight} stroke={C.ink} strokeWidth="3" />
        <text x="25" y="58" fill={C.ink} fontFamily="Georgia, serif" fontSize="43" fontWeight="800">A</text>
        <SuitMark suit="club" x={26} y={69} size={34} color={C.ink} />
        <SuitMark suit="club" x={61} y={113} size={88} color={C.periwinkle} />
      </g>

      <g transform="translate(86 350)">
        <g transform="rotate(-1 150 -12)">
          <rect x="-10" y="-34" width={isPlayerCard ? 390 : 570} height="58" rx="12" fill={C.coral} />
          <text x="18" y="4" fill="white" fontSize="20" fontWeight="850" letterSpacing="3.5">
            {isPlayerCard ? cardPersona.eyebrow : "POT SETTLED · RECEIPTS READY"}
          </text>
        </g>
        <g aria-hidden="true">
          {headlineLines.map((line, index) => (
            <text
              key={`shadow-${line}-${index}`}
              x="8"
              y={125 + index * (headlineSize + 8)}
              fill={C.periwinkle}
              fontFamily="Arial Black, Inter, sans-serif"
              fontSize={headlineSize}
              fontWeight="900"
              letterSpacing="-4"
            >
              {line}
            </text>
          ))}
        </g>
        {headlineLines.map((line, index) => (
          <text
            key={`${line}-${index}`}
            x="0"
            y={116 + index * (headlineSize + 8)}
            fill={C.ink}
            fontFamily="Arial Black, Inter, sans-serif"
            fontSize={headlineSize}
            fontWeight="900"
            letterSpacing="-4"
          >
            {line}
          </text>
        ))}
        <g transform="translate(0 366) rotate(-0.8 220 25)">
          <rect width="470" height="60" rx="12" fill={C.yellow} />
          <text x="24" y="39" fill={C.ink} fontSize="23" fontWeight="800">{clip(data.gameName, 32)}</text>
        </g>
        {isPlayerCard ? (
          <>
            <rect x="626" y="372" width="282" height="88" rx="18" fill={C.ink} opacity="0.18" transform="rotate(2 767 416)" />
            <rect x="618" y="360" width="282" height="88" rx="18" fill={C.blue} stroke={C.ink} strokeWidth="3" transform="rotate(2 759 404)" />
            <text x="759" y="416" textAnchor="middle" fill="white" fontSize="30" fontWeight="900" transform="rotate(2 759 404)">{result}</text>
            <text x="0" y="452" fill={C.ink} fontSize="24" fontWeight="700">{clip(cardPersona.line, 62)}</text>
          </>
        ) : null}
      </g>

      <StatsStrip data={data} />
      {isPlayerCard ? <TableIllustration data={data} featuredPlayerId={featuredPlayer?.id} /> : <ReceiptList data={data} privacy={privacy} mode={mode} />}

      <g transform="translate(86 1685)">
        <line x1="0" x2="908" y1="0" y2="0" stroke={C.ink} strokeWidth="2" strokeDasharray="5 9" />
        <text x="0" y="75" fill={C.muted} fontSize="19" fontWeight="800" letterSpacing="2.5">KEEP THE GAME FRIENDLY.</text>
        <g transform="translate(664 37)">
          <rect width="244" height="72" rx="18" fill={C.ink} />
          <SuitMark suit="spade" x={20} y={20} size={32} color="white" />
          <text x="68" y="46" fill="white" fontSize="20" fontWeight="850" letterSpacing="2">MAINPOT.APP</text>
        </g>
      </g>
      <TicketNotches y={314} />
      <TicketNotches y={1070} />
      <TicketNotches y={1650} />
    </svg>
  );
});

export default RecapStoryCard;
