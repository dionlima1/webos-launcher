// The TV's installed apps with LG's own icons, through the TV's control protocol (SSAP,
// the one LG's ThinQ phone app uses). A Developer Mode app can't list apps or read their
// icons, but the TV hands both over to a paired SSAP client: the icons come back as
// links served by the TV itself.
//
// The first call has no key: the TV then shows a prompt asking to allow the connection,
// and the answer carries a client key. The launcher keeps that key (in its localStorage,
// which survives reinstalls) and sends it with every later call, so the prompt shows once.

'use strict';

var os = require('os');
var WebSocket = require('./vendor/ws');

var PORT = 3001;
var TIMEOUT_MS = 10000;
/** long enough for someone to pick up the remote and accept */
var PAIRING_TIMEOUT_MS = 60000;

/** `callback(error, {key, apps})` with apps [{id, title, icon, largeIcon, iconColor, bgColor}] */
function listApps (key, callback) {
	var host = lanAddress();
	if (!host) { callback(new Error('No network')); return; }
	var done = false;
	var pairing = !key;
	var newKey = key || null;
	var socket;
	var timer = setTimeout(function () { finish(new Error(pairing ? 'Pairing not accepted' : 'Timed out')); }, pairing ? PAIRING_TIMEOUT_MS : TIMEOUT_MS);

	function finish (error, apps) {
		if (done) return;
		done = true;
		clearTimeout(timer);
		try { socket.terminate(); } catch (e) { /* already closed */ }
		if (error) callback(error);
		else callback(null, {key: newKey, apps: apps});
	}

	try {
		// The TV's own certificate is self-signed; this only ever talks to the TV itself.
		socket = new WebSocket('wss://' + host + ':' + PORT, {rejectUnauthorized: false, handshakeTimeout: 5000, maxPayload: 4 * 1024 * 1024});
	} catch (e) { finish(e); return; }

	socket.on('open', function () {
		var payload = {forcePairing: false, pairingType: 'PROMPT', manifest: {manifestVersion: 1, appVersion: '1.0', permissions: ['READ_INSTALLED_APPS']}};
		if (key) payload['client-key'] = key;
		socket.send(JSON.stringify({type: 'register', id: 'register', payload: payload}));
	});
	socket.on('message', function (raw) {
		var m;
		try { m = JSON.parse(String(raw)); } catch (e) { return; }
		if (m.type === 'registered') {
			if (m.payload && m.payload['client-key']) newKey = m.payload['client-key'];
			socket.send(JSON.stringify({type: 'request', id: 'apps', uri: 'ssap://com.webos.applicationManager/listLaunchPoints', payload: {}}));
		} else if (m.id === 'apps') {
			var points = m.payload && m.payload.launchPoints;
			if (!Array.isArray(points)) { finish(new Error('No app list')); return; }
			finish(null, points.map(function (p) {
				return {id: p.id, title: p.title, icon: p.icon || '', largeIcon: p.largeIcon || '', iconColor: p.iconColor || p.bgColor || '', bgColor: p.bgColor || ''};
			}));
		} else if (m.type === 'error') {
			finish(new Error(String(m.error || 'Refused')));
		}
		// A {pairingType: 'PROMPT'} message means the TV is showing its prompt: keep waiting.
	});
	socket.on('error', function (e) { finish(e); });
	socket.on('close', function () { finish(new Error('Connection closed')); });
}

/** The TV's address on the home network (it refuses SSAP on loopback). */
function lanAddress () {
	var interfaces = os.networkInterfaces();
	var names = Object.keys(interfaces);
	for (var i = 0; i < names.length; i++) {
		var list = interfaces[names[i]] || [];
		for (var j = 0; j < list.length; j++) {
			var a = list[j];
			if (a.family === 'IPv4' && !a.internal && a.address.indexOf('169.254.') !== 0) return a.address;
		}
	}
	return null;
}

module.exports = {listApps: listApps};
