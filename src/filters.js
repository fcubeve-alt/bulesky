// Content safety helpers shared by all API functions.
// Kept intentionally simple (zh/en coverage) per PRD section 4 — later
// expansion or a moderation API can replace these lists without touching
// callers.

const ABUSIVE_WORDS = [
  // Chinese
  '傻逼', '智障', '去死', '滚蛋', '婊子', '贱人', '狗东西', '废物玩意',
  // English
  'fuck you', 'kill yourself', 'kys', 'bitch', 'asshole', 'retard', 'cunt',
];

const CRISIS_KEYWORDS = [
  // Chinese — self-harm / suicide method or intent phrasing
  '自杀', '轻生', '不想活了', '割腕', '跳楼', '安眠药', '结束生命', '想死',
  // English
  'suicide', 'kill myself', 'end my life', 'want to die', 'self harm', 'self-harm',
  'overdose', "don't want to live", 'no reason to live',
];

const IM_KEYWORDS = [
  '微信', 'wechat', '加v', '加V', 'whatsapp', 'telegram', ' tg ', 'tg号',
  'line id', 'lineid', 'kakao', 'instagram', ' ig ', 'ig号', 'snapchat',
  'signal', 'qq号', 'qq:', 'qq：', 'zalo', 'viber', 'skype',
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\d[\d\-\s]{5,20}\d/g;

function containsAbusive(text) {
  const lower = text.toLowerCase();
  return ABUSIVE_WORDS.some((w) => lower.includes(w.toLowerCase()));
}

function containsCrisisKeyword(text) {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some((w) => lower.includes(w.toLowerCase()));
}

function maskContactInfo(text) {
  let masked = false;
  let out = text.replace(EMAIL_RE, () => {
    masked = true;
    return '***';
  });

  out = out.replace(PHONE_RE, (m) => {
    const digits = m.replace(/[\s-]/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      masked = true;
      return '***';
    }
    return m;
  });

  const lower = out.toLowerCase();
  for (const kw of IM_KEYWORDS) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx !== -1) {
      masked = true;
      // Mask the keyword itself; anything appended after it (like an id)
      // is likely part of the contact handle, so blank the rest of the line too.
      const before = out.slice(0, idx);
      const rest = out.slice(idx);
      const lineEnd = rest.search(/\n/);
      const line = lineEnd === -1 ? rest : rest.slice(0, lineEnd);
      const tail = lineEnd === -1 ? '' : rest.slice(lineEnd);
      out = `${before}***${tail}`;
    }
  }

  return { text: out, masked };
}

export { containsAbusive, containsCrisisKeyword, maskContactInfo };
