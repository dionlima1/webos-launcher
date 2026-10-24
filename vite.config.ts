import {createRequire} from 'node:module';
import {defineConfig, type Plugin} from 'vite';
import preact from '@preact/preset-vite';

const require = createRequire(import.meta.url);

// webOS 6.x runs Chrome 79. Two things matter for that engine:
//  1. Module scripts (`<script type="module">`) are refused when loaded from file://
//     because the sandbox serves them with no MIME type, so the bundle must be a
//     classic script.
//  2. ES2020 syntax such as `?.` and `??` is a SyntaxError, so everything
//     (dependencies included) is compiled down to the chrome79 target.
const BROWSER_TARGET = 'chrome79';

/** Rewrites Vite's module entry tag into a classic deferred script tag. */
function classicScriptTag (): Plugin {
	return {
		name: 'classic-script-tag',
		enforce: 'post',
		transformIndexHtml (html) {
			return html
				.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
				.replace(/<link rel="stylesheet" crossorigin href="/g, '<link rel="stylesheet" href="');
		}
	};
}

/** In `npm run dev`, answers /__album?url=… with the same reader the TV's JS service
 *  uses (services/album), since a browser can't fetch the album page across origins. */
function albumDevProxy (): Plugin {
	return {
		name: 'album-dev-proxy',
		configureServer (server) {
			const album = require('./services/album/album.js');
			const video = require('./services/album/video.js');
			const planes = require('./services/album/planes.js');
			server.middlewares.use('/__planes', (req, res) => {
				const q = new URL(req.url || '', 'http://localhost').searchParams;
				planes.fetchPlanes(q.get('lat'), q.get('lon'), q.get('radiusNm'), (error: Error | null, list: unknown) => {
					res.setHeader('Content-Type', 'application/json');
					res.statusCode = error ? 502 : 200;
					res.end(JSON.stringify(error ? {returnValue: false, errorText: error.message} : {returnValue: true, planes: list}));
				});
			});
			// Album videos, downloaded and served back with Range support like on the TV.
			server.middlewares.use('/__video', (req, res) => {
				const url = new URL(req.url || '', 'http://localhost').searchParams.get('url') || '';
				video.prepare(url, () => undefined, (error: Error | null, id: string) => {
					if (error) { res.statusCode = 502; res.end(error.message); return; }
					video.serve(id, req, res);
				});
			});
			server.middlewares.use('/__album', (req, res) => {
				const url = new URL(req.url || '', 'http://localhost').searchParams.get('url') || '';
				album.fetchAlbum(url, (error: Error | null, result: unknown) => {
					res.setHeader('Content-Type', 'application/json');
					res.statusCode = error ? 502 : 200;
					res.end(JSON.stringify(error ? {returnValue: false, errorText: error.message} : {returnValue: true, ...(result as object)}));
				});
			});
		}
	};
}

export default defineConfig({
	base: './',            // the app is loaded from a local file path on the TV
	plugins: [preact(), classicScriptTag(), albumDevProxy()],
	build: {
		target: BROWSER_TARGET,
		outDir: 'dist',
		modulePreload: false,
		cssTarget: BROWSER_TARGET,
		rollupOptions: {
			output: {
				format: 'iife',
				inlineDynamicImports: true,
				entryFileNames: 'assets/app.js',
				assetFileNames: 'assets/[name][extname]'
			}
		}
	}
});
