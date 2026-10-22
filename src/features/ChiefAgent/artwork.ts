/**
 * White-label Chief Agent artwork.
 *
 * Upstream ships 16 LobeHub-hosted mascot pairs (avatar + hero) fetched from
 * `OPS_ASSETS_BASE_URL`. This deployment replaces the whole catalog with the
 * Unionclin brand mascot served from the app's own `public/brand`, so no
 * artwork request leaves our origin and the artwork studio shows a single
 * brand identity instead of 16 upstream characters.
 *
 * Keep the exported shape stable: `HomePortrait`, `ArtworkStudio` and
 * `ArtworkStudio/styleReferences` all read this module.
 */
export interface ChiefAgentArtwork {
  avatar: string;
  hero: string;
  id: string;
  tint: string;
}

const BRAND_ARTWORK: ChiefAgentArtwork = {
  avatar: '/brand/chief-avatar.png',
  hero: '/brand/chief-hero.webp',
  // `lobe` is the id remaining modules fall back to (artwork studio default,
  // style reference lookup), so it stays as the single entry's id.
  id: 'lobe',
  tint: '#1685EC',
};

export const CHIEF_AGENT_ARTWORKS: ChiefAgentArtwork[] = [BRAND_ARTWORK];

export const DEFAULT_CHIEF_AGENT_ARTWORK = BRAND_ARTWORK;

export const resolveChiefAgentArtwork = (avatar?: string): ChiefAgentArtwork =>
  CHIEF_AGENT_ARTWORKS.find((item) => item.avatar === avatar) ?? DEFAULT_CHIEF_AGENT_ARTWORK;
