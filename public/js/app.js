import { t, currentLang, applyStaticI18n } from './i18n.js';
import { createWhisperWorld } from './scene.js';
import { initAmbient } from './ambient.js';
import { initBackgrounds } from './backgrounds.js';
import * as identity from './identity.js';
import { url as apiUrl } from './config.js';
import * as native from './native.js';
import { drawCard, shareCard } from './sharecard.js';

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
  aboutIcon: $('about-icon'),
  aboutPanel: $('about-panel'),
  aboutClose: $('about-close'),
  aboutPanelText: $('about-panel-text'),
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
  composeSub: $('compose-sub'),
  crisisBanner: $('crisis-banner'),
  crisisText: $('crisis-text'),
  crisisLink: $('crisis-link'),
  composeContent: $('compose-content'),
  composeCount: $('compose-count'),
  composeCodeLabel: $('compose-code-label'),
  composeCode: $('compose-code'),
  composeAs: $('compose-as'),
  composeRestore: $('compose-restore'),
  composeHp: $('compose-hp'),
  composeError: $('compose-error'),
  composeCancel: $('compose-cancel'),
  composeSubmit: $('compose-submit'),
  confirmOverlay: $('confirm-overlay'),
  confirmSheet: $('confirm-sheet'),
  confirmMessage: $('confirm-message'),
  confirmCode: $('confirm-code'),
  confirmHint: $('confirm-hint'),
  confirmClose: $('confirm-close'),
  readOverlay: $('read-overlay'),
  readClose: $('read-close'),
  readScroll: $('read-scroll'),
  readContent: $('read-content'),
  readAuthor: $('read-author'),
  readInvite: $('read-invite'),
  readReplyBtn: $('read-reply-btn'),
  readListenBtn: $('read-listen-btn'),
  listenDock: $('listen-dock'),
  listenDismiss: $('listen-dismiss'),
  readInviteText: $('read-invite-text'),
  readLightBtn: $('read-light-btn'),
  readReportBtn: $('read-report-btn'),
  readDeleteBtn: $('read-delete-btn'),
  readSaveBtn: $('read-save-btn'),
  readShareBtn: $('read-share-btn'),
  reportOverlay: $('report-overlay'),
  reportSheet: $('report-sheet'),
  reportTitle: $('report-title'),
  reportCancel: $('report-cancel'),
  myskyName: $('mysky-name'),
  myskyRename: $('mysky-rename'),
  myskyNameInput: $('mysky-name-input'),
  myskyNameSave: $('mysky-name-save'),
  mysky: $('mysky'),
  recoveryBox: $('recovery-box'),
  recoverySummary: $('recovery-summary'),
  recoveryNote: $('recovery-note'),
  myRecovery: $('my-recovery'),
  myRecoveryCopy: $('my-recovery-copy'),
  myskyTitle: $('mysky-title'),
  myskyIntro: $('mysky-intro'),
  myskyMsg: $('mysky-msg'),
  restoreLabel: $('restore-label'),
  restoreInput: $('restore-input'),
  restoreSubmit: $('restore-submit'),
  recoveryBlock: $('recovery-block'),
  recoveryLabel: $('recovery-label'),
  recoveryCode: $('recovery-code'),
  recoveryHint: $('recovery-hint'),
  recoveryCopy: $('recovery-copy'),
  detailRepliesTitle: $('detail-replies-title'),
  readReplies: $('read-replies'),
  replyOverlay: $('reply-overlay'),
  replySheet: $('reply-sheet'),
  replyClose: $('reply-close'),
  replyLabel: $('reply-label'),
  replyContent: $('reply-content'),
  replyCount: $('reply-count'),
  replyCode: $('reply-code'),
  replyAs: $('reply-as'),
  replyCodeLabel: $('reply-code-label'),
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
  blocked_guidelines: 'errorGuidelines',
  too_many_replies: 'errorTooManyReplies',
};

const state = {
  composeType: 'pain',
  composeOpenedAt: 0,
  detailBubbleId: null,
  detailBubble: null,
  detailWarmed: false, // did the reader leave a light or a reply on this one?
  pendingMine: null, // just published, waiting for the confirmation to close
};
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

// Kept in step with the server (functions/api/bubbles/[id]/replies.js): a
// reply that the box lets you finish and the server then refuses is the worst
// version of a limit.
const REPLY_MAX = 150;

function applyText() {
  // <html lang> and <html dir>. Never called while the interface was pinned to
  // English, and nothing missed it — now that the interface follows the phone
  // it is what makes Arabic read right to left, and what the browser's own
  // speech synthesis reads to pick a voice when the server route is down.
  applyStaticI18n();
  els.appTitle.textContent = 'Are you alright?'; // fixed signature brand (CSS uppercases it)
  els.aboutPanelText.textContent = t('aboutPanelIntro');
  els.coffeeText.textContent = t('coffeeText');
  els.coffeeLink.textContent = t('coffeeLink');
  els.shareTitle.textContent = t('shareTitle');
  els.shareHint.textContent = t('shareHint');
  els.shareCopy.textContent = t('shareWhisper');
  els.entryPain.textContent = t('entryPain');
  els.entryWish.textContent = t('entryWish');
  els.crisisText.textContent = t('crisisText');
  els.crisisLink.textContent = t('crisisMore');
  els.composeSub.textContent = t('composeSub');
  els.composeCodeLabel.textContent = t('composeNameChip');
  els.composeCode.placeholder = t('codePlaceholder');
  els.composeRestore.textContent = t('composeRestore');
  els.replyCodeLabel.textContent = t('replyNameChip');
  els.composeCancel.textContent = t('cancel');
  els.composeSubmit.textContent = t('submit');
  els.recoveryCopy.textContent = t('copyRecovery');
  els.confirmHint.textContent = t('confirmHint');
  els.confirmClose.textContent = t('close');
  els.readInviteText.textContent = t('readInvite');
  els.readReplyBtn.textContent = t('readReply');
  els.readListenBtn.textContent = t('listen');
  els.readLightBtn.textContent = t('leaveLight');
  els.readDeleteBtn.textContent = t('deleteMine');
  els.readShareBtn.textContent = t('shareMine');
  els.myskyTitle.textContent = t('mySkyTitle');
  els.myskyIntro.textContent = t('mySkyIntro');
  els.reportTitle.textContent = t('reportWhy');
  els.reportCancel.textContent = t('cancel');
  for (const b of document.querySelectorAll('.report-reason')) {
    b.textContent = t(`reportReason_${b.dataset.reason.replace('-', '')}`);
  }
  els.recoverySummary.textContent = t('myCodeTitle');
  els.recoveryNote.textContent = t('myCodeNote');
  els.myRecoveryCopy.textContent = t('copyRecovery');
  els.restoreLabel.textContent = t('restoreLabel');
  els.restoreInput.placeholder = t('restorePlaceholder');
  els.restoreSubmit.textContent = t('restoreSubmit');
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
    // 40, not 80: the refresh below replaces the deck every 90s and a balloon
    // rises every ~3.4s, so only the first ~26 of a sample were ever dealt —
    // the rest was downloaded and thrown away.
    const res = await fetch(apiUrl('/api/bubbles?limit=40'));
    const data = await res.json();
    const whispers = data.bubbles || [];
    whisperWorld.setWhispers(whispers);
  } catch {
    whisperWorld.setWhispers([]);
  }
}

// Called when the drifting field has shown its whole deck once and wants fresh
// balloons rising next (SKY_FEED §3). Throttled so a small corpus that cycles
// quickly doesn't hammer the API.
let lastSampleAt = 0;
function requestFreshSample() {
  const now = Date.now();
  if (now - lastSampleAt < 20000) return;
  lastSampleAt = now;
  loadWhispers();
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

// A device may leave at most one "light" (微光) per whisper — a zero-effort
// warm response. Gated in localStorage so the button can't be spammed.
function litBubbleIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('lit_bubbles') || '[]'));
  } catch {
    return new Set();
  }
}
function hasLeftLight(id) {
  return litBubbleIds().has(id);
}
function rememberLight(id) {
  const s = litBubbleIds();
  if (s.has(id)) return;
  s.add(id);
  localStorage.setItem('lit_bubbles', JSON.stringify([...s]));
}

// ---------- Reporting ----------

// One report per device per item, kept in localStorage as "bubble:12" /
// "reply:34" so a whisper and its replies are counted separately. Reporting is
// deliberately one tap with no confirmation dialog: an extra step mostly buys
// fewer reports, not better ones.
function reportedKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem('reported_items') || '[]'));
  } catch {
    return new Set();
  }
}
function reportKey(targetType, id) {
  return `${targetType}:${id}`;
}
function hasReported(targetType, id) {
  return reportedKeys().has(reportKey(targetType, id));
}
function rememberReported(targetType, id) {
  const s = reportedKeys();
  s.add(reportKey(targetType, id));
  localStorage.setItem('reported_items', JSON.stringify([...s]));
}

function markReportButton(btn) {
  btn.textContent = t('reported');
  btn.disabled = true;
  btn.classList.add('reported');
}

