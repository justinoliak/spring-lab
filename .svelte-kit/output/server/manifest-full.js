export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.ChidX50I.js",app:"_app/immutable/entry/app.FAP0IBMc.js",imports:["_app/immutable/entry/start.ChidX50I.js","_app/immutable/chunks/BVWPpeSg.js","_app/immutable/chunks/B-GTawtV.js","_app/immutable/chunks/jOgOPJoX.js","_app/immutable/entry/app.FAP0IBMc.js","_app/immutable/chunks/CmsKOCeN.js","_app/immutable/chunks/B-GTawtV.js","_app/immutable/chunks/IHki7fMi.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
