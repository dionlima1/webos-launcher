import {useEffect, useState} from 'preact/hooks';
import {TIMING} from '../../config/constants';
import {AIRPORTS, PLACE} from '../../config/home';
import {useTimeout} from '../../hooks/useTimers';
import {altitudeText, distanceKm, distanceText, fetchPlanes, flightName, trailOf, typeName, type Plane} from '../../lib/planes';
import {MAP_TILE_SIZE, mapTileUrl, tilesCovering, worldPixel} from '../../lib/radar';
import {Caption} from './Window';

interface Props {
	running: boolean;
	/** how long the turn lasts, as a multiple of the usual one */
	pace: number;
	width: number;
	height: number;
	onDone: () => void;
}

/** About 135 km across, window or full screen: Greater São Paulo and its surroundings.
 *  Full screen is twice as wide, so it uses the next zoom level (more map detail). */
const zoomFor = (width: number) => (width > 1200 ? 11 : 10);
const CLOSEST_SHOWN = 3;
/** km per pixel at a zoom level and latitude (256-px Web Mercator tiles) */
const kmPerPixel = (zoom: number, lat: number) => 40075 * Math.cos(lat * Math.PI / 180) / (MAP_TILE_SIZE * Math.pow(2, zoom));

/** The last positions, so a new turn draws at once instead of starting empty. */
let last: Plane[] = [];

/** Planes in the air around home on a dark map, refreshed every few seconds and moving
 *  smoothly in between; the closest ones are listed with airline, model and height. */
export function PlanesPane ({running, pace, width, height, onDone}: Props) {
	const [planes, setPlanes] = useState<Plane[]>(last);
	const [failed, setFailed] = useState(false);
	const zoom = zoomFor(width);
	// Ask for planes out to the view's corners (in nautical miles), plus a little.
	const radiusNm = Math.min(100, Math.ceil(Math.sqrt(width * width + height * height) / 2 * kmPerPixel(zoom, PLACE.lat) / 1.852) + 5);

	useEffect(() => {
		if (!running) return;
		let alive = true;
		const load = () => fetchPlanes(PLACE, radiusNm)
			.then((list) => { if (alive) { last = list; setPlanes(list); setFailed(false); } })
			.catch(() => { if (alive && !last.length) setFailed(true); });
		load();
		const id = window.setInterval(load, TIMING.planesRefreshMs);
		return () => { alive = false; window.clearInterval(id); };
	}, [running, radiusNm]);

	useTimeout(running && failed, 0, onDone);
	useTimeout(running && !failed, TIMING.planesMs * pace, onDone);

	const center = worldPixel(PLACE.lat, PLACE.lon, zoom, MAP_TILE_SIZE);
	const x0 = center.x - width / 2;
	const y0 = center.y - height / 2;
	const tiles = tilesCovering(x0, y0, width, height, MAP_TILE_SIZE);
	const shown = planes
		.map((p) => {
			const at = worldPixel(p.lat, p.lon, zoom, MAP_TILE_SIZE);
			return {plane: p, x: at.x - x0, y: at.y - y0, km: distanceKm(PLACE, p)};
		})
		.filter((p) => p.x > -40 && p.y > -40 && p.x < width + 40 && p.y < height + 40);
	const closest = shown.slice().sort((a, b) => a.km - b.km).slice(0, CLOSEST_SHOWN);
	const closestIds = closest.map((c) => c.plane.id);

	return (
		<div class="pane pane--fade">
			<div class="planes-map" style={{width: `${width}px`, height: `${height}px`}}>
				{tiles.map((t) => <img key={`m${t.key}`} class="radar__tile radar__tile--map" src={mapTileUrl('base', t.x, t.y, zoom)} style={t.style} alt="" />)}
				{tiles.map((t) => <img key={`l${t.key}`} class="radar__tile radar__tile--map" src={mapTileUrl('labels', t.x, t.y, zoom)} style={t.style} alt="" />)}
				{/* thin trails behind the closest planes: where they've been in the last 15 min */}
				<svg class="plane-trails" width={width} height={height} aria-hidden="true">
					{closest.map(({plane}) => {
						const points = trailOf(plane.id).map((f) => {
							const at = worldPixel(f.lat, f.lon, zoom, MAP_TILE_SIZE);
							return `${Math.round(at.x - x0)},${Math.round(at.y - y0)}`;
						});
						return points.length > 1 ? <polyline key={plane.id} points={points.join(' ')} /> : null;
					})}
				</svg>
				{AIRPORTS.map((a) => {
					const at = worldPixel(a.lat, a.lon, zoom, MAP_TILE_SIZE);
					return (
						<div key={a.code} class="airport" style={{left: `${at.x - x0}px`, top: `${at.y - y0}px`}}>
							<span class="airport__dot" />
							<span class="airport__label">{a.code}</span>
						</div>
					);
				})}
				{shown.map(({plane, x, y}) => {
					const near = closestIds.indexOf(plane.id) !== -1;
					return (
						<div key={plane.id} class={`plane${near ? ' plane--near' : ''}`} style={{left: `${x}px`, top: `${y}px`}}>
							<svg class="plane__icon" viewBox="0 0 24 24" style={{transform: `rotate(${plane.track}deg)`}} aria-hidden="true">
								<path d="M12 2c.8 0 1.3.9 1.3 2v5.2l7.7 4.6v2l-7.7-2.3v4.7l2.2 1.6V21L12 20.1 8.5 21v-1.2l2.2-1.6v-4.7L3 15.8v-2l7.7-4.6V4c0-1.1.5-2 1.3-2z" />
							</svg>
							<span class="plane__label">{plane.callsign || plane.reg}</span>
						</div>
					);
				})}
			</div>
			<div class="marker" style={{left: `${width / 2}px`, top: `${height / 2}px`}}>
				<span class="marker__dot" />
				<span class="marker__label">{PLACE.name}</span>
			</div>
			{closest.length > 0 && (
				<div class="planes-near">
					<div class="planes-near__title">Mais perto de você</div>
					{closest.map(({plane, km}) => (
						<div key={plane.id} class="planes-near__row">
							<span class="planes-near__flight">{flightName(plane)}</span>
							<span class="planes-near__detail">{typeName(plane)} · {altitudeText(plane)} · a {distanceText(km)}</span>
						</div>
					))}
				</div>
			)}
			<div class="pane__shade" />
			<Caption title={failed ? 'Aviões: sem dados agora' : `Aviões agora · ${shown.length} no ar`} credit="adsb.lol · mapa Esri, © OpenStreetMap" />
		</div>
	);
}