// Send one report. The server answers whether the content ended up hidden —
// either because the moderation model confirmed the violation on this very
// report, or because it has now been flagged enough times.
// Ask what is wrong with it, then send.
//
// The reason is not paperwork: the queue used to show a count and nothing
// else, so whoever reviews a report had to open it and guess at the
// complaint — and there was no way to see which category of harm was actually
// turning up. Five buttons, no typing.
let pendingReport = null;

function askReportReason(targetType, id, btn, onHidden) {
  if (hasReported(targetType, id)) return;
  pendingReport = { targetType, id, btn, onHidden };
  openSheet(els.reportOverlay, els.reportSheet);
}

function closeReportSheet() {
  pendingReport = null;
  closeSheet(els.reportOverlay, els.reportSheet);
}

async function sendReport(targetType, id, btn, onHidden, reason) {
  if (hasReported(targetType, id)) return;
  rememberReported(targetType, id);
  markReportButton(btn);
  try {
    const res = await fetch(apiUrl('/api/report'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetType, targetId: id, reason }),
    });
    const data = await res.json();
    if (!res.ok) return showToast(t('errorGeneric'));
    showToast(t('reportedToast'));
    if (data.hidden) onHidden();
  } catch {
    showToast(t('errorGeneric'));
  }
}

// ---------- Compose ----------

// Set/switch the emotion type: active pill + title + placeholder + crisis
// banner (banner only on 'pain').
function setComposeType(type) {
  state.composeType = type;
  els.composeTitle.textContent = type === 'pain' ? t('composeTitlePain') : t('composeTitleWish');
  els.composeContent.placeholder = type === 'pain' ? t('contentPlaceholderPain') : t('contentPlaceholderWish');
  els.crisisBanner.classList.toggle('hidden', type !== 'pain');
}

function openCompose(type) {
  state.composeOpenedAt = Date.now();
  setComposeType(type);
  els.composeContent.value = '';
  // Enforce the limit at runtime too, so a stale cached index.html (which may
  // still carry the old maxlength) is corrected as soon as the app loads.
  els.composeContent.maxLength = 1000;
  // Asked once, then never again. One phone, one name: with a name already
  // settled the box goes away entirely and the sheet just says who this is
  // going out as. Handing someone an editable name field on every whisper is
  // what produced a person with forty names and a sky that could not be
  // counted.
  showNameField(els.composeCode.parentElement, els.composeAs, els.composeCode, els.composeRestore);
  els.composeCount.textContent = '0 / 1000';
  els.composeError.classList.add('hidden');
  els.composeHp.value = '';
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
    // Ask before minting: a device that has never written anything has no
    // identity, and this is the moment it gets one. The answer decides whether
    // the confirmation shows the recovery code — worth reading once, noise on
    // every whisper after that.
    const firstEver = !identity.hasSecret();
    const secret = identity.secret();
    identity.rememberName(code); // so the next whisper and every reply is signed the same

    const res = await fetch(apiUrl('/api/bubbles'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: state.composeType, content, code, lang: currentLang, secret }),
    });
    const data = await res.json();
    if (!res.ok) return showError(els.composeError, t(ERROR_KEYS[data.error] || 'errorGeneric'));
    closeSheet(els.composeOverlay, els.composeSheet);
    native.tap('heavy'); // it left your hands
    rememberMyBubble(data.id);
    // The author must always see their own whisper — and see it AFTER the
    // confirmation is out of the way. Pinning it here used to send it up behind
    // the confirmation sheet, so by the time that was dismissed the balloon was
    // already near the top or gone, and the whole thing read as "I posted it
    // and it vanished". It is held instead, then launched into a readable tier
    // in the middle of the screen with a ring around it.
    state.pendingMine = { id: data.id, type: data.type, content: data.content, code: data.code, warmth: 0, lights: 0 };
    // The confirmation sheet exists for the things you only need told once: the
    // name you now go by, and the recovery code that is the only way back to
    // your own words. On the second whisper it has nothing left to say — the
    // compose sheet already showed the name on the way in — and repeating it
    // turns sending into a form with an OK button on the end.
    //
    // "第二次你发送的时候这些就没必要出现了…后面就不要再有又跳出一个,太啰唆了."
    // So from the second whisper on it is skipped entirely and the words go
    // straight up: the balloon into the sky, the reading view onto the text.
    //
    // The one exception is a whisper the crisis check flagged. That sheet is
    // carrying a phone number to somebody who may need it tonight, and being
    // brief is not worth more than that.
    if (firstEver || data.crisisFlag) showConfirm(data, firstEver && Boolean(secret));
    else releaseMyWhisper();
    loadWhispers();
  } catch {
    showError(els.composeError, t('errorGeneric'));
  } finally {
    els.composeSubmit.disabled = false;
  }
}

// A name field that disappears once there is a name.
//
// Before the first whisper: the box, because the name has to come from
// somewhere. After it: a line saying which name this is going out under, and
// no way to change it here — changing it is a deliberate act done from My Sky,
// not something that happens because an editable field was sitting on the
// screen at two in the morning.
function showNameField(row, line, input, restore) {
  const name = identity.displayName();
  row.classList.toggle('hidden', Boolean(name));
  line.classList.toggle('hidden', !name);
  if (name) {
    line.textContent = t('postingAs').replace('{name}', name);
    input.value = name;
  } else {
    input.value = '';
  }
  // "One phone, one name" is true of the App, where there is one WebView and
  // one store. On the web it is true of one BROWSER PROFILE: Safari, Chrome, a
  // private window and a home-screen web app on the same phone are four empty
  // stores, and each one asks for a name as though it had met a new person.
  //
  // Nothing can join them up from here — the only techniques that could are
  // fingerprinting ones, and this site does not do that. What can be done is
  // ask, at the one moment it is still cheap: before the new identity exists,
  // offer to bring the old one across instead.
  if (restore) restore.classList.toggle('hidden', Boolean(name));
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// Keep the sky covering the glass — and then CHECK that it does.
//
// Eleven rounds went into the band under the sky on an installed home-screen
// app, and every one of them was the same shape of attempt: work out what the
// right height is, set it, deploy, wait for a photograph. Open loop. When the
// photograph still showed a band there was no way to tell which of the guesses
// had been wrong, so the next round guessed again.
//
// The numbers are why. On one real iPhone, measured: the box a `position:
// fixed` element is laid out in was 684px, `100vh` said 792, and the screen is
// 874. Three numbers for one screen, none of them the screen. Any formula built
// out of them is a guess about which one lies today.
//
// So this stops predicting and starts measuring. --sky-h is still set the same
// way — the largest of what the browser will admit to, which is right often
// enough to be the first try — and then every background layer is asked where
// it ACTUALLY ends, with getBoundingClientRect(), and anything that falls short
// is grown by exactly the shortfall. It does not need to know why a layer came
// up short. It can see that it did.
//
// Three properties this has that none of the eleven had:
//
//   it is closed          a wrong prediction is corrected in the same frame
//                         instead of in the next deploy
//   it can only grow      never shrinks a layer, so it cannot become a new way
//                         for the band to appear
//   it says what it saw   the measurement is left in localStorage for
//                         /diag.html to print, so the next round starts with
//                         numbers from the phone that has the problem
//
// ⚠️ BACKGROUNDS ONLY: #sky-bg, #bg-scrim, .bg-video. Deliberately not
// #lanterns — the balloon world is positioned inside it and changing its height
// moves every balloon in the sky (docs/SKY_FEED.md). A transparent layer coming
// up short is not what a band is made of; a background one is.
const BLEED = 120;

function skyTarget() {
  return Math.max(
    (window.screen && window.screen.height) || 0,
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    (window.visualViewport && window.visualViewport.height) || 0
  );
}

// Grow one layer until it reaches past both edges. Returns what it settled at.
//
// The bar is the screen and nothing more: top at or above 0, bottom at or below
// the last row of pixels. It used to demand a further --bleed of overshoot at
// each end, which was right when the rule was built out of a measured height and
// the bleed was the margin for that measurement being wrong. The rule in
// index.html no longer measures anything, so the only question left is the one
// that was ever being asked — does the scenery reach the glass — and asking for
// more than that would have this fighting the transform that already answers it.
function fitLayer(el, target) {
  let rect = el.getBoundingClientRect();
  // A layer that is not laid out at all (the videos start .hidden) measures as
  // zero and would look infinitely short. It gets fitted when it appears.
  if (!rect.width || !rect.height) return null;

  const before = rect.bottom;
  for (let i = 0; i < 3; i += 1) {
    const shortAtTop = rect.top > 1;
    const shortAtBottom = rect.bottom < target - 1;
    if (!shortAtTop && !shortAtBottom) break;

    if (shortAtTop) {
      const top = parseFloat(getComputedStyle(el).top) || 0;
      el.style.top = `${top - (rect.top + BLEED)}px`;
      rect = el.getBoundingClientRect();
    }
    if (rect.bottom < target - 1) {
      el.style.height = `${rect.height + (target - rect.bottom) + BLEED}px`;
      rect = el.getBoundingClientRect();
    }
  }
  return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), grewBy: Math.round(rect.bottom - before) };
}

