// Getting an album video ready to play. On the TV our service downloads it and serves
// it back over loopback (services/album/video.js), because Google's download can't be
// streamed by the TV's player. In a desktop browser the dev server does the same.

import {FEED, LUNA} from '../config/constants';
import type {Photo} from './album';
import {isWebOS, lunaSubscribe, type LunaResponse} from './luna';

interface PrepareResponse extends LunaResponse {
	received?: number;
	total?: number;
	ready?: boolean;
	src?: string;
}

/** Calls `onProgress(0…1)` while downloading, then `onReady(src)` or `onError`.
 *  Returns a function that stops waiting. */
export function prepareVideo (photo: Photo, onProgress: (fraction: number) => void, onReady: (src: string) => void, onError: (error: Error) => void): () => void {
	if (!isWebOS()) {
		onReady(`${FEED.videoDev}?url=${encodeURIComponent(photo.url)}`);
		return () => undefined;
	}
	let cancel = () => undefined as void;
	cancel = lunaSubscribe<PrepareResponse>(LUNA.prepareVideo, {url: photo.url}, (r) => {
		if (r.ready && r.src) { cancel(); onReady(r.src); return; }
		if (r.total) onProgress(Math.min(1, (r.received || 0) / r.total));
	}, onError);
	return () => cancel();
}

/** "0:32", "1:05" */
export function durationText (ms: number): string {
	const seconds = Math.round(ms / 1000);
	const rest = seconds % 60;
	return `${Math.floor(seconds / 60)}:${rest < 10 ? '0' : ''}${rest}`;
}
