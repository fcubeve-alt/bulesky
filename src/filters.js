// The first gate: word lists. Free, instant, and it runs before anything else.
//
// It is deliberately the cheapest layer and deliberately the dumbest one. It
// catches the obvious — a slur, a phone number, "add me on WeChat" — without a
// network call or a model, so the overwhelming majority of what it stops costs
// nothing at all. Everything subtler is the moderation model's job
// (src/moderation.js), and everything the model misses is the report button's.
//
// ⚠️ THE RULE THAT MATTERS MOST HERE
//
// A blocked word is a wall in front of someone who came here to write down the
// worst thing in their week, and they get no queue, no review and no second
// chance — the sentence simply will not send. So a word only belongs on the
// blocking lists if it CANNOT appear in someone describing their own pain.
//
// This is not theoretical. "去死" used to be on the list, and so
//   我好想去死          I really want to die
//   活着好累，不如去死    living is exhausting, better to be dead
// were both refused, in a product whose entire reason for existing is that
// somebody can type exactly that.
//
// So the lists are split by whether the words name their own target. HATE and
// AT_YOU and AIMED do ("kill yourself", "操你", a slur against a group) and are
// blocked outright. Everything else — including nearly every insult, because
// people turn all of them on themselves here — is blocked only when there is a
// second person in the sentence.
//
// The belittling category from the community rules — 矫情, "get over it",
// "others have it worse" — is deliberately NOT here. Those words appear far
// more often in self-doubt ("我是不是太矫情了") than in cruelty, and a list
// cannot tell the difference. The model can, and does.

// Hate: an attack on a whole group of people. Blocked wherever it appears —
// there is no sentence in this product that needs one of these words, and
// unlike an ordinary insult nobody arrives at one while describing their own
// week.
const HATE = [
  '娘炮', '死基佬', '死残废', '残废玩意', '死聋子', '死瞎子',
  'faggot', 'tranny', 'nigger', 'nigga', 'retarded people', 'kike', 'chink',
  'maricón', 'maricon', 'pédé', 'pede',
];

// Insults that carry their own target: the person being aimed at is inside the
// words. Blocked wherever they appear, for the same reason as AIMED below.
const AT_YOU = [
  '你妈的', '你妈死', '操你', '肏你', '日你妈', '妈了个逼', '草泥马', '尼玛',
  'fuck you', 'go fuck yourself', 'screw you',
  'hijo de puta', 'hija de puta', 'puta madre',
  'ferme ta gueule', 'fils de pute',
  'كس امك', 'ابن الكلب', 'ابن الحرام',
];

// Everything else is only an insult when it is pointed at someone.
//
// This is the list that used to be wrong. Nearly every insult a person can
// throw is also one they can turn on themselves, and self-deprecation is one
// of the most common shapes grief takes here:
//
//   我就是个傻逼，什么都做不好      I'm such an idiot, I can't do anything right
//   我是不是有点智障               am I stupid or something
//   I'm such a loser
//
// Blocking those refuses the person the site is for. So they go through the
// second-person test below, exactly like "去死吧" does.
const INSULTS = [
  '傻逼', '傻bi', '智障', '脑残', '弱智', '低能儿', '白痴', '废物玩意',
  '垃圾玩意', '狗东西', '杂种', '畜生不如', '婊子', '贱人', '贱货', '骚货',
  '死肥猪', '丑八怪', '恶心玩意',
  'idiot', 'moron', 'dumbass', 'stupid bitch', 'bitch', 'asshole', 'cunt',
  'retard', 'scumbag', 'whore', 'slut', 'loser', 'piece of shit',
  'worthless piece', 'pathetic',
  'pendejo', 'gilipollas', 'cabrón', 'cabron',
  'connard', 'connasse', 'salope', 'enculé', 'encule',
  'يا حقير', 'يا قذر',
];

// Phrases that carry their own target. "kill YOURSELF", "你去死" — the person
// being aimed at is inside the words, so there is no way to write your own
// despair with them and no context can rescue them.
const AIMED = [
  // Chinese
  '你去死', '你怎么不死', '你怎么还不死', '你他妈', '你也配', '你活该',
  '你早点死', '劝你去死', '你就该死', '有本事你去死', '不如你去死',
  // English
  'kill yourself', 'kys', 'go kill yourself', 'hang yourself', 'you should die',
  'you deserve to die', 'nobody would miss you', 'do the world a favor and',
  // Spanish
  'mátate', 'matate', 'ojalá te mueras', 'ojala te mueras', 'deberías morirte',
  // French
  'tue-toi', 'va crever', 'tu devrais mourir',
  // Arabic
  'اقتل نفسك', 'موت انت', 'تستاهل الموت',
];

