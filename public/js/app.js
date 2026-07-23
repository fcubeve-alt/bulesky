import { t, currentLang } from './i18n.js';
import { initBackgroundStars, createBubbleDrift, bubbleColor, bubbleSize, layoutBubbles } from './starfield.js';
import { initAmbient } from './ambient.js';

// How much of a bubble's content shows on its face before "…" — full text
// is always one tap away in the detail view.
const PREVIEW_CHAR_LIMIT = 24;

const $ = (id) => document.getElementById(id);

const els = {
  musicIcon: $('music-icon'),
  findIcon: $('find-icon'),
  coffeeIcon: $('coffee-icon'),
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
  appTitle: $('app-title'),
  entryPain: $('entry-pain'),
  entryWish: $('entry-wish'),
  sky: $('sky'),
  skyEmpty: $('sky-empty'),
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
  detailOverlay: $('detail-overlay'),
  detailSheet: $('detail-sheet'),
  detailClose: $('detail-close'),
  detailContent: $('detail-content'),
  detailReport: $('detail-report'),
  detailRepliesTitle: $('detail-replies-title'),
  detailReplies: $('detail-replies'),
  replyLabel: $('reply-label'),
  replyContent: $('reply-content'),
  replyError: $('reply-error'),
  replySubmit: $('reply-submit'),
  iosOverlay: $('ios-overlay'),
  iosModal: $('ios-modal'),
  iosTitle: $('ios-title'),
  iosBody: $('ios-body'),
  iosClose: $('ios-close'),
  toast: $('toast'),
  bgStars: $('bg-stars'),
};

const ERROR_KEYS = {
  empty_content: 'errorEmptyContent',
  empty_code: 'errorEmptyCode',
  content_too_long: 'errorTooLong',
  code_too_long: 'errorTooLong',
  blocked_abusive: 'errorAbusive',
  code_taken: 'errorCodeTaken',
};

const bubbleDrift = createBubbleDrift();

const state = {
  composeType: 'pain',
  composeOpenedAt: 0,
  detailBubbleId: null,
  detailBubbleType: 'pain',
};

function applyText() {
  els.appTitle.textContent = t('appName');
  els.entryPain.textContent = t('entryPain');
  els.entryWish.textContent = t('entryWish');
  els.findLabel.textContent = t('findLabel');
  els.findInput.placeholder = t('codePlaceholder');
  els.findSubmit.textContent = t('findSubmit');
  els.coffeeText.textContent = t('coffeeText');
  els.coffeeLink.textContent = t('coffeeLink');
  els.crisisText.textContent = t('crisisText');
  els.composeCodeLabel.textContent = t('codeLabel');
  els.composeCode.placeholder = t('codePlaceholder');
  els.composeCodeHint.textContent = t('codeHint');
  els.composeCancel.textContent = t('cancel');
  els.composeSubmit.textContent = t('submit');
  els.confirmCopy.textContent = t('copyCode');
  els.confirmHint.textContent = t('confirmHint');
  els.confirmClose.textContent = t('close');
  els.detailReport.textContent = t('detailReport');
  els.replySubmit.textContent = t('replySubmit');
  els.iosTitle.textContent = t('iosTitle');
  els.iosBody.textContent = t('iosBody');
  els.iosClose.textContent = t('iosClose');
  els.skyEmpty.textContent = t('skyEmpty');
  document.title = t('appName');
}

function showToast(message, duration = 3200) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.add('hidden'), duration);
}

function openOverlaySheet(overlay, sheet) {
  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');
}
function closeOverlaySheet(overlay, sheet) {
  overlay.classList.add('hidden');
  sheet.classList.add('hidden');
}

function wireOverlayClose(overlay, sheet) {
  overlay.addEventListener('click', () => closeOverlaySheet(overlay, sheet));
}

// ---------- Sky rendering ----------

let lastBubbles = [];

async function loadSky() {
  try {
    const res = await fetch('/api/bubbles?limit=80');
    const data = await res.json();
    lastBubbles = data.bubbles || [];
    renderSky(lastBubbles);
  } catch {
    renderSky([]);
  }
}