// Give the video the video's own shape, in pixels, and centre it on the screen.
//
// This is `object-fit: cover`, done by hand, because on iOS it was not being
// done at all. Two photographs two minutes apart showed the frame 812pt tall on
// one clip and 848 on the next, on the same 874pt screen, with the leftover
// strip at the bottom of one and the top of the other — and the strip measured
// exactly rgb(5,6,15), the canvas colour, so it was never footage. The box was
// the right size the whole time; the picture inside it was letterboxed.
//
// The trick is that once the element's aspect ratio equals the video's, `cover`,
// `contain` and `fill` all produce the same picture. Whichever one the browser
// decides to honour, there is nowhere for a bar to go.
//
// Over-covering is free — it crops a little more of a background nobody is
// looking at directly — so the target is deliberately generous. Under-covering
// is the bug. That asymmetry is why this takes the largest figure available and
// then adds to it, rather than trying to find the one true screen height, which
// is what the previous thirteen attempts were doing.
const COVER_MARGIN = 1.12;

function coverVideos() {
  const W = Math.max(
    (window.screen && window.screen.width) || 0,
    window.innerWidth || 0,
    document.documentElement.clientWidth || 0
  ) * COVER_MARGIN;
  const H = skyTarget() * COVER_MARGIN;
  if (!(W > 0 && H > 0)) return;

  document.querySelectorAll('.bg-video').forEach((v) => {
    // Before metadata arrives there is no aspect ratio to match. The listener
    // below brings it back the moment there is.
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return;

    const scale = Math.max(W / vw, H / vh);
    const w = Math.ceil(vw * scale);
    const h = Math.ceil(vh * scale);
    v.style.width = `${w}px`;
    v.style.height = `${h}px`;
    // Centred on the screen, not on the element's containing block: the two
    // have disagreed by tens of points on this phone, and centring is the one
    // placement where being wrong costs the same at both ends.
    v.style.left = `${Math.round((W / COVER_MARGIN - w) / 2)}px`;
    v.style.top = `${Math.round((H / COVER_MARGIN - h) / 2)}px`;
    // Belt and braces: with the box already the video's shape this changes
    // nothing, and it removes the last thing that could reintroduce a bar.
    v.style.objectFit = 'fill';
  });
}

function keepSkyHeight() {
  const run = () => {
    const target = skyTarget();
    coverVideos();
    if (target > 0) document.documentElement.style.setProperty('--sky-h', `${target}px`);

    // The videos are placed by coverVideos() above and are deliberately not in
    // this list any more: growing a letterboxed element only grows the letterbox.
    const seen = {};
    document.querySelectorAll('#sky-bg, #bg-scrim').forEach((el) => {
      const at = fitLayer(el, target);
      if (at) seen[el.id || el.className.split(' ')[0]] = at;
    });

    // Left for /diag.html rather than shown to anybody. Nobody is told their
    // sky needed a nudge.
    try {
      localStorage.setItem(
        'sky-fit',
        JSON.stringify({
          at: Date.now(),
          screen: (window.screen && window.screen.height) || 0,
          inner: window.innerHeight || 0,
          client: document.documentElement.clientHeight || 0,
          visual: Math.round((window.visualViewport && window.visualViewport.height) || 0),
          standalone: !!(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches),
          target,
          layers: seen,
        })
      );
    } catch { /* a full or disabled store is not worth a broken sky */ }
  };

  run();
  // iOS reports the new dimensions a beat after the event.
  window.addEventListener('orientationchange', () => setTimeout(run, 250));
  window.addEventListener('resize', run);
  // A video is display:none until it has something to show, so it cannot be
  // measured before then — and it is the layer that has behaved differently
  // from the others before (a replaced element ignores `bottom` and resolves
  // `height: auto` to its own intrinsic size).
  document.querySelectorAll('.bg-video').forEach((v) => {
    v.addEventListener('playing', run);
    // The aspect ratio is not known until here, and a playlist changes clips
    // without the page ever resizing — which is precisely the moment the strip
    // moved from the bottom of one clip to the top of the next.
    v.addEventListener('loadedmetadata', run);
    v.addEventListener('loadeddata', run);
  });
}

// Notice when this phone is running an old copy of the site, and fix it.
//
// This is the bug that cost four rounds. Three correct fixes were deployed, went
// green, and were not on the phone: an installed home-screen web app went on
// serving its own cached page, and from the outside that is indistinguishable
// from a fix that did not work. Every ?v= bump and the network-first service
// worker both failed to shift it.
//
// So the page now carries a build stamp and asks the server what the current one
// is. If they differ, everything a stale install can be holding is thrown away —
// the service worker, its caches — and the page is reloaded once on a URL the
// cache has never seen.
//
// Rules that keep this from becoming its own bug:
//   · ONCE per load, guarded in sessionStorage, so a stamp that somehow never
//     matches cannot put the app in a reload loop.
//   · Silent. Nobody is told their browser was out of date.
//   · Never blocks anything. It runs after the sky is already up, and every
//     failure path just leaves things as they are.
const STAMP_KEY = 'aya_selfheal_done';

