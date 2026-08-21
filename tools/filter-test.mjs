// The word list, from both directions — and the second one matters more.
//
// A blocked word here is a wall in front of someone who came to write down the
// worst thing in their week. There is no queue behind it and no appeal: the
// sentence simply will not send. So every "must go through" case below is a
// real thing a real person writes at three in the morning, and any one of them
// failing is a worse outcome than every "must be stopped" case failing at once.
//
// This is not hypothetical — "去死" was on the blocking list, so 我好想去死
// was refused by the product built for exactly that sentence.
//
//   node tools/filter-test.mjs
import { containsAbusive, containsCrisisKeyword, maskContactInfo } from '../src/filters.js';

let failures = 0;
function check(ok, label) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

// ---- MUST GO THROUGH: someone describing their own pain ----
const OWN_PAIN = [
  '我好想去死。',
  '我真的想去死了，撑不下去。',
  '活着好累，不如去死。',
  '今天又是撑不下去的一天。',
  '我是不是太矫情了，别人比我惨多了。',
  '我觉得自己就是个废物，什么都做不好。',
  '我恨我自己。',
  '我就是个傻逼，什么都做不好。',
  '我是不是有点智障，怎么连这个都办不好。',
  '我觉得我很恶心，配不上任何人。',
  "I'm such an idiot for believing him.",
  "I'm a loser and everyone can tell.",
  'Je suis pathétique.',
  'I want to kill myself and I have nobody to tell.',
  "I don't want to be here any more.",
  'Everyone would be better off without me.',
  'I feel like such an idiot for still crying about this.',
  'Je n’en peux plus, je veux en finir.',
  'No quiero vivir así, quiero acabar con todo.',
  'لا أريد العيش هكذا، أنا متعب جدًا.',
];
for (const text of OWN_PAIN) {
  check(!containsAbusive(text), `goes through: ${text.slice(0, 34)}`);
}

// ---- MUST BE STOPPED: aimed at somebody else ----
const AIMED_AT_SOMEONE = [
  '你去死吧。',
  '你怎么还不死。',
  '就你这样的，早点死了算了吧你。',
  '你就是个傻逼。',
  '滚，贱人。',
  'kill yourself, loser',
  'kys',
  'you should die',
  'nobody would miss you',
  'go fuck yourself',
  'you are a worthless piece of shit',
  'ojalá te mueras',
  'hijo de puta',
  'va crever',
  'ferme ta gueule',
  'اقتل نفسك',
];
for (const text of AIMED_AT_SOMEONE) {
  check(containsAbusive(text), `stopped: ${text.slice(0, 34)}`);
}

// ---- the direction test, on the same words ----
check(!containsAbusive('我去死吧'), 'the same phrase about the writer goes through (我去死吧)');
check(containsAbusive('你去死吧'), '…and aimed at someone does not (你去死吧)');
check(!containsAbusive('I should just go die at this point'), 'I should just go die → through');
check(containsAbusive('you should just go die'), 'you should just go die → stopped');
check(!containsAbusive('我就是个废物玩意'), 'calling YOURSELF a废物玩意 goes through');
check(containsAbusive('你就是个废物玩意'), '…calling someone else it does not');
check(containsAbusive('你个死基佬'), 'a slur against a whole group is stopped whatever the sentence');
check(containsAbusive('操你妈'), 'and so is an insult with the target inside it');

// ---- threats, explicit sex, minors, spam: the rest of the rulebook ----
check(containsAbusive('我知道你住哪，你等着瞧'), 'a threat with a target is stopped');
check(!containsAbusive('我想杀了我自己'), '…and wanting to hurt YOURSELF is not a threat');
check(!containsAbusive('他说他要弄死我，我很害怕'), 'reporting a threat made against you goes through');
check(containsAbusive('i know where you live'), 'i know where you live → stopped');

check(containsAbusive('想约炮的私我'), 'explicit soliciting is stopped');
check(!containsAbusive('我们分手了，我很想他的身体也很想他的人'), 'longing for someone goes through');
check(!containsAbusive('我觉得自己的身体很丑陋'), 'writing about your own body goes through');

check(containsAbusive('有没有未成年的想聊性话题'), 'anything sexual near a child is stopped');
check(!containsAbusive('我小时候的孩子气还没有褪掉'), 'the word 孩子 on its own goes through');

check(containsAbusive('啊'.repeat(60)), 'a wall of one repeated character is spam');
check(containsAbusive('😭'.repeat(40)), 'a wall of one repeated emoji is spam');
check(!containsAbusive('啊啊啊啊啊，我真的受不了了'), 'a cry with real words in it is not spam');
check(!containsAbusive('好'), 'a one-word reply is not spam');
check(
  !containsAbusive('今天下了很大的雨，我一个人走回家，路上一直在想你说过的那句话。'),
  'an ordinary long whisper is not spam'
);

// ---- crisis keywords flag, they never block ----
for (const text of ['我好想去死', 'I want to kill myself', 'quiero acabar con todo', 'أنهي حياتي']) {
  check(containsCrisisKeyword(text), `hotline shown for: ${text.slice(0, 28)}`);
  check(!containsAbusive(text), `…and it is still allowed to be written`);
}
check(!containsCrisisKeyword('今天天气不错'), 'no hotline on an ordinary sentence');

// ---- contact details are masked, not refused ----
{
  const cases = [
    ['我的微信是 abc123，加我聊', '微信'],
    ['reach me at someone@example.com', '@'],
    ['call me on 13800138000', '13800138000'],
    ['add me on telegram @whoever', 'telegram'],
    ['私聊我，我带你赚钱', '私聊我'],
  ];
  for (const [text, needle] of cases) {
    const { text: out, masked } = maskContactInfo(text);
    check(masked && !out.includes(needle), `masked: ${text.slice(0, 30)} → ${out.slice(0, 30)}`);
  }
  const plain = maskContactInfo('我今天很难过，没有人可以说。');
  check(!plain.masked, 'an ordinary whisper is left exactly as written');
  check(plain.text === '我今天很难过，没有人可以说。', '…character for character');
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
