// Photos from Google Photos albums shared by link. On the TV our JS service reads each
// album page (services/album); in a desktop browser the dev server does. The last list
// of each album is kept in localStorage so photos show straight away after a restart.
//
// Which albums: the list the phone edits through the album manager (lib/albumManager.ts),
// saved here as AlbumRefs. On first run it starts with ALBUM_URL from home.local.ts.

import {ALBUM_CACHE_KEY, ALBUMS_KEY, FEED, LUNA, TIMING} from '../config/constants';
import {ALBUM_URL} from '../config/home';
import {isWebOS, lunaCall, type LunaResponse} from './luna';
import {getJson} from './web';

export interface Photo {
	/** base URL; a size suffix is appended to fetch it (see photoUrl) */
	url: string;
	w: number;
	h: number;
	/** capture time in the place it was taken, to be read with UTC getters */
	taken: number | null;
	/** short title of the album it came from */
	album?: string;
	/** link of the album it came from */
	albumUrl?: string;
	/** videos only: length in milliseconds */
	video?: number;
}

export interface Album {
	url: string;
	title: string;
	photos: Photo[];
	fetchedAt: number;
}

/** An album on the TV's list, as the phone page shows it. */
export interface AlbumRef {
	url: string;
	title: string;
	count: number;
}

interface AlbumResponse extends LunaResponse {
	title?: string;
	photos?: Photo[];
}

// ---------- the list of albums ----------

export function loadAlbumRefs (): AlbumRef[] {
	try {
		const stored = JSON.parse(localStorage.getItem(ALBUMS_KEY) || 'null') as AlbumRef[] | null;
		if (Array.isArray(stored)) return stored;
	} catch { /* fall through to the default */ }
	return ALBUM_URL ? [{url: ALBUM_URL, title: '', count: 0}] : [];
}

export function saveAlbumRefs (refs: AlbumRef[]): void {
	try { localStorage.setItem(ALBUMS_KEY, JSON.stringify(refs)); }
	catch { /* nothing sensible to do on a TV */ }
}

// ---------- the photos of one album ----------

function readCache (): Record<string, Album> {
	try { return JSON.parse(localStorage.getItem(ALBUM_CACHE_KEY) || '{}') || {}; }
	catch { return {}; }
}

/** Keeps only the albums still on the list, so removed ones don't pile up. */
function writeCache (cache: Record<string, Album>, keep: string[]): void {
	const trimmed: Record<string, Album> = {};
	for (const url of keep) if (cache[url]) trimmed[url] = cache[url];
	try { localStorage.setItem(ALBUM_CACHE_KEY, JSON.stringify(trimmed)); }
	catch { /* quota: albums will simply be fetched again */ }
}

/** A fresh list when the cached one is old (or `force`); the cached one if the fetch fails. */
function loadAlbum (url: string, cache: Record<string, Album>, now: number, force: boolean): Promise<Album> {
	const cached = cache[url];
	if (cached && !force && now - cached.fetchedAt < TIMING.albumRefreshMs) return Promise.resolve(cached);
	const request: Promise<AlbumResponse> = isWebOS()
		? lunaCall<AlbumResponse>(LUNA.albumList, {url}, TIMING.albumTimeoutMs)
		: getJson<AlbumResponse>(`${FEED.albumDev}?url=${encodeURIComponent(url)}`, TIMING.albumTimeoutMs);
	return request.then((r) => {
		const title = r.title || '';
		const photos = (r.photos || []).map((p) => ({...p, album: shortTitle(title)}));
		if (!photos.length) throw new Error('The album has no photos (or Google changed the page)');
		return {url, title, photos, fetchedAt: now};
	}).catch((error) => {
		if (cached) return cached;
		throw error;
	});
}

/** Every photo of every album on the list. Rejects only when none could be read, so a
 *  single broken album doesn't hide the others. `force` re-reads even fresh lists (the
 *  photos stopped loading, so the links Google gave out may no longer work). */
export function loadPhotos (refs: AlbumRef[], force: boolean = false, now: number = Date.now()): Promise<Photo[]> {
	if (!refs.length) return Promise.resolve([]);
	const cache = readCache();
	const results = refs.map((ref) => loadAlbum(ref.url, cache, now, force).then((album) => { cache[ref.url] = album; return album; }, () => null));
	return Promise.all(results).then((albums) => {
		writeCache(cache, refs.map((r) => r.url));
		const found = albums.filter((a): a is Album => a !== null);
		if (!found.length) throw new Error('No album could be read');
		return found.reduce<Photo[]>((all, a) => all.concat(withAlbumUrl(a)), []);
	});
}

/** `refs` with title and photo count filled in from the cache (the album from
 *  home.local.ts starts without them). Returns the same array when nothing changed. */
export function describeAlbumRefs (refs: AlbumRef[]): AlbumRef[] {
	const cache = readCache();
	let changed = false;
	const described = refs.map((ref) => {
		const album = cache[ref.url];
		if (!album || (ref.title === album.title && ref.count === album.photos.length)) return ref;
		changed = true;
		return {url: ref.url, title: album.title, count: album.photos.length};
	});
	return changed ? described : refs;
}

/** The cached photos, to show something before the first fetch finishes. */
export function cachedPhotos (refs: AlbumRef[]): Photo[] {
	const cache = readCache();
	return refs.reduce<Photo[]>((all, ref) => (cache[ref.url] ? all.concat(withAlbumUrl(cache[ref.url])) : all), []);
}

function withAlbumUrl (album: Album): Photo[] {
	return album.photos.map((p) => (p.albumUrl === album.url ? p : {...p, albumUrl: album.url}));
}

/** One album's photos in the order they were taken (undated ones last). */
export function photosOfAlbum (photos: Photo[], albumUrl: string): Photo[] {
	return photos
		.filter((p) => p.albumUrl === albumUrl)
		.sort((a, b) => (a.taken === null ? 1 : b.taken === null ? -1 : a.taken - b.taken));
}

/** Google serves any size on request: "=w<width>-h<height>" fits the photo inside. */
export function photoUrl (photo: Photo, width: number, height: number): string {
	return `${photo.url}=w${Math.round(width)}-h${Math.round(height)}`;
}

/** "Paris, Londres e Normandia 2025 · 1 – 13 de out. de 2025 📸" → the part before " · ". */
export function shortTitle (title: string): string {
	return title.split(' · ')[0].trim();
}
