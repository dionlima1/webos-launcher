// Small fetch helpers with a timeout (Chrome 79 has fetch but no AbortSignal.timeout).

import {TIMING} from '../config/constants';

export function getText (url: string, timeoutMs: number = TIMING.webTimeoutMs): Promise<string> {
	return withTimeout(fetch(url).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
		return r.text();
	}), timeoutMs, url);
}

export function getJson<T> (url: string, timeoutMs: number = TIMING.webTimeoutMs): Promise<T> {
	return getText(url, timeoutMs).then((text) => JSON.parse(text) as T);
}

/** Resolves once the image is decoded and cached, so swapping it in doesn't flash. */
export function preloadImage (url: string, timeoutMs: number = TIMING.webTimeoutMs): Promise<string> {
	return withTimeout(new Promise<string>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(url);
		img.onerror = () => reject(new Error(`Image failed: ${url}`));
		img.src = url;
	}), timeoutMs, url);
}

function withTimeout<T> (promise: Promise<T>, ms: number, what: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new Error(`Timed out: ${what}`)), ms);
		promise.then(
			(value) => { window.clearTimeout(timer); resolve(value); },
			(error) => { window.clearTimeout(timer); reject(error); }
		);
	});
}
