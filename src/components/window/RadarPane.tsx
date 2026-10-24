import {useEffect, useState} from 'preact/hooks';
import {TIMING} from '../../config/constants';
import {AIRPORTS, PLACE} from '../../config/home';
import {useTimeout} from '../../hooks/useTimers';
import {timeText, type TimeFormat} from '../../lib/clock';
import {fetchRadarFrames, MAP_TILE_SIZE, mapTileUrl, radarTileUrl, TILE_SIZE, tilesCovering, worldPixel, type RadarFrames} from '../../lib/radar';
import {preloadImage} from '../../lib/web';
import {Caption} from './Window';

interface Props {
	running: boolean;
	width: number;
	height: number;
	/** how many times the animation plays before the turn is over */
	loops: number;
	timeFormat: TimeFormat;
	onDone: () => void;
}

/** Zoom 7 is RainViewer's limit; scaled up 1.5× the window frames roughly 320 km
 *  around home (about 640 km across in full screen). */
const MAP_SCALE = 1.5;

let cache: {data: RadarFrames; at: number} | null = null;

/** The frame list, fetched at most every 10 minutes (RainViewer's own pace). */
function radarFrames (): Promise<RadarFrames> {
	if (cache && Date.now() - cache.at < TIMING.feedRefreshMs) return Promise.resolve(cache.data);
	return fetchRadarFrames().then((data) => {
		cache = {data, at: Date.now()};
		return data;
	});
}

/** What the pane draws for a size: the map's corner and the tiles covering it. */
function radarView (width: number, height: number) {
	const viewW = width / MAP_SCALE;
	const viewH = height / MAP_SCALE;
	const center = worldPixel(PLACE.lat, PLACE.lon);
	const x0 = center.x - viewW / 2;
	const y0 = center.y - viewH / 2;
	return {
		viewW, viewH, x0, y0,
		radarTiles: tilesCovering(x0, y0, viewW, viewH, TILE_SIZE),
		mapTiles: tilesCovering(x0, y0, viewW, viewH, MAP_TILE_SIZE)
	};
}

/** Fetch the frames and their images ahead of the radar's turn, so it moves from its
 *  first moment. Called by the window while the view before the radar is on screen. */
export function preloadRadar (width: number, height: number): void {
	radarFrames().then((data) => {
		const {radarTiles, mapTiles} = radarView(width, height);
		const urls = mapTiles.map((t) => mapTileUrl('base', t.x, t.y))
			.concat(mapTiles.map((t) => mapTileUrl('labels', t.x, t.y)));
		for (const f of data.frames) for (const t of radarTiles) urls.push(radarTileUrl(data.host, f, t.x, t.y));
		for (const url of urls) preloadImage(url).catch(() => undefined);
	}).catch(() => undefined);
}

/** The last two hours of radar around PLACE, played as a loop over a dark map: oldest →
 *  newest straight away, a pause on the newest, again. */
export function RadarPane ({running, width, height, loops: turns, timeFormat, onDone}: Props) {
	const [data, setData] = useState<RadarFrames | null>(cache && cache.data);
	const [failed, setFailed] = useState(false);
	const [index, setIndex] = useState(0);
	const [loops, setLoops] = useState(0);

	useEffect(() => {
		let alive = true;
		radarFrames()
			.then((d) => { if (alive && (!data || d !== data)) setData(d); })
			.catch(() => { if (alive && !cache) setFailed(true); });
		return () => { alive = false; };
	}, []);

	useTimeout(running && failed, 0, onDone);

	const last = data ? data.frames.length - 1 : 0;
	const atNewest = index === last;
	useTimeout(running && !!data, atNewest ? TIMING.radarHoldMs : TIMING.radarFrameMs, () => {
		if (!atNewest) { setIndex(index + 1); return; }
		if (loops + 1 >= turns) { onDone(); return; }
		setLoops(loops + 1);
		setIndex(0);
	}, `${index}:${loops}`);

	if (!data) return <div class="pane pane--loading" />;

	const {viewW, viewH, x0, y0, radarTiles, mapTiles} = radarView(width, height);
	const frame = data.frames[index];

	return (
		<div class="pane pane--fade">
			<div class="radar" style={{width: `${viewW}px`, height: `${viewH}px`, transform: `scale(${MAP_SCALE})`}}>
				{mapTiles.map((t) => <img key={`m${t.key}`} class="radar__tile radar__tile--map" src={mapTileUrl('base', t.x, t.y)} style={t.style} alt="" />)}
				{data.frames.map((f, i) => (
					<div key={f.path} class="radar__frame" style={{opacity: i === index ? 1 : 0}}>
						{radarTiles.map((t) => <img key={t.key} class="radar__tile" src={radarTileUrl(data.host, f, t.x, t.y)} style={t.style} alt="" />)}
					</div>
				))}
				{mapTiles.map((t) => <img key={`l${t.key}`} class="radar__tile radar__tile--map" src={mapTileUrl('labels', t.x, t.y)} style={t.style} alt="" />)}
			</div>
			{AIRPORTS.map((a) => {
				// outside the scaled map, so the dot and label keep their size
				const at = worldPixel(a.lat, a.lon);
				return (
					<div key={a.code} class="airport" style={{left: `${(at.x - x0) * MAP_SCALE}px`, top: `${(at.y - y0) * MAP_SCALE}px`}}>
						<span class="airport__dot" />
						<span class="airport__label">{a.code}</span>
					</div>
				);
			})}
			{/* at this scale CGH sits right beside home: put home's label on the other side */}
			<div class="marker marker--label-left" style={{left: `${width / 2}px`, top: `${height / 2}px`}}>
				<span class="marker__dot" />
				<span class="marker__label">{PLACE.name}</span>
			</div>
			<div class="pane__shade" />
			<div class="radar__progress"><div class="radar__progress-bar" style={{width: `${(index + 1) / data.frames.length * 100}%`}} /></div>
			<Caption title={`Radar · ${timeText(frame.time, timeFormat)}`} credit="RainViewer · mapa Esri, © OpenStreetMap" />
		</div>
	);
}
