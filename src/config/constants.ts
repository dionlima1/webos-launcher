// App-wide constants that are not visual tokens (see theme/tokens.ts for those).

export const APP_ID = 'io.github.dionlima1.launcher';

/** webOS app IDs the launcher itself needs. */
export const SYSTEM_APP = {
	lgHome: 'com.webos.app.home',
	liveTv: 'com.webos.app.livetv',
	homebrewChannel: 'org.webosbrew.hbchannel'
} as const;

/** Luna service URIs. A sideloaded web app on webOS 6 may only call methods in the
 *  TV's "public" LS2 group; everything here except homebrewExec is in that group. */
export const LUNA = {
	launch: 'luna://com.webos.applicationManager/launch',
	appLoadStatus: 'luna://com.webos.applicationManager/getAppLoadStatus',
	inputStatus: 'luna://com.webos.service.eim/getAllInputStatus',
	preferences: 'luna://com.webos.service.systemservice/getPreferences',
	/** Homebrew Channel's root shell; only used when the user opts in (see lib/apps.ts) */
	homebrewExec: 'luna://org.webosbrew.hbchannel.service/exec',
	/** our own JS service (services/album), packaged with the app */
	albumList: 'luna://io.github.dionlima1.launcher.album/list',
	/** subscription: the phone album manager's address and album edits */
	albumManager: 'luna://io.github.dionlima1.launcher.album/manager',
	/** subscription: downloads an album video for playback (progress, then `src`) */
	prepareVideo: 'luna://io.github.dionlima1.launcher.album/prepareVideo',
	/** aircraft near a point, from adsb.lol via our service */
	planes: 'luna://io.github.dionlima1.launcher.album/planes',
	/** subscription: the TV asks before starting LG's screensaver (lib/screensaver.ts) */
	screenSaverRequest: 'luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
	screenSaverResponse: 'luna://com.webos.service.tvpower/power/responseScreenSaverRequest'
} as const;

/** Web sources for the home screen's window. All free and keyless; each needs the
 *  credit shown in the window's caption. */
export const FEED = {
	/** NOAA STAR's GOES-19 imagery; the directory listing names each frame by time */
	goesSector: 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/',
	rainviewerMaps: 'https://api.rainviewer.com/public/weather-maps.json',
	/** Esri's dark grey canvas: the map, then names and borders to lay over the radar.
	 *  {z}/{y}/{x} filled in; 256-px tiles. (CARTO's dark tiles now need an API key.) */
	esriDarkBase: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
	esriDarkLabels: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
	openMeteo: 'https://api.open-meteo.com/v1/forecast',
	/** dev server stand-ins for the album service (see vite.config.ts) */
	albumDev: '/__album',
	videoDev: '/__video',
	planesDev: '/__planes',
	/** Wikipedia's "on this day" in Portuguese (CORS-enabled) */
	onThisDay: 'https://api.wikimedia.org/feed/v1/wikipedia/pt/onthisday/'
} as const;

/** Remote-control key codes as delivered to a webOS web app. */
export const KEY = {
	left: 37, up: 38, right: 39, down: 40,
	enter: 13,
	back: 461,          // webOS "BACK" (needs disableBackHistoryAPI in appinfo.json)
	escape: 27          // handy when developing in a desktop browser
} as const;

export const TIMING = {
	lunaTimeoutMs: 4000,
	toastMs: 2200,
	clockTickMs: 1000,
	longPressMs: 600,       // OK held this long enters/leaves re-order mode
	satelliteMs: 20000,     // how long each window view stays up
	radarFrameMs: 450,      // radar animation step
	radarHoldMs: 2500,      // pause on the newest radar frame
	photoMs: 10000,
	videoPosterMs: 20000,
	planesMs: 30000,        // one turn of the planes map
	planesRefreshMs: 8000,  // new positions
	historyMs: 14000,       // each "on this day" event
	historyPerTurn: 2,   // a video waits longer for OK before the slideshow moves on
	photosPerTurn: 3,
	feedRefreshMs: 10 * 60 * 1000,     // satellite and radar publish every 10 minutes
	weatherRefreshMs: 15 * 60 * 1000,
	albumRefreshMs: 6 * 60 * 60 * 1000,
	inputsRefreshMs: 5 * 60 * 1000,
	retryMs: 10000,
	staleReloadGapMs: 2 * 60 * 1000,   // at most one album re-read after failed photos this often         // first retry after a failed load (doubles each time)
	videoSeekMs: 10000,     // ◀ ▶ while a video plays
	ambientMaxMs: 60 * 60 * 1000,   // our ambient view, before LG's screensaver may start
	webTimeoutMs: 20000,
	albumTimeoutMs: 40000
} as const;

/** localStorage key for the user's selections. Bump the suffix on breaking changes. */
export const STORAGE_KEY = 'launcher-config-v1';
/** how often each tile was opened, and the day's tile order (lib/usage.ts) */
export const USAGE_KEY = 'launcher-usage-v1';
/** each album's last photo list, so photos show at once after a restart (lib/album.ts) */
export const ALBUM_CACHE_KEY = 'launcher-album-cache-v3';   // v3: items carry `video`
/** the albums on the TV, as edited from the phone */
export const ALBUMS_KEY = 'launcher-albums-v1';
/** what the window was showing (mode and full screen), restored at the next start */
export const WINDOW_KEY = 'launcher-window-v1';
