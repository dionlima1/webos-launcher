// "Neste dia": what happened on today's date in other years, from Wikipedia in
// Portuguese (Wikimedia's feed API, free and CORS-enabled). The day's list is kept in
// memory, so it's fetched once a day.

import {FEED} from '../config/constants';
import {getJson} from './web';

export interface HistoryEvent {
	year: number;
	text: string;
	/** a picture from the event's main article, if it has one */
	image: string | null;
	/** that article's title, for the caption */
	article: string;
}

interface FeedPage {
	normalizedtitle?: string;
	titles?: {normalized?: string};
	thumbnail?: {source: string; width: number; height: number};
	originalimage?: {source: string; width: number; height: number};
}

interface FeedEvent {
	year: number;
	text: string;
	pages?: FeedPage[];
}

interface FeedResponse {
	selected?: FeedEvent[];
	events?: FeedEvent[];
}

let cache: {day: string; events: HistoryEvent[]} | null = null;

/** Today's events: Wikipedia's own selection first, then the rest; those with a picture
 *  before those without. */
export function fetchOnThisDay (now: Date = new Date()): Promise<HistoryEvent[]> {
	const mm = pad(now.getMonth() + 1);
	const dd = pad(now.getDate());
	const day = `${mm}-${dd}`;
	if (cache && cache.day === day) return Promise.resolve(cache.events);
	return Promise.all([
		getJson<FeedResponse>(`${FEED.onThisDay}selected/${mm}/${dd}`).catch(() => ({} as FeedResponse)),
		getJson<FeedResponse>(`${FEED.onThisDay}events/${mm}/${dd}`).catch(() => ({} as FeedResponse))
	]).then(([selected, rest]) => {
		const seen: Record<string, boolean> = {};
		const all = (selected.selected || []).concat(rest.events || [])
			.filter((e) => { const key = `${e.year}:${e.text}`; if (seen[key]) return false; seen[key] = true; return true; })
			.map(toEvent);
		if (!all.length) throw new Error('Nothing for today');
		const events = all.filter((e) => e.image).concat(all.filter((e) => !e.image));
		cache = {day, events};
		return events;
	});
}

function toEvent (e: FeedEvent): HistoryEvent {
	const page = (e.pages || []).find((p) => p.thumbnail || p.originalimage) || (e.pages || [])[0];
	return {
		year: e.year,
		// Wikipedia's selection mentions its own picture: "(imagem com a sede da ONU)"
		text: e.text.replace(/\s*\((na )?imagem[^)]*\)/gi, ''),
		image: page ? imageOf(page) : null,
		article: page ? (page.normalizedtitle || (page.titles && page.titles.normalized) || '') : ''
	};
}

/** A version of the article's picture about 1280 px wide. */
function imageOf (page: FeedPage): string | null {
	const original = page.originalimage;
	if (original && original.width <= 1600 && !/\.svg$/i.test(original.source)) return original.source;
	const thumb = page.thumbnail;
	if (!thumb) return null;
	return /\/\d+px-/.test(thumb.source) ? thumb.source.replace(/\/\d+px-/, '/1280px-') : thumb.source;
}

function pad (n: number): string {
	return n < 10 ? `0${n}` : String(n);
}
