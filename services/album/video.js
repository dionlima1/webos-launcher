// Album videos for the TV's player.
//
// Google serves a video ("<base>=dv") as one plain download: no byte ranges, and phone
// videos keep their index (the moov atom) at the end of the file, so the TV's player
// gives up on it (MEDIA_ERR_SRC_NOT_SUPPORTED). We download it to /tmp (RAM on the TV)
// and serve it back to the launcher over loopback, with Range support.
// One video at a time; it is deleted when another is asked for or after a while unused.

'use strict';

var https = require('https');
var fs = require('fs');
var urlLib = require('url');
var crypto = require('crypto');

var DIR = '/tmp/io.github.dionlima1.launcher-video';
var MAX_BYTES = 600 * 1024 * 1024;
var IDLE_MS = 15 * 60 * 1000;
var MAX_REDIRECTS = 5;
var BASE_RE = /^https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]{20,}$/;
var HOST_RE = /(^|\.)googleusercontent\.com$/;

/** {id, file, size, received, done, error, listeners, lastUsed} */
var current = null;

setInterval(function () {
	if (current && current.done && Date.now() - current.lastUsed > IDLE_MS) discard();
}, 60 * 1000).unref();

function idFor (url) {
	return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

/** Make the video at `url` (an album item's base link) playable from loopback.
 *  `onProgress(received, total)` while downloading; `onDone(error, id)` at the end. */
function prepare (url, onProgress, onDone) {
	if (!BASE_RE.test(url)) { onDone(new Error('Not an album video')); return; }
	var id = idFor(url);
	if (current && current.id === id && !current.error) {
		current.lastUsed = Date.now();
		if (current.done) { onDone(null, id); return; }
		current.listeners.push({progress: onProgress, done: onDone});
		return;
	}
	discard();
	try { fs.mkdirSync(DIR); } catch (e) { if (e.code !== 'EEXIST') { onDone(e); return; } }
	var entry = {id: id, file: DIR + '/' + id + '.mp4', size: 0, received: 0, done: false, error: null, listeners: [{progress: onProgress, done: onDone}], lastUsed: Date.now()};
	current = entry;
	download(url + '=dv', entry, MAX_REDIRECTS);
}

function download (address, entry, redirectsLeft) {
	var parsed = urlLib.parse(address);
	if (parsed.protocol !== 'https:' || !HOST_RE.test(parsed.hostname || '')) { fail(entry, new Error('Unexpected video host')); return; }
	var request = https.get(parsed, function (res) {
		if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
			res.resume();
			if (redirectsLeft <= 0) { fail(entry, new Error('Too many redirects')); return; }
			download(urlLib.resolve(address, res.headers.location), entry, redirectsLeft - 1);
			return;
		}
		if (res.statusCode !== 200) { res.resume(); fail(entry, new Error('HTTP ' + res.statusCode)); return; }
		entry.size = Number(res.headers['content-length']) || 0;
		if (entry.size > MAX_BYTES) { res.resume(); fail(entry, new Error('Video too large')); return; }
		var out = fs.createWriteStream(entry.file);
		var lastReport = 0;
		res.on('data', function (chunk) {
			entry.received += chunk.length;
			if (entry.received > MAX_BYTES) { request.abort(); fail(entry, new Error('Video too large')); return; }
			var now = Date.now();
			if (now - lastReport > 300) { lastReport = now; entry.listeners.forEach(function (l) { l.progress(entry.received, entry.size); }); }
		});
		res.pipe(out);
		out.on('finish', function () {
			if (entry.error || current !== entry) return;
			entry.size = entry.received;
			entry.done = true;
			var listeners = entry.listeners;
			entry.listeners = [];
			listeners.forEach(function (l) { l.done(null, entry.id); });
		});
		out.on('error', function (e) { fail(entry, e); });
	});
	request.setTimeout(30000, function () { request.abort(); fail(entry, new Error('Timed out')); });
	request.on('error', function (e) { fail(entry, e); });
}

function fail (entry, error) {
	if (entry.error) return;
	entry.error = error;
	var listeners = entry.listeners;
	entry.listeners = [];
	listeners.forEach(function (l) { l.done(error); });
	if (current === entry) discard();
}

function discard () {
	if (!current) return;
	var file = current.file;
	current = null;
	fs.unlink(file, function () { /* already gone is fine */ });
}

/** GET /video/<id>.mp4 from the launcher, with Range support. */
function serve (id, req, res) {
	if (!current || current.id !== id || !current.done) { res.writeHead(404); res.end(); return; }
	current.lastUsed = Date.now();
	var size = current.size;
	var range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
	if (!range || (!range[1] && !range[2])) {
		res.writeHead(200, {'Content-Type': 'video/mp4', 'Content-Length': size, 'Accept-Ranges': 'bytes'});
		fs.createReadStream(current.file).pipe(res);
		return;
	}
	var start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
	var end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
	if (start >= size || start > end) { res.writeHead(416, {'Content-Range': 'bytes */' + size}); res.end(); return; }
	res.writeHead(206, {'Content-Type': 'video/mp4', 'Content-Length': end - start + 1, 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Accept-Ranges': 'bytes'});
	fs.createReadStream(current.file, {start: start, end: end}).pipe(res);
}

module.exports = {prepare: prepare, serve: serve};
