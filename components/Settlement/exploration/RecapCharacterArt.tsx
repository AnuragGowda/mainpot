import { useId } from 'react';
import type { CharacterDirection, CharacterKind } from '@/lib/recap-characters';

const ink = '#202421';
const lilac = '#dce0f6';
export const CHARACTER_SPADE = 'M12 2C9.95 5.6 4 9.02 4 14.13A4.12 4.12 0 0 0 8.12 18.25c1.14 0 2.18-.47 2.94-1.23-.23 1.82-.97 3.23-2.31 4.98h6.5c-1.34-1.75-2.08-3.16-2.31-4.98a4.15 4.15 0 0 0 7.06-2.89C20 9.02 14.05 5.6 12 2Z';
const heart = 'M12 21.25 10.48 19.87C5.08 15 1.5 11.77 1.5 7.8A5.3 5.3 0 0 1 6.85 2.5 5.8 5.8 0 0 1 12 5.48 5.8 5.8 0 0 1 17.15 2.5 5.3 5.3 0 0 1 22.5 7.8c0 3.97-3.58 7.2-8.98 12.08L12 21.25Z';

export function LittleChip({ x, y, angle = 0, dark = false, scale = 1 }: {x:number; y:number; angle?:number; dark?:boolean; scale?:number}) {
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
    <circle cy="5" r="48" fill={ink} opacity=".08"/><circle r="48" fill={dark ? ink : lilac}/>
    <circle r="39" fill="none" stroke="white" strokeWidth="7" strokeDasharray="13 12"/>
    <circle r="29" fill="none" stroke="white" strokeWidth="1.5" opacity=".65"/>
    <path d={CHARACTER_SPADE} transform="translate(-15 -16) scale(1.3)" fill={dark ? 'white' : ink}/>
  </g>;
}

