import {useEffect, useRef, useState} from 'preact/hooks';
import {TIMING} from '../config/constants';

/** Calls `fn` once, `ms` after `active` becomes true (or `restartKey` changes).
 *  Pausing (active false) cancels it; resuming starts the full delay again. */
export function useTimeout (active: boolean, ms: number, fn: () => void, restartKey: unknown = null): void {
	const latest = useRef(fn);
	latest.current = fn;
	useEffect(() => {
		if (!active) return;
		const id = window.setTimeout(() => latest.current(), ms);
		return () => window.clearTimeout(id);
	}, [active, ms, restartKey]);
}

/** Whether the app is on screen (false while another app is in front). */
export function usePageVisible (): boolean {
	const [visible, setVisible] = useState(() => !document.hidden);
	useEffect(() => {
		const sync = () => setVisible(!document.hidden);
		// On the TV the app can come to the front between the first render and this
		// effect, and that visibilitychange would be missed.
		sync();
		document.addEventListener('visibilitychange', sync);
		document.addEventListener('webOSRelaunch', sync);
		return () => {
			document.removeEventListener('visibilitychange', sync);
			document.removeEventListener('webOSRelaunch', sync);
		};
	}, []);
	return visible;
}

/** While `enabled`, runs `load` now and then every `everyMs`, and at once whenever
 *  `restartKey` changes. A failure is retried sooner (TIMING.retryMs, doubling), so a
 *  hiccup at launch doesn't leave a gap for the whole interval. */
export function usePolling (enabled: boolean, everyMs: number, load: () => Promise<unknown>, restartKey: unknown = null): void {
	const latest = useRef(load);
	latest.current = load;
	useEffect(() => {
		if (!enabled) return;
		let alive = true;
		let timer = 0;
		let failures = 0;
		const schedule = (ms: number) => { if (alive) timer = window.setTimeout(run, ms); };
		function run () {
			latest.current().then(
				() => { failures = 0; schedule(everyMs); },
				() => { failures++; schedule(Math.min(everyMs, TIMING.retryMs * Math.pow(2, failures - 1))); }
			);
		}
		run();
		return () => { alive = false; window.clearTimeout(timer); };
	}, [enabled, everyMs, restartKey]);
}
