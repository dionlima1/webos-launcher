// The newest GOES-19 GeoColor frame of a sector, from NOAA STAR. Frames are published
// every 10 minutes as <YYYYDDDHHMM>_GOES19-ABI-<sector>-GEOCOLOR-<size>.jpg (UTC); the
// directory listing is CORS-enabled, so we read it to get the frame's time.

import {FEED} from '../config/constants';
import type {SatelliteView} from '../config/home';
import {getText} from './web';

export interface SatelliteFrame {
	url: string;
	/** capture time; null when only the undated "latest" alias was available */
	time: Date | null;
}

export function latestSatelliteFrame (view: SatelliteView): Promise<SatelliteFrame> {
	const dir = `${FEED.goesSector}${view.sector}/GEOCOLOR/`;
	const fallback: SatelliteFrame = {url: `${dir}${view.size}.jpg?t=${Date.now()}`, time: null};
	const pattern = new RegExp(`href="((\\d{11})_GOES19-ABI-${view.sector}-GEOCOLOR-${view.size}\\.jpg)"`, 'g');
	return getText(dir).then((html) => {
		let newest: RegExpExecArray | null = null;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(html)) !== null) {
			if (!newest || match[2] > newest[2]) newest = match;
		}
		return newest ? {url: dir + newest[1], time: parseStamp(newest[2])} : fallback;
	}).catch(() => fallback);
}

/** "20262971430" → 2026, day 297, 14:30 UTC */
function parseStamp (stamp: string): Date {
	const year = Number(stamp.slice(0, 4));
	const dayOfYear = Number(stamp.slice(4, 7));
	const hours = Number(stamp.slice(7, 9));
	const minutes = Number(stamp.slice(9, 11));
	return new Date(Date.UTC(year, 0, dayOfYear, hours, minutes));
}