function renderSky(bubbles) {
  els.sky.innerHTML = '';
  if (!bubbles.length) {
    els.skyEmpty.classList.remove('hidden');
    els.sky.style.height = '0';
    bubbleDrift.setBubbles([]);
    return;
  }
  els.skyEmpty.classList.add('hidden');

  const width = Math.max(280, els.sky.clientWidth || window.innerWidth - 16);
  const { positions, height } = layoutBubbles(bubbles, width);
  els.sky.style.position = 'relative';
  els.sky.style.height = height + 'px';

  const bubbleEls = [];
  for (const { item, x, y } of positions) {
    const size = bubbleSize(item.content);
    const btn = document.createElement('button');
    btn.className = `bubble type-${item.type}`;
    btn.style.width = size + 'px';
    btn.style.height = size + 'px';
    btn.style.left = `calc(${x}px - ${size / 2}px)`;
    btn.style.top = y + 'px';
    const color = bubbleColor(item.type, item.warmth);
    btn.style.background = `radial-gradient(circle at 35% 30%, ${color}, ${color})`;
    btn.style.boxShadow = `0 0 ${18 + Math.min(30, item.warmth * 2)}px ${color}`;
    btn.style.setProperty('--tail-color', color);
    btn.dataset.id = item.id;
    btn.setAttribute('aria-label', item.type === 'pain' ? t('entryPain') : t('entryWish'));

    const preview = document.createElement('span');
    preview.className = 'bubble-preview';
    preview.textContent =
      item.content.length > PREVIEW_CHAR_LIMIT
        ? item.content.slice(0, PREVIEW_CHAR_LIMIT) + '…'
        : item.content;
    btn.appendChild(preview);

    btn.addEventListener('click', () => openDetail(item.id));
    els.sky.appendChild(btn);
    bubbleEls.push(btn);
  }
  bubbleDrift.setBubbles(bubbleEls);
}

// ---------- Compose ----------

function openCompose(type) {
  state.composeType = type;
  state.composeOpenedAt = Date.now();
  els.composeTitle.textContent = type === 'pain' ? t('composeTitlePain') : t('composeTitleWish');
  els.composeContent.placeholder = type === 'pain' ? t('contentPlaceholderPain') : t('contentPlaceholderWish');
  els.composeContent.value = '';
  els.composeCode.value = '';
  els.composeCount.textContent = '0/500';
  els.composeError.classList.add('hidden');
  els.composeHp.value = '';
  els.crisisBanner.classList.toggle('hidden', type !== 'pain');
  openOverlaySheet(els.composeOverlay, els.composeSheet);
  els.composeContent.focus();
}

function closeCompose() {
  closeOverlaySheet(els.composeOverlay, els.composeSheet);
}

async function submitCompose() {
  const content = els.composeContent.value.trim();
  const code = els.composeCode.value.trim();
  els.composeError.classList.add('hidden');

  if (els.composeHp.value) return; // honeypot tripped, silently drop
  if (Date.now() - state.composeOpenedAt < 800) return; // too fast to be human, silently drop

  if (!content) {
    els.composeError.textContent = t('errorEmptyContent');
    els.composeError.classList.remove('hidden');
    return;
  }
  if (!code) {
    els.composeError.textContent = t('errorEmptyCode');
    els.composeError.classList.remove('hidden');
    return;
  }

  els.composeSubmit.disabled = true;
  try {
    const res = await fetch('/api/bubbles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: state.composeType, content, code, lang: currentLang }),
    });
    const data = await res.json();
    if (!res.ok) {
      const key = ERROR_KEYS[data.error] || 'errorGeneric';
      els.composeError.textContent = t(key);
      els.composeError.classList.remove('hidden');
      return;
    }
    closeCompose();
    showConfirm(data);
    loadSky();
  } catch {
    els.composeError.textContent = t('errorGeneric');
    els.composeError.classList.remove('hidden');
  } finally {
    els.composeSubmit.disabled = false;
  }
}

function showConfirm(data) {
  const baseMsg = state.composeType === 'pain' ? t('toastPain') : t('toastWish');
  els.confirmMessage.textContent = data.crisisFlag ? `${baseMsg} ${t('toastCrisisExtra')}` : baseMsg;
  els.confirmCode.textContent = data.code;
  openOverlaySheet(els.confirmOverlay, els.confirmSheet);
}

// ---------- Detail / replies ----------

async function openDetail(id) {
  try {
    const res = await fetch(`/api/bubbles/${id}`);
    const data = await res.json();
    if (!res.ok) {
      showToast(t('errorGeneric'));
      return;
    }
    renderDetail(data.bubble, data.replies);
    openOverlaySheet(els.detailOverlay, els.detailSheet);
  } catch {
    showToast(t('errorGeneric'));
  }
}

function renderDetail(bubble, replies) {
  state.detailBubbleId = bubble.id;
  state.detailBubbleType = bubble.type;

  els.detailContent.textContent = bubble.content;
  els.detailRepliesTitle.textContent = bubble.type === 'pain' ? t('repliesTitlePain') : t('repliesTitleWish');
  els.replyLabel.textContent = bubble.type === 'pain' ? t('replyLabelPain') : t('replyLabelWish');
  els.replyContent.placeholder = bubble.type === 'pain' ? t('replyPlaceholderPain') : t('replyPlaceholderWish');
  els.replyContent.value = '';
  els.replyError.classList.add('hidden');

  els.detailReplies.innerHTML = '';
  if (!replies.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('noReplies');
    els.detailReplies.appendChild(p);
  } else {
    for (const r of replies) {
      const item = document.createElement('div');
      item.className = 'reply-item';
      item.textContent = r.content;
      els.detailReplies.appendChild(item);
    }
  }
}