// Phrases that are an attack ONLY when they are aimed at somebody. The same
// words are among the most common things a person writes about themselves:
//
//   我去死吧                       vs  你们都去死吧
//   I should just go die            vs  you should just go die
//
// So these need a second-person word nearby before they mean anything. When
// nothing in the sentence says who it is about, the writing goes through —
// the model and the report button are behind this, and a wrongly-blocked
// whisper has nothing behind it at all.
const NEEDS_A_TARGET = [
  ...INSULTS,
  '去死吧', '滚去死', '都去死', '快去死', '死了算了吧',
  'go die', 'end yourself', 'off yourself', 'drop dead',
  'creve', 'crève',
];

// "You", plus the words that only ever get said TO someone. An imperative is a
// second person even when the pronoun is left out — "滚，贱人" names nobody and
// is aimed at exactly one person.
const SECOND_PERSON = [
  '你', '您', '你们', '妳', '滚', '闭嘴', '喂,', '喂，',
  'you', 'u r ', 'ur ', 'yourself', 'urself',
  'tu ', 'te ', 'vous', 'usted', 'ustedes',
  'أنت', 'انت', 'إنت',
];

// How far either side of a match to look for who it is about. A sentence, more
// or less — far enough to catch "I should just go die", short enough that the
// pronoun found actually belongs to this clause.
const WINDOW = 28;

const CRISIS_KEYWORDS = [
  // Chinese — self-harm / suicide intent. These do NOT block anything: they
  // put the hotline on screen and set crisis_flag.
  '自杀', '轻生', '不想活了', '割腕', '跳楼', '安眠药', '结束生命', '想死',
  '去死', '活不下去', '撑不下去', '解脱', '一了百了', '没有意义了',
  // English
  'suicide', 'kill myself', 'end my life', 'want to die', 'self harm', 'self-harm',
  'overdose', "don't want to live", 'no reason to live', 'end it all',
  'better off without me', 'cannot go on', "can't go on",
  // Spanish
  'suicidarme', 'quitarme la vida', 'no quiero vivir', 'acabar con todo',
  // French
  'me suicider', 'en finir', 'ne plus vivre', "j'en peux plus",
  // Arabic
  'انتحار', 'أنهي حياتي', 'لا أريد العيش',
];

const IM_KEYWORDS = [
  '微信', 'wechat', '加v', '加V', 'whatsapp', 'telegram', ' tg ', 'tg号',
  'line id', 'lineid', 'kakao', 'instagram', ' ig ', 'ig号', 'snapchat',
  'signal', 'qq号', 'qq:', 'qq：', 'zalo', 'viber', 'skype', 'discord',
  '抖音号', '小红书', '公众号', '私聊我', '加我好友', 'dm me', 'add me on',
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\d[\d\-\s]{5,20}\d/g;

// Is there anyone else in this sentence?
function aimedAtSomebody(lower, idx, len) {
  const around = lower.slice(Math.max(0, idx - WINDOW), idx + len + WINDOW);
  return SECOND_PERSON.some((p) => around.includes(p));
}

function containsAbusive(text) {
  const lower = String(text || '').toLowerCase();
  if (HATE.some((w) => lower.includes(w.toLowerCase()))) return true;
  if (AT_YOU.some((w) => lower.includes(w.toLowerCase()))) return true;
  if (AIMED.some((w) => lower.includes(w.toLowerCase()))) return true;
  for (const phrase of NEEDS_A_TARGET) {
    const needle = phrase.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx !== -1 && aimedAtSomebody(lower, idx, needle.length)) return true;
  }
  return false;
}

function containsCrisisKeyword(text) {
  const lower = String(text || '').toLowerCase();
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
      const tail = lineEnd === -1 ? '' : rest.slice(lineEnd);
      out = `${before}***${tail}`;
    }
  }

  return { text: out, masked };
}

export { containsAbusive, containsCrisisKeyword, maskContactInfo };