async function healIfStale() {
  const meta = document.querySelector('meta[name="build-stamp"]');
  // No stamp at all means this page is older than the stamp itself — which is
  // to say, as stale as a page can be. It used to return here, and that single
  // line is why three correct fixes were invisible for four days: the self-heal
  // switched itself off on exactly the phones that needed it. A missing stamp
  // is now the strongest possible evidence of staleness, not a reason to stop.
  const mine = (meta && meta.content) || '(none)';
  try {
    if (sessionStorage.getItem(STAMP_KEY)) return;
  } catch {
    return; // no session storage means no loop guard, so do nothing at all
  }
  try {
    const res = await fetch('/index.html', { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(/name="build-stamp"\s+content="([^"]+)"/);
    const live = m && m[1];
    if (!live || live === mine) return;

    sessionStorage.setItem(STAMP_KEY, live);
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
    location.replace(`/?fresh=${Date.now()}`);
  } catch {
    // Offline, or the fetch failed. An old page that still works is not an
    // emergency; the next launch tries again.
  }
}

// Close the confirmation and show the author what they just wrote.
//
// Two things happen, and the order is the point. The whisper is put into the
// sky as a ringed balloon in a readable tier — and then the reading view opens
// on it, the same view a tap on any balloon gives, so the words are on the
// screen and drifting upward the moment the confirmation is out of the way.
//
// A ringed balloon on its own was not enough. "发完之后马上就变成气球了，有时候
// 还要找一下才找得到" — you write something at two in the morning, press send,
// and the thing you wrote turns into a dot you have to go looking for. Closing
// the reading view leaves the balloon still rising underneath, so nothing is
// lost by opening it: you read it once, then let it go.
//
// Both ways out of the sheet come here — and from the second whisper on there
// is no sheet at all and submitCompose calls this directly, so this is the one
// place a published whisper reaches the sky. The closeSheet below is a no-op
// when the sheet was never opened.
function releaseMyWhisper() {
  closeSheet(els.confirmOverlay, els.confirmSheet);
  const mine = state.pendingMine;
  if (!mine) return;
  state.pendingMine = null;
  whisperWorld.pin(mine, { spotlight: true });
  // No rect: this is not zooming out of a balloon the eye was already on, it
  // opens on the words themselves. `mine` is passed as the known whisper so
  // nothing waits on the network — same rule as tapping a balloon.
  openDetail(mine.id, null, mine);
}

function showConfirm(data, showRecovery = false) {
  const base = state.composeType === 'pain' ? t('toastPain') : t('toastWish');
  els.confirmMessage.textContent = data.crisisFlag ? `${base} ${t('toastCrisisExtra')}` : base;
  els.confirmCode.textContent = data.code;

  // Shown on the first whisper only, and shown plainly. There is no account
  // and no e-mail, so this string is the only way back to your own words from
  // another phone — and the only thing that will ever let you delete them.
  // Saying that once, at the moment it is created, is the honest version of a
  // sign-up form.
  const code = showRecovery ? identity.recoveryCode() : null;
  if (code) {
    els.recoveryCode.textContent = code;
    els.recoveryLabel.textContent = t('recoveryLabel');
    els.recoveryHint.textContent = t('recoveryHint');
    els.recoveryBlock.classList.remove('hidden');
  } else {
    els.recoveryBlock.classList.add('hidden');
  }
  openSheet(els.confirmOverlay, els.confirmSheet);
}

// ---------- Detail / replies ----------

// Open the whisper the balloon is carrying.
//
// The words are already here — the balloon has been showing them — so the
// reading view opens on them at once and the fetch only fills in what the sky
// does not know: the replies, whether it is yours, whether you kept it. It used
// to await the fetch before drawing anything, which on a slow connection meant
// a tap that did nothing at all for a second or more, then either opened or
// silently gave up. That is most of "sometimes the balloon doesn't open".
//
// Same rule as the Listen button (CLAUDE.md §7f): nothing may sit between the
// tap and the response.
const DETAIL_TIMEOUT_MS = 8000;

async function openDetail(id, rect, known) {
  if (known) {
    // `isMyBubble` is this device's own note of what it has written. The server
    // is the authority and overrules it a moment later; using it here only
    // stops the author's own delete button flickering into existence.
    renderRead({ ...known, mine: isMyBubble(id), saved: false }, [], rect);
    openRead();
  }
  try {
    // The hash, not the secret. It is enough for the server to answer "yours",
    // and worth nothing to anyone who sees it go past.
    const mineHash = await identity.hash();
    // A request with no ceiling is how a tap ends in nothing: the fetch never
    // settles, so neither branch below ever runs.
    const res = await fetch(apiUrl(`/api/bubbles/${id}`), {
      headers: mineHash ? { 'x-author': mineHash } : {},
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    });
    const data = await res.json();
    if (!res.ok) {
      if (!known) showToast(t('errorGeneric'));
      return;
    }
    // Still the same whisper? A second tap while this was in flight must not be
    // overwritten by the slower answer to the first.
    if (known && state.detailBubbleId !== id) return;
    renderRead(data.bubble, data.replies, rect);
    if (!known) openRead();
  } catch {
    if (!known) showToast(t('errorGeneric'));
  }
}

// Transparent, credits-style reading view: the whisper and its replies drift
// slowly upward over the live scene, then loop.
// The byline, in full.
//
// It used to be cut to two characters — "夜里***" — and that was the right call
// while the name was also a lookup key: anyone who could read a byline could
// type it into the search box and pull up everything that person had written,
// so showing less of it raised the cost of sweeping the sky for one person.
//
// That search is gone (My Sky replaced it), and with it the reason. What the
// mask costs is the only job the name has left: "夜里***" reads like redacted
// evidence, not like somebody. A name here is chosen, not given — the compose
// box says plainly that everyone sees it — and a whisper signed 夜里的猫,
// answered by 走夜路的人, is two people. Two characters and three asterisks is
// not.

function renderRead(bubble, replies, rect) {
  // Only forget "they left something here" when this is a different whisper —
  // replying re-renders this same view, and wiping the flag there swallowed the
  // flare that should greet the sky on close.
  if (state.detailBubbleId !== bubble.id) {
    state.detailWarmed = false;
    // Opening a different whisper while one is being read aloud must not leave
    // the old voice running underneath the new text.
    stopSpeaking();
  }
  state.detailBubbleId = bubble.id;
  state.detailBubble = bubble;
  // The server decided this, not the browser: it compared the hash this device
  // sent against the one stored with the whisper. A list in localStorage is
  // what used to answer this question, and it could be wrong in the direction
  // that matters.
  els.readDeleteBtn.classList.toggle('hidden', !bubble.mine);
  // Your own whisper is already yours; offering to keep it is noise.
  els.readSaveBtn.classList.toggle('hidden', Boolean(bubble.mine));
  els.readShareBtn.classList.toggle('hidden', !bubble.mine);
  els.readSaveBtn.textContent = bubble.saved ? t('savedToSky') : t('saveToSky');
  els.readSaveBtn.classList.toggle('reported', Boolean(bubble.saved));
  els.readOverlay.dataset.type = bubble.type;
  els.readContent.textContent = bubble.content;
  setLightButtonState(bubble.id);
  setReportButtonState(bubble.id);
  if (bubble.code) {
    els.readAuthor.textContent = `${t('byLabel')} ${bubble.code}`;
    els.readAuthor.classList.remove('hidden');
  } else {
    els.readAuthor.textContent = '';
    els.readAuthor.classList.add('hidden');
  }
  els.detailRepliesTitle.textContent = bubble.type === 'pain' ? t('repliesTitlePain') : t('repliesTitleWish');
  els.replyLabel.textContent = bubble.type === 'pain' ? t('replyLabelPain') : t('replyLabelWish');
  els.replyContent.placeholder = bubble.type === 'pain' ? t('replyPlaceholderPain') : t('replyPlaceholderWish');
  els.replyContent.value = '';
  els.replyCount.textContent = `0 / ${REPLY_MAX}`;
  // The same name, the same rule. An unsigned reply reads as "from 匿名", and a
  // sky where most answers come from 匿名 is a sky where nobody is answering
  // anybody — the point of a reply is that a person said it to a person.
  showNameField(els.replyCode.parentElement, els.replyAs, els.replyCode);
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
      who.textContent = `${t('byLabel')} ${r.code || t('anonymous')}`;
      // Every reply carries its own report button, counted separately from the
      // whisper it sits under.
      const flag = document.createElement('button');
      flag.className = 'report-pill';
      const flagged = hasReported('reply', r.id);
      flag.textContent = flagged ? t('reported') : t('report');
      flag.disabled = flagged;
      flag.classList.toggle('reported', flagged);
      flag.addEventListener('click', (e) => {
        e.stopPropagation(); // a tap on the overlay closes the reading view
        askReportReason('reply', r.id, flag, () => item.remove());
      });
      who.appendChild(flag);

      // Your own words, on someone else's whisper. The author of the whisper
      // cannot remove these — they belong to whoever wrote them — so this
      // appears only for the person who did, and only because the server said
      // so.
      if (r.mine) {
        const remove = document.createElement('button');
        remove.className = 'report-pill';
        remove.textContent = t('deleteMine');
        remove.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!window.confirm(t('deleteReplyConfirm'))) return;
          remove.disabled = true;
          try {
            const res = await fetch(apiUrl(`/api/replies/${r.id}`), {
              method: 'DELETE',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ secret: identity.secret() }),
            });
            if (!res.ok) throw new Error('failed');
            item.remove();
            showToast(t('deleteDone'));
            loadWhispers();
          } catch {
            remove.disabled = false;
            showToast(t('errorGeneric'));
          }
        });
        who.appendChild(remove);
      }

      item.append(body, who);
      els.readReplies.appendChild(item);
    }
  }

  // The invitation waits until the whisper is nearly done rising. Asking
  // someone to respond before they have read the thing is what made this line
  // invisible: it was furniture on screen from the first second.
  clearTimeout(inviteTimer);
  els.readInvite.classList.add('hidden');
  els.readReplyBtn.classList.remove('inviting');
  // The listen offer comes back for each new whisper even if it was dismissed
  // on the last one — dismissing is "not this time", not "never again".
  els.listenDock.classList.remove('hidden');

  // Scroll speed scales with how much there is to read, so long whispers
  // aren't rushed and short ones don't crawl.
  const chars = (bubble.content || '').length + replies.reduce((n, r) => n + (r.content || '').length, 0);
  const dur = Math.min(75, Math.max(20, Math.round(18 + chars * 0.06)));
  els.readScroll.style.setProperty('--read-dur', dur + 's');
  // Timed off how long the words take to READ, not off the scroll animation.
  // Tying it to the animation meant a two-line whisper — read and closed in
  // about five seconds — never showed the invitation at all, because the scroll
  // has a 20s floor regardless of how little there is in it. Roughly 55ms per
  // character, held between 2.5 and 9 seconds: long enough that nobody is asked
  // to respond before they have read, and short enough that it is always
  // reached — including on the two-line whispers that people close fastest.
  inviteTimer = setTimeout(showInvite, Math.min(9000, Math.max(2500, chars * 55)));

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

let inviteTimer = 0;
function showInvite() {
  els.readInvite.classList.remove('hidden');
  els.readReplyBtn.classList.add('inviting');
}

function openRead() {
  els.readOverlay.classList.remove('hidden');
  // While reading, hide the bottom compose bar and the now-playing strip so
  // the reading view's own actions don't collide with them.
  document.body.classList.add('reading');
  // And hold the sky still. Reading long text with a dozen balloons rising
  // behind it is tiring in a way that is hard to name and easy to feel: the
  // words stay put while everything around them keeps moving. The background
  // video carries on, so this is still the same night — the balloons simply
  // wait. They pick up exactly where they stopped when the story closes.
  whisperWorld.freeze(true);
}

function closeRead() {
  // If they left something behind, flare the balloon as the sky comes back —
  // the change happened while this view was covering it.
  if (state.detailWarmed && state.detailBubbleId) {
    whisperWorld.pulse(state.detailBubbleId);
    state.detailWarmed = false;
  }
  // A voice must never outlive the view it belongs to — closing the whisper has
  // to also close the reading of it, and give the music back.
  stopSpeaking();
  clearTimeout(inviteTimer);
  els.readOverlay.classList.add('hidden');
  els.readOverlay.classList.remove('lit');
  els.readScroll.classList.remove('paused');
  document.body.classList.remove('reading');
  whisperWorld.freeze(false);
}

// Reflect whether this device has already reported the open whisper.
function setReportButtonState(id) {
  const done = hasReported('bubble', id);
  els.readReportBtn.textContent = done ? t('reported') : t('report');
  els.readReportBtn.disabled = done;
  els.readReportBtn.classList.toggle('reported', done);
}

// Reflect whether this device has already left a light on the open whisper.
function setLightButtonState(id) {
  const left = hasLeftLight(id);
  els.readLightBtn.textContent = left ? t('lightLeft') : t('leaveLight');
  els.readLightBtn.classList.toggle('left', left);
  els.readLightBtn.disabled = left;
}

// A single spark that floats up and fades — the visible acknowledgement that a
// light was left. Self-removing so it never piles up in the DOM.
function flySpark() {
  const s = document.createElement('div');
  s.className = 'light-spark';
  s.textContent = '✨';
  els.readOverlay.appendChild(s);
  s.addEventListener('animationend', () => s.remove());
}

