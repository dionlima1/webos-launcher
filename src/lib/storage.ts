// The user's choices: which apps and which inputs appear on the home rows, in order,
// plus options. Persisted in localStorage (private to this app on the TV).

import {STORAGE_KEY} from '../config/constants';
import {DEFAULT_APP_IDS} from '../config/catalog';

export interface UserConfig {
	/** ordered app IDs for the Apps row (the catalogue's choice; Início shows every app
	 *  except hiddenAppIds instead) */
	appIds: string[];
	/** installed apps kept off the home screen */
	hiddenAppIds: string[];
	/** ordered input appIds (com.webos.app.hdmiN) for the Sources row; null → all inputs */
	sourceIds: string[] | null;
	/** read the live app list through the Homebrew Channel (root). Off by default. */
	useHomebrew: boolean;
	/** use the TV's own app list and LG's icons (SSAP; the TV asks permission once). On by default. */
	useTvApps: boolean;
}

export const DEFAULT_CONFIG: UserConfig = {
	appIds: DEFAULT_APP_IDS.slice(),
	hiddenAppIds: [],
	sourceIds: null,
	useHomebrew: false,
	useTvApps: true
};

export function loadConfig (): UserConfig {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {...DEFAULT_CONFIG};
		const parsed = JSON.parse(raw) as Partial<UserConfig>;
		return {
			appIds: Array.isArray(parsed.appIds) ? parsed.appIds : DEFAULT_CONFIG.appIds,
			hiddenAppIds: Array.isArray(parsed.hiddenAppIds) ? parsed.hiddenAppIds : [],
			sourceIds: Array.isArray(parsed.sourceIds) ? parsed.sourceIds : null,
			useHomebrew: parsed.useHomebrew === true,
			useTvApps: parsed.useTvApps !== false
		};
	} catch {
		return {...DEFAULT_CONFIG};
	}
}

export function saveConfig (config: UserConfig): void {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }
	catch { /* nothing sensible to do on a TV */ }
}

/** Toggle an ID in an ordered list: remove if present, else append. */
export function toggleId (ids: string[], id: string): string[] {
	return ids.indexOf(id) === -1 ? ids.concat(id) : ids.filter((x) => x !== id);
}
