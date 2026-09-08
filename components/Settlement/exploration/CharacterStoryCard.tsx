import { forwardRef } from 'react';
import { recapFontFace, RECAP_FONT_FAMILY } from '@/lib/recap-image';
import { formatDuration, type RecapData, type RecapPrivacy } from '@/lib/recap';
import { getRecapCharacter, characterMoney, recordedDuration, type CharacterDirection } from '@/lib/recap-characters';
import RecapCharacterArt, { CHARACTER_SPADE } from './RecapCharacterArt';

interface Props { data:RecapData; privacy:RecapPrivacy; featuredPlayerId?:string; direction:CharacterDirection; decorative?:boolean }
const C = {ink:'#202421', paper:'#f7f8f6', muted:'#6c716c', line:'#dedfdc', lilac:'#dce0f6'};
const CharacterStoryCard = forwardRef<SVGSVGElement, Props>(function CharacterStoryCard({data, privacy, featuredPlayerId, direction, decorative = false}, ref) {
  const persona = getRecapCharacter(data, privacy, featuredPlayerId);
  const pocket = direction === 'pocket';
  const duration = recordedDuration(data.durationMinutes);
  const showTotals = privacy.hiddenPlayerIds.length === 0 && privacy.showLosses;
  const count = (value: number) => Number.isSafeInteger(value) && value >= 0 ? String(value) : '—';
  const stats = [
    {label:'PLAYERS', value:count(data.playerCount), show:privacy.showPlayerCount !== false},
    {label:'DURATION', value:duration ? formatDuration(duration) : '—', show:privacy.showDuration !== false},
    {label:'TABLE BUY-IN', value:characterMoney(data.totalBuyIn), show:privacy.showDollarAmounts && showTotals},
    {label:'TABLE REBUYS', value:count(data.rebuyCount), show:privacy.showRebuys !== false && showTotals},
  ].filter(s=>s.show);
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `Mainpot poker night: ${persona.title.join(' ')}`} fontFamily={`"${RECAP_FONT_FAMILY}", Arial, sans-serif`} className="h-auto w-full rounded-[20px]">
    <defs><style data-recap-font>{recapFontFace()}</style></defs>
    <rect width="1080" height="1920" fill={C.paper}/>
    {pocket && <rect x="48" y="168" width="984" height="1530" rx="46" fill="white" stroke={C.line} strokeWidth="2"/>}
    <g transform="translate(76 66)"><rect width="51" height="51" rx="15" fill={C.ink}/><path d={CHARACTER_SPADE} transform="translate(11 9) scale(1.2)" fill="white"/><text x="67" y="37" fontSize="39" fontWeight="700" letterSpacing="-1.8" fill={C.ink}>Mainpot</text></g>
    <text x="1004" y="99" textAnchor="end" fontSize="20" letterSpacing="2.8" fill={C.muted}>POKER NIGHT, PERSONIFIED.</text>
    {pocket ? <>
      <text x="540" y="231" textAnchor="middle" fontSize="20" letterSpacing="4" fill={C.muted}>TONIGHT’S POCKET LEGEND</text>
      <g transform="translate(140 257)"><RecapCharacterArt kind={persona.kind} direction={direction}/></g>
      <text textAnchor="middle" fontWeight="700" fontSize="88" letterSpacing="-4" fill={C.ink}>{persona.title.map((line,i)=><tspan key={line} x="540" y={984+i*94}>{line}{i===0?' ':''}</tspan>)}</text>
      <text x="540" y="1146" textAnchor="middle" fontSize="29" fill={C.muted}>{persona.line}</text>
    </> : <>
      <text x="540" y="215" textAnchor="middle" fontSize="22" letterSpacing="4" fill={C.muted}>TONIGHT, I WAS</text>
      <text textAnchor="middle" fontWeight="700" fontSize="98" letterSpacing="-4.5" fill={C.ink}>{persona.title.map((line,i)=><tspan key={line} x="540" y={318+i*103}>{line}{i===0?' ':''}</tspan>)}</text>
      <text x="540" y="490" textAnchor="middle" fontSize="29" fill={C.muted}>{persona.line}</text>
      <g transform="translate(140 520)"><RecapCharacterArt kind={persona.kind} direction={direction}/></g>
    </>}
    <g transform={`translate(80 ${pocket ? 1203 : 1178})`}>
      <rect width="920" height={pocket ? 194 : 213} rx="28" fill={pocket ? C.lilac : C.ink}/>
      <text x="44" y={pocket ? 49 : 53} fill={pocket ? C.ink : C.lilac} fontSize="20" letterSpacing="2.5">{persona.result === undefined ? 'GOOD COMPANY. GOOD STORY.' : 'MY NET RESULT'}</text>
      <text x="44" y={pocket ? 148 : 158} fontSize={persona.result === undefined ? 65 : characterMoney(persona.result, true).length > 12 ? 48 : characterMoney(persona.result, true).length > 9 ? 65 : 87} fontWeight="700" style={{ fontVariantNumeric: 'tabular-nums' }} letterSpacing="-3" fill={pocket ? C.ink : 'white'}>{persona.result === undefined ? 'You had to be there.' : characterMoney(persona.result, true)}</text>
      <g transform={`translate(842 ${pocket ? 97 : 106.5}) rotate(12)`} opacity=".65" aria-hidden="true">
        <circle r="35" fill="none" stroke={pocket ? C.ink : C.lilac} strokeWidth="2"/>
        <path d={CHARACTER_SPADE} transform="translate(-18 -19) scale(1.5)" fill={pocket ? C.ink : C.lilac}/>
      </g>
    </g>
    <text x="540" y="1450" textAnchor="middle" fontSize="25" fill={C.muted}>{persona.evidence}</text>
    {stats.map((stat,i)=><g key={stat.label} transform={`translate(${80+(i%2)*476} ${1494+Math.floor(i/2)*96})`}>
      <line x2="444" stroke={C.line} strokeWidth="2"/><text y="30" fontSize="18" letterSpacing="2" fill={C.muted}>{stat.label}</text><text y="77" fontSize="41" fontWeight="600" letterSpacing="-1" fill={C.ink}>{stat.value}</text>
    </g>)}
    <g transform="translate(80 1740)">
      <line x2="920" stroke={C.line} strokeWidth="2"/>
      <text y="68" fill={C.ink} fontSize="35" fontWeight="600" letterSpacing="-1">Good nights make great characters.</text>
      <text y="117" fill={C.muted} fontSize="24">Find yours after your next home game.</text>
      <g transform="translate(710 92)">
        <text x="174" y="25" textAnchor="end" fill={C.ink} fontSize="30" fontWeight="600" letterSpacing="-.8">mainpot.app</text>
        <path d="m190 24 20-20m-17 0h17v17" fill="none" stroke={C.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </g>
    </g>
  </svg>;
});
export default CharacterStoryCard;