// Leave a light: a soft, numberless "I read this, I'm here" for readers who
// don't want to type. One per device per whisper.
// Push new warmth onto the balloon carrying the whisper being read, right now.
// The server has already recorded it, but the sky only refetches every so often
// and a balloon in flight keeps the whisper it was bound to — so without this,
// leaving a light or a reply changed nothing you could see. If no balloon is
// carrying it any more (it recycled while you were reading), pin the whisper so
// one rises with the change on it.
function warmOpenWhisper(changes) {
  const id = state.detailBubbleId;
  if (!id || !state.detailBubble) return;
  Object.assign(state.detailBubble, changes);
  state.detailWarmed = true;
  if (whisperWorld.markWhisper(id, changes)) {
    // The reading view is transparent — the balloon is right there behind the
    // text, so flare it the moment they tap, not only when the view closes.
    whisperWorld.pulse(id);
  } else {
    whisperWorld.pin({ ...state.detailBubble });
  }
}

// ---------- Listen ----------
//
// The whisper rises as text over a moving background, which is not always easy
// to read — and some of this is easier to receive in a voice than on a screen.
//
// Two paths, and the difference matters. The server route returns a reading
// spoken with actual direction ("unhurried, warm, a little sorrowful") and is
// what this feature is for. If no TTS key is configured, or the provider fails,
// we fall back to the browser's own speech synthesis — flat and robotic, but a
// button that does nothing is worse. The fallback is a safety net, not the
// design.
let speech = { audio: null, utterance: null, id: null };

// Well under natural pace. This is someone's grief being read aloud, not an
// announcement — 0.88 was still being heard as rushed.
// 1.0, back from 0.82.
//
// The slow-down was added when the reading came from a provider that rattled
// through it. It is now the model that sets the pace, and playing an already
// unhurried reading at 0.82 stacked one slowness on another — a word every
// second with gaps in between. Pace belongs in one place, and that place is now
// the delivery note.
const SPEECH_RATE = 1.0;

// Add ?debug=voice to the address to have Listen's failures shown on screen
// rather than only whispered to the console.
const VOICE_DEBUG = new URLSearchParams(location.search).get('debug') === 'voice';

function setListenState(mode) {
  els.readListenBtn.classList.toggle('speaking', mode === 'speaking');
  els.readListenBtn.classList.toggle('loading', mode === 'loading');
  els.readListenBtn.textContent =
    mode === 'speaking' ? t('listenStop') : mode === 'loading' ? t('listenLoading') : t('listen');
}

function stopSpeaking() {
  if (speech.audio) {
    speech.audio.pause();
    // Detach the handlers before clearing the source: removing a src fires an
    // error on some browsers, which would bounce straight into the fallback
    // voice for a reading the listener just chose to stop.
    speech.audio.onended = null;
    speech.audio.onerror = null;
    speech.audio.oncanplay = null;
    speech.audio.onplaying = null;
    speech.audio.ontimeupdate = null;
    speech.audio.removeAttribute('src');
    speech.audio.load();
    speech.audio = null;
  }
  if (speech.utterance) {
    window.speechSynthesis.cancel();
    speech.utterance = null;
  }
  speech.id = null;
  ambient.duck(false);
  setListenState('idle');
}

// Must only ever be called from inside a tap. Empty so nothing is heard, and
// untracked so its immediate onend cannot stop the real reading that follows.
function primeBrowserVoice() {
  if (!('speechSynthesis' in window)) return;
  try {
    // Chrome fills the voice list asynchronously and returns an empty array
    // until something asks. Asking here means bestBrowserVoice has a list to
    // choose from by the time a failed reading needs one.
    window.speechSynthesis.getVoices();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  } catch {
    /* nothing is lost: the fallback simply stays as unreliable as it was */
  }
}

// The device almost certainly has a better voice than the one it defaults to.
//
// Left alone, speechSynthesis picks the system default, which on iOS and
// Android is usually the small "compact" voice — the flat, buzzy one. The good
// ones are sitting right there in the same list under names like Samantha,
// Karen, Ava or Google UK English Female, and choosing one is free. It is still
// not a person reading, but the gap between the worst voice on an iPhone and
// the best one is much wider than people expect.
//
// Ordered by how good they actually sound rather than alphabetically, and
// checked against the page's language first so a Chinese whisper is not read by
// an English voice.
const NICE_VOICES = [
  'Ava', 'Allison', 'Samantha', 'Serena', 'Karen', 'Moira', 'Tessa', 'Fiona',
  'Google UK English Female', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny',
  'Tingting', 'Ting-Ting', 'Sinji', 'Google 国语',
];

function bestBrowserVoice(lang) {
  let voices = [];
  try {
    voices = window.speechSynthesis.getVoices() || [];
  } catch {
    return null;
  }
  if (!voices.length) return null;

  const base = String(lang || document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  const sameLanguage = voices.filter((v) => String(v.lang || '').slice(0, 2).toLowerCase() === base);
  const pool = sameLanguage.length ? sameLanguage : voices;

  // "compact" is Apple's own word for the low-quality variant, so it is the one
  // signal in this list that is worth acting on directly.
  const notCompact = pool.filter((v) => !/compact/i.test(v.name || ''));
  const usable = notCompact.length ? notCompact : pool;

  for (const wanted of NICE_VOICES) {
    const hit = usable.find((v) => String(v.name || '').toLowerCase().includes(wanted.toLowerCase()));
    if (hit) return hit;
  }
  // Nothing recognised: a local voice still beats a network one for latency,
  // and on Apple devices localService is where the good ones live.
  return usable.find((v) => v.localService) || usable[0] || null;
}

function speakInBrowser(text) {
  if (!('speechSynthesis' in window)) {
    showToast(t('listenUnavailable'));
    stopSpeaking();
    return;
  }
  // speak() can throw outright on some platforms. Without this the button would
  // sit on "Stop" forever and the music would stay ducked with nothing playing
  // over it — a dead end the reader cannot get out of except by closing.
  try {
    const u = new SpeechSynthesisUtterance(text);
    const voice = bestBrowserVoice(u.lang);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = SPEECH_RATE;
    u.pitch = 0.95;
    u.onend = stopSpeaking;
    u.onerror = stopSpeaking;
    speech.utterance = u;
    setListenState('speaking');
    window.speechSynthesis.speak(u);
  } catch {
    showToast(t('listenUnavailable'));
    stopSpeaking();
  }
}

// Getting a voice out of an iPhone means satisfying two rules at once, and I
// have now broken this in both directions.
//
//   1. play() is only permitted inside a user gesture, and any await before it
//      throws the gesture away. So the audio cannot be fetched first.
//   2. Media loaded from a URL must support HTTP byte-range requests, which a
//      plain Pages Function response does not. So the src cannot be the
//      endpoint. This is why the Blob version worked and the tidy direct-URL
//      version did not.
//
// Both are satisfied by unlocking one long-lived element with a moment of
// silence inside the tap — after which iOS allows this element to be played
// again later — and only then fetching the audio and swapping the source. The
// Blob keeps the bytes in memory, so no range request is ever made.
const SILENT_WAV = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

let speechEl = null;
function speechAudio() {
  if (!speechEl) {
    speechEl = new Audio();
    speechEl.preload = 'auto';
  }
  return speechEl;
}

// A little air around the voice.
//
// The readings people admire elsewhere — "magnetic, like it comes from far
// away, a bit hollow" — are not doing that with a better model. They are voice
// plus space, added afterwards. No text-to-speech returns it: every one of them
// hands back a voice recorded an inch from a microphone, clean and flat and
// close. The room is ours to add.
//
// So: the reading runs through a convolver alongside itself, a little of the
// reflected copy mixed under the plain one. It costs nothing, needs no
// regeneration, and applies to every whisper already in the cache.
const REVERB_SECONDS = 2.4;
const REVERB_WET = 0.26;
const REVERB_OFF = new URLSearchParams(location.search).get('reverb') === 'off';

// Noise that fades away is the whole of a convincing space. Anything more
// structured starts to sound like a machine — a metal pipe, a stairwell — and
// what is wanted here is only the impression of distance.
function makeSpace(ctx) {
  const length = Math.floor(ctx.sampleRate * REVERB_SECONDS);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
  }
  return buffer;
}

// Built once, on the first Listen, inside the tap.
//
// The dry path is connected before anything else is attempted, and that order
// is deliberate. Routing a media element through Web Audio cannot be undone, so
// if the reverb half then fails the element must already have a route to the
// speakers — otherwise a decorative effect turns the whole feature silent,
// which is a mistake this project has already made once.
let speechRouted = false;
function addSpace(el) {
  if (speechRouted || REVERB_OFF) return;
  const ctx = ambient.audioContext();
  if (!ctx) return;
  try {
    const source = ctx.createMediaElementSource(el);
    const dry = ctx.createGain();
    dry.gain.value = 1;
    source.connect(dry).connect(ctx.destination);
    speechRouted = true;

    const space = ctx.createConvolver();
    space.buffer = makeSpace(ctx);
    const wet = ctx.createGain();
    wet.gain.value = REVERB_WET;
    source.connect(space).connect(wet).connect(ctx.destination);
  } catch {
    /* no room, just a voice — which is the thing that matters */
  }
}

