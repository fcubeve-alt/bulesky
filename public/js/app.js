import { t, currentLang } from './i18n.js';
import { createWhisperWorld } from './scene.js';
import { initAmbient } from './ambient.js';
import { initBackgrounds } from './backgrounds.js';
import { VideoRecorderEngine, isRecordingSupported } from './recorder.js';

const $ = (id) => document.getElementById(id);

const els = {
  appTitle: $('app-title'),
  bgIcon: $('bg-icon'),
  musicIcon: $('music-icon'),
  findIcon: $('find-icon'),
  coffeeIcon: $('coffee-icon'),
  lanterns: $('lanterns'),
  world: $('world'),
  bgVideoA: $('bg-video-a'),
  bgVideoB: $('bg-video-b'),
  bgScrim: $('bg-scrim'),
  bgPanel: $('bg-panel'),
  bgClose: $('bg-close'),
  bgNow: $('bg-now'),
  bgNext: $('bg-next'),
  bgAuto: $('bg-auto'),
  bgNote: $('bg-note'),
  findPanel: $('find-panel'),
  findClose: $('find-close'),
  findLabel: $('find-label'),
  findInput: $('find-input'),
  findSubmit: $('find-submit'),
  findResult: $('find-result'),
  coffeePanel: $('coffee-panel'),
  coffeeClose: $('coffee-close'),
  coffeeText: $('coffee-text'),
  coffeeLink: $('coffee-link'),
  shareIcon: $('share-icon'),
  sharePanel: $('share-panel'),
  shareClose: $('share-close'),
  shareTitle: $('share-title'),
  shareHint: $('share-hint'),
  shareCopy: $('share-copy'),
  musicPanel: $('music-panel'),
  musicClose: $('music-close'),
  musicNow: $('music-now'),
  musicCredit: $('music-credit'),
  musicToggle: $('music-toggle'),
  musicNext: $('music-next'),
  musicNote: $('music-note'),
  nowPlaying: $('now-playing'),
  entryPain: $('entry-pain'),
  entryWish: $('entry-wish'),
  composeOverlay: $('compose-overlay'),
  composeSheet: $('compose-sheet'),
  composeClose: $('compose-close'),
  composeTitle: $('compose-title'),
  crisisBanner: $('crisis-banner'),
  crisisText: $('crisis-text'),
  composeContent: $('compose-content'),
  composeCount: $('compose-count'),
  composeCodeLabel: $('compose-code-label'),
  composeCode: $('compose-code'),
  composeCodeHint: $('compose-code-hint'),
  composeHp: $('compose-hp'),
  composeError: $('compose-error'),
  composeCancel: $('compose-cancel'),
  composeSubmit: $('compose-submit'),
  confirmOverlay: $('confirm-overlay'),
  confirmSheet: $('confirm-sheet'),
  confirmMessage: $('confirm-message'),
  confirmCode: $('confirm-code'),
  confirmCopy: $('confirm-copy'),
  confirmHint: $('confirm-hint'),
  confirmClose: $('confirm-close'),
  readOverlay: $('read-overlay'),
  readClose: $('read-close'),
  readScroll: $('read-scroll'),
  readContent: $('read-content'),
  readAuthor: $('read-author'),
  readReport: $('read-report'),
  readReplyBtn: $('read-reply-btn'),
  readVideoBtn: $('read-video-btn'),
  recordOverlay: $('record-overlay'),
  recordModal: $('record-modal'),
  recordClose: $('record-close'),
  recordTitle: $('record-title'),
  recordStatus: $('record-status'),
  recordProgress: $('record-progress'),
  recordBar: $('record-bar'),
  recordPreview: $('record-preview'),
  recordDownload: $('record-download'),
  recordShare: $('record-share'),
  detailRepliesTitle: $('detail-replies-title'),
  readReplies: $('read-replies'),
  replyOverlay: $('reply-overlay'),
  replySheet: $('reply-sheet'),
  replyClose: $('reply-close'),
  replyLabel: $('reply-label'),
  replyContent: $('reply-content'),
  replyCode: $('reply-code'),
  replyError: $('reply-error'),
  replySubmit: $('reply-submit'),
  iosOverlay: $('ios-overlay'),
  iosModal: $('ios-modal'),
  iosTitle: $('ios-title'),
  iosBody: $('ios-body'),
  iosClose: $('ios-close'),
  noticeOverlay: $('notice-overlay'),
  noticeModal: $('notice-modal'),
  noticeTitle: $('notice-title'),
  noticeBody: $('notice-body'),
  noticeOk: $('notice-ok'),
  composePublicHint: $('compose-public-hint'),
  toast: $('toast'),
};

