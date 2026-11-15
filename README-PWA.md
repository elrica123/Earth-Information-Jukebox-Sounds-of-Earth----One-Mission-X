# The Earth Information Jukebox

## Features
- Album-sleeve player with NASA GIBS satellite imagery for each EONET event.
- Event records grouped by category. The shelf sits beside the player on wide screens and becomes a horizontal carousel on smaller screens.
- Selecting a record updates its details and artwork. Playback starts only after the user presses **Play**.
- The shelf glides to the selected record and gives it a short visual lift. Reduced-motion preferences are respected.
- Custom CSS with no Bootstrap dependency. Bricolage Grotesque is loaded from Google Fonts with system-font fallbacks.
- PWA manifest, service worker, offline page, installation prompt, and update notice.
- Updates never interrupt playback: a new version waits until the user selects **Update** in the notice.
- Offline: the app shell, the last EONET response, and the most recent NASA GIBS images (up to 40) are kept for offline use.
- Responsive header (single row, icon-only buttons on phones), two-column player from ~560 px, landscape-phone layout, safe-area support for notched devices, and print styles.
- Light and dark themes follow the system preference and can be changed from the theme button.

## Accessibility
- Skip links, semantic landmarks, and a logical heading structure.
- Record buttons expose their selection state and category to assistive technology.
- Live announcements describe record selection, playback, and data refreshes.
- Keyboard and pointer selection never start audio automatically. Use **Play** to begin playback.
- Playback controls use `aria-disabled` so they remain focusable. Previous and next record controls are available.
- The cover image has descriptive alternative text; thumbnails are decorative.
- Event values, frequency, sonification notes, date, location, and source links are also available as text.
- Supports visible focus, reduced motion, high contrast, forced colors, and reflow down to 320 px.

## Notes
- Serve over HTTPS or localhost for service worker and installation support.
- Open once while online to save the latest EONET events for offline use.
- On Apache, `.htaccess` sets the right MIME type for the manifest and keeps `sw.js` from being cached. On Nginx, serve `sw.js` with `Cache-Control: no-cache` and `.webmanifest` as `application/manifest+json`.
- `config/.htaccess` blocks direct web access to the database configuration.
- Optional: add real screenshots to `manifest.webmanifest` (`screenshots`, 1280×720 wide and 720×1280 narrow) for a richer install dialog.
- Increase `CACHE_VERSION` in `sw.js` when changing cached application assets.
