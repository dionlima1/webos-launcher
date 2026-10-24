import {useEffect, useRef, useState} from 'preact/hooks';
import {TIMING} from '../../config/constants';
import {useTimeout} from '../../hooks/useTimers';
import {photoUrl, type Photo} from '../../lib/album';
import {photoDateText} from '../../lib/clock';
import {durationText, prepareVideo} from '../../lib/video';
import {preloadImage} from '../../lib/web';
import {Caption} from './Window';

/** A press of ◀ or ▶ in full screen; `id` changes on every press. */
export interface PhotoNav {
	id: number;
	delta: number;
}

/** What the item on screen is doing: a photo ('none'), a video waiting for OK
 *  ('poster'), or a video being downloaded, played or paused. */
export type VideoState = 'none' | 'poster' | 'loading' | 'playing' | 'paused';

/** A remote command for the video on screen; `id` changes on every press. */
export interface VideoCmd {
	id: number;
	action: 'play' | 'toggle' | 'back' | 'forward' | 'stop';
}

interface Playback {
	state: 'loading' | 'playing' | 'paused';
	/** download progress, 0…1 */
	progress: number;
	src: string | null;
}

interface Props {
	running: boolean;
	/** the photos to show (every album, or the chosen one) */
	photos: Photo[];
	/** keep the given order (one album, by date) instead of shuffling */
	ordered: boolean;
	width: number;
	height: number;
	nav: PhotoNav | null;
	videoCmd: VideoCmd | null;
	onVideoState: (state: VideoState) => void;
	/** a photo failed to load: the album may need to be read again */
	onStale: () => void;
	onDone: () => void;
}

const MAX_FAILURES = 3;

/** A walk through the photos that carries on across turns: shuffled (every photo once
 *  before any repeats) or in the given order. ◀ walks back through it. Starts over when
 *  the set of photos changes. */
const walk = {key: '', order: [] as number[], pos: -1};

/** Identifies a set of photos without their links (Google may hand out new ones when an
 *  album is read again), so a re-read doesn't restart the walk. */
function setKey (photos: Photo[], ordered: boolean): string {
	if (!photos.length) return '';
	const first = photos[0];
	return `${ordered}:${photos.length}:${first.taken}:${first.w}x${first.h}:${first.albumUrl}`;
}

function stepPhoto (photos: Photo[], delta: number, ordered: boolean): Photo {
	const key = setKey(photos, ordered);
	const fresh = () => (ordered ? photos.map((_, i) => i) : shuffle(photos.map((_, i) => i)));
	if (walk.key !== key) {
		walk.key = key;
		walk.order = fresh();
		walk.pos = -1;
	}
	let pos = walk.pos + delta;
	if (pos >= walk.order.length) { walk.order = fresh(); pos = 0; }
	walk.pos = Math.max(0, pos);
	return photos[walk.order[walk.pos]];
}

/** A few photos per turn: the photo fitted inside the pane over a blurred, darkened copy
 *  of itself, with a slow zoom. A video shows its first frame with a play mark; it only
 *  plays when asked (OK in full screen), and the slideshow waits while it does. */
