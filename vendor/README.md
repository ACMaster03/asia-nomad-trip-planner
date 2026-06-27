# vendor/

Third-party assets vendored locally so the app works **offline** (double-click `index.html`)
with no CDN and no API key. These are committed on purpose — do not add to `.gitignore`.

| File | What | Version | Source |
|------|------|---------|--------|
| `globe.gl.min.js` | 3D globe library (bundles three.js + three-globe) | 2.46.1 | https://unpkg.com/globe.gl/dist/globe.gl.min.js |
| `earth-night.jpg` | Earth surface texture for the globe | — | https://unpkg.com/three-globe/example/img/earth-night.jpg |

To update globe.gl later, re-download the two files from the URLs above (pin a version if you
want reproducibility) and bump the version note here.
