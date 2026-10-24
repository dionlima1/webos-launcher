// Minimal Luna (LS2) bridge. webOS injects `PalmServiceBridge` into every web app;
// each call gets its own bridge object and answers on `onservicecallback`.

import {TIMING} from '../config/constants';

interface PalmServiceBridgeInstance {
	onservicecallback: ((message: string) => void) | null;
	call (uri: string, params: string): void;
	cancel? (): void;
}

declare global {
	interface Window {
		PalmServiceBridge?: new () => PalmServiceBridgeInstance;
	}
}

export interface LunaResponse {
	returnValue?: boolean;
	errorCode?: number | string;
	errorText?: string;
	[key: string]: unknown;
}

export function isWebOS (): boolean {
	return typeof window.PalmServiceBridge === 'function';
}

/** Subscription: `onMessage` gets every response until the returned cancel function is
 *  called. `onError` fires once (bridge error, returnValue:false or bad JSON) and the
 *  subscription is over; the caller decides whether to subscribe again. */
export function lunaSubscribe<T extends LunaResponse = LunaResponse> (uri: string, params: object, onMessage: (data: T) => void, onError: (error: Error) => void): () => void {
	const Bridge = window.PalmServiceBridge;
	if (!Bridge) { onError(new Error('Not running on webOS')); return () => undefined; }
	const bridge = new Bridge();
	let done = false;
	const cancel = () => {
		if (done) return;
		done = true;
		try { bridge.cancel && bridge.cancel(); } catch { /* ignore */ }
	};
	bridge.onservicecallback = (message) => {
		if (done) return;
		let data: T;
		try { data = JSON.parse(message) as T; }
		catch (e) { cancel(); onError(e as Error); return; }
		if (data.returnValue === false) { cancel(); onError(new Error(data.errorText || `${uri} failed`)); return; }
		onMessage(data);
	};
	try { bridge.call(uri, JSON.stringify({...params, subscribe: true})); }
	catch (e) { cancel(); onError(e as Error); }
	return cancel;
}

/** One-shot call. Resolves with the parsed payload; rejects on returnValue:false,
 *  a bridge error, malformed JSON or timeout. */
export function lunaCall<T extends LunaResponse = LunaResponse> (uri: string, params: object = {}, timeoutMs: number = TIMING.lunaTimeoutMs): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const Bridge = window.PalmServiceBridge;
		if (!Bridge) { reject(new Error('Not running on webOS')); return; }

		const bridge = new Bridge();
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timer);
			try { bridge.cancel && bridge.cancel(); } catch { /* ignore */ }
			fn();
		};
		const timer = window.setTimeout(() => finish(() => reject(new Error(`Timed out: ${uri}`))), timeoutMs);

		bridge.onservicecallback = (message) => {
			let data: T;
			try { data = JSON.parse(message) as T; }
			catch (e) { finish(() => reject(e as Error)); return; }
			if (data.returnValue === false) {
				finish(() => reject(new Error(data.errorText || `${uri} failed`)));
			} else {
				finish(() => resolve(data));
			}
		};

		try { bridge.call(uri, JSON.stringify(params)); }
		catch (e) { finish(() => reject(e as Error)); }
	});
}