const ERROR_KEYS = {
  empty_content: 'errorEmptyContent',
  empty_code: 'errorEmptyCode',
  content_too_long: 'errorTooLong',
  code_too_long: 'errorTooLong',
  blocked_abusive: 'errorAbusive',
  code_taken: 'errorCodeTaken',
};

const state = { composeType: 'pain', composeOpenedAt: 0, detailBubbleId: null };
let whisperWorld = null;
let backgrounds = null;

// Subtle "now playing" strip above the bottom bar. Updates on every track
// change (including auto-advance), and hides when music is off or on synth.
function updateNowPlaying() {
  const show = ambient.isPlaying && ambient.usingLibrary && ambient.nowPlaying;
  if (show) {
    const artist = ambient.nowArtist ? ` — ${ambient.nowArtist}` : '';
    els.nowPlaying.textContent = `🎵 ${ambient.nowPlaying}${artist}`;
    els.nowPlaying.classList.remove('hidden');
  } else {
    els.nowPlaying.classList.add('hidden');
  }
}

const ambient = initAmbient({ onChange: () => updateNowPlaying() });

function applyText() {
  els.appTitle.textContent = 'Are you alright?'; // fixed signature brand (CSS uppercases it)
  els.findLabel.textContent = t('findLabel');
  els.findInput.placeholder = t('codePlaceholder');
  els.findSubmit.textContent = t('findSubmit');
  els.coffeeText.textContent = t('coffeeText');
  els.coffeeLink.textContent = t('coffeeLink');
  els.shareTitle.textContent = t('shareTitle');
  els.shareHint.textContent = t('shareHint');
  els.shareCopy.textContent = t('shareWhisper');
  els.entryPain.textContent = t('entryPain');
  els.entryWish.textContent = t('entryWish');
  els.crisisText.textContent = t('crisisText');
  els.composeCodeLabel.textContent = t('codeLabel');
  els.composeCode.placeholder = t('codePlaceholder');
  els.composeCodeHint.textContent = t('codeHint');
  els.composeCancel.textContent = t('cancel');
  els.composeSubmit.textContent = t('submit');
  els.confirmCopy.textContent = t('copyCode');
  els.confirmHint.textContent = t('confirmHint');
  els.confirmClose.textContent = t('close');
  els.readReport.textContent = t('detailReport');
  els.readReplyBtn.textContent = t('readReply');
  els.readVideoBtn.textContent = t('makeVideo');
  els.recordTitle.textContent = t('recordTitle');
  els.recordDownload.textContent = t('download');
  els.recordShare.textContent = t('shareWhisper');
  els.replyCode.placeholder = t('replyCodePlaceholder');
  els.replySubmit.textContent = t('replySubmit');
  els.iosTitle.textContent = t('iosTitle');
  els.iosBody.textContent = t('iosBody');
  els.iosClose.textContent = t('iosClose');
  els.noticeTitle.textContent = t('noticeTitle');
  els.noticeBody.textContent = t('noticeBody');
  els.noticeOk.textContent = t('noticeOk');
  els.composePublicHint.textContent = t('composePublicHint');
  document.title = SHARE_BRAND;
}

function showToast(message, duration = 3200) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.add('hidden'), duration);
}

function openSheet(overlay, sheet) {
  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');
}
function closeSheet(overlay, sheet) {
  overlay.classList.add('hidden');
  sheet.classList.add('hidden');
}
function wireOverlayClose(overlay, sheet) {
  overlay.addEventListener('click', () => closeSheet(overlay, sheet));
}

// ---------- Whispers → lanterns ----------

async function loadWhispers() {
  try {
    const res = await fetch('/api/bubbles?limit=80');
    const data = await res.json();
    const whispers = data.bubbles || [];
    whisperWorld.setWhispers(whispers);
  } catch {
    whisperWorld.setWhispers([]);
  }
}

