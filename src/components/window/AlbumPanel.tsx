import qrcode from 'qrcode-generator';
import {shortTitle, type AlbumRef} from '../../lib/album';

interface Props {
	/** the phone page's address on the home network; null off the TV or before the service answers */
	url: string | null;
	albums: AlbumRef[];
	/** the album being shown (its link), or null for all of them */
	choice: string | null;
	/** the row the remote is on: 0 is "all albums", then one per album */
	focus: number;
}

/** Over the photos in full screen: pick which album to watch (or all of them), and a QR
 *  code that opens the album manager on the phone to add or remove albums. */
export function AlbumPanel ({url, albums, choice, focus}: Props) {
	const rows: {key: string; title: string; detail: string; chosen: boolean}[] = [
		{key: 'all', title: 'Todos os álbuns', detail: 'em ordem aleatória', chosen: choice === null}
	].concat(albums.map((a) => ({
		key: a.url,
		title: shortTitle(a.title) || 'Álbum',
		detail: a.count ? `${a.count} fotos, em ordem` : 'em ordem',
		chosen: choice === a.url
	})));

	return (
		<div class="album-panel">
			<div class="album-panel__list">
				<div class="album-panel__title">O que mostrar</div>
				{rows.map((r, i) => (
					<div key={r.key} class={`album-row${i === focus ? ' album-row--focused' : ''}${r.chosen ? ' album-row--chosen' : ''}`}>
						<span class="album-row__check">{r.chosen ? '✓' : ''}</span>
						<span class="album-row__title">{r.title}</span>
						<span class="album-row__detail">{r.detail}</span>
					</div>
				))}
				<div class="album-panel__hint">▲ ▼ escolher · OK mostrar · Voltar fecha</div>
			</div>
			<div class="album-panel__side">
				<div class="album-panel__qr">
					{url
						? <div class="album-panel__code" dangerouslySetInnerHTML={{__html: qrSvg(url)}} />
						: <div class="album-panel__waiting">Só funciona na TV.</div>}
				</div>
				<div class="album-panel__side-title">Adicionar ou remover álbuns</div>
				<div class="album-panel__note">Aponte a câmera do celular para o código. O celular precisa estar no mesmo Wi-Fi da TV.</div>
			</div>
		</div>
	);
}

function qrSvg (text: string): string {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	return qr.createSvgTag({cellSize: 8, margin: 2, scalable: true});
}
