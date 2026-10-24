// Reads a Google Photos album that is shared by link ("Share → Create link").
//
// Google removed the Library API's read scopes in March 2025, so there is no
// official way to list a shared album. The public share page embeds every photo's
// base URL, size and capture time in a JSON blob; we pick those out with regular
// expressions. If Google changes the page, this finds zero photos.
//
// Plain CommonJS for the TV's Node 8. Also loaded by vite.config.ts so the dev
// server can answer the same request in a desktop browser.

'use strict';

var https = require('https');
var urlLib = require('url');

// Google serves the photos.app.goo.gl link as a script interstitial to some desktop
// browsers; with the TV's own user agent it is a plain redirect.
var USER_AGENT = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';
var MAX_REDIRECTS = 5;
var TIMEOUT_MS = 20000;
var MIN_DIMENSION = 300;   // skip avatars and thumbnails
var MIN_TAKEN = Date.UTC(2000, 0, 1);   // earlier capture times are placeholders, not dates
var ALLOWED_HOSTS = ['photos.app.goo.gl', 'photos.google.com', 'goo.gl'];

/** "https://lh3.googleusercontent.com/pw/<id>",<width>,<height> */
var PHOTO_RE = /"(https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]{20,})",(\d+),(\d+)/g;
/** After the photo's [url, w, h, …] array: ],<taken ms>,"<hash>",<tz offset ms>, */
var TAKEN_RE = /^[^"]{0,200}?\],(\d{12,14}),"[^"]*",(-?\d{1,9}),/;
var TITLE_RE = /<meta property="og:title" content="([^"]*)"/;
/** A video's entry carries {"76647426":[<duration ms>, …]}; photos don't. */
var VIDEO_RE = /"76647426":\[(\d+),/;

function isAllowed (address) {
	var parsed = urlLib.parse(address);
	return parsed.protocol === 'https:' && ALLOWED_HOSTS.indexOf(parsed.hostname) !== -1;
}

function get (address, redirectsLeft, callback) {
	if (!isAllowed(address)) { callback(new Error('Not a Google Photos album link')); return; }
	var options = urlLib.parse(address);
	options.headers = {'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9'};
	var request = https.get(options, function (response) {
		var status = response.statusCode;
		if (status >= 300 && status < 400 && response.headers.location) {
			response.resume();
			if (redirectsLeft <= 0) { callback(new Error('Too many redirects')); return; }
			get(urlLib.resolve(address, response.headers.location), redirectsLeft - 1, callback);
			return;
		}
		if (status !== 200) { response.resume(); callback(new Error('HTTP ' + status)); return; }
		var chunks = [];
		response.on('data', function (chunk) { chunks.push(chunk); });
		response.on('end', function () { callback(null, Buffer.concat(chunks).toString('utf8')); });
		response.on('error', callback);
	});
	request.setTimeout(TIMEOUT_MS, function () { request.abort(); callback(new Error('Timed out')); });
	request.on('error', callback);
}

function decodeEntities (text) {
	return text.replace(/&amp;/g, '&').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** { title, photos: [{url, w, h, taken, video}] }. `taken` is the capture time in the
 *  place it was taken, as milliseconds to be read with UTC getters; null if unknown.
 *  `video` is the length in milliseconds for videos (play them with the "=dv" link,
 *  see manager.js), absent for photos. */
function parseAlbum (html) {
	var titleMatch = TITLE_RE.exec(html);
	var matches = [];
	var match;
	PHOTO_RE.lastIndex = 0;
	while ((match = PHOTO_RE.exec(html)) !== null) matches.push({m: match, end: PHOTO_RE.lastIndex});

	var byUrl = {};
	var order = [];
	matches.forEach(function (entry, i) {
		var url = entry.m[1];
		var w = Number(entry.m[2]);
		var h = Number(entry.m[3]);
		if (w < MIN_DIMENSION || h < MIN_DIMENSION) return;
		// The rest of this entry: up to where the next photo starts.
		var rest = html.slice(entry.end, i + 1 < matches.length ? matches[i + 1].m.index : entry.end + 3000);
		var after = TAKEN_RE.exec(rest.slice(0, 400));
		var taken = after && Number(after[1]) >= MIN_TAKEN ? Number(after[1]) + Number(after[2]) : null;
		var video = VIDEO_RE.exec(rest);
		var previous = byUrl[url];
		if (!previous) order.push(url);
		if (!previous || w * h > previous.w * previous.h) {
			var item = {url: url, w: w, h: h, taken: taken || (previous && previous.taken) || null};
			if (video || (previous && previous.video)) item.video = video ? Number(video[1]) : previous.video;
			byUrl[url] = item;
		} else if (video && !previous.video) {
			previous.video = Number(video[1]);
		}
	});
	return {
		title: titleMatch ? decodeEntities(titleMatch[1]) : '',
		photos: order.map(function (url) { return byUrl[url]; })
	};
}

function fetchAlbum (address, callback) {
	get(address, MAX_REDIRECTS, function (error, html) {
		if (error) { callback(error); return; }
		callback(null, parseAlbum(html));
	});
}

module.exports = {fetchAlbum: fetchAlbum, parseAlbum: parseAlbum};
