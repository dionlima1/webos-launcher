// Adapters from data (apps, inputs) to what the Tile component draws.

import type {AppEntry} from './apps';
import type {InputSource} from './inputs';
import type {TileModel} from '../components/Tile';

const INPUT_ICON_DIR = 'icons/inputs/';

export function appTile (app: AppEntry): TileModel {
	return {key: app.id, label: shortTitle(app.title), imageUrl: app.iconUrl, color: app.color};
}

/** "discovery+ : O Streaming que é Vida Real e Muito Mais" → "discovery+": some apps put
 *  a slogan in their title, which a tile label can't fit. */
function shortTitle (title: string): string {
	return title.split(/\s+[:|–—-]\s+/)[0];
}

export function inputTile (input: InputSource): TileModel {
	return {key: input.appId, label: input.label, glyphImageUrl: INPUT_ICON_DIR + input.icon};
}

/** Order `items` by an ID list, dropping IDs that no longer exist. */
export function pickInOrder<T> (items: T[], ids: string[], idOf: (item: T) => string): T[] {
	const byId: Record<string, T> = {};
	for (const item of items) byId[idOf(item)] = item;
	return ids.map((id) => byId[id]).filter((x): x is T => x !== undefined);
}
