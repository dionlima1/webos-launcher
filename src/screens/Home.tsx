import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Clock} from '../components/Clock';
import {Glyph, type GlyphName} from '../components/Glyph';
import {Row} from '../components/Row';
import type {TileModel} from '../components/Tile';
import {Window} from '../components/window/Window';
import type {PhotoNav, VideoCmd, VideoState} from '../components/window/PhotosPane';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useClock} from '../hooks/useClock';
import {useTimeFormat} from '../hooks/useTimeFormat';
import {photosOfAlbum, type AlbumRef, type Photo} from '../lib/album';
import type {SaverConfig} from '../lib/storage';
import type {Weather} from '../lib/weather';
import {loadWindowState, saveWindowState, stepMode, type ViewId, type WindowMode} from '../lib/windowState';
import {APP_GRID, LAYOUT} from '../theme/tokens';

export interface HomeButton {
	key: string;
	label: string;
	glyph: GlyphName;
}

interface Props {
	/** the ambient view (instead of LG's screensaver): the window full screen */
	ambient: boolean;
	/** what the ambient view shows, and how long each view stays (Settings) */
	saver: SaverConfig;
	/** apps and inputs, already in today's order */
	tiles: TileModel[];
	/** small buttons beside the clock (LG Home, Settings) */
	buttons: HomeButton[];
	active: boolean;
	/** the app is on screen; the window pauses when it isn't */
	visible: boolean;
	weather: Weather | null;
	photos: Photo[];
	albums: AlbumRef[];
	/** the phone album manager's address (QR code), once the service has answered */
	managerUrl: string | null;
	/** photos stopped loading (their links expire): re-read the albums */
	onPhotosStale: () => void;
	emptyText: string;
	onActivate: (item: TileModel | HomeButton) => void;
}

/** Where the remote's focus is: the buttons by the clock, the grid, or the window. */
type Zone = 'buttons' | 'grid' | 'window';

const COLS = LAYOUT.appColumns;

/** Layout A: the clock and a grid of apps on the left, the window (satellite, radar,
 *  photos) on the right. Right from the grid's last column moves into the window, where
 *  Right changes the mode and OK goes full screen. In full screen ▲ ▼ change the mode,
 *  ◀ ▶ go back and forth through the photos, OK on the photos opens the album panel
 *  (pick one album or all of them; QR code to add or remove), OK on a video plays it,
 *  Back leaves. The mode, full screen and chosen album are remembered for the next start. */
