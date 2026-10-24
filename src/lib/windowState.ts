// What the window shows, remembered across starts: if it was left on one album's photos
// in full screen, that's how the next start opens.

import {WINDOW_KEY} from '../config/constants';

export type ViewId = 'satellite' | 'radar' | 'planes' | 'photos' | 'history';
/** 'auto' cycles through the views; a view on its own stays put. */
export type WindowMode = 'auto' | ViewId;

export const MODES: WindowMode[] = ['auto', 'satellite', 'radar', 'planes', 'photos', 'history'];

export const MODE_LABEL: Record<WindowMode, string> = {auto: 'Automático', satellite: 'Satélite', radar: 'Radar', planes: 'Aviões', photos: 'Fotos', history: 'Neste dia'};

export interface WindowState {
	mode: WindowMode;
	fullscreen: boolean;
	/** the album chosen in the album panel (its link); null shows every album, shuffled */
	album: string | null;
}

export function loadWindowState (): WindowState {
	try {
		const s = JSON.parse(localStorage.getItem(WINDOW_KEY) || '{}') as Partial<WindowState>;
		return {
			mode: s.mode && MODES.indexOf(s.mode) !== -1 ? s.mode : 'auto',
			fullscreen: s.fullscreen === true,
			album: typeof s.album === 'string' ? s.album : null
		};
	} catch {
		return {mode: 'auto', fullscreen: false, album: null};
	}
}

export function saveWindowState (state: WindowState): void {
	try { localStorage.setItem(WINDOW_KEY, JSON.stringify(state)); }
	catch { /* nothing sensible to do on a TV */ }
}

/** The next (or previous) mode, wrapping around. */
export function stepMode (mode: WindowMode, delta: number): WindowMode {
	const i = MODES.indexOf(mode);
	return MODES[(i + delta + MODES.length) % MODES.length];
}
