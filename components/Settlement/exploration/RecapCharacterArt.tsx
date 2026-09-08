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

/** Original vector family, drawn in a shared 800 x 620 illustration space. */
export default function RecapCharacterArt({kind, direction}: {kind:CharacterKind; direction:CharacterDirection}) {
  const pocket = direction === 'pocket';
  return <g strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="400" cy="568" rx="219" ry="23" fill={ink} opacity=".06"/>
    <circle cx="400" cy="300" r="255" fill={lilac} opacity={pocket ? '.38' : '.5'}/>
    <circle cx="400" cy="300" r="283" fill="none" stroke={ink} strokeOpacity=".07" strokeDasharray={pocket ? '3 16' : undefined}/>
    <g transform={`translate(400 308) rotate(${kind === 'sponsor' ? 7 : -7})`}>
      {/* Shoes and elastic limbs give the entire family the same silhouette. */}
      <g fill="none" stroke={ink} strokeWidth="13">
        <path d="M-68 157q-18 45-9 81M64 157q13 45 3 81"/>
        <path d={kind === 'sponsor' ? 'M-133 0q-87 30-88-27M133 0q78 28 98-32' : 'M-133 0q-93 18-90-72M133 0q73 52 86 4'}/>
      </g>
      <path d="M-81 222q-42 2-48 25q24 15 68 0l-1-25M64 222q44 0 51 24q-24 16-68 0l-1-24" fill={ink}/>
      <g fill="white" stroke={ink} strokeWidth="5">
        <path d="M-226-61q-21-4-26-22q-3-17 9-20q10-2 16 16q-9-29 5-32q14 0 17 29q1-19 13-16q19 8-8 40Z"/>
        <path d="M216 5q13 20 30 4q17-19 7-26q-9-5-21 8q14-27 1-32q-13-1-19 26q-5-13-15-6q-11 14 17 26Z"/>
      </g>
      {pocket ? <>
        <circle cy="8" r="174" fill={ink}/><circle r="174" fill={lilac} stroke={ink} strokeWidth="5"/>
        <circle r="151" fill="none" stroke="white" strokeWidth="19" strokeDasharray="31 28"/>
        <circle r="128" fill="#f7f8f6" stroke={ink} strokeWidth="3"/>
      </> : <>
        <rect x="-140" y="-174" width="292" height="376" rx="38" fill={ink} opacity=".12"/>
        <rect x="-146" y="-184" width="292" height="376" rx="38" fill="white" stroke={ink} strokeWidth="5"/>
        <text x="-116" y="-130" fontSize="40" fontWeight="600" fill={ink}>A</text>
        <text x="106" y="156" fontSize="40" fontWeight="600" fill={ink} transform="rotate(180 106 142)">A</text>
      </>}
      {/* One suit per playing card; the face sits above, never replaces the suit. */}
      <path d={kind === 'sponsor' ? heart : CHARACTER_SPADE} fill={kind === 'sponsor' ? '#ad6170' : ink} transform="translate(-40 18) scale(3.35)"/>
      <g fill={ink}>
        {kind === 'encore' ? <path d="M-54-57q16-19 32 0" fill="none" stroke={ink} strokeWidth="6"/> : <ellipse cx="-38" cy="-60" rx="10" ry="21"/>}<ellipse cx="38" cy="-60" rx="10" ry="21"/>
      </g>
      <path d={kind === 'baron' ? 'M-20-22h40' : 'M-24-30q24 25 48 0'} fill="none" stroke={ink} strokeWidth="5"/>
      {kind === 'mayor' && <>
        <path d="M-114-173l14-90h180l21 90Z" fill={ink}/><path d="M-142-172q135-28 262 0" stroke={ink} strokeWidth="19"/>
        <path d="M-104-204h193" stroke={lilac} strokeWidth="21"/>
        <path d="M-141 88l183 101h82l-265-151Z" fill={lilac}/>
        <circle cx="-94" cy="105" r="18" fill={ink}/><path d="m-101 105 5 5 9-11" fill="none" stroke="white" strokeWidth="3"/>
      </>}
      {kind === 'sponsor' && <>
        <path d="M-38-122v-38l38 19 38-19v38l-38-18Z" fill={ink}/><circle cy="-141" r="10" fill={lilac}/>
        <path d="M-265-36h109" stroke={ink} strokeWidth="7"/><LittleChip x={-210} y={-77} scale={.7} angle={27}/>
      </>}
      {kind === 'baron' && <>
        <circle cx="38" cy="-60" r="31" fill="none" stroke={ink} strokeWidth="4"/>
        <path d="M68-52q55 102 28 163" fill="none" stroke={ink} strokeWidth="3"/>
        <path d="M-105-181v-42l43 16 42-37 42 37 43-16v42Z" fill={lilac} stroke={ink} strokeWidth="5"/>
      </>}
      {kind === 'encore' && <>
        <path d="M-127-175q125-31 252 0l-12 35q-117-28-226 0Z" fill={lilac} stroke={ink} strokeWidth="4"/>
        <path d="m-111-153-54 28 9-43 40-10" fill={lilac} stroke={ink} strokeWidth="4"/>
        <path d="M-137 112q134 51 273 0v45q-135 62-273 0Z" fill={ink}/>
        <path d="m-31 145-20-19v38l20-19 19 19v-38Z" fill={lilac}/>
        <g transform="translate(217 35) rotate(-15)"><rect x="-6" width="12" height="104" rx="6" fill={ink}/><rect x="-6" width="12" height="25" rx="3" fill={lilac}/></g>
      </>}
      {kind === 'marathoner' && <>
        <path d="M-144-173q145-37 289 0v26q-145-36-289 0Z" fill={lilac}/>
        <path d="M-142-163q145-36 285 0" fill="none" stroke="white" strokeWidth="5"/>
        <path d="m133-167 55-14-11 34-37-9 41 38-25 16-28-51" fill={lilac} stroke={ink} strokeWidth="3"/>
        <path d="M-57-178q8-27 29-21m19 14q14-33 33-26m2 33q22-23 39-10" stroke={ink} strokeWidth="6" fill="none"/>
        <g transform="translate(196 23)"><circle r="29" fill="white" stroke={ink} strokeWidth="5"/><path d="M0-16v17l13 7M-7-37H7" stroke={ink} strokeWidth="4" fill="none"/></g>
        <path d="m-110 238 26-4m144 3 24 3" stroke={lilac} strokeWidth="7"/>
      </>}
      {kind === 'correspondent' && <>
        <path d="M-112-179q13-67 107-59q95 9 104 61Z" fill={lilac} stroke={ink} strokeWidth="5"/>
        <path d="M-132-178q155-27 258 5" fill="none" stroke={ink} strokeWidth="10"/>
        <rect x="-39" y="-221" width="74" height="40" rx="5" fill="white" stroke={ink} strokeWidth="3"/>
        <path d="M-21-206H17m-38 12H6" stroke={ink} strokeWidth="4"/>
        <g fill="none" stroke={ink} strokeWidth="4"><circle cx="-38" cy="-60" r="28"/><circle cx="38" cy="-60" r="28"/><path d="M-10-62h20"/></g>
        <g transform="translate(211 37) rotate(12)"><rect x="-30" y="-6" width="69" height="92" rx="8" fill={lilac} stroke={ink} strokeWidth="4"/><path d="M-16 17h39m-39 15h30m-30 15h36" stroke={ink} strokeWidth="3"/><path d="m26-17 7-7 8 7-21 35-9 4 1-10Z" fill="white" stroke={ink} strokeWidth="3"/></g>
      </>}
      {kind === 'social' && <>
        <path d="M-72-78h56l-7 36h-40ZM16-78h56l-9 36H23Z" fill={ink}/><path d="M-16-67h32" stroke={ink} strokeWidth="5"/>
        <path d="M-90-188q92-75 179 0" fill={lilac} stroke={ink} strokeWidth="5"/>
        <path d="M16-193q71-16 115 5" stroke={ink} strokeWidth="9"/>
      </>}
    </g>
    <LittleChip x={134} y={470} angle={-29} dark scale={1.15}/>
    <LittleChip x={674} y={467} angle={24} scale={.88}/>
    <g fill="none" stroke={ink} strokeWidth="3"><path d="M119 172v30m-15-15h30M678 234v24m-12-12h24m-55-139 10-17 10 17-10 17Z"/></g>
    <circle cx="188" cy="299" r="4" fill={ink}/><circle cx="638" cy="122" r="4" fill={ink}/>
  </g>;
}
