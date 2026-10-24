// Album manager: a tiny web server on the TV, for the phone. The launcher shows its
// address as a QR code; the phone opens it on the same Wi-Fi and adds or removes
// shared albums. No outside server is involved. The same server also hands album
// videos to the launcher's player, over loopback only (video.js).
//
// The launcher owns the album list (it keeps it in localStorage) and hands it over
// when it subscribes; every change made from the phone is pushed back to it.
// The random token in the QR code keeps others on the network from editing the list.

'use strict';

var http = require('http');
var os = require('os');
var crypto = require('crypto');
var urlLib = require('url');
var album = require('./album');
var page = require('./page');
var video = require('./video');

var PORT = 8642;
var MAX_BODY = 8 * 1024;
var LINK_RE = /^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com\/share)\/[^\s"'<>]+$/;

var state = {
	albums: [],             // [{url, title, count}]
	token: crypto.randomBytes(8).toString('hex'),
	server: null,
	listeners: []
};

/** Start (once) and take the launcher's current list. `onChange(albums)` is called
 *  after every edit from the phone. Returns the address for the QR code. */
function start (albums, onChange) {
	if (Array.isArray(albums)) state.albums = albums.filter(isAlbum);
	if (onChange && state.listeners.indexOf(onChange) === -1) state.listeners.push(onChange);
	if (!state.server) {
		state.server = http.createServer(handle);
		state.server.on('error', function () { state.server = null; });
		state.server.listen(PORT, '0.0.0.0');
	}
	return address();
}

function stopListening (onChange) {
	state.listeners = state.listeners.filter(function (l) { return l !== onChange; });
}

function address () {
	return 'http://' + lanAddress() + ':' + PORT + '/?t=' + state.token;
}

function albums () {
	return state.albums.slice();
}

/** The TV's IPv4 address on the home network (Wi-Fi or cable). */
function lanAddress () {
	var interfaces = os.networkInterfaces();
	var names = Object.keys(interfaces).sort(function (a, b) { return rank(a) - rank(b); });
	for (var i = 0; i < names.length; i++) {
		var list = interfaces[names[i]] || [];
		for (var j = 0; j < list.length; j++) {
			if (list[j].family === 'IPv4' && !list[j].internal) return list[j].address;
		}
	}
	return '127.0.0.1';
}

function rank (name) {
	if (/^(wlan|eth)/.test(name)) return 0;
	return 1;
}

function isLoopback (req) {
	var from = req.socket.remoteAddress || '';
	return from === '127.0.0.1' || from === '::1' || from === '::ffff:127.0.0.1';
}

/** Where the launcher plays a prepared video from (loopback only). */
function videoAddress (id) {
	return 'http://127.0.0.1:' + PORT + '/video/' + id + '.mp4';
}

function isAlbum (a) {
	return a && typeof a.url === 'string' && LINK_RE.test(a.url);
}

function changed () {
	var copy = albums();
	state.listeners.forEach(function (l) { l(copy); });
}

// ---------- HTTP ----------

function handle (req, res) {
	var parsed = urlLib.parse(req.url, true);
	// Album videos, for the launcher's own player only (see video.js).
	var clip = /^\/video\/([a-f0-9]{16})\.mp4$/.exec(parsed.pathname || '');
	if (clip) {
		if (isLoopback(req)) video.serve(clip[1], req, res);
		else json(res, 403, {error: 'Não permitido'});
		return;
	}
	var authorised = parsed.query.t === state.token;
	if (parsed.pathname === '/' && req.method === 'GET') {
		send(res, authorised ? 200 : 403, 'text/html; charset=utf-8', authorised ? page.html() : page.forbidden());
		return;
	}
	if (!authorised) { json(res, 403, {error: 'Escaneie o QR Code na TV de novo.'}); return; }
	if (parsed.pathname === '/api/albums' && req.method === 'GET') { json(res, 200, {albums: albums()}); return; }
	if (parsed.pathname === '/api/add' && req.method === 'POST') { readJson(req, res, add); return; }
	if (parsed.pathname === '/api/remove' && req.method === 'POST') { readJson(req, res, remove); return; }
	json(res, 404, {error: 'Não encontrado'});
}

function add (body, res) {
	var link = String(body.url || '').trim();
	if (!LINK_RE.test(link)) {
		json(res, 400, {error: 'Esse não parece um link de álbum do Google Fotos. Ele começa com https://photos.app.goo.gl/ ou https://photos.google.com/share/.'});
		return;
	}
	if (state.albums.some(function (a) { return a.url === link; })) {
		json(res, 200, {albums: albums(), note: 'Esse álbum já está na TV.'});
		return;
	}
	album.fetchAlbum(link, function (error, result) {
		if (error || !result.photos.length) {
			json(res, 400, {error: 'Não consegui ler esse álbum. Confira se ele está compartilhado por link ("Criar link").'});
			return;
		}
		state.albums.push({url: link, title: result.title, count: result.photos.length});
		changed();
		json(res, 200, {albums: albums(), note: 'Álbum adicionado: ' + result.photos.length + ' fotos.'});
	});
}

function remove (body, res) {
	var link = String(body.url || '');
	state.albums = state.albums.filter(function (a) { return a.url !== link; });
	changed();
	json(res, 200, {albums: albums(), note: 'Álbum removido da TV.'});
}

function readJson (req, res, next) {
	var chunks = [];
	var size = 0;
	req.on('data', function (chunk) {
		size += chunk.length;
		if (size > MAX_BODY) { req.destroy(); return; }
		chunks.push(chunk);
	});
	req.on('end', function () {
		var body;
		try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
		catch (e) { json(res, 400, {error: 'Pedido inválido'}); return; }
		next(body, res);
	});
}

function json (res, status, data) {
	send(res, status, 'application/json; charset=utf-8', JSON.stringify(data));
}

function send (res, status, type, body) {
	res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'});
	res.end(body);
}

module.exports = {start: start, stopListening: stopListening, address: address, albums: albums, videoAddress: videoAddress};
