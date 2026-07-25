# Background videos

The background plays a **continuous crossfade playlist**: each clip in
`manifest.json` plays once, then dissolves into the next (1 → 2 → 3 → … →
loop) with no jarring loop jump. Until any videos exist it shows a plain dark
sky. The 🏔️ panel can skip to the next clip or pause auto-advance.

## Where the clips come from (automatic)

`tools/fetch-media.js` (run by the **Fetch background media** GitHub Action)
pulls license-safe, expansive/aerial, real-motion footage and curates it here
over time — it **accumulates** a library (up to 40 clips) instead of
overwriting good ones. Sources:

- **Pixabay** — needs `PIXABAY_API_KEY` (free). Pixabay License, no attribution.
- **Pexels** — needs `PEXELS_API_KEY` (free). Pexels License, no attribution.

Add each as a GitHub Actions secret, then run the workflow (it can run several
times to build the library up). Bad clips can be removed on request.

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
