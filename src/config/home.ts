// Settings for the home screen: where we are (weather, radar), which satellite view
// to show, the photo album and the starting order of the tiles.
//
// Personal values go in src/config/home.local.ts (git-ignored); see
// home.local.example.ts. Anything it doesn't export keeps the default below.

export interface Place {
	name: string;
	lat: number;
	lon: number;
}

/** A crop of one GOES-19 sector image (NOAA STAR), in that image's pixels. */
export interface SatelliteView {
	/** STAR sector code, e.g. "ssa" (southern South America) */
	sector: string;
	/** which of STAR's published sizes to load */
	size: string;
	imageWidth: number;
	imageHeight: number;
	crop: {x: number; y: number; w: number; h: number};
	/** where `place` is in the image, for the marker; omit to hide it */
	marker?: {x: number; y: number};
	/** caption, e.g. "Sudeste agora" */
	title: string;
}

/** An airport marked on the planes and radar maps. */
export interface Airport {
	name: string;
	/** IATA code, e.g. "GRU" */
	code: string;
	lat: number;
	lon: number;
}

/** Shape of the optional src/config/home.local.ts. */
export interface LocalHome {
	PLACE?: Place;
	AIRPORTS?: Airport[];
	SATELLITE?: SatelliteView;
	/** a Google Photos album shared by link (photos.app.goo.gl/… or photos.google.com/share/…) */
	ALBUM_URL?: string;
	/** tile order before there is any usage history: app IDs and input app IDs */
	START_ORDER?: string[];
	/** shorter tile names by app/input ID, e.g. {'com.webos.app.hdmi3': 'NET TV'} */
	LABELS?: Record<string, string>;
}

// Vite resolves this at build time; it's an empty object when the file doesn't exist.
const localModules = import.meta.glob<LocalHome>('./home.local.ts', {eager: true});
const local: LocalHome = localModules['./home.local.ts'] || {};

export const PLACE: Place = local.PLACE || {name: 'São Paulo', lat: -23.55, lon: -46.63};

/** The Southeast of Brazil from the "ssa" sector, centred on São Paulo. The marker was
 *  placed by reading the coastline (Santos, Ilhabela, the RJ border), so it is good to
 *  a few pixels, not exact. */
export const SATELLITE: SatelliteView = local.SATELLITE || {
	sector: 'ssa',
	size: '3600x2160',
	imageWidth: 3600,
	imageHeight: 2160,
	crop: {x: 1975, y: 194, w: 700, h: 716},
	marker: {x: 2325, y: 552},
	title: 'Sudeste agora'
};

/** Airline airports around São Paulo (aerodrome reference points). The planes map
 *  shows those within its ~135 km; the radar's wider map shows them all. */
export const AIRPORTS: Airport[] = local.AIRPORTS || [
	{name: 'Guarulhos', code: 'GRU', lat: -23.4356, lon: -46.4731},
	{name: 'Congonhas', code: 'CGH', lat: -23.6261, lon: -46.6564},
	{name: 'Viracopos', code: 'VCP', lat: -23.0074, lon: -47.1345},
	{name: 'São José dos Campos', code: 'SJK', lat: -23.2292, lon: -45.8615}
];

export const ALBUM_URL: string = local.ALBUM_URL || '';

export const START_ORDER: string[] = local.START_ORDER || [];

export const LABELS: Record<string, string> = local.LABELS || {};
