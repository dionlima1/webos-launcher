// LG's screensaver. After a while without a key press the TV asks the app in front
// before starting it, and the app may say no (video players do). The launcher says no
// for up to an hour and shows its own ambient view instead; then it lets LG's start.

import {APP_ID, LUNA, TIMING} from '../config/constants';
import {isWebOS, lunaCall, lunaSubscribe, type LunaResponse} from './luna';

interface SaverRequest extends LunaResponse {
	/** echo it back in the answer */
	timestamp?: string;
}

declare global {
	interface Window {
		/** for testing: act as if the TV had asked to start its screensaver */
		__screenSaverRequest?: () => void;
	}
}

/** Calls `onRequest(timestamp)` each time the TV wants to start its screensaver.
 *  Subscribes again after a failure. Returns a function that stops listening. */
export function watchScreenSaver (onRequest: (timestamp: string | null) => void): () => void {
	window.__screenSaverRequest = () => onRequest(null);
	if (!isWebOS()) return () => { delete window.__screenSaverRequest; };
	let cancel: () => void = () => undefined;
	let retry = 0;
	let stopped = false;
	const connect = () => {
		cancel = lunaSubscribe<SaverRequest>(LUNA.screenSaverRequest, {clientName: APP_ID}, (r) => {
			if (r.timestamp) onRequest(r.timestamp);
		}, () => {
			if (!stopped) retry = window.setTimeout(connect, TIMING.retryMs);
		});
	};
	connect();
	return () => { stopped = true; window.clearTimeout(retry); cancel(); delete window.__screenSaverRequest; };
}

/** `allow` false keeps LG's screensaver away (this time). A null timestamp is a test
 *  request (window.__screenSaverRequest) and needs no answer. */
export function answerScreenSaver (timestamp: string | null, allow: boolean): void {
	if (!timestamp || !isWebOS()) return;
	lunaCall(LUNA.screenSaverResponse, {clientName: APP_ID, ack: allow, timestamp}).catch(() => { /* the TV decides on its own */ });
}
