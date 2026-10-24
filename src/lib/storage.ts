// The user's choices: which apps and which inputs appear on the home rows, in order,
// plus options. Persisted in localStorage (private to this app on the TV).

import {STORAGE_KEY} from '../config/constants';
import {DEFAULT_APP_IDS} from '../config/catalog';
import {MODES, type WindowMode} from './windowState';

/** Início's screensaver (the window in full screen) in place of LG's. */
export interface SaverConfig {
	/** false leaves LG's own screensaver as it is */
	enabled: boolean;
	/** minutes without a key before it starts; 0 = when the TV asks (about 2 minutes) */
	startMinutes: number;
	/** 'auto' goes through every view; a single view stays on screen */
	views: WindowMode;
	/** how long each view stays, as a multiple of its usual turn */
	pace: number;
	/** minutes it runs before LG's screensaver may take over */
	maxMinutes: number;
}

/** The choices Settings offers for each screensaver option, in order. */
export const SAVER_CHOICES = {
	startMinutes: [0, 5, 10],
	pace: [0.5, 1, 2, 6],
	maxMinutes: [30, 60, 120, 240]
} as const;

export const DEFAULT_SAVER: SaverConfig = {enabled: true, startMinutes: 0, views: 'auto', pace: 1, maxMinutes: 60};

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
	saver: SaverConfig;
}

export const DEFAULT_CONFIG: UserConfig = {
	appIds: DEFAULT_APP_IDS.slice(),
	hiddenAppIds: [],
	sourceIds: null,
	useHomebrew: false,
	useTvApps: true,
	saver: {...DEFAULT_SAVER}
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
			useTvApps: parsed.useTvApps !== false,
			saver: readSaver(parsed.saver)
		};
	} catch {
		return {...DEFAULT_CONFIG};
	}
}

function readSaver (raw: Partial<SaverConfig> | undefined): SaverConfig {
	const s = raw || {};
	const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.indexOf(value as T) !== -1 ? value as T : fallback);
	return {
		enabled: s.enabled !== false,
		startMinutes: pick(s.startMinutes, SAVER_CHOICES.startMinutes, DEFAULT_SAVER.startMinutes),
		views: pick(s.views, MODES, DEFAULT_SAVER.views),
		pace: pick(s.pace, SAVER_CHOICES.pace, DEFAULT_SAVER.pace),
		maxMinutes: pick(s.maxMinutes, SAVER_CHOICES.maxMinutes, DEFAULT_SAVER.maxMinutes)
	};
}

export function saveConfig (config: UserConfig): void {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }
	catch { /* nothing sensible to do on a TV */ }
}

/** Toggle an ID in an ordered list: remove if present, else append. */
export function toggleId (ids: string[], id: string): string[] {
	return ids.indexOf(id) === -1 ? ids.concat(id) : ids.filter((x) => x !== id);
}