// Track which whispers this device authored, so only the author can turn
// their own whisper into a video. Per-device by design (no accounts).
function myBubbleIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('my_bubbles') || '[]'));
  } catch {
    return new Set();
  }
}
function rememberMyBubble(id) {
  if (!id) return;
  const s = myBubbleIds();
  if (s.has(id)) return;
  s.add(id);
  localStorage.setItem('my_bubbles', JSON.stringify([...s]));
}
function isMyBubble(id) {
  return myBubbleIds().has(id);
}

// ---------- Compose ----------

function openCompose(type) {
  state.composeType = type;
  state.composeOpenedAt = Date.now();
  els.composeTitle.textContent = type === 'pain' ? t('composeTitlePain') : t('composeTitleWish');
  els.composeContent.placeholder = type === 'pain' ? t('contentPlaceholderPain') : t('contentPlaceholderWish');
  els.composeContent.value = '';
  // Enforce the limit at runtime too, so a stale cached index.html (which may
  // still carry the old maxlength) is corrected as soon as the app loads.
  els.composeContent.maxLength = 1000;
  els.composeCode.value = '';
  els.composeCount.textContent = '0/1000';
  els.composeError.classList.add('hidden');
  els.composeHp.value = '';
  els.crisisBanner.classList.toggle('hidden', type !== 'pain');
  openSheet(els.composeOverlay, els.composeSheet);
  els.composeContent.focus();
}

