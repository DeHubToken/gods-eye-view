# DeHub arcade distribution

The arcade distribution follows upstream `591f299d11f38a612629a274463196d57ae3862e`
(10 October 2026). Its source is reviewed here; the compiled artifact is vendored
by the DeHub web repository. Web and native mobile load the same production URL.

The DeHub arcade bundle workflow builds with `vite.dehub.config.js`, moves the
Cesium runtime into the served subpath, excludes the non-commercial Bhote Koshi
event imagery and river coordinates, and checks startup inside an opaque-origin
iframe. Upstream's standalone application and server build remain separate.

The community panel lets a signed-in user select and confirm a point, request
device location, or remove their pin. The host handles authenticated writes.
Public reads carry no credentials. The existing map service stores approximate
coordinates at a 25 km setting; there is no background device-location tracking.
No account token or wallet address is sent to the globe document.

Upstream additions include Street Level imagery, weather controls, directions,
recent imagery, scene tools and portable panels. Provider-backed features still
need their corresponding services and credentials; a static bundle does not
deploy the upstream Node server or provision provider accounts.
