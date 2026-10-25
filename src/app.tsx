import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Home, type HomeButton} from './screens/Home';
import {Settings, type SettingsTab} from './screens/Settings';
import type {OptionItem} from './components/OptionList';
import {Toast, type ToastMessage} from './components/Toast';
import type {TileModel} from './components/Tile';
import {cachedPhotos, describeAlbumRefs, loadAlbumRefs, loadPhotos, saveAlbumRefs, type AlbumRef, type Photo} from './lib/album';
import {connectAlbumManager, pushAlbumsToManager} from './lib/albumManager';
import {cachedTvApps, hasTvPermission, listApps, type AppEntry} from './lib/apps';
import {listInputs, MOCK_INPUTS, type InputSource} from './lib/inputs';
import {launchApp, launchLgHome} from './lib/launch';
import {isWebOS} from './lib/luna';
import {hidePointerOnForeground} from './lib/pointer';
import {armPowerOn, type BootReport} from './lib/boot';
import {loadConfig, saveConfig, SAVER_CHOICES, toggleId, type SaverConfig, type UserConfig} from './lib/storage';
import {MODES, MODE_LABEL} from './lib/windowState';
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
const OPTION = {
	useTvApps: 'use-tv-apps',
	saver: 'saver',
	saverStart: 'saver-start',
	saverViews: 'saver-views',
	saverPace: 'saver-pace',
	saverMax: 'saver-max'
} as const;

