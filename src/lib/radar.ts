// Weather radar from RainViewer's public API: the last two hours in 10-minute frames,
// as 512-px Web Mercator tiles (zoom 7 at most). Esri's dark map goes underneath and
// its place names on top. Its 256-px zoom-8 tiles share the radar's pixel grid.

import {FEED} from '../config/constants';
import {getJson} from './web';

export interface RadarFrame {
	time: Date;
	path: string;
}

export interface RadarFrames {
	host: string;
	frames: RadarFrame[];
}

interface MapsResponse {
	host?: string;
	radar?: {past?: {time: number; path: string}[]};
}

export const RADAR_ZOOM = 7;   // RainViewer's highest supported zoom
export const TILE_SIZE = 512;
/** Map tiles: zoom 8 at 256 px covers exactly what zoom 7 does at 512 px. */
export const MAP_ZOOM = 8;
export const MAP_TILE_SIZE = 256;
/** RainViewer colour scheme 2 ("Universal Blue"), smoothed, snow shown */
const RADAR_STYLE = '2/1_1';

export function fetchRadarFrames (): Promise<RadarFrames> {
	return getJson<MapsResponse>(FEED.rainviewerMaps).then((r) => {
		const past = (r.radar && r.radar.past) || [];
		if (!r.host || !past.length) throw new Error('No radar frames');
		return {host: r.host, frames: past.map((f) => ({time: new Date(f.time * 1000), path: f.path}))};
	});
}

export function radarTileUrl (host: string, frame: RadarFrame, x: number, y: number): string {
	return `${host}${frame.path}/${TILE_SIZE}/${RADAR_ZOOM}/${x}/${y}/${RADAR_STYLE}.png`;
}

export function mapTileUrl (layer: 'base' | 'labels', x: number, y: number, zoom: number = MAP_ZOOM): string {
	return (layer === 'base' ? FEED.esriDarkBase : FEED.esriDarkLabels)
		.replace('{z}', String(zoom))
		.replace('{x}', String(x))
		.replace('{y}', String(y));
}

/** Position of a lat/lon in pixels of the whole Web Mercator map at a zoom level
 *  (by default the radar's: zoom 7 with 512-px tiles). */
export function worldPixel (lat: number, lon: number, zoom: number = RADAR_ZOOM, tileSize: number = TILE_SIZE): {x: number; y: number} {
	const size = tileSize * Math.pow(2, zoom);
	const sin = Math.sin(lat * Math.PI / 180);
	return {
		x: (lon + 180) / 360 * size,
		y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size
	};
}

/** The square tiles of `size` px that cover a view starting at (x0, y0), positioned
 *  relative to it. Radar and map tiles share the same pixel grid, only the size differs. */
export function tilesCovering (x0: number, y0: number, width: number, height: number, size: number) {
	const tiles: {x: number; y: number; key: string; style: {left: string; top: string; width: string; height: string}}[] = [];
	for (let ty = Math.floor(y0 / size); ty <= Math.floor((y0 + height) / size); ty++) {
		for (let tx = Math.floor(x0 / size); tx <= Math.floor((x0 + width) / size); tx++) {
			tiles.push({
				x: tx,
				y: ty,
				key: `${tx}_${ty}`,
				style: {left: `${tx * size - x0}px`, top: `${ty * size - y0}px`, width: `${size}px`, height: `${size}px`}
			});
		}
	}
	return tiles;
}
