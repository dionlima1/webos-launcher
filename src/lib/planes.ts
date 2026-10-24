// Aircraft around PLACE right now, from adsb.lol (open ADS-B data). On the TV our service
// fetches them (adsb.lol sends no CORS headers); in a desktop browser the dev server does.

import {FEED, LUNA} from '../config/constants';
import type {Place} from '../config/home';
import {isWebOS, lunaCall, type LunaResponse} from './luna';
import {getJson} from './web';

export interface Plane {
	id: string;
	callsign: string;
	reg: string;
	/** ICAO type designator, e.g. "A20N" */
	type: string;
	lat: number;
	lon: number;
	altFt: number;
	onGround: boolean;
	speedKt: number;
	/** degrees clockwise from north */
	track: number;
	rotorcraft: boolean;
}

interface PlanesResponse extends LunaResponse {
	planes?: Plane[];
}

/** Planes in the air within `radiusNm` nautical miles (adsb.lol allows up to 100).
 *  Every answer is also added to the planes' trails (see trailOf). */
export function fetchPlanes (place: Place, radiusNm: number): Promise<Plane[]> {
	const params = {lat: place.lat, lon: place.lon, radiusNm};
	const request: Promise<PlanesResponse> = isWebOS()
		? lunaCall<PlanesResponse>(LUNA.planes, params, 20000)
		: getJson<PlanesResponse>(`${FEED.planesDev}?lat=${place.lat}&lon=${place.lon}&radiusNm=${radiusNm}`);
	return request.then((r) => {
		const planes = (r.planes || []).filter((p) => !p.onGround);
		recordPositions(planes, Date.now());
		return planes;
	});
}

// ---------- trails ----------
// adsb.lol's recorded tracks sit behind a bot check, so we keep our own: every position
// fetched while the planes map is on screen (every 8 s), for the last 15 minutes. Nothing
// is fetched for trails in the background; in auto mode they grow each time the map comes
// round. Memory only; a restart starts them over.

interface Fix {
	lat: number;
	lon: number;
	at: number;
}

const TRAIL_MS = 15 * 60 * 1000;
const trails: Record<string, Fix[]> = {};

function recordPositions (planes: Plane[], now: number): void {
	for (const p of planes) {
		const trail = trails[p.id] || (trails[p.id] = []);
		const lastFix = trail[trail.length - 1];
		if (!lastFix || lastFix.lat !== p.lat || lastFix.lon !== p.lon) trail.push({lat: p.lat, lon: p.lon, at: now});
	}
	for (const id in trails) {
		const kept = trails[id].filter((f) => now - f.at <= TRAIL_MS);
		if (kept.length) trails[id] = kept;
		else delete trails[id];
	}
}

/** Where a plane has been in the last 15 minutes, oldest first. */
export function trailOf (id: string): {lat: number; lon: number}[] {
	return trails[id] || [];
}

/** Great-circle distance in km. */
export function distanceKm (a: {lat: number; lon: number}, b: {lat: number; lon: number}): number {
	const rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad;
	const dLon = (b.lon - a.lon) * rad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
	return 12742 * Math.asin(Math.sqrt(h));
}

/** ICAO airline prefixes seen over Brazil. */
const AIRLINES: Record<string, string> = {
	TAM: 'LATAM', LAN: 'LATAM', LPE: 'LATAM', LXP: 'LATAM', GLO: 'GOL', AZU: 'Azul', ACN: 'Azul Conecta',
	PTB: 'VoePass', TTL: 'Total', ABJ: 'Abaeté', SID: 'Sideral', LTG: 'LATAM Cargo', TUS: 'ABSA Cargo',
	ARG: 'Aerolíneas', AAL: 'American', DAL: 'Delta', UAL: 'United', AFR: 'Air France', KLM: 'KLM',
	BAW: 'British Airways', DLH: 'Lufthansa', TAP: 'TAP', IBE: 'Iberia', AEA: 'Air Europa', CMP: 'Copa',
	AVA: 'Avianca', UAE: 'Emirates', QTR: 'Qatar', ETH: 'Ethiopian', SWR: 'Swiss', ITY: 'ITA', BOV: 'BoA',
	SKU: 'Sky', JAT: 'JetSMART', AMX: 'Aeroméxico', ACA: 'Air Canada', THY: 'Turkish', SAA: 'South African',
	FDX: 'FedEx', UPS: 'UPS', DHL: 'DHL', CLX: 'Cargolux', GTI: 'Atlas Air', BRS: 'FAB'
};

/** "TAM8117" → "LATAM 8117"; a callsign we don't know (or a registration) stays as is. */
export function flightName (p: Plane): string {
	const m = /^([A-Z]{3})(\d[\dA-Z]*)$/.exec(p.callsign);
	if (m && AIRLINES[m[1]]) return `${AIRLINES[m[1]]} ${m[2]}`;
	return p.callsign || p.reg || 'Sem identificação';
}

const TYPES: Record<string, string> = {
	A319: 'Airbus A319', A320: 'Airbus A320', A20N: 'Airbus A320neo', A321: 'Airbus A321', A21N: 'Airbus A321neo',
	A332: 'Airbus A330', A333: 'Airbus A330', A339: 'Airbus A330neo', A359: 'Airbus A350', A35K: 'Airbus A350-1000', A388: 'Airbus A380',
	B737: 'Boeing 737', B738: 'Boeing 737-800', B38M: 'Boeing 737 MAX', B739: 'Boeing 737-900', B763: 'Boeing 767', B772: 'Boeing 777',
	B77W: 'Boeing 777', B77L: 'Boeing 777F', B788: 'Boeing 787', B789: 'Boeing 787', B78X: 'Boeing 787', B744: 'Boeing 747', B748: 'Boeing 747-8',
	E190: 'Embraer 190', E195: 'Embraer 195', E295: 'Embraer E195-E2', E75L: 'Embraer 175', E145: 'Embraer 145',
	AT72: 'ATR 72', AT76: 'ATR 72', AT75: 'ATR 72', C208: 'Cessna Caravan', PC12: 'Pilatus PC-12', R44: 'Robinson R44', R66: 'Robinson R66',
	AS50: 'Esquilo', EC35: 'Airbus H135', EC45: 'Airbus H145', B06: 'Bell 206', S76: 'Sikorsky S-76', A109: 'AW109', A139: 'AW139'
};

export function typeName (p: Plane): string {
	const name = TYPES[p.type] || p.type;
	return p.rotorcraft ? `${name || 'Helicóptero'}${name ? ' (helicóptero)' : ''}` : name;
}

/** Aviation units, as pilots and controllers use them: "8.875 pés" */
export function altitudeText (p: Plane): string {
	return `${thousands(Math.round(p.altFt))} pés`;
}

/** Nautical miles: "2,7 NM", or "14 NM" from 10 up */
export function distanceText (km: number): string {
	const nm = km / 1.852;
	return nm < 10 ? `${nm.toFixed(1).replace('.', ',')} NM` : `${Math.round(nm)} NM`;
}

/** 19375 → "19.375" */
function thousands (n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
