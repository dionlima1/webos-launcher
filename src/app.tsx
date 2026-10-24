import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Home, type HomeButton} from './screens/Home';
import {Settings, type SettingsTab} from './screens/Settings';
import type {OptionItem} from './components/OptionList';
import {Toast, type ToastMessage} from './components/Toast';
import type {TileModel} from './components/Tile';
import {cachedPhotos, describeAlbumRefs, loadAlbumRefs, loadPhotos, saveAlbumRefs, type AlbumRef, type Photo} from './lib/album';
import {connectAlbumManager, pushAlbumsToManager} from './lib/albumManager';
import {listApps, type AppEntry} from './lib/apps';
import {listInputs, MOCK_INPUTS, type InputSource} from './lib/inputs';
import {launchApp, launchLgHome} from './lib/launch';
import {isWebOS} from './lib/luna';
import {hidePointerOnForeground} from './lib/pointer';
import {loadConfig, saveConfig, toggleId, type UserConfig} from './lib/storage';
import {appTile, inputTile, pickInOrder} from './lib/tiles';
import {orderForToday, recordLaunch} from './lib/usage';
import {fetchWeather, type Weather} from './lib/weather';
import {answerScreenSaver, watchScreenSaver} from './lib/screensaver';
import {usePageVisible, usePolling, useTimeout} from './hooks/useTimers';
import {TIMING} from './config/constants';
import {LABELS, PLACE, START_ORDER} from './config/home';

type Screen = 'home' | 'settings';

const ROW = {apps: 'apps', sources: 'sources'} as const;
const MISC = {lgHome: 'lg-home', settings: 'settings'} as const;
const OPTION = {useHomebrew: 'use-homebrew'} as const;

const BUTTONS: HomeButton[] = [
	{key: MISC.lgHome, label: 'LG Home', glyph: 'house'},
	{key: MISC.settings, label: 'Ajustes', glyph: 'gear'}
];

