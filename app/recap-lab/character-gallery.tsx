import RecapCharacterArt from '@/components/Settlement/exploration/RecapCharacterArt';
import type { CharacterDirection, CharacterKind } from '@/lib/recap-characters';

const characters: { kind: CharacterKind; name: string }[] = [
  { kind: 'mayor', name: 'Mayor of Value Town' },
  { kind: 'sponsor', name: 'The Table Sponsor' },
  { kind: 'baron', name: 'The Break-Even Baron' },
  { kind: 'social', name: 'The Table Celebrity' },
  { kind: 'encore', name: 'The Encore Artist' },
  { kind: 'marathoner', name: 'The Felt Marathoner' },
  { kind: 'correspondent', name: 'The Group Chat Correspondent' },
];

const directions: { direction: CharacterDirection; name: string }[] = [
  { direction: 'society', name: 'The Felt Society' },
  { direction: 'pocket', name: 'Pocket Legends' },
];

export default function CharacterGallery() {
  return <section aria-label="All character designs" className="mb-12 space-y-10">
    <p className="text-sm leading-6 text-gray-500">All seven characters, in both design directions.</p>
    {directions.map(({ direction, name }) => <section key={direction} aria-label={`${name} designs`}>
      <h2 className="mb-4 text-lg font-semibold tracking-tight">{name}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {characters.map(character => <figure key={character.kind} className="rounded-2xl border border-[#dedfdc] bg-white p-3 sm:p-4">
          <svg viewBox="0 0 800 620" aria-hidden="true" className="w-full">
            <RecapCharacterArt kind={character.kind} direction={direction}/>
          </svg>
          <figcaption className="mt-3 text-sm font-semibold leading-5 text-[#202421]">{character.name}</figcaption>
        </figure>)}
      </div>
    </section>)}
  </section>;
}
