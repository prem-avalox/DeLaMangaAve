# Audiovisual Portfolio

Minimal single-page portfolio to showcase video grading, image finishing, and audio mastering with before/after interactions.

## Running
Open `index.html` in a browser. No build tools or dependencies are required.

## Replacing media
- **Video:** Drop your graded pair into the file inputs in the Video section. Both clips stay time-locked when you scrub the split slider.
- **Image:** Use the file inputs in the Image section to load before/after stills. The slider reveals the retouched version with a clean edge.
- **Audio:** Load your mix and master in the Audio section. Audio auto-plays silently; as you scroll into the section a master fade raises level, and you can blend with the crossfader (space snaps ends).
- **Meters visualizer:** In the meters section, upload two captured Minimeters (or similar) videos for before/after; use the split slider to compare them in sync.

## Fonts
Three-type system using built-in stacks: sans for body, serif for headlines, mono for labels/utility. No remote font requests.

## Notes
- Demo audio is generated in-browser to show the mastering A/B control; swap with real files for your work.
- Replace placeholder posters if you prefer custom thumbnails; see `data-video-display` and `data-image-display` elements in `index.html`.
- Media attempts to auto-play muted/silent; some browsers may still require a user gesture before raising volume.
