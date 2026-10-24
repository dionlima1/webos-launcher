// Example of local home-screen settings. Copy to home.local.ts (git-ignored) and edit.
// Every export is optional. Rebuild after changing it.

import type {Place} from './home';

/** Weather and the radar map are centred here. */
export const PLACE: Place = {name: 'São Paulo', lat: -23.55, lon: -46.63};

/** A Google Photos album shared by link. Anyone with this link can see the album,
 *  which is why it lives in this git-ignored file. */
export const ALBUM_URL = 'https://photos.app.goo.gl/XXXXXXXXXXXXXXXXX';

/** Tile order until usage history takes over. Inputs are their app IDs
 *  (com.webos.app.hdmi1 … hdmi4, com.webos.app.livetv). */
export const START_ORDER: string[] = [
	'com.webos.app.hdmi1', 'youtube.leanback.v4', 'netflix'
];

/** Shorter names for tiles whose own name doesn't fit. */
export const LABELS: Record<string, string> = {
	'com.webos.app.hdmi1': 'Console'
};