function toggleListen() {
  const id = state.detailBubbleId;
  if (!id) return;
  if (speech.id === id) return stopSpeaking(); // tapping again stops it
  stopSpeaking();

  speech.id = id;
  setListenState('loading');
  ambient.duck(true);

  const text = state.detailBubble?.content || '';
  const audio = speechAudio();
  speech.audio = audio;

  // Still inside the gesture: nothing above this line awaits anything.
  audio.src = SILENT_WAV;
  const unlock = audio.play();
  if (unlock && unlock.catch) unlock.catch(() => {});

  // No "the first one takes a moment" line any more: it was not true. A second
  // and third listen can be just as slow, because a reading is only fast once
  // it is genuinely cached and several things can stop that happening. A
  // sentence that is wrong half the time is worse than none — the button's own
  // progress bar says "working" without claiming to know why.

  // Give the voice its room while still inside the tap — creating and resuming
  // an AudioContext is gesture-bound on iOS like everything else here.
  addSpace(audio);

  // And unlock the browser's own voice in the same breath, because the fallback
  // is bound by exactly the same rule as the element above.
  //
  // speakInBrowser runs from inside a .then(), long after the tap has ended, and
  // iOS ignores speak() outside a gesture — no error, no sound, nothing in the
  // console. So when the endpoint failed, the safety net that was supposed to
  // catch the reader was itself silent, and "no sound at all" is what got
  // reported. Speaking one empty utterance now, inside the tap, is what buys
  // permission to speak later.
  primeBrowserVoice();

  // Two rounds of "still no sound" went by without anyone being able to see
  // why, because every failure here falls back silently by design. The reason
  // now always reaches the console, and ?debug=voice puts it on screen so it
  // can be read off a phone.
  // Say plainly when this is not our voice.
  //
  // The fallback was made to sound as good as the device allows, and that turned
  // out to be a trap: the phone's own reading is flat, fast and always the same
  // narrator, and with every provider out of quota at once it became what the
  // site sounded like — while everyone, including me, went on discussing which
  // model to tune. An emergency voice must never be mistaken for the product.
  // ...but once the site's own voice has actually been heard, the phone's voice
  // must not take over.
  //
  // The fallback is written for "nothing played at all", and it starts the
  // whisper again from the first word. Firing it halfway through means the
  // listener hears the opening in one voice and then the whole thing over again
  // in another — which is not a fallback, it is a second reader, and it is one
  // of the ways a whisper ends up with two voices in it. Long ones are where it
  // shows: they are the readings assembled out of several pieces, and a join
  // between two pieces is where a decoder gives up.
  //
  // So after the first sound, a failure ends the reading rather than restarting
  // it in another voice. Stopping with a reason is honest; two readers is not.
  let heard = false;

  // …and "heard" has to mean the sound, not the event that announces it.
  //
  // This was hung on `onplaying` alone, and `onplaying` is dispatched
  // asynchronously: the element can be unpaused with the clock already
  // advancing — audible, out loud, in someone's ear — while the handler is
  // still queued. A decode failure landing in that window found `heard` false,
  // took the "nothing played" path, and started the whisper again from the
  // first word in the phone's voice. Rare, and exactly the two-voices fault
  // everything above is written to prevent. So the clock counts as evidence
  // too.
  //
  // But only once THIS reading is what the clock is measuring. `addSpace`
  // played a fraction of a second of silence through this same element inside
  // the tap, to buy iOS's permission — so `currentTime` is already past zero
  // before the whisper has a source at all, and reading it any earlier says
  // "heard" about a reading that never began. `oncanplay` is the line: past it
  // the element is loaded with the reading itself.
  let sourceReady = false;
  const hasBeenHeard = () => heard || (sourceReady && audio.currentTime > 0);

  const giveUpToBrowser = (why) => {
    if (speech.id !== id) return;
    const reason = `listen fell back: ${why || 'unknown'}`;
    console.warn(reason);
    if (hasBeenHeard()) {
      showToast(VOICE_DEBUG ? `${t('listenCutShort')} (${reason})` : t('listenCutShort'), 6000);
      stopSpeaking();
      return;
    }
    showToast(VOICE_DEBUG ? `${t('listenDevice')} (${reason})` : t('listenDevice'), 6000);
    speakInBrowser(text);
  };

  fetch(apiUrl(`/api/voice/${id}`))
    .then(async (res) => {
      // Judge it by what came back, not by the status.
      //
      // The endpoint answers 200 even when it failed, because Cloudflare's edge
      // replaces the body of any 5xx a Pages Function returns with its own
      // 16-byte error page — so a status-based check learned only "502" while
      // the actual reason was thrown away. Its contract is audio or an
      // explanation, and content-type is what tells them apart.
      // With ?debug=voice, say who is speaking. Six providers can answer this
      // endpoint and the phone's own voice answers when none of them do, and by
      // ear they are not reliably tellable apart — which has cost several
      // rounds of "is this the new voice or the old cache?".
      if (VOICE_DEBUG) {
        const who = res.headers.get('x-voice');
        if (who) showToast(`voice: ${who}`, 4000);
      }
      const type = res.headers.get('content-type') || '';
      if (!/^audio\//i.test(type)) {
        const detail = await res.text().catch(() => '');
        throw new Error(`${res.status} ${detail.slice(0, 200)}`);
      }
      return res.blob();
    })
    .then((blob) => {
      if (speech.id !== id) return; // closed or switched while it synthesised
      audio.onended = stopSpeaking;
      audio.onerror = () => giveUpToBrowser(`cannot decode ${blob.type} (${blob.size} bytes)`);
      audio.onplaying = () => { heard = true; };
      audio.ontimeupdate = () => { if (sourceReady && audio.currentTime > 0) heard = true; };
      audio.oncanplay = () => {
        // From here the clock belongs to this reading, not to the silence
        // played inside the tap.
        sourceReady = true;
        if (speech.id !== id) return;
        // Some browsers reset the rate when a new source loads.
        audio.preservesPitch = true;
        audio.playbackRate = SPEECH_RATE;
        setListenState('speaking');
      };
      audio.src = URL.createObjectURL(blob);
      audio.preservesPitch = true;
      audio.playbackRate = SPEECH_RATE;
      const started = audio.play();
      if (started && started.catch) started.catch((e) => giveUpToBrowser(`play refused: ${e && e.name}`));
    })
    .catch((e) => giveUpToBrowser(String((e && e.message) || e)));
}


// Make a picture of your own whisper.
//
// Drawn on the device (see sharecard.js), so it costs nothing and needs no
// server. A long whisper becomes an opening plus the link rather than a wall of
// text: the card is a poster for the story, not a copy of it — the words stay
// here, where their author can still take them back.
async function shareMine() {
  const bubble = state.detailBubble;
  if (!bubble || !bubble.mine) return;

  els.readShareBtn.disabled = true;
  els.readShareBtn.textContent = t('shareWorking');
  try {
    const url = `${location.origin}/?w=${bubble.id}`;
    const blob = await drawCard({ text: bubble.content, type: bubble.type, label: t('shareCardRead') });
    const how = await shareCard(blob, { title: t('shareCardTitle'), url });
    if (how === 'downloaded') showToast(t('shareSaved'));
  } catch {
    showToast(t('errorGeneric'));
  } finally {
    els.readShareBtn.disabled = false;
    els.readShareBtn.textContent = t('shareMine');
  }
}

// Keep a stranger's story, or let it go again.
//
// What is stored is a reference, never the words: when its author deletes it,
// it leaves every shelf at the same moment. Nobody here ends up holding a
// private permanent copy of somebody else's worst night, and that is the point
// rather than a limitation.
async function toggleSave() {
  const bubble = state.detailBubble;
  if (!bubble) return;
  const nowSaved = !bubble.saved;

  els.readSaveBtn.disabled = true;
  try {
    const res = await fetch(apiUrl('/api/saves'), {
      method: nowSaved ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: identity.secret(), itemType: 'bubble', itemId: bubble.id }),
    });
    if (!res.ok) throw new Error('failed');
    bubble.saved = nowSaved;
    els.readSaveBtn.textContent = nowSaved ? t('savedToSky') : t('saveToSky');
    els.readSaveBtn.classList.toggle('reported', nowSaved);
    showToast(nowSaved ? t('saveDone') : t('saveUndone'));
  } catch {
    showToast(t('errorGeneric'));
  } finally {
    els.readSaveBtn.disabled = false;
  }
}

// A list of results under a heading.
//
// Folded. Opening My Sky shows four lines and nothing else — what I wrote,
// what I kept, my recovery code, find by name — each with its count, each
// opening on a tap. Spilling two full lists the moment the panel appears is
// what made it look like a mess; the count on the heading already answers
// "is there anything in there".
function resultGroup(title, count) {
  const group = document.createElement('details');
  group.className = 'result-group';
  group.open = false;
  const head = document.createElement('summary');
  head.className = 'find-results-title';
  head.textContent = `${title} · ${count}`;
  group.appendChild(head);
  const body = document.createElement('div');
  group.appendChild(body);
  return body;
}

