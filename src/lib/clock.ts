// Time-of-day text, in Brazilian Portuguese. Pure functions so they are trivially testable.

export type TimeFormat = '12h' | '24h';

const DAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dayName (date: Date): string {
	return DAYS[date.getDay()];
}

/** "23 de setembro" */
export function dateText (date: Date): string {
	return `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

/** "3 de outubro de 2025" for a photo's capture time (local to where it was taken,
 *  so it is read with UTC getters). */
export function photoDateText (taken: number): string {
	const d = new Date(taken);
	return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export interface TimeParts {
	/** "15:42" or "3:42" */
	time: string;
	/** "AM" / "PM" in 12-hour format, otherwise empty */
	period: string;
}

export function timeParts (date: Date, format: TimeFormat): TimeParts {
	const h = date.getHours();
	const m = pad(date.getMinutes());
	if (format === '24h') return {time: `${pad(h)}:${m}`, period: ''};
	return {time: `${h % 12 || 12}:${m}`, period: h < 12 ? 'AM' : 'PM'};
}

/** "15h" (or "3pm"), for the forecast strip */
export function hourText (date: Date, format: TimeFormat): string {
	const h = date.getHours();
	return format === '24h' ? `${h}h` : `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
}

/** "15:42" (or "3:42 PM"), for captions */
export function timeText (date: Date, format: TimeFormat): string {
	const {time, period} = timeParts(date, format);
	return period ? `${time} ${period}` : time;
}

function pad (n: number): string {
	return n < 10 ? `0${n}` : String(n);
}
