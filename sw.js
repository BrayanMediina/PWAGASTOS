const APP_CACHE = "gastos-app-shell-v3";
const RUNTIME_CACHE = "gastos-runtime-v3";

const APP_SHELL = [
	"./",
	"./index.html",
	"./src/pages/offline.html",
	"./src/css/styles.css",
	"./src/js/app.js",
	"./src/js/vitals.js",
	"./src/js/install.js",
	"./src/assets/icons/icon-192.svg",
	"./src/assets/icons/icon-512.svg"
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(APP_CACHE)
			.then((cache) =>
				Promise.all(
					APP_SHELL.map((resource) =>
						cache.add(resource).catch(() => null)
					)
				)
			)
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) =>
				Promise.all(
					cacheNames
						.filter((name) => ![APP_CACHE, RUNTIME_CACHE].includes(name))
						.map((name) => caches.delete(name))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") {
		return;
	}

	const request = event.request;
	const acceptHeader = request.headers.get("accept") || "";
	const isNavigation = request.mode === "navigate" || acceptHeader.includes("text/html");

	if (isNavigation) {
		event.respondWith(networkFirstPage(request));
		return;
	}

	event.respondWith(cacheFirstAsset(request));
});

function networkFirstPage(request) {
	return fetch(request)
		.then((response) => {
			return caches.open(RUNTIME_CACHE).then((cache) => {
				cache.put(request, response.clone());
				return response;
			});
		})
		.catch(() =>
			caches.match(request).then((cached) => {
				if (cached) {
					return cached;
				}
				return caches.match("./src/pages/offline.html");
			})
		);
}

function cacheFirstAsset(request) {
	return caches.match(request).then((cached) => {
		if (cached) {
			return cached;
		}

		return fetch(request)
			.then((response) => {
				return caches.open(RUNTIME_CACHE).then((cache) => {
					cache.put(request, response.clone());
					return response;
				});
			})
			.catch(() =>
				caches.match("./index.html").then((appShellFallback) => {
					if (appShellFallback) {
						return appShellFallback;
					}
					throw new Error("No se encontró recurso en caché");
				})
			);
	});
}
