import { forwardRef } from 'react';
import CharacterStoryCard from './exploration/CharacterStoryCard';
import type { RecapData, RecapMode, RecapPrivacy } from '@/lib/recap';

interface RecapStoryCardProps {
  data: RecapData;
  privacy: RecapPrivacy;
  mode: RecapMode;
  decorative?: boolean;
  featuredPlayerId?: string;
}

/** The same automatic, privacy-safe character powers the preview and export. */
const RecapStoryCard = forwardRef<SVGSVGElement, RecapStoryCardProps>(function RecapStoryCard(
  { data, privacy, decorative, featuredPlayerId }, ref,
) {
  return <CharacterStoryCard ref={ref} data={data} privacy={privacy} featuredPlayerId={featuredPlayerId}
    direction="society" decorative={decorative}/>;
});

export default RecapStoryCard;
