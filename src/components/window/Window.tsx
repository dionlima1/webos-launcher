import {useCallback, useEffect, useState} from 'preact/hooks';
import type {AlbumRef, Photo} from '../../lib/album';
import type {TimeFormat} from '../../lib/clock';
import {MODES, MODE_LABEL, type ViewId, type WindowMode} from '../../lib/windowState';
import type {Severity} from '../../lib/weather';
import {LAYOUT} from '../../theme/tokens';
import {AlbumPanel} from './AlbumPanel';
import {SatellitePane} from './SatellitePane';
import {preloadRadar, RadarPane} from './RadarPane';
import {PhotosPane, type PhotoNav, type VideoCmd, type VideoState} from './PhotosPane';
import {PlanesPane} from './PlanesPane';
import {HistoryPane} from './HistoryPane';

interface Props {
	/** 'auto' cycles through the views; a single view stays on screen */
	mode: WindowMode;
	fullscreen: boolean;
	/** standing in for LG's screensaver: no hints or chips, nothing that stays put */
	ambient: boolean;
	focused: boolean;
	/** false while Settings is open or another app is in front: everything pauses */
	running: boolean;
	/** how bad the weather is (lib/weather.ts): in auto mode, the worse it gets the more
	 *  often the radar comes round and the longer it stays */
	severity: Severity;
	/** the photos to show: one album, or all of them */
	photos: Photo[];
	/** true for one album: its photos go in order instead of shuffled */
	ordered: boolean;
	albums: AlbumRef[];
	/** the chosen album (link), or null for all */
	albumChoice: string | null;
	/** the album panel row the remote is on */
	panelRow: number;
	/** the phone album manager's address, for the QR code */
	managerUrl: string | null;
	/** the album panel is open (photos in full screen only) */
	panelOpen: boolean;
	/** ◀ ▶ on the photos in full screen */
	photoNav: PhotoNav | null;
	/** remote commands for a video in the photos (full screen) */
	videoCmd: VideoCmd | null;
	videoState: VideoState;
	onVideoState: (state: VideoState) => void;
	onPhotosStale: () => void;
	timeFormat: TimeFormat;
	/** told which view is on screen, so the remote keys can depend on it */
	onView: (view: ViewId) => void;
}

/** The big panel next to the apps, or the whole screen. Each pane says when its turn is
 *  over; in auto mode the next view follows, otherwise the same view starts again. */
export function Window ({mode, fullscreen, ambient, focused, running, severity, photos, ordered, albums, albumChoice, panelRow, managerUrl, panelOpen, photoNav, videoCmd, videoState, onVideoState, onPhotosStale, timeFormat, onView}: Props) {
	const views = mode === 'auto' ? sequence(severity, photos.length > 0) : [mode];
	const [step, setStep] = useState(0);
	const view = views[step % views.length];
	const next = useCallback(() => setStep((s) => s + 1), []);

	useEffect(() => { setStep(0); }, [mode, severity]);   // a new mode, or the weather turning, restarts the cycle
	useEffect(() => { onView(view); }, [view]);

	const width = fullscreen ? LAYOUT.screenWidth : LAYOUT.windowWidth;
	const height = fullscreen ? LAYOUT.screenHeight : LAYOUT.windowHeight;

	// The radar is next: load it now, so it moves from its first moment.
	const upcoming = views[(step + 1) % views.length];
	useEffect(() => {
		if (running && upcoming === 'radar' && view !== 'radar') preloadRadar(width, height);
	}, [step, upcoming, width, running]);
	const paneRunning = running && !panelOpen;
	const hint = ambient ? '' : fullscreen ? fullscreenHint(view, videoState) : focused ? '▶ trocar · OK tela cheia' : '';

	return (
		<div class={`window${fullscreen ? ' window--full' : ''}${ambient ? ' window--ambient' : ''}${focused && !fullscreen ? ' window--focused' : ''}`}>
			{view === 'satellite' && <SatellitePane key={step} running={paneRunning} width={width} height={height} timeFormat={timeFormat} onDone={next} />}
			{view === 'radar' && <RadarPane key={`${step}:${width}`} running={paneRunning} width={width} height={height} loops={mode === 'auto' ? RADAR_LOOPS[severity] : RADAR_LOOPS[0]} timeFormat={timeFormat} onDone={next} />}
			{view === 'planes' && <PlanesPane key={`${step}:${width}`} running={paneRunning} width={width} height={height} onDone={next} />}
			{view === 'history' && <HistoryPane key={step} running={paneRunning} onDone={next} />}
			{view === 'photos' && <PhotosPane key={step} running={paneRunning} photos={photos} ordered={ordered} width={width} height={height} nav={photoNav} videoCmd={videoCmd} onVideoState={onVideoState} onStale={onPhotosStale} onDone={next} />}
			<div class="window__chips">
				{MODES.map((m) => (
					<span key={m} class={`chip${m === mode ? ' chip--on' : ''}${mode === 'auto' && m === view ? ' chip--current' : ''}`}>{MODE_LABEL[m]}</span>
				))}
			</div>
			{hint && <div class="window__hint">{hint}</div>}
			{panelOpen && fullscreen && view === 'photos' && <AlbumPanel url={managerUrl} albums={albums} choice={albumChoice} focus={panelRow} />}
		</div>
	);
}

function fullscreenHint (view: ViewId, video: VideoState): string {
	if (view !== 'photos') return '▲ ▼ trocar · OK ou Voltar sai da tela cheia';
	if (video === 'loading') return 'Voltar cancela';
	if (video === 'playing' || video === 'paused') return '◀ ▶ 10 s · OK pausa · Voltar para o vídeo';
	if (video === 'poster') return 'OK assistir · ◀ ▶ fotos · ▲ ▼ trocar · Voltar sai';
	return '◀ ▶ fotos · ▲ ▼ trocar · OK álbuns · Voltar sai';
}

/** Auto mode's cycle for each severity: settled weather gives the radar one turn in
 *  five; rain gives it two in six; a storm leaves only the radar and the satellite. */
function sequence (severity: Severity, hasPhotos: boolean): ViewId[] {
	if (severity === 3) return ['radar', 'satellite', 'radar'];
	const views: ViewId[] = severity === 0
		? ['satellite', 'planes', 'radar', 'photos', 'history']
		: ['radar', 'satellite', 'radar', 'planes', 'photos', 'history'];
	return hasPhotos ? views : views.filter((v) => v !== 'photos');
}

/** How many times the radar animation plays per turn, by severity. */
const RADAR_LOOPS: Record<Severity, number> = {0: 2, 1: 2, 2: 3, 3: 4};

/** Caption in the bottom-left corner of a pane. */
export function Caption ({title, credit}: {title: string; credit: string}) {
	return (
		<div class="window__caption">
			<div class="window__title">{title}</div>
			<div class="window__credit">{credit}</div>
		</div>
	);
}
