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

## Curated classical (public domain, Internet Archive)

The fetch-media tool also pulls a hand-picked list of calm standard-repertoire
pieces — Chopin nocturnes/preludes, Bach (cello suite prelude, Chaconne, Air on
the G String), Beethoven's *Moonlight* 1st movement, Elgar's cello concerto,
Saint-Saëns' *The Swan*, Satie's *Gymnopédie/Gnossienne No. 1*, Tchaikovsky's
*October*, Debussy's *Clair de Lune* / *Arabesque No. 1*. The list lives in
`CLASSICAL` in `tools/fetch-media.js`.

These **compositions** are public domain, but a **recording** has its own
copyright, so the tool only downloads recordings under a clear reusable license
— public domain / CC0, or attribution-only Creative Commons (CC-BY / CC-BY-SA),
whose credit the app shows in the music panel — plus recordings from a few
Internet Archive collections that are public domain by nature even when their
per-item license field is blank: **Musopen**, the **78rpm / George Blood**
digitized pre-1928 discs (public domain in the US), and the **Boston Public
Library "unlocked recordings"**. For each piece it prefers an exact-work match
and falls
back to another recording from the same set (e.g. a different Chopin nocturne)
only if the exact one isn't found. These tracks are `pinned` so the auto-fetch
cap never evicts them. No API key is needed.

Modern **neo-classical** (Ludovico Einaudi's *Nuvole Bianche*, Yann Tiersen's
*Comptine d'un autre été*, Max Richter's *On the Nature of Daylight*) is
intentionally **not** included: those composers are living and both the works
and their recordings are under copyright, so they can't be streamed for free on
a public site. They'd need a paid/licensed source.

## Automatic music (ccMixter)

A second English CC source, **ccMixter**, is queried automatically — no API key
needed. Same rules: attribution-only licenses (CC-BY / CC-BY-SA / public
domain; NonCommercial, NoDerivatives and sampling licenses excluded),
disturbing-word title blocklist, English-ish titles. Attribution shows in the
music panel and a subtle "now playing" strip at the bottom of the screen.

## Note on uploading without editing files

If you'd rather upload/change tracks from a web admin page (no git), that
needs server-side object storage (Cloudflare R2) plus a small
password-protected admin page. That's a straightforward follow-up — say the
word and it can be wired up (it needs R2 enabled on the Cloudflare account
and one admin-password secret).
