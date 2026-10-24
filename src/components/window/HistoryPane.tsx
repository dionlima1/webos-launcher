import {useEffect, useState} from 'preact/hooks';
import {TIMING} from '../../config/constants';
import {useTimeout} from '../../hooks/useTimers';
import {fetchOnThisDay, type HistoryEvent} from '../../lib/history';
import {preloadImage} from '../../lib/web';
import {Caption} from './Window';

interface Props {
	running: boolean;
	onDone: () => void;
}

/** Carries on across turns, so each turn shows the next events of the day. */
let cursor = 0;

/** "Neste dia": a couple of things that happened on today's date, each with the picture
 *  of its Wikipedia article over a blurred copy of itself. */
export function HistoryPane ({running, onDone}: Props) {
	const [events, setEvents] = useState<HistoryEvent[] | null>(null);
	const [shown, setShown] = useState<{event: HistoryEvent; image: string | null} | null>(null);
	const [count, setCount] = useState(0);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let alive = true;
		fetchOnThisDay().then((list) => { if (alive) setEvents(list); }).catch(() => { if (alive) setFailed(true); });
		return () => { alive = false; };
	}, []);

	// Show the next event once its picture has loaded (or without it, if it won't).
	useEffect(() => {
		if (!events) return;
		let alive = true;
		const event = events[cursor % events.length];
		cursor++;
		const show = (image: string | null) => { if (alive) setShown({event, image}); };
		if (event.image) preloadImage(event.image).then(() => show(event.image), () => show(null));
		else show(null);
		return () => { alive = false; };
	}, [events, count]);

	useTimeout(running && failed, 0, onDone);
	useTimeout(running && !!shown, TIMING.historyMs, () => {
		if (count + 1 >= TIMING.historyPerTurn) onDone();
		else setCount(count + 1);
	}, shown);

	if (!shown) return <div class="pane pane--loading" />;
	const {event, image} = shown;
	const yearsAgo = new Date().getFullYear() - event.year;
	return (
		<div class={`pane pane--fade history${image ? '' : ' history--text'}`} key={`${event.year}:${event.text}`}>
			{image && <div class="photo__backdrop" style={{backgroundImage: `url("${image}")`}} />}
			{image && <div class="history__picture" style={{backgroundImage: `url("${image}")`}} />}
			<div class="history__text">
				<div class="history__year">{event.year}<span class="history__ago">{yearsAgo > 0 ? ` · há ${yearsAgo} anos` : ''}</span></div>
				<div class="history__event">{event.text}</div>
			</div>
			<div class="pane__shade" />
			<Caption title="Neste dia" credit={`Wikipédia${event.article ? ` · ${event.article}` : ''}`} />
		</div>
	);
}