// My Sky: what I wrote, and what I kept.
//
// Found by the secret this device holds — not by typing a name into a box, the
// way it used to work. A name is printed under every whisper; a secret is not
// written down anywhere a reader can see it.
function showMyName() {
  const name = identity.displayName();
  els.myskyName.textContent = name ? t('mySkyName').replace('{name}', name) : '';
  els.myskyName.classList.toggle('hidden', !name);
  els.myskyRename.classList.toggle('hidden', !name);
  els.myskyNameInput.value = name;
  els.myskyNameInput.placeholder = t('codePlaceholder');
  els.myskyNameSave.textContent = t('renameSave');
}

// Get the name back from the server when this browser has lost it.
//
// The identity and the name are stored in the same place but do not travel
// together: a recovery code carries the secret onto a new phone and nothing
// else, and clearing site data takes the name while the person is still the
// same author. Either way the device ends up recognised — its whispers are
// listed, the delete button appears — and yet asked "你的名字" as if it had
// never written anything.
//
// So ask the server, which has known all along. Only when there is no local
// name: a name typed here is the one that counts, and this must never quietly
// overwrite a rename that has not reached a whisper yet.
async function syncName() {
  if (!identity.hasSecret() || identity.hasName()) return;
  try {
    const hash = await identity.hash();
    if (!hash) return;
    const res = await fetch(apiUrl('/api/me'), { headers: { 'x-author': hash } });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.name || identity.hasName()) return;
    identity.rememberName(data.name);
    showMyName();
  } catch {
    // Offline, or the request failed. The name box comes back, which is the
    // old behaviour — nothing is broken by not knowing.
  }
}

async function loadMySky() {
  const box = els.mysky;
  box.textContent = '';
  // A device that has never written anything has no code to show, and asking
  // for one would mint an identity nobody asked for (identity.js). The section
  // itself stays — the box for pasting a code IN lives here too, and the person
  // who most needs it is exactly the one with nothing of their own yet.
  // The name lives here when you are not writing — and this is the ONLY place
  // it can be changed, which is what makes "one phone, one name" true rather
  // than merely default.
  showMyName();
  const code = identity.hasSecret() ? identity.recoveryCode() : null;
  els.recoveryBox.open = false;
  els.recoveryNote.classList.toggle('hidden', !code);
  els.myRecovery.classList.toggle('hidden', !code);
  els.myRecoveryCopy.classList.toggle('hidden', !code);
  if (code) els.myRecovery.textContent = code;

  // Both headings show, always, even at zero — and even on a device that has
  // never written anything. A section that vanishes when it is empty makes the
  // panel a different shape every time it opens, and leaves "where did my
  // whispers go" unanswered: "我写的 · 0" is an answer, a missing line is not.
  const render = (mine, saved) => {
    for (const [title, items] of [[t('myBalloons'), mine], [t('mySaved'), saved]]) {
      const group = resultGroup(title, items.length);
      for (const item of items) {
        const row = document.createElement('button');
        row.className = 'find-result-row';
        const icon = item.itemType === 'reply' ? '🤍 ' : item.type === 'wish' ? '✦ ' : '❁ ';
        const text = (item.content || '').trim();
        row.textContent = icon + text.slice(0, 42) + (text.length > 42 ? '…' : '');
        row.addEventListener('click', () => {
          els.findPanel.classList.add('hidden');
          openDetail(item.itemType === 'reply' ? item.bubble_id : item.id);
        });
        group.appendChild(row);
      }
      box.appendChild(group.parentNode);
    }
  };

  if (!identity.hasSecret()) {
    render([], []);
    els.myskyMsg.textContent = t('mySkyEmpty');
    return;
  }
  try {
    const hash = await identity.hash();
    const res = await fetch(apiUrl('/api/me'), { headers: { 'x-author': hash } });
    const data = await res.json();
    if (!res.ok) throw new Error('failed');

    // The same answer already carries the name, so a device that arrived here
    // without one gets it back without a second request.
    if (data.name && !identity.hasName()) {
      identity.rememberName(data.name);
      showMyName();
    }

    const mine = data.mine || [];
    const saved = data.saved || [];
    const any = mine.length > 0 || saved.length > 0;
    render(mine, saved);

    // A shelf that quietly shrinks is unsettling. Say it plainly instead: the
    // story was taken back by the person who wrote it, which is how this works.
    els.myskyMsg.textContent = !any
      ? t('mySkyEmpty')
      : data.gone
        ? t('savedGone').replace('{n}', data.gone)
        : '';
  } catch {
    els.myskyMsg.textContent = t('errorGeneric');
  }
}

// Carry an identity over from another phone.
function restoreIdentity() {
  const value = els.restoreInput.value.trim();
  if (!value) return;
  if (!identity.adopt(value)) {
    els.myskyMsg.textContent = t('restoreBad');
    return;
  }
  els.restoreInput.value = '';
  els.myskyMsg.textContent = t('restoreOk');
  // The code carries the secret and nothing else, so the name on the new phone
  // is still empty. loadMySky asks the server for both.
  loadMySky();
}

// Take back your own whisper.
//
// Two taps, because it cannot be undone, and the second one says what actually
// goes: the whisper leaves the sky, and the reading of it is deleted with it.
// The replies other people left underneath are their words and are not the
// author's to erase — the whisper simply stops being readable, and they go with
// it rather than being handed to anyone else.
async function deleteMine() {
  const id = state.detailBubbleId;
  if (!id) return;
  if (!window.confirm(t('deleteConfirm'))) return;

  els.readDeleteBtn.disabled = true;
  try {
    const res = await fetch(apiUrl(`/api/bubbles/${id}`), {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: identity.secret() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(t(data.error === 'not_yours' ? 'deleteNotYours' : 'errorGeneric'));
    showToast(t('deleteDone'));
    closeRead();
    loadWhispers();
  } catch {
    showToast(t('errorGeneric'));
  } finally {
    els.readDeleteBtn.disabled = false;
  }
}

async function leaveLight() {
  const id = state.detailBubbleId;
  if (!id || hasLeftLight(id)) return;
  // A light is a small, deliberate thing. Feeling it land is most of why it
  // feels like more than a counter going up.
  native.tap('light');
  rememberLight(id);
  setLightButtonState(id);
  // Clear, immediate feedback: the whisper warms up and a little spark floats
  // off it, so it's obvious the light landed (a toast alone was easy to miss).
  els.readOverlay.classList.add('lit');
  flySpark();
  showToast(t('lightThanks'));
  warmOpenWhisper({ lights: (state.detailBubble?.lights || 0) + 1 });
  try {
    const res = await fetch(apiUrl(`/api/bubbles/${id}/lights`), { method: 'POST' });
    const data = await res.json();
    // Take the server's count — someone else may have left one too.
    if (Number.isFinite(data?.lights)) warmOpenWhisper({ lights: data.lights });
  } catch {
    // Best-effort; the on-device "already left" state stands regardless.
  }
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
  identity.rememberName(els.replyCode.value.trim());
  try {
    const res = await fetch(apiUrl(`/api/bubbles/${state.detailBubbleId}/replies`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        code: els.replyCode.value.trim(),
        lang: currentLang,
        secret: identity.secret(),
      }),
    });
    const data = await res.json();
    if (!res.ok) return showError(els.replyError, t(ERROR_KEYS[data.error] || 'errorGeneric'));
    closeSheet(els.replyOverlay, els.replySheet);
    // Light the basket immediately — this whisper now has an answer.
    warmOpenWhisper({ warmth: (state.detailBubble?.warmth || 0) + 1 });
    await openDetail(state.detailBubbleId);
    loadWhispers();
  } catch {
    showError(els.replyError, t('errorGeneric'));
  } finally {
    els.replySubmit.disabled = false;
  }
}


