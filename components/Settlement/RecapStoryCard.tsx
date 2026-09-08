import { forwardRef, useId } from "react";
import { recapFontFace, RECAP_FONT_FAMILY, RECAP_HEIGHT, RECAP_WIDTH } from "@/lib/recap-image";
import { getShareableRecapCaption } from "@/lib/recap-personality";
import { formatDuration, type RecapData, type RecapMode, type RecapPrivacy } from "@/lib/recap";

interface RecapStoryCardProps {
  data: RecapData;
  privacy: RecapPrivacy;
  mode: RecapMode;
  decorative?: boolean;
  featuredPlayerId?: string;
  captionIndex?: number;
}

const C = {
  ink: "#111512",
  paper: "#f7f8f6",
  muted: "#69716b",
  line: "#e3e7e3",
  lilac: "#dce2ff",
};

const SPADE = "M12 2C9.95 5.6 4 9.02 4 14.13A4.12 4.12 0 0 0 8.12 18.25c1.14 0 2.18-.47 2.94-1.23-.23 1.82-.97 3.23-2.31 4.98h6.5c-1.34-1.75-2.08-3.16-2.31-4.98a4.15 4.15 0 0 0 7.06-2.89C20 9.02 14.05 5.6 12 2Z";
const HEART = "M12 21.25 10.48 19.87C5.08 15 1.5 11.77 1.5 7.8A5.3 5.3 0 0 1 6.85 2.5 5.8 5.8 0 0 1 12 5.48 5.8 5.8 0 0 1 17.15 2.5 5.3 5.3 0 0 1 22.5 7.8c0 3.97-3.58 7.2-8.98 12.08L12 21.25Z";

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

