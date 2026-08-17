# Audiovisual Portfolio

Minimal single-page portfolio to showcase video grading, image finishing, and audio mastering with before/after interactions.

## Running
Open `index.html` in a browser for the static site.

For the local admin backend, run:

```bash
node server.js
```

Then open `http://localhost:8000/admin.html`.

The backend creates a local SQLite database at `data/delamanga-cms.sqlite`.

## Project structure

Public pages stay at the repository root so GitHub Pages can serve them directly. Content and media are split by responsibility:

```txt
assets/
  brand/backgrounds/       Site backgrounds and shared brand imagery
  color/before-after/      Still before/after color references
  color/video/             Color, audio, and timeline demo videos
  fonts/                   Local type files
  music/operacion-14/      Audio and web artwork for Operación 14
  photography/{category}/full/
data/
  collections.js           Public collections output
  image-metadata.js        Static EXIF-derived viewer metadata
  music.js                 Public music archive output
```

## Replacing media
- **Video:** Drop your graded pair into the file inputs in the Video section. Both clips stay time-locked when you scrub the split slider.
- **Image:** Use the file inputs in the Image section to load before/after stills. The slider reveals the retouched version with a clean edge.
- **Audio:** Load your mix and master in the Audio section. Audio auto-plays silently; as you scroll into the section a master fade raises level, and you can blend with the crossfader (space snaps ends).
- **Meters visualizer:** In the meters section, upload two captured Minimeters (or similar) videos for before/after; use the split slider to compare them in sync.

## Collections
`colecciones.html` is rendered from `data/collections.js`. To add a new collection:

1. Put the images or videos inside `assets/photography/{collection}/full/`.
2. Copy one object inside `window.DE_LA_MANGA_COLLECTIONS`.
3. Update `id`, `title`, `type`, `status`, `cover`, `summary`, `tags`, and `items`.

Use `href` only when a collection has its own dedicated page, like `operacion14.html`.

## Local collection admin
Open `admin.html` through the local Node server to create/edit collections and music archives through a form. When the backend is running, the admin reads from SQLite, writes to SQLite, and regenerates public data files automatically:

- `data/collections.js` for collections.
- `data/music.js` for music archives.

On macOS, double-click `open-cms.command` from the project folder to start the local backend and open the admin without typing commands.

If the backend is not running, the editor falls back to browser `localStorage` and JS export. This is not a private remote CMS: `admin.html` has no real authentication. Do not link it from the public navigation.

For music archives, use **Importar audios** to select or drag audio files. The admin sorts them by file date, derives track numbers from that order, derives titles from filenames, reads durations from metadata, and recalculates the total release duration.

When served by `server.js`, the admin includes a media manager:

- **Elegir** opens the local media library and fills the selected path into the field.
- **Subir** copies a file into the correct project folder and fills the field automatically.
- Collection media can be imported in bulk as images or videos.
- Large collection imports are uploaded in smaller browser-safe batches. There is no fixed item-count limit, but very large original photos still make the git repo and public pages heavier; prefer web-sized JPG/WebP exports for the published gallery and keep full-resolution masters outside the site unless they are intentionally downloadable.
- Music archive covers, section backgrounds, section images, audio files, and downloads can be uploaded from their fields.
- Use **Revisar galería** inside a collection to inspect items at large size and remove pieces from that collection. This does not delete the physical file from `assets/`; it only removes the item from the published collection data.

Imported audio files are copied into `assets/music/{release-id}/audio/`. Edits are autosaved into SQLite after a short pause, then `data/music.js` or `data/collections.js` is regenerated as the static public output. **Guardar ahora** remains available as a manual save and creates a timestamped `.bak-*` backup when the generated file changes.

Upload limits keep the static site and Git repository manageable:

- Images: 25 MB each.
- Audio files: 180 MB each.
- Short video pieces: 80 MB each.
- Download bundles: 250 MB each.

The CMS updates local files only. To publish the edited site, commit and push the changed data/assets to GitHub.

The backend keeps the normalized CMS database as the editing source. The current schema includes reserved users/roles, permissions, media assets, music archives, tracks, archive sections, links, downloads, collections, tags, and collection items. The public site still reads `data/music.js` and `data/collections.js`, but those files are generated output.

Useful local CMS endpoints:

- `GET /api/cms/status`
- `GET /api/cms/content`
- `GET /api/cms/media-assets`
- `GET /api/cms/music-archives`
- `GET /api/cms/collections`
- `POST /api/cms/content`

## Music archives
`music-archive.html?id=operacion-14` renders reusable music release pages from `data/music.js`. Each archive can define independent visual sections, a cover, a tracklist, player sources, and download links.

Use lightweight audio such as MP3 for `webAudio`. Use download links for high-quality ZIP bundles such as AIFF or FLAC exports.

Add release links in the `links` array with `platform: "spotify"` or `platform: "apple-music"` once the release is live.

## Fonts
Local font files live in `assets/fonts/`. There are no remote font requests.

## Notes
- Demo audio is generated in-browser to show the mastering A/B control; swap with real files for your work.
- Replace placeholder posters if you prefer custom thumbnails; see `data-video-display` and `data-image-display` elements in `index.html`.
- Media attempts to auto-play muted/silent; some browsers may still require a user gesture before raising volume.