// ---------- Find my light (robust query-param endpoint) ----------

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
  whisperWorld = createWhisperWorld(els.lanterns, els.world, {
    onTap: openDetail,
    onNeedMore: requestFreshSample,
  });
  loadWhispers();
  // Periodically deal a fresh sample so a long-open sky keeps bringing in
  // different whispers (each fetch is a new per-viewer random draw server-side).
  setInterval(loadWhispers, 90000);
  ambient.preload(); // fetch the music manifest early so first-tap playback is instant
  armMusicAutostart();

  // Stop the music the moment the page is hidden or closed (swiping the tab
  // away, backgrounding the browser, locking the phone). Mobile browsers keep
  // media playing behind a closed page otherwise; resume when the user comes
  // back if music was on.
  document.addEventListener('visibilitychange', () => {
    // A whisper being read aloud is subject to the same rule — nobody expects a
    // voice to keep talking out of a phone they just put in their pocket.
    if (document.hidden) stopSpeaking();
    if (document.hidden) ambient.suspend();
    else ambient.resume();
  });
  window.addEventListener('pagehide', () => ambient.suspend());

  els.entryPain.addEventListener('click', () => openCompose('pain'));
  els.entryWish.addEventListener('click', () => openCompose('wish'));
  els.composeClose.addEventListener('click', () => closeSheet(els.composeOverlay, els.composeSheet));
  els.composeCancel.addEventListener('click', () => closeSheet(els.composeOverlay, els.composeSheet));
  els.composeSubmit.addEventListener('click', submitCompose);
  els.replyContent.addEventListener('input', () => {
    els.replyCount.textContent = `${els.replyContent.value.length} / ${REPLY_MAX}`;
  });
  els.composeContent.addEventListener('input', () => {
    els.composeCount.textContent = `${els.composeContent.value.length} / 1000`;
  });
  wireOverlayClose(els.composeOverlay, els.composeSheet);

  els.confirmClose.addEventListener('click', releaseMyWhisper);
  const renameMe = () => {
    const next = els.myskyNameInput.value.trim();
    if (!next || next === identity.displayName()) return;
    identity.rememberName(next);
    // Only what is written from now on carries it. Whispers already in the sky
    // keep the name they went up under — rewriting a byline after the fact
    // would change what a stranger already read, and there is no server call
    // here that could do it anyway.
    showToast(t('renameDone').replace('{name}', identity.displayName()));
    loadMySky();
  };
  els.myskyNameSave.addEventListener('click', renameMe);
  els.myskyNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') renameMe(); });

  els.myRecoveryCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.myRecovery.textContent);
      showToast(t('copied'));
    } catch { /* ignore */ }
  });
  els.recoveryCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.recoveryCode.textContent);
      showToast(t('copied'));
    } catch { /* ignore */ }
  });
  els.confirmOverlay.addEventListener('click', releaseMyWhisper);

  els.readClose.addEventListener('click', closeRead);
  // Tap on empty space (overlay or the non-interactive viewport) closes.
  els.readOverlay.addEventListener('click', (e) => {
    if (e.target === els.readOverlay || e.target.classList.contains('read-viewport')) closeRead();
  });
  // Tapping the text holds it still — for a slow re-read, and so the report
  // button on a reply can actually be hit. Tap again to let it drift on.
  els.readScroll.addEventListener('click', () => {
    els.readScroll.classList.toggle('paused');
  });
  els.readReplyBtn.addEventListener('click', openReplySheet);
  els.readListenBtn.addEventListener('click', toggleListen);
  els.listenDismiss.addEventListener('click', () => {
    stopSpeaking();
    els.listenDock.classList.add('hidden');
  });
  els.readLightBtn.addEventListener('click', leaveLight);
  els.readDeleteBtn.addEventListener('click', deleteMine);
  els.readSaveBtn.addEventListener('click', toggleSave);
  els.readShareBtn.addEventListener('click', shareMine);
  els.restoreSubmit.addEventListener('click', restoreIdentity);
  els.restoreInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') restoreIdentity(); });
  els.readReportBtn.addEventListener('click', () => {
    const id = state.detailBubbleId;
    if (!id) return;
    // A whisper that gets hidden leaves the sky, so close the view it was
    // being read in and re-deal the deck.
    askReportReason('bubble', id, els.readReportBtn, () => {
      closeRead();
      loadWhispers();
    });
  });
  els.reportCancel.addEventListener('click', closeReportSheet);
  els.reportOverlay.addEventListener('click', closeReportSheet);
  for (const b of document.querySelectorAll('.report-reason')) {
    b.addEventListener('click', () => {
      const r = pendingReport;
      if (!r) return;
      closeReportSheet();
      sendReport(r.targetType, r.id, r.btn, r.onHidden, b.dataset.reason);
    });
  }
  els.replyClose.addEventListener('click', () => closeSheet(els.replyOverlay, els.replySheet));
  els.replySubmit.addEventListener('click', submitReply);
  wireOverlayClose(els.replyOverlay, els.replySheet);

  els.aboutIcon.addEventListener('click', () => {
    els.aboutPanel.classList.toggle('hidden');
    els.findPanel.classList.add('hidden');
    els.coffeePanel.classList.add('hidden');
    els.musicPanel.classList.add('hidden');
    els.bgPanel.classList.add('hidden');
    els.sharePanel.classList.add('hidden');
  });
  els.aboutClose.addEventListener('click', () => els.aboutPanel.classList.add('hidden'));

  // "Written here before, on another browser?" — the way back, offered at the
  // only moment it costs nothing: before this browser has minted an identity of
  // its own. Closes the compose sheet, opens My Sky with the recovery box
  // already unfolded, so it is one tap rather than a hunt.
  els.composeRestore.addEventListener('click', () => {
    closeSheet(els.composeOverlay, els.composeSheet);
    loadMySky();
    els.findPanel.classList.remove('hidden');
    els.recoveryBox.open = true;
    els.restoreInput.focus();
  });

  els.findIcon.addEventListener('click', () => {
      loadMySky();
    els.findPanel.classList.toggle('hidden');
    els.aboutPanel.classList.add('hidden');
    els.coffeePanel.classList.add('hidden');
    els.musicPanel.classList.add('hidden');
    els.bgPanel.classList.add('hidden');
    els.sharePanel.classList.add('hidden');
  });
  els.findClose.addEventListener('click', () => els.findPanel.classList.add('hidden'));

  els.coffeeIcon.addEventListener('click', () => {
    els.coffeePanel.classList.toggle('hidden');
    els.aboutPanel.classList.add('hidden');
    els.findPanel.classList.add('hidden');
    els.musicPanel.classList.add('hidden');
    els.bgPanel.classList.add('hidden');
    els.sharePanel.classList.add('hidden');
  });
  els.coffeeClose.addEventListener('click', () => els.coffeePanel.classList.add('hidden'));

  els.shareIcon.addEventListener('click', () => {
    els.sharePanel.classList.toggle('hidden');
    els.aboutPanel.classList.add('hidden');
    els.findPanel.classList.add('hidden');
    els.coffeePanel.classList.add('hidden');
    els.musicPanel.classList.add('hidden');
    els.bgPanel.classList.add('hidden');
  });
  els.shareClose.addEventListener('click', () => els.sharePanel.classList.add('hidden'));
  els.shareCopy.addEventListener('click', shareSite);

  els.bgIcon.addEventListener('click', () => {
    els.bgPanel.classList.toggle('hidden');
    els.aboutPanel.classList.add('hidden');
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

  // The ♪ in the top row is a music button, so it had better make music.
  //
  // It only ever opened this panel. That is fine while the music is already
  // playing — autostart brings it in on the first touch of the visit — but
  // anyone who has once pressed pause has autostart switched off from then on
  // (MUSIC_OFF_KEY), and for them tapping ♪ opened a panel and produced
  // silence. Tap it again, panel closes. Again, opens. That is the reported
  // "点了好几次都没有声音".
  //
  // So: silent → this turns the music on, and shows the panel so it is obvious
  // what happened and what is playing. Already playing → it is just the panel
  // toggle it always was. The button never does nothing.
  els.musicIcon.addEventListener('click', () => {
    const wasSilent = !ambient.isPlaying;
    if (wasSilent) {
      // No await before this: the sound has to begin inside the gesture or iOS
      // refuses it outright (see ambient.toggle and CLAUDE.md §7f).
      const playing = ambient.toggle();
      els.musicIcon.setAttribute('aria-pressed', String(playing));
      localStorage.setItem(MUSIC_OFF_KEY, playing ? '0' : '1');
      els.musicPanel.classList.remove('hidden');
    } else {
      els.musicPanel.classList.toggle('hidden');
    }
    els.aboutPanel.classList.add('hidden');
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

  // Rotating swaps the screen's dimensions, so the height the inline script in
  // index.html measured before first paint stops being right. Republish it.
  keepSkyHeight();

  // Last, and never awaited: the sky is already up by here, and a phone that
  // turns out to be stale reloads itself into the current one.
  healIfStale();

  maybeShowNotice();
  maybeShowIosGuide();
  maybeShowFirstHint();

  // Before the compose sheet can ask for a name, find out whether this device
  // already has one. Returns immediately for everyone who does.
  syncName();

  // ?w=<id> opens one whisper straight away. This is what the link on a share
  // card points at, and without it the card would be a picture with a URL that
  // lands on the sky and leaves the reader hunting for the story it came from.
  // A whisper its author has since deleted simply is not found, which is the
  // right ending: the card outlives the words only as a picture, never as a way
  // back into them.
  const wanted = parseInt(new URLSearchParams(location.search).get('w') || '', 10);
  if (Number.isFinite(wanted)) openDetail(wanted);

  // The App only. On the web every one of these is a no-op.
  native.dressWindow();
  native.onBackButton((canGoBack) => {
    // Back closes what is open before it closes anything else. Android users
    // expect the button to undo the last step, and an App that quits from
    // inside a whisper reads as a crash.
    if (!els.readOverlay.classList.contains('hidden')) return closeRead();
    if (!els.composeSheet.classList.contains('hidden')) return closeSheet(els.composeOverlay, els.composeSheet);
    if (!els.findPanel.classList.contains('hidden')) return els.findPanel.classList.add('hidden');
    if (canGoBack) history.back();
  });

  // The service worker belongs to the website. In the App the files are
  // already on the phone, and a second cache in front of them is one more
  // thing that can serve something stale.
  if ('serviceWorker' in navigator && !native.inApp()) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