const PACE_LABEL: Record<number, string> = {0.5: 'Curto', 1: 'Normal', 2: 'Longo', 6: 'Bem longo'};

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

	const showToast = useCallback((text: string, kind: ToastMessage['kind'] = 'info', ms: number = TIMING.toastMs) => {
		window.clearTimeout(toastTimer.current);
		setToast({text, kind});
		toastTimer.current = window.setTimeout(() => setToast(null), ms);
	}, []);

	// Start in remote (5-way) mode: hide the Magic Remote pointer whenever we come to the
	// front. Shaking the remote still brings it back.
	useEffect(() => hidePointerOnForeground(), []);

	// The Home button helper after a power-on (lib/boot.ts).
	useEffect(() => {
		armPowerOn().then((report) => { (window as unknown as {__bootReport: BootReport}).__bootReport = report; });
	}, []);

	// Load apps at start and whenever the TV-list option changes. The TV's own list (with
	// LG's icons) needs its permission once: without it the TV shows a prompt, so we say
	// what to do; if it's refused we don't ask again until the option is switched back on.
	useEffect(() => {
		const useTv = config.useTvApps && isWebOS();
		const cached = useTv ? cachedTvApps() : null;
		if (cached) setApps(cached);
		const asking = useTv && !hasTvPermission();
		if (asking) showToast('Para mostrar os ícones da LG, aceite o pedido que apareceu na TV.', 'info', 60000);
		listApps(config.useHomebrew, useTv)
			.then(({apps: list, source}) => {
				setApps(list);
				if (asking && source !== 'tv') {
					updateConfig({...config, useTvApps: false});
					showToast('Sem permissão da TV: usando os ícones do Início. Dá para tentar de novo em Ajustes.', 'error', 6000);
				} else if (asking) {
					showToast('Pronto: ícones e apps da TV.', 'info', 3000);
				}
			})
			.catch(() => showToast('Não deu para ler a lista de apps.', 'error'));
	}, [config.useHomebrew, config.useTvApps, showToast]);

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

	// Ambient view (Início's screensaver, set up in Settings): the window in full screen
	// instead of LG's screensaver. It starts when the TV asks to start its own (about two
	// minutes without a key), or after the minutes chosen in Settings, whichever is later;
	// after its time is up we let LG's screensaver start. Any key ends it and resets that.
	const [ambient, setAmbient] = useState(false);
	const ambientSince = useRef(0);     // 0 while not ambient
	const ambientSpent = useRef(false);  // its time was used up; LG's screensaver is next
	const lastInput = useRef(Date.now());
	const visibleRef = useRef(visible);
	visibleRef.current = visible;
	const saverRef = useRef(config.saver);
	saverRef.current = config.saver;
	const saver = config.saver;

	const startAmbient = useCallback(() => {
		ambientSince.current = Date.now();
		setAmbient(true);
		setScreen('home');   // Settings left open would cover it and keep the window still
	}, []);
	const endAmbient = useCallback((spent: boolean) => {
		ambientSince.current = 0;
		ambientSpent.current = spent;
		setAmbient(false);
	}, []);

	useEffect(() => watchScreenSaver((timestamp) => {
		const s = saverRef.current;
		const now = Date.now();
		if (!s.enabled || ambientSpent.current || !visibleRef.current) {
			answerScreenSaver(timestamp, true);
			if (ambientSince.current) endAmbient(true);
		} else if (ambientSince.current) {
			const withinTime = now - ambientSince.current < s.maxMinutes * 60000;
			answerScreenSaver(timestamp, !withinTime);
			if (!withinTime) endAmbient(true);
		} else {
			// Not yet (a later start was chosen): keep LG's away; our own timer starts it.
			answerScreenSaver(timestamp, false);
			if (now - lastInput.current >= s.startMinutes * 60000) startAmbient();
		}
	}), []);

	// A later start than the TV's: our own timer, checked while the home screen is up.
	const ownTimer = saver.enabled && saver.startMinutes > 0 && visible && !ambient;
	useEffect(() => {
		if (!ownTimer) return;
		const id = window.setInterval(() => {
			const idle = Date.now() - lastInput.current;
			if (!ambientSpent.current && visibleRef.current && idle >= saverRef.current.startMinutes * 60000) startAmbient();
		}, TIMING.saverCheckMs);
		return () => window.clearInterval(id);
	}, [ownTimer]);

	// Its time is up even if the TV doesn't ask again: leave the ambient view, so the
	// screen is still and LG's screensaver gets its turn at the next request.
	useTimeout(ambient, saver.maxMinutes * 60000, () => endAmbient(true));

	// Any key: back to where things were (the key itself only wakes the screen). The Home
	// button never reaches the page as a key (the helper takes it and relaunches Início),
	// so a relaunch counts as one. Moving the Magic Remote's pointer counts as use too.
	useEffect(() => {
		const wake = (): boolean => {
			lastInput.current = Date.now();
			ambientSpent.current = false;
			if (!ambientSince.current) return false;
			endAmbient(false);
			return true;
		};
		const onKey = (e: KeyboardEvent) => {
			if (!wake()) return;
			e.stopImmediatePropagation();
			e.preventDefault();
		};
		const onPointer = () => { lastInput.current = Date.now(); };
		const onRelaunch = () => { wake(); };
		window.addEventListener('keydown', onKey, true);
		window.addEventListener('mousemove', onPointer, true);
		document.addEventListener('webOSRelaunch', onRelaunch);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			window.removeEventListener('mousemove', onPointer, true);
			document.removeEventListener('webOSRelaunch', onRelaunch);
		};
	}, []);
	useEffect(() => {
		lastInput.current = Date.now();
		if (!visible && ambientSince.current) endAmbient(false);
	}, [visible]);

	// The phone album manager: its address for the QR code, and the albums it edits.
	useEffect(() => connectAlbumManager(() => albumsRef.current, setManagerUrl, (list) => {
		setAlbums(list);
		saveAlbumRefs(list);
	}), []);

	const updateConfig = (next: UserConfig) => { setConfig(next); saveConfig(next); };

	// ----- the home grid -----
	// Every installed app, unless hidden in Settings; the order comes from use (below).
	const shownApps = useMemo(() => apps.filter((a) => config.hiddenAppIds.indexOf(a.id) === -1), [apps, config.hiddenAppIds]);
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
		{id: ROW.apps, label: 'Apps', noun: 'apps', items: apps.map(appTile), shown: shownApps.map(appTile), reorderable: false},
		{id: ROW.sources, label: 'Sources', noun: 'sources', items: inputs.map(inputTile), shown: shownInputs.map(inputTile)}
	], [apps, inputs, shownApps, shownInputs]);

	const options: OptionItem[] = useMemo(() => {
		const s = config.saver;
		const off = !s.enabled;
		return [
			{
				id: OPTION.useTvApps,
				label: 'Apps e ícones da TV',
				description: 'Usa a lista de apps instalados e os ícones da própria LG. Na primeira vez a TV pede permissão na tela. Desligado, usa o catálogo do Início.',
				value: config.useTvApps
			},
			{
				id: OPTION.saver,
				label: 'Descanso de tela do Início',
				description: 'Quando a TV fica parada, mostra a janela em tela cheia no lugar do descanso da LG. Desligado, entra o descanso da própria LG.',
				value: s.enabled
			},
			{
				id: OPTION.saverStart,
				label: 'Começa depois de',
				description: 'Tempo sem apertar nenhuma tecla. A TV pede o descanso por volta de 2 minutos; na OLED, tela parada por muito tempo pode marcar, por isso o máximo é 10.',
				value: false,
				choice: s.startMinutes === 0 ? 'Quando a TV pedir' : `${s.startMinutes} minutos`,
				dimmed: off
			},
			{
				id: OPTION.saverViews,
				label: 'O que mostrar',
				description: 'Todas as telas, uma depois da outra, ou só uma delas.',
				value: false,
				choice: s.views === 'auto' ? 'Todas, alternando' : MODE_LABEL[s.views],
				dimmed: off
			},
			{
				id: OPTION.saverPace,
				label: 'Tempo em cada tela',
				description: 'Normal: uns 20 a 30 segundos por tela. Curto é a metade; Longo, o dobro; Bem longo, uns 2 a 3 minutos.',
				value: false,
				choice: PACE_LABEL[s.pace],
				dimmed: off
			},
			{
				id: OPTION.saverMax,
				label: 'Depois, o descanso da LG',
				description: 'Por quanto tempo o descanso do Início fica na tela antes de dar lugar ao da LG, que protege a tela e economiza energia.',
				value: false,
				choice: s.maxMinutes < 60 ? `${s.maxMinutes} minutos` : s.maxMinutes === 60 ? '1 hora' : `${s.maxMinutes / 60} horas`,
				dimmed: off
			}
		];
	}, [config.useTvApps, config.saver]);

	// ----- actions -----
	const onActivate = useCallback((item: TileModel | HomeButton) => {
		if (item.key === MISC.settings) { setScreen('settings'); return; }
		if (item.key === MISC.lgHome) { launchLgHome().catch(() => showToast('Não deu para abrir a LG Home', 'error')); return; }
		recordLaunch(item.key);
		launchApp(item.key).catch(() => showToast(`Não deu para abrir ${item.label}`, 'error'));
	}, [showToast]);

	const onToggle = useCallback((tabId: string, key: string) => {
		if (tabId === ROW.apps) {
			updateConfig({...config, hiddenAppIds: toggleId(config.hiddenAppIds, key)});
		} else {
			const current = config.sourceIds || inputs.map((s) => s.appId);
			updateConfig({...config, sourceIds: toggleId(current, key)});
		}
	}, [config, inputs]);

	const onOption = useCallback((optionId: string, delta: number) => {
		const s = config.saver;
		const setSaver = (patch: Partial<SaverConfig>) => updateConfig({...config, saver: {...s, ...patch}});
		if (optionId === OPTION.useTvApps) updateConfig({...config, useTvApps: !config.useTvApps});
		else if (optionId === OPTION.saver) setSaver({enabled: !s.enabled});
		else if (optionId === OPTION.saverStart) setSaver({startMinutes: stepChoice(SAVER_CHOICES.startMinutes, s.startMinutes, delta)});
		else if (optionId === OPTION.saverViews) setSaver({views: stepChoice(MODES, s.views, delta)});
		else if (optionId === OPTION.saverPace) setSaver({pace: stepChoice(SAVER_CHOICES.pace, s.pace, delta)});
		else if (optionId === OPTION.saverMax) setSaver({maxMinutes: stepChoice(SAVER_CHOICES.maxMinutes, s.maxMinutes, delta)});
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
				saver={saver}
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

/** The next (or previous) value in a list of choices, wrapping around. */
function stepChoice<T> (choices: readonly T[], current: T, delta: number): T {
	const i = choices.indexOf(current);
	return choices[(i + delta + choices.length) % choices.length];
}
