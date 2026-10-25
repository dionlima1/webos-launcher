// After the TV powers on, the Home button helper has to be started again (it stops
// when the TV is switched off). Our service does that once per power-on (`boot`, in
// services/album/service.js); this sets up the call:
//  - a persistent activity asks the service every minute (5 if the TV won't take 1),
//    also after the TV restarts, so the helper comes back (and opens Início) without
//    anyone opening Início first;
//  - opening Início asks too, so the Home button works again at the latest then.

import {LUNA} from '../config/constants';
import {isWebOS, lunaCall, type LunaResponse} from './luna';

const ACTIVITY = 'io.github.dionlima1.launcher.boot';

export interface BootReport {
	activity: LunaResponse | string;
	boot: LunaResponse | string;
}

/** Sets up the power-on activity and runs the check once now. Never throws; the
 *  report is for debugging (window.__bootReport). */
export function armPowerOn (): Promise<BootReport> {
	if (!isWebOS()) return Promise.resolve({activity: 'not webOS', boot: 'not webOS'});
	const describe = (e: Error) => String(e.message || e);
	// Every minute needs a precise schedule; the TV only takes 5 minutes or more for
	// an ordinary one, so that's the fallback.
	const create = (schedule: object) => lunaCall(LUNA.activityCreate, {
		activity: {
			name: ACTIVITY,
			description: 'Starts the Home button helper after the TV powers on',
			type: {foreground: true, persist: true},
			schedule,
			callback: {method: LUNA.albumBoot, params: {}}
		},
		start: true,
		replace: true,
		subscribe: false
	});
	const activity = create({interval: '1m', precise: true}).then((r) => ({...r, schedule: '1m precise'}))
		.catch(() => create({interval: '5m'}).then((r) => ({...r, schedule: '5m'})))
		.catch(describe);
	const boot = lunaCall(LUNA.albumBoot, {}, 10000).catch(describe);
	return Promise.all([activity, boot]).then(([a, b]) => ({activity: a, boot: b}));
}