export function App () {
	const [screen, setScreen] = useState<Screen>('home');
	const [config, setConfig] = useState<UserConfig>(loadConfig);
	const [apps, setApps] = useState<AppEntry[]>([]);
	const [inputs, setInputs] = useState<InputSource[]>([]);
	const [weather, setWeather] = useState<Weather | null>(null);
	const [albums, setAlbums] = useState<AlbumRef[]>(loadAlbumRefs);
	const [photos, setPhotos] = useState<Photo[]>(() => cachedPhotos(loadAlbumRefs()));
	const [managerUrl, setManagerUrl] = useState<string | null>(null);
	const albumsRef = useRef(albums);
	albumsRef.current = albums;
	const [toast, setToast] = useState<ToastMessage | null>(null);
	const toastTimer = useRef(0);
	const visible = usePageVisible();

	const showToast = useCallback((text: string, kind: ToastMessage['kind'] = 'info') => {
		window.clearTimeout(toastTimer.current);
		setToast({text, kind});
		toastTimer.current = window.setTimeout(() => setToast(null), TIMING.toastMs);
	}, []);

	// Start in remote (5-way) mode: hide the Magic Remote pointer whenever we come to the
	// front. Shaking the remote still brings it back.
	useEffect(() => hidePointerOnForeground(), []);

	// Load apps at start and whenever the Homebrew option changes; refresh inputs whenever
	// the app comes back to the foreground (labels or connections may have changed).
	useEffect(() => {
		listApps(config.useHomebrew)
			.then(({apps: list, source}) => {
				setApps(list);
				if (config.useHomebrew && source !== 'homebrew') showToast('Homebrew Channel not available, using the built-in app list', 'error');
			})
			.catch(() => showToast('Could not read the app list', 'error'));
	}, [config.useHomebrew, showToast]);

	// Inputs, weather and the photo album refresh only while we're on screen, and are
	// retried soon after a failure (on the TV a call made at launch can fail).
	usePolling(visible, TIMING.inputsRefreshMs, () => (isWebOS() ? listInputs() : Promise.resolve(MOCK_INPUTS)).then(setInputs));
	usePolling(visible, TIMING.weatherRefreshMs, () => fetchWeather(PLACE).then(setWeather));
	// Photos that stop loading may mean Google changed their links: re-read the albums at
	// once (at most every couple of minutes, in case the failures have another cause).
	const [staleCount, setStaleCount] = useState(0);
	const forceReload = useRef(false);
	const lastForced = useRef(0);
	const onPhotosStale = useCallback(() => {
		if (Date.now() - lastForced.current < TIMING.staleReloadGapMs) return;
		lastForced.current = Date.now();
		forceReload.current = true;
		setStaleCount((n) => n + 1);
	}, []);

	const albumsKey = `${albums.map((a) => a.url).join('|')}#${staleCount}`;
	usePolling(visible, TIMING.albumRefreshMs, () => {
		const force = forceReload.current;
		forceReload.current = false;
		return loadPhotos(albumsRef.current, force).then((list) => {
		setPhotos(list);
		// The album from home.local.ts starts without a title; fill it in for the phone page.
		const described = describeAlbumRefs(albumsRef.current);
		if (described !== albumsRef.current) { setAlbums(described); saveAlbumRefs(described); pushAlbumsToManager(described); }
		}, (error) => {
			if (!albumsRef.current.length) setPhotos([]);
			throw error;
		});
	}, albumsKey);

	// Ambient view: when LG's screensaver would start, we say no and show the window in
	// full screen, automatic mode, instead. After an hour (or at the TV's next request
	// past that hour) we let LG's screensaver start. Any key ends it and resets the hour.
	const [ambient, setAmbient] = useState(false);
	const ambientSince = useRef(0);     // 0 while not ambient
	const ambientSpent = useRef(false);  // the hour was used up; LG's screensaver is next
	const visibleRef = useRef(visible);
	visibleRef.current = visible;

	const endAmbient = useCallback((spent: boolean) => {
		ambientSince.current = 0;
		ambientSpent.current = spent;
		setAmbient(false);
	}, []);

	useEffect(() => watchScreenSaver((timestamp) => {
		const now = Date.now();
		const withinHour = ambientSince.current === 0 || now - ambientSince.current < TIMING.ambientMaxMs;
		if (!ambientSpent.current && withinHour && visibleRef.current) {
			answerScreenSaver(timestamp, false);
			if (ambientSince.current === 0) { ambientSince.current = now; setAmbient(true); }
		} else {
			answerScreenSaver(timestamp, true);
			endAmbient(true);
		}
	}), []);

	// The hour is up even if the TV doesn't ask again: leave the ambient view, so the
	// screen is still and LG's screensaver gets its turn at the next request.
	useTimeout(ambient, TIMING.ambientMaxMs, () => endAmbient(true));

	// Any key: back to where things were (the key itself only wakes the screen).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			ambientSpent.current = false;
			if (!ambientSince.current) return;
			e.stopImmediatePropagation();
			e.preventDefault();
			endAmbient(false);
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, []);
	useEffect(() => { if (!visible && ambientSince.current) endAmbient(false); }, [visible]);

	// The phone album manager: its address for the QR code, and the albums it edits.
	useEffect(() => connectAlbumManager(() => albumsRef.current, setManagerUrl, (list) => {
		setAlbums(list);
		saveAlbumRefs(list);
	}), []);

	const updateConfig = (next: UserConfig) => { setConfig(next); saveConfig(next); };

	// ----- the home grid -----
	const shownApps = useMemo(() => pickInOrder(apps, config.appIds, (a) => a.id), [apps, config.appIds]);
	const shownInputs = useMemo(
		() => (config.sourceIds ? pickInOrder(inputs, config.sourceIds, (s) => s.appId) : inputs),
		[inputs, config.sourceIds]
	);

	// Apps and connected inputs in one list: START_ORDER first, then the rest, then
	// re-ranked by use (frozen for the day, see lib/usage.ts).
	const tiles: TileModel[] = useMemo(() => {
		const all = shownApps.map(appTile).concat(shownInputs.filter((s) => s.connected).map(inputTile));
		const byKey: Record<string, TileModel> = {};
		for (const t of all) byKey[t.key] = LABELS[t.key] ? {...t, label: LABELS[t.key]} : t;
		const start = START_ORDER.filter((key) => byKey[key]);
		const base = start.concat(all.map((t) => t.key).filter((key) => start.indexOf(key) === -1));
		return orderForToday(base).map((key) => byKey[key]);
	}, [shownApps, shownInputs]);

	const tabs: SettingsTab[] = useMemo(() => [
		{id: ROW.apps, label: 'Apps', noun: 'apps', items: apps.map(appTile), shown: shownApps.map(appTile)},
		{id: ROW.sources, label: 'Sources', noun: 'sources', items: inputs.map(inputTile), shown: shownInputs.map(inputTile)}
	], [apps, inputs, shownApps, shownInputs]);

	const options: OptionItem[] = useMemo(() => [
		{
			id: OPTION.useHomebrew,
			label: 'Live app list via Homebrew Channel',
			description: 'Rooted TVs only. Lists every installed app with its real icon, using the Homebrew Channel, which runs commands as root. When off, the built-in app catalogue is used.',
			value: config.useHomebrew
		}
	], [config.useHomebrew]);

	// ----- actions -----
	const onActivate = useCallback((item: TileModel | HomeButton) => {
		if (item.key === MISC.settings) { setScreen('settings'); return; }
		if (item.key === MISC.lgHome) { launchLgHome().catch(() => showToast('Não deu para abrir a LG Home', 'error')); return; }
		recordLaunch(item.key);
		launchApp(item.key).catch(() => showToast(`Não deu para abrir ${item.label}`, 'error'));
	}, [showToast]);

	const onToggle = useCallback((tabId: string, key: string) => {
		if (tabId === ROW.apps) {
			updateConfig({...config, appIds: toggleId(config.appIds, key)});
		} else {
			const current = config.sourceIds || inputs.map((s) => s.appId);
			updateConfig({...config, sourceIds: toggleId(current, key)});
		}
	}, [config, inputs]);

	const onOption = useCallback((optionId: string) => {
		if (optionId === OPTION.useHomebrew) updateConfig({...config, useHomebrew: !config.useHomebrew});
	}, [config]);

	/** Replace a row's order with `keys` (the full list of what's shown). */
	const onReorder = useCallback((tabId: string, keys: string[]) => {
		if (tabId === ROW.apps) updateConfig({...config, appIds: keys});
		else updateConfig({...config, sourceIds: keys});
	}, [config]);

	return (
		<>
			{/* Home stays mounted under Settings so it keeps its focus position. */}
			<Home
				ambient={ambient}
				tiles={tiles}
				buttons={BUTTONS}
				active={screen === 'home'}
				visible={visible}
				weather={weather}
				photos={photos}
				albums={albums}
				managerUrl={managerUrl}
				onPhotosStale={onPhotosStale}
				emptyText="Nenhum app escolhido. Adicione em Ajustes."
				onActivate={onActivate}
			/>
			{screen === 'settings' && <Settings tabs={tabs} options={options} active onToggle={onToggle} onReorder={onReorder} onOption={onOption} onClose={() => setScreen('home')} />}
			<Toast message={toast} />
		</>
	);
}