async function submitReply() {
  const content = els.replyContent.value.trim();
  els.replyError.classList.add('hidden');
  if (!content) {
    els.replyError.textContent = t('errorEmptyContent');
    els.replyError.classList.remove('hidden');
    return;
  }
  els.replySubmit.disabled = true;
  try {
    const res = await fetch(`/api/bubbles/${state.detailBubbleId}/replies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, lang: currentLang }),
    });
    const data = await res.json();
    if (!res.ok) {
      const key = ERROR_KEYS[data.error] || 'errorGeneric';
      els.replyError.textContent = t(key);
      els.replyError.classList.remove('hidden');
      return;
    }
    await openDetail(state.detailBubbleId);
  } catch {
    els.replyError.textContent = t('errorGeneric');
    els.replyError.classList.remove('hidden');
  } finally {
    els.replySubmit.disabled = false;
  }
}

async function reportContent(targetType, targetId) {
  if (!window.confirm(t('reportConfirm'))) return;
  try {
    await fetch('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetType, targetId }),
    });
    showToast(t('reportedToast'));
    if (targetType === 'bubble') {
      closeOverlaySheet(els.detailOverlay, els.detailSheet);
      loadSky();
    }
  } catch {
    showToast(t('errorGeneric'));
  }
}

// ---------- Find my bubble ----------

async function submitFind() {
  const code = els.findInput.value.trim();
  els.findResult.innerHTML = '';
  if (!code) return;
  try {
    const res = await fetch(`/api/bubbles/by-code/${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) {
      els.findResult.textContent = t('findNotFound');
      return;
    }
    els.findPanel.classList.add('hidden');
    renderDetail(data.bubble, data.replies);
    openOverlaySheet(els.detailOverlay, els.detailSheet);
  } catch {
    els.findResult.textContent = t('findError');
  }
}

// ---------- iOS install guide ----------

function maybeShowIosGuide() {
  const isIos =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (!isIos || isStandalone) return;
  if (localStorage.getItem('bulesky_ios_guide_dismissed')) return;
  setTimeout(() => openOverlaySheet(els.iosOverlay, els.iosModal), 1200);
}

// ---------- Wiring ----------

function init() {
  applyText();
  initBackgroundStars(els.bgStars);
  loadSky();

  els.entryPain.addEventListener('click', () => openCompose('pain'));
  els.entryWish.addEventListener('click', () => openCompose('wish'));
  els.composeClose.addEventListener('click', closeCompose);
  els.composeCancel.addEventListener('click', closeCompose);
  els.composeSubmit.addEventListener('click', submitCompose);
  els.composeContent.addEventListener('input', () => {
    els.composeCount.textContent = `${els.composeContent.value.length}/500`;
  });
  wireOverlayClose(els.composeOverlay, els.composeSheet);

  els.confirmClose.addEventListener('click', () => closeOverlaySheet(els.confirmOverlay, els.confirmSheet));
  els.confirmCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.confirmCode.textContent);
      showToast(t('copied'));
    } catch {
      /* clipboard unavailable, ignore */
    }
  });
  wireOverlayClose(els.confirmOverlay, els.confirmSheet);

  els.detailClose.addEventListener('click', () => closeOverlaySheet(els.detailOverlay, els.detailSheet));
  els.detailReport.addEventListener('click', () => reportContent('bubble', state.detailBubbleId));
  els.replySubmit.addEventListener('click', submitReply);
  wireOverlayClose(els.detailOverlay, els.detailSheet);

  els.findIcon.addEventListener('click', () => {
    els.findResult.innerHTML = '';
    els.findPanel.classList.toggle('hidden');
    els.coffeePanel.classList.add('hidden');
  });
  els.findClose.addEventListener('click', () => els.findPanel.classList.add('hidden'));
  els.findSubmit.addEventListener('click', submitFind);
  els.findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitFind();
  });

  els.coffeeIcon.addEventListener('click', () => {
    els.coffeePanel.classList.toggle('hidden');
    els.findPanel.classList.add('hidden');
  });
  els.coffeeClose.addEventListener('click', () => els.coffeePanel.classList.add('hidden'));

  const ambient = initAmbient();
  els.musicIcon.addEventListener('click', async () => {
    const playing = await ambient.toggle();
    els.musicIcon.textContent = playing ? '🔊' : '🔇';
    els.musicIcon.setAttribute('aria-pressed', String(playing));
  });

  els.iosClose.addEventListener('click', () => {
    localStorage.setItem('bulesky_ios_guide_dismissed', '1');
    closeOverlaySheet(els.iosOverlay, els.iosModal);
  });
  wireOverlayClose(els.iosOverlay, els.iosModal);

  maybeShowIosGuide();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
