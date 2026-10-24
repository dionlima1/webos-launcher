// Aircraft near a point, from adsb.lol (open ADS-B data, no key). The launcher can't
// fetch it itself (no CORS headers), so the service passes it on, trimmed down.

'use strict';

var https = require('https');

var MAX_RADIUS_NM = 100;

/** `callback(error, planes)` with planes [{id, callsign, reg, type, lat, lon, altFt, onGround, speedKt, track, rotorcraft}] */
function fetchPlanes (lat, lon, radiusNm, callback) {
	lat = Number(lat); lon = Number(lon); radiusNm = Math.min(MAX_RADIUS_NM, Number(radiusNm) || 40);
	if (!isFinite(lat) || !isFinite(lon)) { callback(new Error('lat and lon are required')); return; }
	var path = '/v2/point/' + lat.toFixed(4) + '/' + lon.toFixed(4) + '/' + Math.round(radiusNm);
	var request = https.get({host: 'api.adsb.lol', path: path, headers: {'User-Agent': 'io.github.dionlima1.launcher'}}, function (res) {
		if (res.statusCode !== 200) { res.resume(); callback(new Error('HTTP ' + res.statusCode)); return; }
		var chunks = [];
		res.on('data', function (c) { chunks.push(c); });
		res.on('end', function () {
			var data;
			try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
			catch (e) { callback(e); return; }
			callback(null, (data.ac || []).filter(function (a) { return typeof a.lat === 'number' && typeof a.lon === 'number'; }).map(function (a) {
				return {
					id: a.hex,
					callsign: (a.flight || '').trim(),
					reg: a.r || '',
					type: a.t || '',
					lat: a.lat,
					lon: a.lon,
					altFt: typeof a.alt_baro === 'number' ? a.alt_baro : 0,
					onGround: a.alt_baro === 'ground',
					speedKt: a.gs || 0,
					track: typeof a.track === 'number' ? a.track : (a.true_heading || 0),
					rotorcraft: a.category === 'A7'
				};
			}));
		});
		res.on('error', callback);
	});
	request.setTimeout(15000, function () { request.abort(); callback(new Error('Timed out')); });
	request.on('error', callback);
}

module.exports = {fetchPlanes: fetchPlanes};