export function Home ({ambient, saver, tiles, buttons, active, visible, weather, photos, albums, managerUrl, onPhotosStale, emptyText, onActivate}: Props) {
	const now = useClock();
	const timeFormat = useTimeFormat();
	const [zone, setZone] = useState<Zone>('grid');
	const [index, setIndex] = useState(0);          // focused tile, in the flat list
	const [button, setButton] = useState(0);
	const [gridTop, setGridTop] = useState(0);       // first visible grid line
	const [windowState, setWindowState] = useState(loadWindowState);
	const [panelOpen, setPanelOpen] = useState(false);
	const [view, setView] = useState<ViewId>('satellite');
	const [photoNav, setPhotoNav] = useState<PhotoNav | null>(null);
	const [panelRow, setPanelRow] = useState(0);      // album panel: 0 = all albums, then one per album
	const [videoState, setVideoState] = useState<VideoState>('none');
	const [videoCmd, setVideoCmd] = useState<VideoCmd | null>(null);
	const sendVideo = (action: VideoCmd['action']) => setVideoCmd((c) => ({id: (c ? c.id : 0) + 1, action}));
	const {mode, fullscreen} = windowState;

	// The chosen album, if it is still on the TV; its photos go in date order, a trip
	// told from start to finish. Without a choice every album is shuffled together.
	const album = windowState.album && albums.some((a) => a.url === windowState.album) ? windowState.album : null;
	const shownPhotos = useMemo(() => (album ? photosOfAlbum(photos, album) : photos), [photos, album]);
	const panelChoices = [null as string | null].concat(albums.map((a) => a.url));

	const updateWindow = (next: {mode?: WindowMode; fullscreen?: boolean; album?: string | null}) => {
		setWindowState((current) => {
			const updated = {
				mode: next.mode || current.mode,
				fullscreen: next.fullscreen !== undefined ? next.fullscreen : current.fullscreen,
				album: next.album !== undefined ? next.album : current.album
			};
			saveWindowState(updated);
			return updated;
		});
		if (next.mode || next.fullscreen === false) setPanelOpen(false);
	};

	const openPanel = () => {
		setPanelRow(Math.max(0, panelChoices.indexOf(album)));
		setPanelOpen(true);
	};

	const lines = chunk(tiles, COLS);
	const focused = clamp(index, 0, Math.max(0, tiles.length - 1));
	const line = Math.floor(focused / COLS);
	const col = focused % COLS;

	// Keep the focused line inside the visible part of the grid.
	useEffect(() => {
		const maxTop = Math.max(0, lines.length - LAYOUT.appRowsVisible);
		setGridTop((top) => {
			if (line < top) return line;
			if (line >= top + LAYOUT.appRowsVisible) return line - LAYOUT.appRowsVisible + 1;
			return clamp(top, 0, maxTop);
		});
	}, [line, lines.length]);

	const handleKey = useCallback((key: NavKey): boolean => {
		if (fullscreen && panelOpen) {
			// the album panel: ▲ ▼ pick a row, OK shows it, Back closes
			if (key === 'up' || key === 'down') setPanelRow((r) => clamp(r + (key === 'up' ? -1 : 1), 0, panelChoices.length - 1));
			else if (key === 'enter') { updateWindow({album: panelChoices[panelRow]}); setPanelOpen(false); }
			else if (key === 'back') setPanelOpen(false);
			return true;
		}
		if (fullscreen && view === 'photos' && (videoState === 'loading' || videoState === 'playing' || videoState === 'paused')) {
			// a video: OK pauses, ◀ ▶ jump 10 s, Back stops it (and stays in full screen)
			if (key === 'enter') sendVideo('toggle');
			else if (key === 'left') sendVideo('back');
			else if (key === 'right') sendVideo('forward');
			else if (key === 'back') sendVideo('stop');
			return true;
		}
		if (fullscreen) {
			// ◀ ▶ browse the photos; ▲ ▼ change what's shown (◀ ▶ are free here, unlike
			// on the home screen where they move between the apps and the window).
			if (key === 'up' || key === 'down') updateWindow({mode: stepMode(mode, key === 'up' ? -1 : 1)});
			else if ((key === 'left' || key === 'right') && view === 'photos') setPhotoNav((n) => ({id: (n ? n.id : 0) + 1, delta: key === 'left' ? -1 : 1}));
			else if (key === 'left' || key === 'right') { /* nothing to browse in this view */ }
			else if (key === 'enter' && view === 'photos' && videoState === 'poster') sendVideo('play');
			else if (key === 'enter' && view === 'photos') openPanel();
			else if (key === 'enter' || key === 'back') { updateWindow({fullscreen: false}); setZone('window'); }
			return true;
		}
		if (key === 'back') return true;   // swallow: Back on the home screen does nothing
		if (zone === 'buttons') {
			if (key === 'left') setButton((b) => clamp(b - 1, 0, buttons.length - 1));
			else if (key === 'right') { if (button < buttons.length - 1) setButton(button + 1); else setZone('window'); }
			else if (key === 'down' && tiles.length) setZone('grid');
			else if (key === 'enter' && buttons[button]) onActivate(buttons[button]);
			return true;
		}
		if (zone === 'window') {
			if (key === 'left') setZone(tiles.length ? 'grid' : 'buttons');
			else if (key === 'up') setZone('buttons');
			else if (key === 'right') updateWindow({mode: stepMode(mode, 1)});
			else if (key === 'enter') updateWindow({fullscreen: true});
			return true;
		}
		// grid
		const last = tiles.length - 1;
		switch (key) {
			case 'up':
				if (line === 0) setZone('buttons');
				else setIndex(focused - COLS);
				break;
			case 'down':
				if (line < lines.length - 1) setIndex(Math.min(last, focused + COLS));
				break;
			case 'left':
				if (col > 0) setIndex(focused - 1);
				break;
			case 'right':
				if (col < COLS - 1 && focused < last) setIndex(focused + 1);
				else setZone('window');
				break;
			case 'enter':
				if (tiles[focused]) onActivate(tiles[focused]);
				break;
		}
		return true;
	}, [zone, button, buttons, tiles, focused, line, col, lines.length, onActivate, fullscreen, mode, view, panelOpen, panelRow, album, albums, videoState]);

	useKeys(handleKey, active);

	// The Home button (through the helper) relaunches Início even while it's on screen.
	// In full screen that works like Back, so Home always brings back the apps.
	const fullscreenRef = useRef(fullscreen);
	fullscreenRef.current = fullscreen;
	useEffect(() => {
		const onRelaunch = () => {
			if (!fullscreenRef.current) return;
			updateWindow({fullscreen: false});
			setZone('window');
		};
		document.addEventListener('webOSRelaunch', onRelaunch);
		return () => document.removeEventListener('webOSRelaunch', onRelaunch);
	}, []);

	const room = 2 * LAYOUT.focusRoom;
	return (
		<div class="screen screen--home">
			<Clock now={now} format={timeFormat} weather={weather} />
			<div class="home-buttons">
				{buttons.map((b, i) => (
					<div
						key={b.key}
						class={`home-button${zone === 'buttons' && i === button ? ' home-button--focused' : ''}`}
						onMouseEnter={() => { setZone('buttons'); setButton(i); }}
						onClick={() => onActivate(b)}
					>
						<Glyph name={b.glyph} />
						<span>{b.label}</span>
					</div>
				))}
			</div>
			<div class="app-grid" style={{width: `${APP_GRID.width + room}px`, height: `${APP_GRID.height + room}px`}}>
				{tiles.length === 0
					? <div class="row__empty">{emptyText}</div>
					: <div class="app-grid__track" style={{transform: `translateY(${-gridTop * APP_GRID.rowPitch}px)`}}>
						{lines.map((items, i) => (
							<Row
								key={i}
								label=""
								items={items}
								size="large"
								focused={zone === 'grid' && i === line}
								selected={col}
								onSelect={(c) => { setZone('grid'); setIndex(i * COLS + c); }}
								onActivate={(c) => onActivate(items[c])}
							/>
						))}
					</div>}
			</div>
			<div class={`window-slot${ambient || fullscreen ? ' window-slot--full' : ''}`} onClick={() => updateWindow({fullscreen: !fullscreen})} onMouseEnter={() => setZone('window')}>
				<Window
					mode={ambient ? saver.views : mode}
					pace={ambient ? saver.pace : 1}
					fullscreen={ambient || fullscreen}
					ambient={ambient}
					focused={zone === 'window'}
					running={active && visible}
					severity={weather ? weather.severity : 0}
					photos={shownPhotos}
					ordered={album !== null}
					albums={albums}
					albumChoice={album}
					panelRow={panelRow}
					managerUrl={managerUrl}
					panelOpen={panelOpen && !ambient}
					photoNav={photoNav}
					videoCmd={videoCmd}
					videoState={videoState}
					onVideoState={setVideoState}
					onPhotosStale={onPhotosStale}
					timeFormat={timeFormat}
					onView={setView}
				/>
			</div>
		</div>
	);
}

function chunk<T> (list: T[], size: number): T[][] {
	const lines: T[][] = [];
	for (let i = 0; i < list.length; i += size) lines.push(list.slice(i, i + size));
	return lines;
}
