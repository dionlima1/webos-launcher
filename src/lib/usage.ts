// How often each tile is opened, and the home grid's order that follows from it.
//
// Every tile has a score that goes up by one per launch and halves every week, so the
// order favours what is used often *and* lately. Scores are frozen once a day and the
// order comes from the frozen copy, so tiles never move under the remote mid-session.

import {USAGE_KEY} from '../config/constants';

const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

interface Score {
	value: number;
	/** when `value` was last updated */
	at: number;
}

interface UsageData {
	scores: Record<string, Score>;
	/** the day `frozen` was taken, as YYYY-MM-DD in local time */
	day?: string;
	frozen?: Record<string, number>;
}

export function recordLaunch (id: string, now: number = Date.now()): void {
	const data = load();
	data.scores[id] = {value: decayed(data.scores[id], now) + 1, at: now};
	save(data);
}

/** `ids` in today's order: highest frozen score first; ties keep the order given. */
export function orderForToday (ids: string[], now: Date = new Date()): string[] {
	const data = load();
	const today = dayKey(now);
	if (data.day !== today || !data.frozen) {
		const frozen: Record<string, number> = {};
		for (const id in data.scores) frozen[id] = decayed(data.scores[id], now.getTime());
		data.frozen = frozen;
		data.day = today;
		save(data);
	}
	const frozen = data.frozen;
	return ids
		.map((id, index) => ({id, index, score: frozen[id] || 0}))
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map((entry) => entry.id);
}

function decayed (score: Score | undefined, now: number): number {
	if (!score) return 0;
	return score.value * Math.pow(0.5, Math.max(0, now - score.at) / HALF_LIFE_MS);
}

function dayKey (date: Date): string {
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function load (): UsageData {
	try {
		const parsed = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}') as Partial<UsageData>;
		return {scores: parsed.scores || {}, day: parsed.day, frozen: parsed.frozen};
	} catch {
		return {scores: {}};
	}
}

function save (data: UsageData): void {
	try { localStorage.setItem(USAGE_KEY, JSON.stringify(data)); }
	catch { /* nothing sensible to do on a TV */ }
}