function PlayingCard({ x, y, angle, heart = false }: {
  x: number; y: number; angle: number; heart?: boolean;
}) {
  const color = heart ? "#bd4255" : C.ink;
  const suit = heart ? HEART : SPADE;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle} 137 190)`}>
      <rect x="5" y="14" width="274" height="380" rx="30" fill={C.ink} opacity="0.06" />
      <rect width="274" height="380" rx="30" fill="white" stroke={C.line} strokeWidth="2" />
      <text x="28" y="65" fill={color} fontSize="48" fontWeight="600">A</text>
      <path d={suit} fill={color} transform="translate(65 118) scale(6)" />
      <g transform="translate(274 380) rotate(180)">
        <text x="28" y="65" fill={color} fontSize="48" fontWeight="600">A</text>
      </g>
    </g>
  );
}

function Chip({ x, y, angle, scale = 1, dark = false }: {
  x: number; y: number; angle: number; scale?: number; dark?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <circle cy="7" r="67" fill={C.ink} opacity="0.08" />
      <circle r="67" fill={dark ? C.ink : C.lilac} />
      <circle r="55" fill="none" stroke={dark ? "#f7f8f6" : "#ffffff"} strokeWidth="9" strokeDasharray="17 18" />
      <circle r="41" fill="none" stroke={dark ? "#f7f8f6" : "#ffffff"} strokeWidth="2" opacity="0.65" />
      <path d={SPADE} fill={dark ? "white" : C.ink} transform="translate(-20 -21) scale(1.7)" />
    </g>
  );
}

/** Balance the curated titles across two lines without truncating the joke. */
function titleLines(title: string): string[] {
  const words = title.split(" ");
  if (words.length < 2) return [title];
  let split = 1;
  for (let index = 2; index < words.length; index++) {
    const width = Math.max(words.slice(0, index).join(" ").length, words.slice(index).join(" ").length);
    const bestWidth = Math.max(words.slice(0, split).join(" ").length, words.slice(split).join(" ").length);
    if (width < bestWidth) split = index;
  }
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

/** One name-free design shared by the preview and standalone PNG. */
const RecapStoryCard = forwardRef<SVGSVGElement, RecapStoryCardProps>(function RecapStoryCard(
  { data, privacy, decorative = false, featuredPlayerId, captionIndex = 0 }, ref
) {
  // Unique paint servers keep the inline card and open editor independent.
  const id = useId().replace(/:/g, "");
  const featuredPlayer = data.players.find((player) => player.id === featuredPlayerId) ?? data.players[0];
  const showResult = privacy.showResult !== false && privacy.showDollarAmounts && featuredPlayer
    && !privacy.hiddenPlayerIds.includes(featuredPlayer.id)
    && (privacy.showLosses || featuredPlayer.net >= -0.005);
  const caption = getShareableRecapCaption(data, featuredPlayer?.id, captionIndex, privacy);
  const headline = titleLines(caption.title);
  const headlineSize = Math.min(100, 1500 / Math.max(...headline.map((line) => line.length)));
  const result = showResult ? formatCardCurrency(featuredPlayer.net, true) : null;
  const stats = [
    { label: "PLAYERS", value: String(data.playerCount), visible: privacy.showPlayerCount !== false },
    { label: "DURATION", value: data.durationMinutes ? formatDuration(data.durationMinutes) : "—", visible: privacy.showDuration !== false },
    { label: "TOTAL BUY-IN", value: formatCardCurrency(data.totalBuyIn), visible: privacy.showDollarAmounts },
    { label: "REBUYS", value: String(data.rebuyCount), visible: privacy.showRebuys !== false },
  ].filter((stat) => stat.visible);

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={RECAP_WIDTH}
      height={RECAP_HEIGHT}
      viewBox="0 0 1080 1920"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Mainpot poker night recap"}
      focusable="false"
      fontFamily={`"${RECAP_FONT_FAMILY}", Arial, sans-serif`}
      className="h-auto w-full overflow-hidden rounded-[22px]"
    >
      <defs>
        <style data-recap-font>{recapFontFace()}</style>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="#d5ddff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#e8e6ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-panel`} x2="1" y2="1">
          <stop stopColor="#242932" />
          <stop offset="1" stopColor={C.ink} />
        </linearGradient>
        <pattern id={`${id}-dots`} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill={C.ink} opacity="0.16" />
        </pattern>
      </defs>
      <rect width="1080" height="1920" fill={C.paper} />
      <ellipse cx="740" cy="640" rx="640" ry="690" fill={`url(#${id}-glow)`} />
      <circle cx="540" cy="732" r="320" fill="none" stroke={C.ink} strokeOpacity="0.07" />
      <circle cx="540" cy="732" r="370" fill="none" stroke={C.ink} strokeOpacity="0.05" />
      <path d="M90 740 A450 450 0 0 1 990 740 L940 740 A400 400 0 0 0 140 740Z" fill={`url(#${id}-dots)`} />

      <g transform="translate(80 76)">
        <rect width="60" height="60" rx="17" fill={C.ink} />
        <path d={SPADE} fill="white" transform="translate(14 13) scale(1.35)" />
        <text x="78" y="43" fill={C.ink} fontSize="44" fontWeight="700" letterSpacing="-2">Mainpot</text>
      </g>
      <text x="1000" y="115" textAnchor="end" fill={C.muted} fontSize="21" letterSpacing="3">POKER NIGHT PERSONALITY</text>
      <text x="540" y="216" textAnchor="middle" fill={C.muted} fontSize="23" letterSpacing="4">TONIGHT, I WAS</text>
      <text textAnchor="middle" fill={C.ink} fontSize={headlineSize} fontWeight="700" letterSpacing="-4">
        {headline.map((line, index) => <tspan key={index} x="540" y={318 + index * 98}>{line}{index === 0 ? " " : ""}</tspan>)}
      </text>
      <text x="540" y="476" textAnchor="middle" fill={C.muted} fontSize="28">{caption.line}</text>

      <PlayingCard x={299} y={542} angle={-14} heart />
      <PlayingCard x={490} y={559} angle={10} />
      <Chip x={245} y={875} angle={-38} scale={0.78} dark />
      <Chip x={296} y={934} angle={18} />
      <Chip x={814} y={805} angle={28} scale={0.72} />
      <Chip x={799} y={875} angle={-16} dark />
      <Chip x={719} y={989} angle={58} scale={0.62} />
      <g fill="none" stroke={C.ink} strokeWidth="3" strokeLinecap="round">
        <path d="M231 560v28m-14-14h28M859 512v20m-10-10h20" />
        <path d="m837 978 8-16 8 16-8 16Z" />
      </g>
      <circle cx="202" cy="824" r="5" fill={C.ink} />
      <circle cx="870" cy="651" r="5" fill={C.ink} />

      <g transform="translate(80 1060)">
        <rect width="920" height="264" rx="36" fill={`url(#${id}-panel)`} />
        <text x="48" y="66" fill="#dce2ff" fontSize="22" letterSpacing="3">{result ? "NET RESULT" : "POKER NIGHT"}</text>
        <text x="48" y="193" fill="white" fontSize={result ? (result.length > 8 ? 94 : 120) : 80} fontWeight="700" letterSpacing="-4">{result ?? "That's a wrap."}</text>
        <g transform="translate(856 58)" fill="none" stroke="#dce2ff" strokeWidth="3">
          <circle r="24" />
          <path d="m-10 0 7 7 14-14" />
        </g>
      </g>

      {stats.map((stat, index) => {
        const lastFullWidth = index === stats.length - 1 && stats.length % 2 === 1;
        const x = 80 + (index % 2) * 476;
        const y = 1364 + Math.floor(index / 2) * 120;
        return (
          <g key={stat.label} transform={`translate(${x} ${y})`}>
            <line x2={lastFullWidth ? 920 : 444} stroke={C.line} strokeWidth="2" />
            <text y="36" fill={C.muted} fontSize="22" letterSpacing="2">{stat.label}</text>
            <text y="93" fill={C.ink} fontSize={stat.value.length > 9 ? 42 : 52} fontWeight="600" letterSpacing="-1.5">{stat.value}</text>
          </g>
        );
      })}
      <line x1="80" x2="1000" y1="1772" y2="1772" stroke={C.line} strokeWidth="2" />
      <text x="80" y="1824" fill={C.ink} fontSize="29" fontWeight="600">What’s your poker alter ego?</text>
      <text x="80" y="1866" fill={C.muted} fontSize="23">Track your game. Settle up. Get your card.</text>
      <text x="962" y="1847" textAnchor="end" fill={C.ink} fontSize="36" fontWeight="700" letterSpacing="-1">mainpot.app</text>
      <path d="m978 1844 22-22m-18 0h18v18" fill="none" stroke={C.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});

export default RecapStoryCard;