/** Hands are drawn around a shared wrist so poses and props stay connected. */
function Glove({ x, y, grip = false, angle = 0 }: { x: number; y: number; grip?: boolean; angle?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${angle})`} fill="white" stroke={ink} strokeWidth="4">
    {grip ? <>
      <path d="M-10 3C-20-4-20-20-11-25H8C20-25 22-12 15-3L9 3Z"/>
      <path d="M-10-15H4C12-15 12-5 5-4H-2" fill="none"/>
    </> : <>
      <path d="M-11 2C-25-7-34-21-28-27C-23-32-17-26-12-20L-17-41C-19-51-7-54-4-43L1-25L5-45C7-54 19-51 17-41L13-21C20-31 29-28 27-20C24-9 17-2 10 2Z"/>
      <path d="M-7-13Q1-18 8-12" fill="none" strokeWidth="3"/>
    </>}
    <rect x="-12" y="0" width="24" height="10" rx="4"/>
  </g>;
}

/** Original vector family, drawn in a shared 800 x 620 illustration space. */
export default function RecapCharacterArt({kind, direction}: {kind:CharacterKind; direction:CharacterDirection}) {
  const pocket = direction === 'pocket';
  const bodyClip = `recap-body-${useId().replace(/:/g, '')}`;
  const holding = kind === 'encore' || kind === 'marathoner' || kind === 'correspondent';
  return <g strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="400" cy="568" rx="219" ry="23" fill={ink} opacity=".06"/>
    <circle cx="400" cy="300" r="255" fill={lilac} opacity={pocket ? '.38' : '.5'}/>
    <circle cx="400" cy="300" r="283" fill="none" stroke={ink} strokeOpacity=".07" strokeDasharray={pocket ? '3 16' : undefined}/>
    <g transform={`translate(400 308) rotate(${kind === 'sponsor' ? 7 : -7})`}>
      <defs><clipPath id={bodyClip}>
        {pocket ? <circle r="171"/> : <rect x="-143" y="-181" width="286" height="370" rx="35"/>}
      </clipPath></defs>
      {/* Arms end at the wrist; feet and props share the same attachment points. */}
      <g fill="none" stroke={ink} strokeWidth="13">
        <path d="M-68 157q-18 45-9 81M64 157q13 45 3 81"/>
        <path d={kind === 'sponsor' ? 'M-133 0Q-212 32-222-32' : 'M-133 0Q-218 28-222-62'}/>
        <path d="M133 0Q202 51 224 8"/>
      </g>
      <path d="M-81 222q-42 2-48 25q24 15 68 0l-1-25M64 222q44 0 51 24q-24 16-68 0l-1-24" fill={ink}/>
      {kind !== 'sponsor' && <Glove x={-222} y={-62} angle={-12}/>}
      {!holding && <Glove x={224} y={8} angle={18}/>}
      {pocket ? <>
        <circle cy="8" r="174" fill={ink}/><circle r="174" fill={lilac} stroke={ink} strokeWidth="5"/>
        <circle r="151" fill="none" stroke="white" strokeWidth="19" strokeDasharray="31 28"/>
        <circle r="128" fill="#f7f8f6" stroke={ink} strokeWidth="3"/>
      </> : <>
        <rect x="-140" y="-174" width="292" height="376" rx="38" fill={ink} opacity=".12"/>
        <rect x="-146" y="-184" width="292" height="376" rx="38" fill="white" stroke={ink} strokeWidth="5"/>
        <text x="-116" y="-130" fontSize="40" fontWeight="600" fill={ink}>A</text>
        <g transform="rotate(180)"><text x="-116" y="-130" fontSize="40" fontWeight="600" fill={ink}>A</text></g>
      </>}
      {/* One suit per playing card; the face sits above, never replaces the suit. */}
      <path d={kind === 'sponsor' ? heart : CHARACTER_SPADE} fill={kind === 'sponsor' ? '#ad6170' : ink} transform="translate(-40 18) scale(3.35)"/>
      <g fill={ink} visibility={kind === 'social' ? 'hidden' : undefined}>
        {kind === 'encore' ? <path d="M-54-57q16-19 32 0" fill="none" stroke={ink} strokeWidth="6"/> : <ellipse cx="-38" cy="-60" rx="10" ry="21"/>}<ellipse cx="38" cy="-60" rx="10" ry="21"/>
      </g>
      <path d={kind === 'baron' ? 'M-20-22h40' : 'M-24-30q24 25 48 0'} fill="none" stroke={ink} strokeWidth="5"/>
      {kind === 'mayor' && <>
        <path d="M-114-173l14-90h180l21 90Z" fill={ink}/><path d="M-142-172q135-28 262 0" stroke={ink} strokeWidth="19"/>
        <path d="M-104-204h193" stroke={lilac} strokeWidth="21"/>
        <g clipPath={`url(#${bodyClip})`}>
          <path d="M-174 44 154 171 135 205-190 79Z" fill={lilac}/>
          <circle cx="-94" cy="94" r="18" fill={ink}/><path d="m-101 94 5 5 9-11" fill="none" stroke="white" strokeWidth="3"/>
        </g>
      </>}
      {kind === 'sponsor' && <>
        <path d="M-38-122v-38l38 19 38-19v38l-38-18Z" fill={ink}/><circle cy="-141" r="10" fill={lilac}/>
        <g transform="translate(-222 -32)">
          <path d="M-11 6Q-18-10-7-17L21-24Q30-23 25-15L8-6H-5" fill="white" stroke={ink} strokeWidth="4"/>
          <rect x="-13" y="2" width="24" height="10" rx="4" fill="white" stroke={ink} strokeWidth="4"/>
          <path d="M-48-29H58" stroke={ink} strokeWidth="7"/>
          {[0, 1, 2].map(i => <rect key={i} x="-21" y={-43-i*12} width="51" height="12" rx="5" fill={i === 1 ? 'white' : lilac} stroke={ink} strokeWidth="3"/>)}
        </g>
      </>}
      {kind === 'baron' && <>
        <circle cx="38" cy="-60" r="31" fill="none" stroke={ink} strokeWidth="4"/>
        <path d="M68-52q55 102 28 163" fill="none" stroke={ink} strokeWidth="3"/>
        <path d="M-85-169-99-220-51-201 0-241 51-201 99-220 85-169Z" fill={lilac} stroke={ink} strokeWidth="5"/>
      </>}
      {kind === 'encore' && <>
        <g clipPath={`url(#${bodyClip})`}>
          <path d={pocket ? 'M-150-113Q0-205 150-113L150-142Q0-226-150-142Z' : 'M-146-148Q0-180 146-148V-179Q0-211-146-179Z'} fill={lilac} stroke={ink} strokeWidth="4"/>
          <path d="M-174 110Q0 183 174 110V172Q0 224-174 172Z" fill={ink}/>
          <path d="M-5 148-31 131V165L-5 152M5 148 31 131V165L5 152" fill={lilac}/><circle cy="150" r="7" fill={lilac}/>
        </g>
        <g transform="translate(224 8) rotate(18)">
          <rect x="-6" y="-78" width="12" height="132" rx="4" fill={ink}/><rect x="-6" y="-78" width="12" height="24" rx="3" fill={lilac} stroke={ink} strokeWidth="2"/>
        </g>
      </>}
      {kind === 'marathoner' && <>
        <g clipPath={`url(#${bodyClip})`}>
          <path d={pocket ? 'M-150-120Q0-210 150-120L150-148Q0-231-150-148Z' : 'M-146-145Q0-180 146-145V-173Q0-208-146-173Z'} fill={lilac} stroke={ink} strokeWidth="3"/>
          <path d={pocket ? 'M-150-136Q0-222 150-136' : 'M-146-159Q0-194 146-159'} fill="none" stroke="white" strokeWidth="5"/>
        </g>
        <g transform={pocket ? 'translate(113 -119)' : 'translate(140 -159)'} fill={lilac} stroke={ink} strokeWidth="3">
          <path d="M0 0 42-12 31 12Z"/><path d="M0 0 30 36 10 40Z"/>
        </g>
        <g transform="translate(224 57)">
          <path d="M-8-38V-48H8V-38M-8-49H8" stroke={ink} strokeWidth="5" fill="none"/>
          <circle r="29" fill="white" stroke={ink} strokeWidth="5"/><path d="M0-16v17l13 7" stroke={ink} strokeWidth="4" fill="none"/>
        </g>
        <path d="m-110 238 26-4m144 3 24 3" stroke={lilac} strokeWidth="7"/>
      </>}
      {kind === 'correspondent' && <>
        <path d="M-112-179q13-67 107-59q95 9 104 61Z" fill={lilac} stroke={ink} strokeWidth="5"/>
        <path d="M-132-178q155-27 258 5" fill="none" stroke={ink} strokeWidth="10"/>
        <rect x="-39" y="-221" width="74" height="40" rx="5" fill="white" stroke={ink} strokeWidth="3"/>
        <path d="M-21-206H17m-38 12H6" stroke={ink} strokeWidth="4"/>
        <g fill="none" stroke={ink} strokeWidth="4"><circle cx="-38" cy="-60" r="28"/><circle cx="38" cy="-60" r="28"/><path d="M-10-62h20"/></g>
        <g transform="translate(224 8) rotate(8)"><rect x="-30" y="-28" width="69" height="108" rx="8" fill={lilac} stroke={ink} strokeWidth="4"/><path d="M-16 17h39m-39 15h30m-30 15h36" stroke={ink} strokeWidth="3"/><path d="m26-17 7-7 8 7-21 35-9 4 1-10Z" fill="white" stroke={ink} strokeWidth="3"/></g>
      </>}
      {kind === 'social' && <>
        <path d="M-72-78h56l-7 36h-40ZM16-78h56l-9 36H23Z" fill={ink}/><path d="M-16-67h32" stroke={ink} strokeWidth="5"/>
        <path d="M-92-165Q-67-230 7-222Q64-217 88-166Z" fill={lilac} stroke={ink} strokeWidth="5"/>
        <path d="M-2-168Q69-189 126-163Q70-149-2-168Z" fill={ink}/>
        <path d="M7-221Q27-202 27-183" fill="none" stroke={ink} strokeWidth="3"/>
      </>}
      {holding && <Glove x={224} y={8} grip angle={kind === 'encore' ? 18 : 0}/>}
    </g>
    <LittleChip x={134} y={470} angle={-29} dark scale={1.15}/>
    <LittleChip x={674} y={467} angle={24} scale={.88}/>
    <g fill="none" stroke={ink} strokeWidth="3"><path d="M119 172v30m-15-15h30M678 234v24m-12-12h24m-55-139 10-17 10 17-10 17Z"/></g>
    <circle cx="188" cy="299" r="4" fill={ink}/><circle cx="638" cy="122" r="4" fill={ink}/>
  </g>;
}
