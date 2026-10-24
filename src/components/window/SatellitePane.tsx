import {useEffect, useState} from 'preact/hooks';
import {TIMING} from '../../config/constants';
import {PLACE, SATELLITE, type SatelliteView} from '../../config/home';
import {useTimeout} from '../../hooks/useTimers';
import {timeText, type TimeFormat} from '../../lib/clock';
import {latestSatelliteFrame, type SatelliteFrame} from '../../lib/satellite';
import {preloadImage} from '../../lib/web';
import {Caption} from './Window';

interface Props {
	running: boolean;
	width: number;
	height: number;
	timeFormat: TimeFormat;
	onDone: () => void;
}

/** Survives the pane unmounting between turns, so a frame is fetched once per 10 min. */
let cache: {frame: SatelliteFrame; at: number} | null = null;

/** The newest GOES-19 frame, cropped to SATELLITE.crop, with a marker on PLACE. */
export function SatellitePane ({running, width, height, timeFormat, onDone}: Props) {
	const [frame, setFrame] = useState<SatelliteFrame | null>(cache && cache.frame);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (cache && Date.now() - cache.at < TIMING.feedRefreshMs) return;
		let alive = true;
		latestSatelliteFrame(SATELLITE)
			.then((f) => preloadImage(f.url).then(() => f))
			.then((f) => { cache = {frame: f, at: Date.now()}; if (alive) setFrame(f); })
			.catch(() => { if (alive && !cache) setFailed(true); });
		return () => { alive = false; };
	}, []);

	// Nothing to show (offline, NOAA down): hand over to the next pane straight away.
	useTimeout(running, failed ? 0 : TIMING.satelliteMs, onDone);

	if (!frame) return <div class="pane pane--loading" />;
	const geo = cropGeometry(SATELLITE, width, height);
	const when = frame.time ? ` · ${timeText(frame.time, timeFormat)}` : '';
	return (
		<div class="pane pane--fade">
			<div class="satellite" style={{backgroundImage: `url("${frame.url}")`, backgroundSize: geo.size, backgroundPosition: geo.position}} />
			{geo.marker && (
				<div class="marker" style={{left: `${geo.marker.x}px`, top: `${geo.marker.y}px`}}>
					<span class="marker__dot" />
					<span class="marker__label">{PLACE.name}</span>
				</div>
			)}
			<div class="pane__shade" />
			<Caption title={SATELLITE.title} credit={`Satélite GOES-19 · NOAA${when}`} />
		</div>
	);
}

/** CSS background size/position for a width × height box: the whole crop fits, centred,
 *  and the box is filled with the image around it (it is much larger than the crop). */
function cropGeometry (view: SatelliteView, width: number, height: number) {
	const {crop} = view;
	const scale = Math.min(width / crop.w, height / crop.h);
	const dx = (width - crop.w * scale) / 2 - crop.x * scale;
	const dy = (height - crop.h * scale) / 2 - crop.y * scale;
	return {
		size: `${view.imageWidth * scale}px ${view.imageHeight * scale}px`,
		position: `${dx}px ${dy}px`,
		marker: view.marker ? {x: view.marker.x * scale + dx, y: view.marker.y * scale + dy} : null
	};
}
