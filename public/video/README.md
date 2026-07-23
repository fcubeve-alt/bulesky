# Background videos

The background switcher (🏔️ icon) cycles through the procedural night-lake
scene plus any scenery videos listed here. Until you add videos, it shows the
painted lake scene.

## How to add background videos

1. Put video files in this `public/video/` folder. Recommendations:
   - Format: **MP4 (H.264)** — best browser support. `.webm` also works.
   - Keep them **calm and slow-moving** (mountains, water, sky, snow…).
   - Keep files reasonably small (ideally under ~15–20 MB each): mobile data
     and Cloudflare Pages limits. A short clip that loops seamlessly beats a
     long one. ~720p is plenty behind the overlay.
   - Only use footage you have the right to use (your own, or clearly
     license-free / Creative Commons / royalty-free stock).
2. List them in `manifest.json`:

   ```json
   {
     "videos": [
       { "title": "Misty Mountains", "src": "/video/mountains.mp4" },
       { "title": "Still Lake",       "src": "/video/lake.mp4" }
     ]
   }
   ```

3. Commit and push — the deploy picks them up. The app opens on the first
   video; tap 🏔️ → "Next background" to switch (the choice is remembered).

The videos autoplay muted and looped (required for mobile autoplay). A soft
dark overlay is drawn on top so the lanterns and text stay readable.

## Uploading without editing files

To upload/switch videos from a web admin page (no git), that needs
server-side object storage (Cloudflare R2) plus a small password-protected
admin page — the same follow-up noted for the music library. Say the word to
wire it up.
