// Keeps the launcher connected to the phone album manager in our JS service
// (services/album/manager.js): hands it the current album list, and hears back the
// manager's address (for the QR code) and every edit made from the phone.

import {LUNA, TIMING} from '../config/constants';
import type {AlbumRef} from './album';
import {isWebOS, lunaCall, lunaSubscribe, type LunaResponse} from './luna';

interface ManagerResponse extends LunaResponse {
	url?: string;
	albums?: AlbumRef[];
}

/** Subscribes, and subscribes again after a failure (the service may have been
 *  restarted). Returns a function that ends it all. */
export function connectAlbumManager (getAlbums: () => AlbumRef[], onAddress: (url: string) => void, onAlbums: (albums: AlbumRef[]) => void): () => void {
	if (!isWebOS()) return () => undefined;
	let cancel: () => void = () => undefined;
	let retry = 0;
	let stopped = false;
	let first = true;

	const connect = () => {
		first = true;
		cancel = lunaSubscribe<ManagerResponse>(LUNA.albumManager, {albums: getAlbums()}, (r) => {
			if (r.url) onAddress(r.url);
			// The first answer echoes the list we sent; later ones are edits from the phone.
			if (!first && Array.isArray(r.albums)) onAlbums(r.albums);
			first = false;
		}, () => {
			if (!stopped) retry = window.setTimeout(connect, TIMING.retryMs);
		});
	};
	connect();
	return () => { stopped = true; window.clearTimeout(retry); cancel(); };
}

/** Tell the manager about a change made on the TV side (e.g. titles filled in once the
 *  albums were read), so the phone page lists them properly. */
export function pushAlbumsToManager (albums: AlbumRef[]): void {
	if (!isWebOS()) return;
	lunaCall(LUNA.albumManager, {albums}).catch(() => { /* the next subscription sends them anyway */ });
}