export function PhotosPane ({running, photos, ordered, width, height, nav, videoCmd, onVideoState, onStale, onDone}: Props) {
	/** `position` is 1-based within an ordered album, 0 when shuffled */
	const [photo, setPhoto] = useState<{photo: Photo; src: string; position: number} | null>(null);
	/** what to load next: one step forward or back; `n` makes every request distinct */
	const [request, setRequest] = useState({delta: 1, n: 0});
	const [shown, setShown] = useState(0);
	const [failures, setFailures] = useState(0);
	const lastNav = useRef(nav ? nav.id : 0);   // a press from before this turn doesn't count
	const [playback, setPlayback] = useState<Playback | null>(null);
	const [videoError, setVideoError] = useState('');
	const player = useRef<HTMLVideoElement | null>(null);
	const cancelPrepare = useRef<() => void>(() => undefined);
	const lastCmd = useRef(videoCmd ? videoCmd.id : 0);

	const stopVideo = () => {
		cancelPrepare.current();
		cancelPrepare.current = () => undefined;
		setPlayback(null);
	};

	useEffect(() => {
		if (!nav || nav.id === lastNav.current) return;
		lastNav.current = nav.id;
		stopVideo();
		setShown(0);   // browsing by hand keeps the photos on screen for a full turn
		setRequest((r) => ({delta: nav.delta, n: r.n + 1}));
	}, [nav]);

	// Remote commands for the video on screen.
	useEffect(() => {
		if (!videoCmd || videoCmd.id === lastCmd.current) return;
		lastCmd.current = videoCmd.id;
		const video = player.current;
		switch (videoCmd.action) {
			case 'play': {
				if (!photo || !photo.photo.video || playback) return;
				setVideoError('');
				setPlayback({state: 'loading', progress: 0, src: null});
				cancelPrepare.current = prepareVideo(photo.photo,
					(progress) => setPlayback((pb) => (pb && pb.state === 'loading' ? {...pb, progress} : pb)),
					(src) => setPlayback((pb) => (pb ? {state: 'playing', progress: 1, src} : pb)),
					() => { setPlayback(null); setVideoError('Não deu para tocar este vídeo.'); });
				return;
			}
			case 'toggle':
				if (!video || !playback || playback.state === 'loading') return;
				if (video.paused) { video.play(); setPlayback({...playback, state: 'playing'}); }
				else { video.pause(); setPlayback({...playback, state: 'paused'}); }
				return;
			case 'back':
			case 'forward':
				if (video && playback && playback.src) video.currentTime = Math.max(0, video.currentTime + (videoCmd.action === 'back' ? -1 : 1) * TIMING.videoSeekMs / 1000);
				return;
			case 'stop':
				stopVideo();
		}
	}, [videoCmd]);

	// Leaving full screen (the pane changes size) stops the video; so does unmounting.
	useEffect(() => { stopVideo(); }, [width]);
	useEffect(() => () => { cancelPrepare.current(); onVideoState('none'); }, []);

	const isVideo = !!(photo && photo.photo.video);
	useEffect(() => {
		onVideoState(playback ? playback.state : isVideo ? 'poster' : 'none');
	}, [playback ? playback.state : '', isVideo]);
	useTimeout(!!videoError, 4000, () => setVideoError(''));

	// Load (and decode) the photo before swapping it in.
	useEffect(() => {
		if (!photos.length) return;
		let alive = true;
		const p = stepPhoto(photos, request.delta, ordered);
		const position = ordered ? walk.pos + 1 : 0;
		const src = photoUrl(p, width, height);
		preloadImage(src)
			.then(() => { if (alive) setPhoto({photo: p, src, position}); })
			.catch(() => {
				if (!alive) return;
				onStale();
				setFailures((f) => f + 1);
				setRequest((r) => ({delta: 1, n: r.n + 1}));
			});
		return () => { alive = false; };
	}, [request, setKey(photos, ordered), width]);

	useTimeout(running && failures >= MAX_FAILURES, 0, onDone);
	useTimeout(running && !!photo && !playback, isVideo ? TIMING.videoPosterMs : TIMING.photoMs, () => {
		if (shown + 1 >= TIMING.photosPerTurn) { onDone(); return; }
		setShown(shown + 1);
		setRequest((r) => ({delta: 1, n: r.n + 1}));
	}, photo);

	if (!photos.length) {
		return (
			<div class="pane pane--empty">
				<div class="pane__message">Nenhum álbum na TV ainda.<br />Em tela cheia, aperte OK para adicionar um pelo celular.</div>
			</div>
		);
	}
	if (!photo) return <div class="pane pane--loading" />;
	const date = photo.photo.taken ? `${photoDateText(photo.photo.taken)} · ` : '';
	const kind = photo.photo.video ? `Vídeo de ${durationText(photo.photo.video)}` : '';
	const where = photo.position ? `${photo.position} de ${photos.length}` : 'Google Fotos';
	const when = `${date}${kind ? `${kind} · ` : ''}${where}`;
	return (
		<div class="pane pane--fade" key={photo.src}>
			<div class="photo__backdrop" style={{backgroundImage: `url("${photo.src}")`}} />
			<img class="photo__image" src={photo.src} alt="" style={{animationDuration: `${TIMING.photoMs + 1000}ms`}} />
			{playback && playback.src && (
				<video
					ref={player}
					class="photo__video"
					src={playback.src}
					autoPlay
					onEnded={stopVideo}
					onError={() => { stopVideo(); setVideoError('Não deu para tocar este vídeo.'); }}
				/>
			)}
			{isVideo && !playback && <div class="video-mark"><span class="video-mark__icon" /></div>}
			{playback && playback.state === 'loading' && (
				<div class="video-loading">
					<div class="video-loading__text">Preparando o vídeo… {Math.round(playback.progress * 100)}%</div>
					<div class="video-loading__bar"><div class="video-loading__fill" style={{width: `${Math.round(playback.progress * 100)}%`}} /></div>
				</div>
			)}
			{playback && playback.state === 'paused' && <div class="video-mark video-mark--paused"><span class="video-mark__pause" /></div>}
			{videoError && <div class="video-error">{videoError}</div>}
			{!(playback && playback.src && playback.state === 'playing') && <div class="pane__shade" />}
			{!(playback && playback.src && playback.state === 'playing') && <Caption title={photo.photo.album || 'Fotos'} credit={when} />}
		</div>
	);
}

function shuffle<T> (list: T[]): T[] {
	const a = list.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const t = a[i]; a[i] = a[j]; a[j] = t;
	}
	return a;
}