async function submitCompose() {
  const content = els.composeContent.value.trim();
  const code = els.composeCode.value.trim();
  els.composeError.classList.add('hidden');
  if (els.composeHp.value) return;
  if (Date.now() - state.composeOpenedAt < 800) return;
  if (!content) return showError(els.composeError, t('errorEmptyContent'));
  if (!code) return showError(els.composeError, t('errorEmptyCode'));

  els.composeSubmit.disabled = true;
  try {
    const res = await fetch('/api/bubbles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: state.composeType, content, code, lang: currentLang }),
    });
    const data = await res.json();
    if (!res.ok) return showError(els.composeError, t(ERROR_KEYS[data.error] || 'errorGeneric'));
    closeSheet(els.composeOverlay, els.composeSheet);
    rememberMyBubble(data.id);
    showConfirm(data);
    loadWhispers();
  } catch {
    showError(els.composeError, t('errorGeneric'));
  } finally {
    els.composeSubmit.disabled = false;
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showConfirm(data) {
  const base = state.composeType === 'pain' ? t('toastPain') : t('toastWish');
  els.confirmMessage.textContent = data.crisisFlag ? `${base} ${t('toastCrisisExtra')}` : base;
  els.confirmCode.textContent = data.code;
  openSheet(els.confirmOverlay, els.confirmSheet);
}

// ---------- Detail / replies ----------

async function openDetail(id, rect) {
  try {
    const res = await fetch(`/api/bubbles/${id}`);
    const data = await res.json();
    if (!res.ok) return showToast(t('errorGeneric'));
    renderRead(data.bubble, data.replies, rect);
    openRead();
  } catch {
    showToast(t('errorGeneric'));
  }
}

// Transparent, credits-style reading view: the whisper and its replies drift
// slowly upward over the live scene, then loop.
// Show a handle with most of it hidden, e.g. "ty***" — enough to give the
// sky some human presence without exposing anyone's full chosen name.
function maskName(code) {
  const s = String(code || '').trim();
  if (!s) return '';
  return Array.from(s).slice(0, 2).join('') + '***';
}

function renderRead(bubble, replies, rect) {
  state.detailBubbleId = bubble.id;
  els.readOverlay.dataset.type = bubble.type;
  els.readContent.textContent = bubble.content;
  // Only the author (this device posted it) can turn a whisper into a video.
  els.readVideoBtn.classList.toggle('hidden', !isMyBubble(bubble.id));
  if (bubble.code) {
    els.readAuthor.textContent = `${t('byLabel')} ${maskName(bubble.code)}`;
    els.readAuthor.classList.remove('hidden');
  } else {
    els.readAuthor.textContent = '';
    els.readAuthor.classList.add('hidden');
  }
  els.detailRepliesTitle.textContent = bubble.type === 'pain' ? t('repliesTitlePain') : t('repliesTitleWish');
  els.replyLabel.textContent = bubble.type === 'pain' ? t('replyLabelPain') : t('replyLabelWish');
  els.replyContent.placeholder = bubble.type === 'pain' ? t('replyPlaceholderPain') : t('replyPlaceholderWish');
  els.replyContent.value = '';
  els.replyCode.value = '';
  els.replyError.classList.add('hidden');

  els.readReplies.innerHTML = '';
  if (!replies.length) {
    els.detailRepliesTitle.classList.add('hidden');
  } else {
    els.detailRepliesTitle.classList.remove('hidden');
    for (const r of replies) {
      const item = document.createElement('div');
      item.className = 'read-reply';
      const body = document.createElement('div');
      body.className = 'read-reply-text';
      body.textContent = r.content;
      const who = document.createElement('div');
      who.className = 'read-reply-author';
      who.textContent = `${t('byLabel')} ${r.code ? maskName(r.code) : t('anonymous')}`;
      item.append(body, who);
      els.readReplies.appendChild(item);
    }
  }

  // Scroll speed scales with how much there is to read, so long whispers
  // aren't rushed and short ones don't crawl.
  const chars = (bubble.content || '').length + replies.reduce((n, r) => n + (r.content || '').length, 0);
  const dur = Math.min(75, Math.max(20, Math.round(18 + chars * 0.06)));
  els.readScroll.style.setProperty('--read-dur', dur + 's');

  // Start the rise from where the tapped balloon is, so the text appears
  // instantly and feels like it lifts off from the balloon — instead of
  // crawling up from far below the screen. Falls back to near the bottom edge.
  const vh = window.innerHeight;
  let startY = vh * 0.88;
  if (rect && Number.isFinite(rect.top)) {
    startY = Math.min(vh * 0.98, Math.max(vh * 0.22, rect.top));
  }
  els.readScroll.style.setProperty('--read-from', startY + 'px');

  // Restart the rise every time the view opens.
  els.readScroll.style.animation = 'none';
  void els.readScroll.offsetWidth; // force reflow
  els.readScroll.style.animation = '';
}

function openRead() {
  els.readOverlay.classList.remove('hidden');
}

function closeRead() {
  els.readOverlay.classList.add('hidden');
}

function openReplySheet() {
  openSheet(els.replyOverlay, els.replySheet);
  els.replyContent.focus();
}

async function submitReply() {
  const content = els.replyContent.value.trim();
  els.replyError.classList.add('hidden');
  if (!content) return showError(els.replyError, t('errorEmptyContent'));
  els.replySubmit.disabled = true;
  try {
    const res = await fetch(`/api/bubbles/${state.detailBubbleId}/replies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, code: els.replyCode.value.trim(), lang: currentLang }),
    });
    const data = await res.json();
    if (!res.ok) return showError(els.replyError, t(ERROR_KEYS[data.error] || 'errorGeneric'));
    closeSheet(els.replyOverlay, els.replySheet);
    await openDetail(state.detailBubbleId);
    loadWhispers();
  } catch {
    showError(els.replyError, t('errorGeneric'));
  } finally {
    els.replySubmit.disabled = false;
  }
}

async function reportBubble() {
  if (!window.confirm(t('reportConfirm'))) return;
  try {
    await fetch('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetType: 'bubble', targetId: state.detailBubbleId }),
    });
    showToast(t('reportedToast'));
    closeRead();
    loadWhispers();
  } catch {
    showToast(t('errorGeneric'));
  }
}

// ---------- Find my light (robust query-param endpoint) ----------

async function submitFind() {
  const code = els.findInput.value.trim();
  els.findResult.innerHTML = '';
  if (!code) return;
  try {
    const res = await fetch(`/api/bubbles?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok || !data.bubbles || data.bubbles.length === 0) {
      els.findResult.textContent = t('findNotFound');
      return;
    }
    renderFindResults(data.bubbles);
  } catch {
    els.findResult.textContent = t('findError');
  }
}

// A name can hold many whispers, so show them as a tappable list; tapping one
// opens its full detail (with replies).
function renderFindResults(bubbles) {
  // Whispers found by your own code are yours — remember them so you can
  // make videos of them.
  for (const b of bubbles) rememberMyBubble(b.id);
  els.findResult.innerHTML = '';
  const title = document.createElement('p');
  title.className = 'find-results-title';
  title.textContent = `${t('findResultsTitle')} · ${bubbles.length}`;
  els.findResult.appendChild(title);
  for (const b of bubbles) {
    const row = document.createElement('button');
    row.className = 'find-result-row';
    const icon = b.type === 'wish' ? '✦ ' : '❁ ';
    const text = (b.content || '').trim();
    row.textContent = icon + text.slice(0, 42) + (text.length > 42 ? '…' : '');
    row.addEventListener('click', () => {
      els.findPanel.classList.add('hidden');
      openDetail(b.id);
    });
    els.findResult.appendChild(row);
  }
}

// ---------- iOS install guide ----------

// First-visit notice: everything posted here is public, and only the author
// may repost their own words elsewhere. Shown once, before anything else.
function maybeShowNotice() {
  if (localStorage.getItem('bulesky_notice_ack')) return false;
  setTimeout(() => openSheet(els.noticeOverlay, els.noticeModal), 700);
  return true;
}

function maybeShowIosGuide() {
  // Don't stack the install guide on top of the first-visit notice.
  if (!localStorage.getItem('bulesky_notice_ack')) return;
  const isIos =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (!isIos || standalone || localStorage.getItem('bulesky_ios_guide_dismissed')) return;
  setTimeout(() => openSheet(els.iosOverlay, els.iosModal), 1400);
}

// Share the site itself (a link), never someone else's words — that keeps
// promotion easy while honoring "only the author may repost their content".
// Shared content stays English-only (the audience is international) and always
// carries the brand name "Are you all right?".
const SHARE_BRAND = 'Are you all right?';
const SITE_URL = 'https://cubewithin.com';

async function shareSite() {
  try {
    if (navigator.share) {
      await navigator.share({ title: SHARE_BRAND, text: SHARE_BRAND, url: SITE_URL });
      return;
    }
  } catch {
    return; // user cancelled the native sheet
  }
  try {
    await navigator.clipboard.writeText(`${SHARE_BRAND} ${SITE_URL}`);
    showToast(t('copied'));
  } catch {
    showToast(url);
  }
}

// ---------- One-tap share video (in-page recording, no system UI) ----------
// Composites the live background video + this whisper's text + the music onto
// an offscreen canvas and records ~16s to a shareable clip. Balloons are DOM
// and aren't captured here (a later phase could canvas-render them).
const RECORD_SECONDS = 16;
let recordState = { engine: null, raf: 0, blob: null };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx, video, W, H) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return true;
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of Array.from(para)) {
      if (line && ctx.measureText(line + ch).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

function prepRecordModal() {
  els.recordStatus.textContent = '';
  els.recordProgress.classList.add('hidden');
  els.recordBar.style.width = '0%';
  els.recordPreview.classList.add('hidden');
  els.recordPreview.innerHTML = '';
  els.recordDownload.classList.add('hidden');
  els.recordShare.classList.add('hidden');
}

function videoFilename() {
  const ext = recordState.engine ? recordState.engine.extension : 'webm';
  return `cubewithin-${Date.now()}.${ext}`;
}

function startWhisperVideo() {
  openSheet(els.recordOverlay, els.recordModal);
  prepRecordModal();
  if (!isRecordingSupported()) {
    els.recordStatus.textContent = t('recordUnsupported');
    return;
  }

  const text = (els.readContent.textContent || '').trim();
  const author = (els.readAuthor.textContent || '').trim();
  const type = els.readOverlay.dataset.type || 'wish';
  const credit = ambient.isPlaying && ambient.usingLibrary && ambient.nowPlaying
    ? `♪ ${ambient.nowPlaying}${ambient.nowCredit ? ' · ' + ambient.nowCredit : ''}`
    : '';
  const bgVideo = document.querySelector('.bg-video.bg-show');

  const W = 720;
  const H = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const engine = new VideoRecorderEngine(canvas, ambient.getAudioTracks(), { fps: 30 });
  recordState.engine = engine;
  recordState.blob = null;

  els.recordProgress.classList.remove('hidden');
  els.recordStatus.textContent = t('recordWorking');

  const start = performance.now();
  function frame(now) {
    const elapsed = (now - start) / 1000;
    const p = Math.min(1, elapsed / RECORD_SECONDS);

    if (!(bgVideo && bgVideo.readyState >= 2 && drawCover(ctx, bgVideo, W, H))) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0a0f22');
      g.addColorStop(1, '#161d3a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = 'rgba(4,6,16,0.34)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '600 40px "PingFang SC", "Hiragino Sans GB", "Noto Sans", system-ui, sans-serif';
    const maxW = W * 0.76;
    const x = W * 0.12;
    const lines = wrapCanvasText(ctx, text, maxW);
    const lineH = 58;
    const authorH = author ? 46 : 0;
    const blockH = lines.length * lineH + authorH;
    const y = H * 0.9 - p * (H * 0.52); // rise upward over the clip

    ctx.fillStyle = 'rgba(255,244,204,0.44)';
    roundRect(ctx, x - 24, y - 24, maxW + 48, blockH + 40, 24);
    ctx.fill();

    ctx.fillStyle = '#3b2f18';
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH));
    if (author) {
      ctx.font = '700 26px "PingFang SC", system-ui, sans-serif';
      ctx.fillStyle = '#6a561f';
      ctx.fillText(author, x, y + lines.length * lineH + 8);
    }

    ctx.textAlign = 'left';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(SHARE_BRAND, 28, H - 64);
    ctx.font = '500 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('cubewithin.com', 28, H - 38);
    if (credit) {
      ctx.textAlign = 'right';
      ctx.font = '500 20px system-ui, sans-serif';
      ctx.fillText(credit.slice(0, 52), W - 28, H - 44);
    }

    els.recordBar.style.width = (p * 100).toFixed(1) + '%';

    if (elapsed < RECORD_SECONDS) {
      recordState.raf = requestAnimationFrame(frame);
    } else {
      finishWhisperVideo();
    }
  }

  try {
    engine.start();
  } catch {
    els.recordStatus.textContent = t('recordUnsupported');
    return;
  }
  recordState.raf = requestAnimationFrame(frame);
}

async function finishWhisperVideo() {
  cancelAnimationFrame(recordState.raf);
  els.recordStatus.textContent = t('recordFinishing');
  try {
    const blob = await recordState.engine.stop();
    recordState.blob = blob;
    els.recordPreview.innerHTML = '';
    const v = document.createElement('video');
    v.src = VideoRecorderEngine.previewUrl(blob);
    v.controls = true;
    v.loop = true;
    v.playsInline = true;
    v.autoplay = true;
    els.recordPreview.appendChild(v);
    els.recordPreview.classList.remove('hidden');
    els.recordProgress.classList.add('hidden');
    els.recordStatus.textContent = t('recordDone');
    els.recordDownload.classList.remove('hidden');
    els.recordShare.classList.remove('hidden');
  } catch {
    els.recordProgress.classList.add('hidden');
    els.recordStatus.textContent = t('recordFailed');
  }
}

function stopRecordFlow() {
  cancelAnimationFrame(recordState.raf);
  try {
    const r = recordState.engine && recordState.engine.recorder;
    if (r && r.state === 'recording') r.stop();
  } catch {
    /* ignore */
  }
  closeSheet(els.recordOverlay, els.recordModal);
}

// ---------- First-visit hint ----------

// Tell first-time visitors that a single tap starts the music (browsers block
// audible autoplay until a gesture, so we nudge them). Shown once, ever.
function maybeShowFirstHint() {
  if (localStorage.getItem('bulesky_first_hint')) return;
  localStorage.setItem('bulesky_first_hint', '1');
  setTimeout(() => showToast(t('firstHint'), 5200), 900);
}

// ---------- Music panel ----------

function refreshMusicPanel() {
  els.musicToggle.textContent = ambient.isPlaying ? t('musicPause') : t('musicPlay');
  els.musicNext.textContent = t('musicNext');
  if (ambient.isPlaying) {
    els.musicNow.textContent = ambient.usingLibrary ? ambient.nowPlaying || '' : t('musicSynth');
  } else {
    els.musicNow.textContent = t('musicIdle');
  }
  // Attribution (required for CC-BY tracks): show artist · license, linked to source.
  const credit = ambient.isPlaying && ambient.usingLibrary ? ambient.nowCredit : '';
  if (credit) {
    els.musicCredit.textContent = credit;
    els.musicCredit.href = ambient.nowSource || '#';
    els.musicCredit.style.display = '';
  } else {
    els.musicCredit.style.display = 'none';
  }
  els.musicNote.textContent = ambient.usingLibrary ? '' : t('musicEmptyNote');
  els.musicNext.style.display = ambient.usingLibrary ? '' : 'none';
}

// ---------- Wiring ----------

function refreshBgPanel() {
  els.bgNow.textContent = backgrounds.currentTitle;
  els.bgNext.textContent = t('bgNext');
  els.bgAuto.textContent = backgrounds.autoOn ? t('bgAutoOn') : t('bgAutoOff');
  els.bgNote.textContent = backgrounds.hasVideos ? '' : t('bgEmptyNote');
  els.bgNext.style.display = backgrounds.count > 1 ? '' : 'none';
  els.bgAuto.style.display = backgrounds.count > 1 ? '' : 'none';
}

const MUSIC_OFF_KEY = 'bulesky_music_off';

// Browsers block audible autoplay until a user gesture, so start the music
// on the very first tap/click/key anywhere — unless the user has turned it
// off before (remembered). Feels like autoplay without fighting the policy.
function armMusicAutostart() {
  if (localStorage.getItem(MUSIC_OFF_KEY) === '1') return;
  const start = async () => {
    window.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
    if (ambient.isPlaying) return;
    const playing = await ambient.toggle();
    els.musicIcon.setAttribute('aria-pressed', String(playing));
  };
  window.addEventListener('pointerdown', start, { once: false });
  window.addEventListener('keydown', start, { once: false });
}

function init() {
  applyText();
  backgrounds = initBackgrounds({ videoA: els.bgVideoA, videoB: els.bgVideoB, scrim: els.bgScrim });
  whisperWorld = createWhisperWorld(els.lanterns, els.world, { onTap: openDetail });
  loadWhispers();
  ambient.preload(); // fetch the music manifest early so first-tap playback is instant
  armMusicAutostart();

  // Stop the music the moment the page is hidden or closed (swiping the tab
  // away, backgrounding the browser, locking the phone). Mobile browsers keep
  // media playing behind a closed page otherwise; resume when the user comes
  // back if music was on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ambient.suspend();
    else ambient.resume();
  });
  window.addEventListener('pagehide', () => ambient.suspend());

  els.entryPain.addEventListener('click', () => openCompose('pain'));
  els.entryWish.addEventListener('click', () => openCompose('wish'));
  els.composeClose.addEventListener('click', () => closeSheet(els.composeOverlay, els.composeSheet));
  els.composeCancel.addEventListener('click', () => closeSheet(els.composeOverlay, els.composeSheet));
  els.composeSubmit.addEventListener('click', submitCompose);
  els.composeContent.addEventListener('input', () => {
    els.composeCount.textContent = `${els.composeContent.value.length}/1000`;
  });
  wireOverlayClose(els.composeOverlay, els.composeSheet);

  els.confirmClose.addEventListener('click', () => closeSheet(els.confirmOverlay, els.confirmSheet));
  els.confirmCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.confirmCode.textContent);
      showToast(t('copied'));
    } catch { /* ignore */ }
  });
  wireOverlayClose(els.confirmOverlay, els.confirmSheet);

  els.readClose.addEventListener('click', closeRead);
  // Tap on empty space (overlay or the non-interactive viewport) closes.
  els.readOverlay.addEventListener('click', (e) => {
    if (e.target === els.readOverlay || e.target.classList.contains('read-viewport')) closeRead();
  });
  els.readReport.addEventListener('click', reportBubble);
  els.readReplyBtn.addEventListener('click', openReplySheet);
  els.readVideoBtn.addEventListener('click', startWhisperVideo);
  els.recordClose.addEventListener('click', stopRecordFlow);
  els.recordOverlay.addEventListener('click', stopRecordFlow);
  els.recordDownload.addEventListener('click', () => {
    if (recordState.blob) VideoRecorderEngine.download(recordState.blob, videoFilename());
  });
  els.recordShare.addEventListener('click', async () => {
    if (!recordState.blob) return;
    const r = await VideoRecorderEngine.share(recordState.blob, videoFilename(), `${SHARE_BRAND} ${SITE_URL}`);
    if (r === 'downloaded') showToast(t('copied'));
  });
  els.replyClose.addEventListener('click', () => closeSheet(els.replyOverlay, els.replySheet));
  els.replySubmit.addEventListener('click', submitReply);
  wireOverlayClose(els.replyOverlay, els.replySheet);

  els.findIcon.addEventListener('click', () => {
    els.findResult.innerHTML = '';
    els.findPanel.classList.toggle('hidden');
    els.coffeePanel.classList.add('hidden');
    els.musicPanel.classList.add('hidden');
    els.bgPanel.classList.add('hidden');
    els.sharePanel.classList.add('hidden');
  });
  els.findClose.addEventListener('click', () => els.findPanel.classList.add('hidden'));
  els.findSubmit.addEventListener('click', submitFind);
  els.findInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitFind(); });

  els.coffeeIcon.addEventListener('click', () => {
    els.coffeePanel.classList.toggle('hidden');
    els.findPanel.classList.add('hidden');
    els.musicPanel.classList.add('hidden');
    els.bgPanel.classList.add('hidden');
    els.sharePanel.classList.add('hidden');
  });
  els.coffeeClose.addEventListener('click', () => els.coffeePanel.classList.add('hidden'));

  els.shareIcon.addEventListener('click', () => {
    els.sharePanel.classList.toggle('hidden');
    els.findPanel.classList.add('hidden');
    els.coffeePanel.classList.add('hidden');
    els.musicPanel.classList.add('hidden');
    els.bgPanel.classList.add('hidden');
  });
  els.shareClose.addEventListener('click', () => els.sharePanel.classList.add('hidden'));
  els.shareCopy.addEventListener('click', shareSite);

  els.bgIcon.addEventListener('click', () => {
    els.bgPanel.classList.toggle('hidden');
    els.findPanel.classList.add('hidden');
    els.coffeePanel.classList.add('hidden');
    els.musicPanel.classList.add('hidden');
    refreshBgPanel();
  });
  els.bgClose.addEventListener('click', () => els.bgPanel.classList.add('hidden'));
  els.bgNext.addEventListener('click', () => {
    backgrounds.next();
    refreshBgPanel();
  });
  els.bgAuto.addEventListener('click', () => {
    backgrounds.toggleAuto();
    refreshBgPanel();
  });

  els.musicIcon.addEventListener('click', () => {
    els.musicPanel.classList.toggle('hidden');
    els.findPanel.classList.add('hidden');
    els.coffeePanel.classList.add('hidden');
    els.bgPanel.classList.add('hidden');
    refreshMusicPanel();
  });
  els.musicClose.addEventListener('click', () => els.musicPanel.classList.add('hidden'));
  els.musicToggle.addEventListener('click', async () => {
    const playing = await ambient.toggle();
    els.musicIcon.setAttribute('aria-pressed', String(playing));
    // Remember the choice so autostart respects a deliberate pause next visit.
    localStorage.setItem(MUSIC_OFF_KEY, playing ? '0' : '1');
    refreshMusicPanel();
  });
  els.musicNext.addEventListener('click', () => {
    ambient.next();
    setTimeout(refreshMusicPanel, 60);
  });

  els.iosClose.addEventListener('click', () => {
    localStorage.setItem('bulesky_ios_guide_dismissed', '1');
    closeSheet(els.iosOverlay, els.iosModal);
  });
  wireOverlayClose(els.iosOverlay, els.iosModal);

  els.noticeOk.addEventListener('click', () => {
    localStorage.setItem('bulesky_notice_ack', '1');
    closeSheet(els.noticeOverlay, els.noticeModal);
  });

  maybeShowNotice();
  maybeShowIosGuide();
  maybeShowFirstHint();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
