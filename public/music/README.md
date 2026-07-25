# Music library

The ambient-sound button plays tracks listed here at random. Until you add
tracks, it falls back to a soft synthesized pad.

## How to add your own music

1. Drop audio files (`.mp3`, `.m4a`, or `.ogg`) into this `public/music/`
   folder. Use calm, ambient, royalty-free / license-cleared tracks — this
   is a public site, so only add music you have the right to stream.
2. List them in `manifest.json`:

   ```json
   {
     "tracks": [
       { "title": "Still Lake", "src": "/music/still-lake.mp3" },
       { "title": "Night Snow", "src": "/music/night-snow.mp3" }
     ]
   }
   ```

3. Commit and push — the deploy picks them up automatically. The app plays
   a random track, then auto-advances to another random one; the in-app
   music panel has a "next" button to skip.

## Automatic music (Jamendo)

If a `JAMENDO_CLIENT_ID` secret is set, the fetch-media workflow pulls
Creative-Commons **vocal songs** from Jamendo automatically — mellow,
emotional singer-songwriter / acoustic / folk ballads (`vocalinstrumental=vocal`,
energetic genres blocked). Famous copyrighted hits can't be used for free, so
these are independent CC-BY / CC-BY-SA artists (NonCommercial and
NoDerivatives excluded). The app shows the required attribution (artist ·
license, linked to the source) in the music panel. It accumulates a library
(up to 40 tracks) over repeated runs rather than overwriting. Get a free
client id at https://devportal.jamendo.com.

## Note on uploading without editing files

If you'd rather upload/change tracks from a web admin page (no git), that
needs server-side object storage (Cloudflare R2) plus a small
password-protected admin page. That's a straightforward follow-up — say the
word and it can be wired up (it needs R2 enabled on the Cloudflare account
and one admin-password secret).
