// JS service for the launcher:
//  - list: reads a shared album (the web app can't fetch the album page itself,
//    since Google sends no CORS headers, but a service can);
//  - manager: runs the phone album manager (manager.js) and pushes the album list
//    to the launcher whenever it's edited from the phone. The launcher keeps this
//    subscription open, which also keeps the service (and its web server) alive;
//  - prepareVideo: downloads an album video so the TV can play it (video.js);
//    subscribe for progress, the last answer has `src`;
//  - planes: aircraft near a point, from adsb.lol (planes.js);
//  - apps: the installed apps with LG's own icons, over SSAP (apps.js).

'use strict';

var Service = require('webos-service');
var pkgInfo = require('./package.json');
var album = require('./album');
var manager = require('./manager');
var video = require('./video');
var planes = require('./planes');
var apps = require('./apps');

var service = new Service(pkgInfo.name);

service.register('list', function (message) {
	var url = message.payload && message.payload.url;
	if (typeof url !== 'string' || !url) {
		message.respond({returnValue: false, errorText: 'url is required'});
		return;
	}
	album.fetchAlbum(url, function (error, result) {
		if (error) {
			message.respond({returnValue: false, errorText: String(error.message || error)});
			return;
		}
		message.respond({returnValue: true, title: result.title, photos: result.photos});
	});
});

var listeners = {};

service.register('manager', function (message) {
	var albums = message.payload && message.payload.albums;
	var onChange = function (list) { message.respond({returnValue: true, url: manager.address(), albums: list}); };
	var url = manager.start(albums, message.isSubscription ? onChange : null);
	if (message.isSubscription) listeners[message.uniqueToken] = onChange;
	message.respond({returnValue: true, subscribed: !!message.isSubscription, url: url, albums: manager.albums()});
}, function (message) {
	// subscription cancelled (the launcher closed)
	var onChange = listeners[message.uniqueToken];
	if (onChange) manager.stopListening(onChange);
	delete listeners[message.uniqueToken];
});

service.register('prepareVideo', function (message) {
	var url = message.payload && message.payload.url;
	if (typeof url !== 'string' || !url) {
		message.respond({returnValue: false, errorText: 'url is required'});
		return;
	}
	manager.start();   // the web server that plays the video back
	video.prepare(url, function (received, total) {
		if (message.isSubscription) message.respond({returnValue: true, received: received, total: total});
	}, function (error, id) {
		if (error) message.respond({returnValue: false, errorText: String(error.message || error)});
		else message.respond({returnValue: true, ready: true, src: manager.videoAddress(id)});
	});
});

service.register('planes', function (message) {
	var p = message.payload || {};
	planes.fetchPlanes(p.lat, p.lon, p.radiusNm, function (error, list) {
		if (error) message.respond({returnValue: false, errorText: String(error.message || error)});
		else message.respond({returnValue: true, planes: list});
	});
});

service.register('apps', function (message) {
	var key = message.payload && typeof message.payload.key === 'string' ? message.payload.key : '';
	apps.listApps(key, function (error, result) {
		if (error) message.respond({returnValue: false, errorText: String(error.message || error)});
		else message.respond({returnValue: true, key: result.key, apps: result.apps});
	});
});
