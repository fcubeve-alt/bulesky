// Turning your own whisper into something you can post somewhere else.
//
// Drawn here, on the phone, on a canvas. Not on the server, and that is a
// decision rather than a shortcut: image composition in a Worker means either a
// paid browser-rendering add-on or a second service to run, and every card
// would then cost money and a round trip. On the device it costs nothing, works
// offline, and the picture appears in the same second it is asked for.
//
// What goes on the card is the other half of the design. A long whisper is NOT
// pasted onto a tall image — an opening that stops mid-thought, with a link
// back, travels better than a wall of text nobody finishes, and it leaves the
// whole story where it was written rather than making a copy of it that outlives
// the original. The author can still delete the whisper; the card is a poster
// for it, not a duplicate of it.
//
// Only ever the author's own words: the button that calls this is shown only
// when the server says the whisper is yours.

import { share } from './native.js';

const W = 1080;
const H = 1350; // 4:5 — the tallest an image can be before Instagram crops it

const BRAND = 'ARE YOU ALRIGHT';
const SITE = 'cubewithin.com';

// Long whispers get an opening, not a summary. Picking "the most moving part"
// would mean asking a model to judge somebody's grief, and being wrong at that
// is worse than being plain: the first lines are what the writer chose to open
// with, and stopping at a sentence end keeps it from reading like a truncation.
const CARD_CHARS = 220;

export function excerpt(text, max = CARD_CHARS) {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  if (s.length <= max) return { text: s, trimmed: false };

  const cut = s.slice(0, max);
  // Prefer a sentence end, then any pause, then wherever we are.
  const end = Math.max(
    cut.lastIndexOf('。'), cut.lastIndexOf('. '), cut.lastIndexOf('！'),
    cut.lastIndexOf('!'), cut.lastIndexOf('？'), cut.lastIndexOf('?')
  );
  const pause = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf(', '), cut.lastIndexOf('、'));
  const at = end > max * 0.5 ? end + 1 : pause > max * 0.5 ? pause + 1 : max;
  return { text: s.slice(0, at).trim(), trimmed: true };
}

// Wrap for both scripts in one pass. Latin breaks on spaces; CJK breaks between
// characters, because it has no spaces and measuring word-by-word would put one
// very long line on the card and nothing else.
export function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    const candidate = line + ch;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (/\s/.test(ch)) {
      lines.push(line.trim());
      line = '';
      continue;
    }
    // Latin: back up to the last space so a word is not split down the middle.
    const lastSpace = line.lastIndexOf(' ');
    if (lastSpace > 0 && /[A-Za-z0-9'’,.-]/.test(ch)) {
      lines.push(line.slice(0, lastSpace).trim());
      line = line.slice(lastSpace + 1) + ch;
    } else {
      lines.push(line.trim());
      line = ch;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return hangPunctuation(lines);
}

// A Chinese line may not BEGIN with closing punctuation. Greedy wrapping breaks
// this constantly — 「，我不再数日子」 at the start of a line is the tell that a
// card was laid out by measuring characters and nothing else — so any stranded
// mark is pulled back onto the line above, which is what hanging punctuation
// means and what every typesetter does. It may overhang the margin slightly;
// that is correct, and far less visible than the alternative.
const NO_LINE_START = /[。，、！？；：）】》」』〉…·.,!?;:)\]}]/;

function hangPunctuation(lines) {
  for (let i = 1; i < lines.length; i += 1) {
    while (lines[i] && NO_LINE_START.test(lines[i][0])) {
      lines[i - 1] += lines[i][0];
      lines[i] = lines[i].slice(1);
    }
  }
  return lines.filter(Boolean);
}

function nightSky(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#070c1e');
  sky.addColorStop(0.55, '#0d1733');
  sky.addColorStop(1, '#14203f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars, seeded by nothing in particular — a card is looked at once.
  for (let i = 0; i < 140; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.75;
    const r = Math.random() * 1.8 + 0.4;
    ctx.globalAlpha = 0.15 + Math.random() * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// One balloon, small, low and to the side. The picture is for the words; a
// large illustration would compete with them.
function balloon(ctx, x, y, scale, warm) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 90);
  glow.addColorStop(0, warm ? 'rgba(255,196,120,0.55)' : 'rgba(150,200,255,0.45)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 90, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = warm ? '#ffd9a0' : '#bcd8ff';
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.bezierCurveTo(30, -34, 34, -6, 12, 26);
  ctx.lineTo(-12, 26);
  ctx.bezierCurveTo(-34, -6, -30, -34, 0, -34);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(-7, 30, 14, 9);
  ctx.restore();
}

// Returns a PNG Blob of the card.
export async function drawCard({ text, type = 'pain', label = '' }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  nightSky(ctx);
  balloon(ctx, W - 190, H - 330, 1.6, type === 'wish');

  const { text: body, trimmed } = excerpt(text);
  const margin = 110;
  const maxWidth = W - margin * 2;

  // Shrink the type rather than the whisper: a short one deserves to be read
  // from across a feed, a long one still has to fit.
  const size = body.length < 60 ? 62 : body.length < 140 ? 52 : 44;
  ctx.font = `${size}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Georgia, serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.textBaseline = 'top';

  const lines = wrap(ctx, trimmed ? `${body}…` : body, maxWidth);
  const lineHeight = size * 1.62;
  const blockHeight = lines.length * lineHeight;
  let y = Math.max(margin + 120, (H - 260 - blockHeight) / 2);

  for (const line of lines) {
    ctx.fillText(line, margin, y);
    y += lineHeight;
  }

  // Only when there is genuinely more to read. On a trimmed card this line is
  // the way back to the rest of it; on a whisper that fits, "read it all" is a
  // lie the card tells about itself.
  ctx.font = '30px "PingFang SC", Georgia, serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  if (label && trimmed) ctx.fillText(label, margin, H - 210);

  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(BRAND, margin, H - 155);

  ctx.font = '30px Georgia, serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(SITE, margin, H - 105);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Hand it to the phone, or fall back to saving it.
//
// `navigator.share` with a file is what puts it into the system sheet — the
// only route that reaches Instagram, WhatsApp or WeChat without us integrating
// with any of them. Where it does not exist, or the user cancels, a download
// still leaves them holding the picture.
export async function shareCard(blob, { title, url }) {
  const file = new File([blob], 'are-you-alright.png', { type: 'image/png' });

  try {
    await share({ files: [file], text: `${title}\n${url}`, title, url });
    return 'shared';
  } catch (e) {
    // Cancelling is not a failure and must not be reported as one.
    if (e && e.name === 'AbortError') return 'cancelled';
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'are-you-alright.png';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  return 'downloaded';
}
