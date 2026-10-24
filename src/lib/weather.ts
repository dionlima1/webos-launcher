// Current weather, the next hours and how bad it is at PLACE, from Open-Meteo (free, no key).

import {FEED} from '../config/constants';
import type {Place} from '../config/home';
import {getJson} from './web';

export interface HourForecast {
	time: Date;
	temperature: number;
	/** WMO weather code */
	code: number;
	/** chance of rain, 0–100 */
	rainChance: number;
	isDay: boolean;
}

/** 0 settled · 1 rain likely soon · 2 raining · 3 storm or heavy rain. The window's
 *  auto mode shows the radar more, and for longer, the higher this is. */
export type Severity = 0 | 1 | 2 | 3;

export interface Weather {
	temperature: number;
	/** WMO weather code */
	code: number;
	isDay: boolean;
	/** short Portuguese description, e.g. "nublado" */
	text: string;
	severity: Severity;
	/** the hours after this one */
	hours: HourForecast[];
}

interface OpenMeteoResponse {
	current?: {temperature_2m?: number; weather_code?: number; precipitation?: number; is_day?: number; wind_gusts_10m?: number};
	hourly?: {time?: string[]; temperature_2m?: number[]; precipitation_probability?: (number | null)[]; precipitation?: (number | null)[]; weather_code?: number[]; is_day?: number[]};
	minutely_15?: {precipitation?: (number | null)[]};
}

/** hours shown in the forecast strip */
export const FORECAST_HOURS = 6;
/** how far ahead counts for the severity */
const SEVERITY_HOURS = 3;

export function fetchWeather (place: Place): Promise<Weather> {
	const url = `${FEED.openMeteo}?latitude=${place.lat}&longitude=${place.lon}`
		+ '&current=temperature_2m,weather_code,precipitation,is_day,wind_gusts_10m'
		+ '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day'
		+ `&forecast_hours=${FORECAST_HOURS + 2}`
		+ '&minutely_15=precipitation&forecast_minutely_15=4&timezone=auto';
	return getJson<OpenMeteoResponse>(url).then((r) => {
		const current = r.current || {};
		if (typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') throw new Error('No current weather');
		const all = hourly(r);
		const now = Date.now();
		// The list starts at the current hour; the strip shows the ones after it.
		const upcoming = all.filter((h) => h.time.getTime() > now);
		const nextHourMm = ((r.minutely_15 && r.minutely_15.precipitation) || []).reduce<number>((sum, mm) => sum + (mm || 0), 0);
		return {
			temperature: Math.round(current.temperature_2m),
			code: current.weather_code,
			isDay: current.is_day !== 0,
			text: describe(current.weather_code),
			severity: severityOf(current.weather_code, current.precipitation || 0, current.wind_gusts_10m || 0, nextHourMm, all.slice(0, SEVERITY_HOURS + 1)),
			hours: upcoming.slice(0, FORECAST_HOURS)
		};
	});
}

function hourly (r: OpenMeteoResponse): (HourForecast & {mm: number})[] {
	const h = r.hourly || {};
	const times = h.time || [];
	return times.map((t, i) => ({
		// "2026-10-24T15:00" in the place's own time zone: read it as local time
		time: new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)), Number(t.slice(11, 13)), Number(t.slice(14, 16))),
		temperature: Math.round((h.temperature_2m || [])[i] || 0),
		code: (h.weather_code || [])[i] || 0,
		rainChance: (h.precipitation_probability || [])[i] || 0,
		mm: (h.precipitation || [])[i] || 0,
		isDay: (h.is_day || [])[i] !== 0
	}));
}

function severityOf (code: number, mmNow: number, gusts: number, nextHourMm: number, soon: {code: number; rainChance: number; mm: number}[]): Severity {
	const maxMm = Math.max(mmNow, ...soon.map((h) => h.mm));
	const maxChance = Math.max(0, ...soon.map((h) => h.rainChance));
	if (isStorm(code) || soon.some((h) => isStorm(h.code)) || maxMm >= 5 || gusts >= 70) return 3;
	if (mmNow >= 1 || isHeavy(code) || maxMm >= 2) return 2;
	if (mmNow > 0 || isRain(code) || nextHourMm >= 0.2 || maxChance >= 50) return 1;
	return 0;
}

function isStorm (code: number): boolean { return code >= 95; }
function isHeavy (code: number): boolean { return code === 65 || code === 67 || code === 82; }
function isRain (code: number): boolean { return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || isStorm(code); }

/** WMO 4677 codes as Open-Meteo uses them. */
function describe (code: number): string {
	if (code === 0) return 'céu limpo';
	if (code === 1) return 'poucas nuvens';
	if (code === 2) return 'parcialmente nublado';
	if (code === 3) return 'nublado';
	if (code === 45 || code === 48) return 'neblina';
	if (code >= 51 && code <= 57) return 'garoa';
	if (code === 61) return 'chuva fraca';
	if (code === 63 || code === 66) return 'chuva';
	if (code === 65 || code === 67) return 'chuva forte';
	if (code >= 71 && code <= 77) return 'neve';
	if (code === 80 || code === 81) return 'pancadas de chuva';
	if (code === 82) return 'pancadas fortes';
	if (code === 85 || code === 86) return 'neve';
	if (code === 95) return 'trovoadas';
	if (code === 96 || code === 99) return 'trovoadas com granizo';
	return '';
}
