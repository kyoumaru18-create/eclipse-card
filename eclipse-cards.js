/* Eclipse Cards — ルール・AI・画面・オンライン対戦 */

/* ===== ルール定数（engine.py と同じ値） ===== */
const R = {
  MAX_HP: 40, START_SHIELD: 15, SHIELD_CAP: 30, START_HAND: 6, DRAW: 2, FIRST_DRAW: 1, MAX_MON: 2,
  ATTR_BONUS: 1.5, ECLIPSE_BONUS: 2, ATK_BUFF: 1.2, DEF_BUFF: 0.7, BLEED_DMG: 2,
  WRATH_AT: 3, FINISH_AT: 4, FINISH_DMG: 14, WAIT_BONUS: 1, WRATH_REDUCE: 5, WRATH_DRAW: 2, MAX_ROUNDS: 40,
  ESCALATION: 0.5,   // 日蝕の深まり：昼夜が1周するごとに与えるダメージ+50%（膠着して終わらない試合を防ぐ）
  OUGI_AT: 4,        // 奥義（仏の怒りを含む）：この枚数目を使うと必殺技
  AMATERASU_DMG: 10, TSUKUYOMI_DMG: 10, KODOKU_POISON: 8, KODOKU_MULT: 3, KYOKA_MULT: 1.5,
  DECK_MIN: 30, DECK_MAX: 40, MAX_COPIES: 3, BUDDHA_MAX: 4,
  PLAY_LIMIT: 2,     // 1ターンに使えるカードの枚数（使う・回復・奥義を数える。秘奥の同時使用は数えない）
};
const PHASE_ROUNDS = 3;   // 昼・夜それぞれの巡数
const CYCLE = [...Array(PHASE_ROUNDS).fill("day"), "dusk", ...Array(PHASE_ROUNDS).fill("night"), "dawn"];
const PHASE_JP = { day: "昼", dusk: "日没", night: "夜", dawn: "夜明け" };
const ATTR_JP = { day: "昼", night: "夜", none: "無" };
const TYPE_JP = { attack: "攻撃", heal: "HP回復", poison: "毒", bleed: "出血", counter: "反撃", summon: "召喚", bloodshield: "血の盾", regen: "再生", buddha: "奥義", ougi: "奥義" };
const BLOOD = { SHURA_HEAL: 10, SHURA_MULT: 1.5, RAGE_STEP: 4 };   // 自傷デッキ用（修羅の回復量・倍率、狂血の増え方）
/* 奥義：4枚溜めると必殺技（同じ奥義は1ターン1枚） */
const OUGI = {
  buddha:    { name: "仏の怒り", desc: "14ダメージ（怒り状態で待ったターンごとに+1）。3枚目から怒り状態（受けるダメージ-5・仏の怒り以外は使えない）" },
  amaterasu: { name: "天照",     desc: "10ダメージ＋以降、自分の昼カードは常に1.5倍" },
  tsukuyomi: { name: "月読",     desc: "10ダメージ＋以降、相手のシールド回復量が半分・自分の夜カードは常に1.5倍" },
  kodoku:    { name: "蠱毒",     desc: "相手に毒8＋以降、自分が与える毒と出血のダメージが3倍" },
  kyoka:     { name: "鏡花水月", desc: "相手の攻撃カードを1回だけ1.5倍にして跳ね返せる（受けるときに選ぶ）" },
  shura:     { name: "修羅",     desc: "HP10回復＋以降、HPを払うカードのダメージが1.5倍" },
};
function isOugi(c) { return c.type === "buddha" || c.type === "ougi"; }
/* 秘奥：日没・夜明けに昼と夜の指定カードを同時に使うと1つ選べる。選べる候補はデッキのタイプで変わる */
const BUFFS = {
  attack: ["攻撃強化", "以降、与えるダメージ+20%"],
  defense: ["防御強化", "以降、受けるダメージ30%減"],
  draw: ["ドロー強化", "以降、毎ターン追加で1枚ドロー"],
  search: ["サーチ", "デッキから好きなカードを1枚手札へ"],
  sunlight: ["陽光", "以降、毎ターン始めにシールド+3"],
  scorch: ["灼光", "以降、昼カードのシールド消費-1"],
  moonshadow: ["月影", "以降、毎ターン始めに相手のシールド-1"],
  lifesteal: ["吸命", "以降、攻撃カードで与えたダメージの1/4だけHP回復"],
  virulent: ["猛毒", "以降、毒と出血を付けるとき+2"],
  plague: ["疫病", "以降、毎ターン始めに相手に毒1"],
  riposte: ["返し刃", "以降、反撃の構えは受けた攻撃を全部返す"],
  steadfast: ["不動", "以降、受ける攻撃のダメージ-5"],
  bloodthirst: ["血の渇き", "以降、HPを払うとその分シールド回復"],
  undying: ["不死身", "1回だけ、HPが0になってもHP1で踏みとどまる"],
  regenplus: ["再生強化", "以降、毎ターン始めにHP+2"],
};
const BUFF_ORDER = Object.keys(BUFFS);
/* デッキのタイプごとの秘奥の候補（並びはAIが選ぶ優先順） */
const HIOU_SETS = {
  day: ["attack", "sunlight", "scorch"],
  night: ["moonshadow", "draw", "lifesteal"],
  balanced: ["attack", "draw", "defense"],
  venom: ["plague", "virulent", "defense"],
  counter: ["steadfast", "draw", "riposte"],
  blood: ["bloodthirst", "undying", "attack"],
};
const HIOU_NAME = { day: "陽の秘奥", night: "月の秘奥", balanced: "蝕の秘奥", venom: "毒の秘奥", counter: "鏡の秘奥", blood: "血の秘奥" };
const HIOU_LEAN = 4;   // 昼（夜）カードが夜（昼）カードよりこの枚数以上多ければ昼寄り（夜寄り）
/* デッキのタイプ。蠱毒→毒、鏡花水月→カウンター、修羅→自傷、天照→昼、月読→夜。それ以外は昼と夜のカードの枚数で決まる */
function deckType(def) {
  const map = [["kodoku", "venom"], ["kyoka", "counter"], ["shura", "blood"], ["amaterasu", "day"], ["tsukuyomi", "night"]];
  for (const [id, kind] of map) if (def[id] > 0) return kind;
  let day = 0, night = 0;
  for (const [id, n] of Object.entries(def)) { if (CARDS[id].attr === "day") day += n; else if (CARDS[id].attr === "night") night += n; }
  return day - night >= HIOU_LEAN ? "day" : night - day >= HIOU_LEAN ? "night" : "balanced";
}

/* ===== カードデータ（cards.json と同じ） ===== */
const CARDS = {
  strike:   { name: "打撃",       attr: "day",   type: "attack",  power: 5, cost: 3, recover: 3 },
  bomb:     { name: "爆撃",       attr: "day",   type: "attack",  power: 8, cost: 5, recover: 5 },
  sunwolf:  { name: "陽の狼",     attr: "day",   type: "summon",  power: 3, turns: 3, cost: 5, recover: 5 },
  slash:    { name: "斬撃",       attr: "night", type: "attack",  power: 5, cost: 3, recover: 3 },
  ambush:   { name: "闇討ち",     attr: "night", type: "attack",  power: 8, cost: 5, recover: 5 },
  nightowl: { name: "夜の梟",     attr: "night", type: "summon",  power: 3, turns: 3, cost: 5, recover: 5 },
  drain:    { name: "吸血",       attr: "night", type: "attack",  power: 6, drain: true, cost: 4, recover: 4 },
  jab:      { name: "突き",       attr: "day",   type: "attack",  power: 3, cost: 2, recover: 2 },
  recoil:   { name: "捨て身",     attr: "night", type: "attack",  power: 12, recoil: 3, cost: 4, recover: 4 },
  eclipse:  { name: "日蝕",       attr: "none",  type: "attack",  power: 6, eclipse: true, cost: 4, recover: 4 },
  needle:   { name: "毒針",       attr: "night", type: "poison",  power: 5, cost: 3, recover: 3 },
  bleed:    { name: "裂傷",       attr: "night", type: "bleed",   power: 3, cost: 3, recover: 3 },
  counter:  { name: "反撃の構え", attr: "day",   type: "counter", cost: 3, recover: 3 },
  heal:     { name: "治癒",       attr: "day",   type: "heal",    power: 8, cost: 0, recover: 2 },
  firstaid: { name: "応急処置",   attr: "none",  type: "heal",    power: 4, cure: true, cost: 0, recover: 2 },
  buddha:   { name: "仏の怒り",   attr: "none",  type: "buddha",  cost: 0, recover: 0 },
  amaterasu:{ name: "天照",       attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  tsukuyomi:{ name: "月読",       attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  kodoku:   { name: "蠱毒",       attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  kyoka:    { name: "鏡花水月",   attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  bloodblade:  { name: "血刃",   attr: "night", type: "attack",      power: 7, hpcost: 3, cost: 0, recover: 4 },
  bloodlust:   { name: "狂血",   attr: "night", type: "attack",      power: 3, rage: true, hpcost: 2, cost: 2, recover: 4 },
  bloodshield: { name: "血の盾", attr: "day",   type: "bloodshield", power: 8, hpcost: 4, cost: 0, recover: 5 },
  regen:       { name: "再生",   attr: "day",   type: "regen",       power: 3, turns: 4, cost: 2, recover: 4 },
  shura:    { name: "修羅",       attr: "none",  type: "ougi",    cost: 0, recover: 0 },
};
/* 見本デッキ（cards.json の decks と同じ） */
const PRESETS = {
  sun: { name: "昼特化", cards: {
    strike: 3, bomb: 3, sunwolf: 3, eclipse: 3, jab: 3, recoil: 2,
    slash: 2, drain: 2, counter: 2, needle: 2, heal: 3, firstaid: 2, amaterasu: 4 } },
  moon: { name: "夜特化", cards: {
    slash: 3, ambush: 3, nightowl: 3, drain: 3, eclipse: 3, jab: 2,
    strike: 2, bomb: 2, bleed: 2, counter: 2, heal: 3, firstaid: 2, tsukuyomi: 4 } },
  venom: { name: "状態異常", cards: {
    needle: 3, bleed: 3, drain: 3, slash: 3, ambush: 2, strike: 2, bomb: 2,
    jab: 2, recoil: 2, eclipse: 2, counter: 2, firstaid: 3, heal: 1, kodoku: 4 } },
  counter: { name: "カウンター", cards: {
    counter: 3, kyoka: 4, jab: 3, strike: 3, slash: 3, bomb: 2, ambush: 2,
    drain: 2, recoil: 2, heal: 3, firstaid: 3 } },
  buddha: { name: "仏の怒り", cards: {
    buddha: 4, counter: 3, jab: 3, heal: 3, firstaid: 3,
    strike: 2, bomb: 2, slash: 2, ambush: 2, drain: 2, recoil: 2, needle: 2 } },
  blood: { name: "自傷", cards: {
    bloodblade: 3, bloodlust: 3, bloodshield: 3, regen: 3, recoil: 3, shura: 4,
    drain: 2, strike: 2, slash: 2, heal: 2, firstaid: 3 } },
};
const DEFAULT_PRESET = "buddha";   // 最初に使うデッキ。保存データがおかしいときもこれに戻す
const DECK = PRESETS[DEFAULT_PRESET].cards;

/* デッキの枚数・ルール確認 */
function deckSize(def) { return Object.values(def).reduce((a, b) => a + b, 0); }
function maxCopies(id) { return isOugi(CARDS[id]) ? R.BUDDHA_MAX : R.MAX_COPIES; }
/* 外から来たデッキ（保存データ・相手のデッキ）を安全な形に直す。おかしければ標準デッキ */
function sanitizeDeck(def) {
  const out = {};
  if (def && typeof def === "object")
    for (const [id, n] of Object.entries(def))
      if (CARDS[id] && Number.isInteger(n) && n > 0) out[id] = Math.min(n, maxCopies(id));
  const size = deckSize(out);
  return size >= R.DECK_MIN && size <= R.DECK_MAX ? out : { ...DECK };
}
function deckProblems(def) {
  const out = [];
  const size = deckSize(def);
  if (size < R.DECK_MIN) out.push(`あと${R.DECK_MIN - size}枚必要（${R.DECK_MIN}〜${R.DECK_MAX}枚）`);
  if (size > R.DECK_MAX) out.push(`${size - R.DECK_MAX}枚多い（${R.DECK_MIN}〜${R.DECK_MAX}枚）`);
  return out;
}
function deckWarnings(def) {
  const has = attr => Object.keys(def).some(id => CARDS[id].attr === attr && def[id] > 0);
  const out = [];
  if (!has("day") || !has("night")) out.push("昼属性と夜属性のカードが両方ないと、秘奥が取れない");
  for (const id of Object.keys(OUGI))
    if (def[id] > 0 && def[id] < R.OUGI_AT) out.push(`${OUGI[id].name}は${R.OUGI_AT}枚そろわないと必殺技にならない`);
  return out;
}

let uidSeq = 0;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function makeDeck(def = DECK) {
  const d = [];
  for (const [id, n] of Object.entries(sanitizeDeck(def))) for (let i = 0; i < n; i++) d.push({ ...CARDS[id], id, uid: ++uidSeq });
  return shuffle(d);
}
/* 指定カード（昼2種・夜2種）を決める。chosen（プレイヤーが選んだもの）のうちデッキにあるものを使い、
   足りない分はデッキで枚数の多いカードから自動で埋める。発動に必要なのは昼1枚＋夜1枚 */
const DESIGNATED_PER_ATTR = 2;
function autoDesignated(def, chosen) {
  const out = {};
  for (const attr of ["day", "night"]) {
    const ids = Object.keys(def).filter(id => CARDS[id]?.attr === attr && !isOugi(CARDS[id]) && def[id] > 0);
    const picked = (chosen?.[attr] || []).filter(id => ids.includes(id)).slice(0, DESIGNATED_PER_ATTR);
    for (const id of ids.sort((a, b) => def[b] - def[a] || a.localeCompare(b)))
      if (picked.length < DESIGNATED_PER_ATTR && !picked.includes(id)) picked.push(id);
    out[attr] = picked;
  }
  return out;
}
function newPlayer(name, isAI, def, chosen) {
  const deck = makeDeck(def);
  const designated = autoDesignated(sanitizeDeck(def), chosen);
  return { name, isAI, hp: R.MAX_HP, shield: R.START_SHIELD, deck, hand: [], drop: [], monsters: [],
           stacks: {},          // 奥義ごとに溜めたカード
           stackUsed: [],       // このターンに使った奥義
           buffs: new Set(), buffRound: null, poison: 0, bleed: 0, counter: false, wrath: false, designated,
           wrathTurns: 0,       // 怒り状態で4枚目を待ったターン数（必殺技のダメージが増える）
           kyoka: false,       // 鏡花水月（相手の攻撃カードを1回だけ1.5倍で跳ね返せる）
           regen: 0, regenTurns: 0,   // 再生（毎ターンHP回復）
           shura: false,       // 修羅（HPを払うカードのダメージが1.5倍）
           blessing: [],        // 天照・月読の加護（この属性のカードは常に1.5倍）
           kodoku: false,       // 蠱毒（自分が与える毒・出血が3倍）
           recoverHalf: false,  // 相手の月読（シールド回復量が半分）
           plays: 0,            // このターンに使ったカードの枚数
           hiou: deckType(sanitizeDeck(def)),   // 選べる秘奥の種類（デッキのタイプで決まる）
           undyingUsed: false,  // 秘奥・不死身を使ったか
         };
}
function hiouOptions(p) { return HIOU_SETS[p.hiou || "balanced"].filter(b => !p.buffs.has(b)); }
function stackOf(p, id) { return p.stacks[id] || []; }
/* 仏の怒りの必殺技の基本ダメージ（怒り状態で待ったターンだけ増える） */
function finisherBase(p) { return R.FINISH_DMG + R.WAIT_BONUS * (p.wrathTurns || 0); }

/* ===== 戦闘エンジン（engine.py の移植）
   プレイヤー名は "@0" "@1" の記号で記録し、画面に出すときに見る人ごとに「あなた」「相手」に置き換える。
   ログの1行1行が演出（ダメージ表示・大きな文字）の元になるので、相手の画面でも同じ演出が再現される ===== */
class Game {
  constructor({ ai = [false, false], firstIdx = 0, decks = [DECK, DECK], designated = [null, null] } = {}) {
    this.gid = Math.random().toString(36).slice(2, 10);
    this.players = [newPlayer("@0", ai[0], decks[0], designated[0]), newPlayer("@1", ai[1], decks[1], designated[1])];
    this.firstIdx = firstIdx; this.turnIdx = firstIdx;
    this.round = 1; this.over = false; this.winnerIdx = null; this.pending = null; this.logs = []; this.logSeq = 0;
    for (const p of this.players) this.draw(p, R.START_HAND);
  }
  static load(s) {
    const g = Object.create(Game.prototype);
    Object.assign(g, JSON.parse(JSON.stringify(s)));
    for (const p of g.players) {
      p.buffs = new Set(p.buffs);
      for (const c of [...p.deck, ...p.hand, ...p.drop, ...Object.values(p.stacks || {}).flat()]) uidSeq = Math.max(uidSeq, c.uid);
    }
    return g;
  }
  serialize() {
    return {
      gid: this.gid, players: this.players.map(p => ({ ...p, buffs: [...p.buffs] })),
      firstIdx: this.firstIdx, turnIdx: this.turnIdx, round: this.round, over: this.over,
      winnerIdx: this.winnerIdx, pending: this.pending, logs: this.logs.slice(-80), logSeq: this.logSeq,
    };
  }
  /* m: 文章, k: 種類, t: 対象プレイヤー, a: 量 */
  log(m, k = "", t = null, a = 0) {
    this.logs.push({ m, k, t, a, n: ++this.logSeq });
    if (this.logs.length > 150) this.logs.shift();
  }
  idx(p) { return this.players.indexOf(p); }
  get phase() { return CYCLE[(this.round - 1) % CYCLE.length]; }
  get active() { return this.players[this.turnIdx]; }
  opp(p) { return p === this.players[0] ? this.players[1] : this.players[0]; }
  isTransition() { return this.phase === "dusk" || this.phase === "dawn"; }
  buffReady(p) { return this.isTransition() && p.buffRound !== this.round && hiouOptions(p).length > 0; }
  roundsToTransition() {
    for (let k = 0; k < CYCLE.length; k++) {
      const ph = CYCLE[(this.round - 1 + k) % CYCLE.length];
      if (ph === "dusk" || ph === "dawn") return [k, ph];
    }
  }
  checkDead() {
    for (const p of this.players)   // 秘奥・不死身：1回だけHP1で踏みとどまる
      if (p.hp <= 0 && p.buffs.has("undying") && !p.undyingUsed) {
        p.undyingUsed = true; p.hp = 1;
        this.log(`${p.name}は不死身でHP1で踏みとどまった`, "undying", this.idx(p));
      }
    const dead = this.players.filter(p => p.hp <= 0);
    if (dead.length && !this.over) { this.over = true; this.winnerIdx = dead.length === 2 ? null : this.idx(this.opp(dead[0])); }
  }
  cardMult(c, p = null) {
    if (c.eclipse) return this.isTransition() ? R.ECLIPSE_BONUS : 1;
    return this.attrMult(c.attr, p);
  }
  attrMult(attr, p = null) { return attr === this.phase || (p && p.blessing.includes(attr)) ? R.ATTR_BONUS : 1; }
  /* 毒・出血のダメージ倍率（日蝕の深まり×相手の蠱毒） */
  dotMult(victim) { return this.escalation() * (this.opp(victim).kodoku ? R.KODOKU_MULT : 1); }
  /* 日蝕の深まり。昼夜が1周するごとにダメージ倍率が上がる */
  escalation() { return 1 + R.ESCALATION * Math.floor((this.round - 1) / CYCLE.length); }
  outgoing(p, base, mult) { let d = base * mult * this.escalation(); if (p.buffs.has("attack")) d *= R.ATK_BUFF; return d; }
  incoming(t, a) {
    if (t.buffs.has("defense")) a *= R.DEF_BUFF;
    if (t.wrath) a -= R.WRATH_REDUCE;
    if (t.buffs.has("steadfast")) a -= 5;   // 秘奥・不動
    return Math.max(0, Math.floor(a + 0.5));
  }
  /* シールド消費（秘奥・灼光なら昼カードは-1） */
  shieldCost(p, c) { return p.buffs.has("scorch") && c.attr === "day" ? Math.max(0, c.cost - 1) : c.cost; }
  /* 攻撃カードの基本ダメージ（狂血は減っているHPで増え、修羅はHPを払うカードを強くする） */
  attackPower(p, c) {
    let power = c.power;
    if (c.rage) power += Math.floor(Math.max(0, R.MAX_HP - p.hp) / BLOOD.RAGE_STEP);
    if (p.shura && c.hpcost) power *= BLOOD.SHURA_MULT;
    return power;
  }
  preview(p, c) {
    const o = this.opp(p);
    if (c.type === "attack") return this.incoming(o, this.outgoing(p, this.attackPower(p, c), this.cardMult(c, p)));
    if (c.type === "summon") return this.incoming(o, this.outgoing(p, c.power, this.cardMult(c, p))) * c.turns;
    if (c.type === "poison") return c.power * (c.power + 1) / 2;
    return 0;
  }
  /* 攻撃を当てる。attacker があれば反撃の構えが発動しうる。実際に与えた量を返す */
  dealDamage(t, amount, src, attacker = null) {
    return this.hit(t, this.incoming(t, amount), src, attacker);
  }
  /* 受け手側の補正（防御強化・怒り状態）を計算済みのダメージを当てる */
  hit(t, amt, src, attacker = null) {
    let reflect = 0;
    if (attacker && t.counter && amt > 0) {
      t.counter = false;
      const half = Math.floor(amt / 2);
      reflect = t.buffs.has("riposte") ? amt : half;   // 秘奥・返し刃なら全部返す
      amt -= half;
    }
    const ab = Math.min(t.shield, amt);
    t.shield -= ab;
    const th = amt - ab;
    t.hp -= th;
    this.log(`${src} → ${t.name}に${amt}ダメージ（シールド-${ab}${th ? `、HP-${th}` : ""}）`, "dmg", this.idx(t), amt);
    this.checkDead();
    if (reflect && !this.over) {
      this.log(`${t.name}の反撃！`, "counter", this.idx(t));
      this.dealDamage(attacker, reflect, "反撃");
    }
    return amt;
  }
  directHp(p, n, reason) {
    p.hp -= n;
    this.log(`${reason}で${p.name}のHP-${n}`, "dmg", this.idx(p), n);
    this.checkDead();
  }
  heal(p, n, reason) {
    const b = p.hp; p.hp = Math.min(R.MAX_HP, p.hp + n);
    if (p.hp > b) this.log(`${reason}で${p.name}のHP回復 ${b}→${p.hp}`, "heal", this.idx(p), p.hp - b);
  }
  payCost(p, cost) {
    const paid = Math.min(p.shield, cost);
    p.shield -= paid;
    const s = cost - paid;
    if (s) { p.hp -= s; this.log(`シールド不足。${p.name}は${s}をHPで支払った`, "dmg", this.idx(p), s); this.checkDead(); }
  }
  draw(p, n) {
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) {
        if (!p.drop.length) return;
        p.deck = shuffle(p.drop); p.drop = [];
        this.log(`${p.name}のドロップゾーンをシャッフルしてデッキに戻した`);
      }
      p.hand.push(p.deck.pop());
    }
  }
  /* counted=false は秘奥の同時使用（1ターンの枚数制限に数えない） */
  canPlay(p, c, mode, counted = true) {
    if (counted && (p.plays || 0) >= R.PLAY_LIMIT) return false;
    // 奥義は溜めるだけ。同じ奥義は1ターン1枚。怒り状態でも仏の怒りだけは使える
    if (isOugi(c)) return mode === "use" && !p.stackUsed.includes(c.id) && (!p.wrath || c.id === "buddha");
    if (p.wrath) return false;
    if (mode === "use" && c.type === "summon" && p.monsters.length >= R.MAX_MON) return false;
    return true;
  }
  play(p, uid, mode) {
    const c = p.hand.find(c => c.uid === uid);
    if (!c || !this.canPlay(p, c, mode)) return false;
    p.hand.splice(p.hand.indexOf(c), 1);
    p.plays = (p.plays || 0) + 1;
    this.resolve(p, c, mode);
    return true;
  }
  resolve(p, c, mode) {
    if (mode === "recover") {
      p.drop.push(c);
      const b = p.shield;
      const gain = p.recoverHalf ? Math.ceil(c.recover / 2) : c.recover;
      p.shield = Math.min(R.SHIELD_CAP, p.shield + gain);
      this.log(`${p.name}は${c.name}をシールド回復に使った（${b}→${p.shield}${p.recoverHalf ? "・月読で半減" : ""}）`, "shield", this.idx(p), p.shield - b);
      return;
    }
    if (isOugi(c)) return this.useOugi(p, c);
    p.drop.push(c);
    const o = this.opp(p);
    const cost = this.shieldCost(p, c);
    this.log(`${p.name}は${c.name}を使った${cost ? `（シールド-${cost}）` : ""}`, "play");
    this.payCost(p, cost);
    if (this.over) return;
    if (c.hpcost) {
      this.directHp(p, c.hpcost, "血の代償");
      if (this.over) return;
      if (p.buffs.has("bloodthirst")) p.shield = Math.min(R.SHIELD_CAP, p.shield + c.hpcost);   // 秘奥・血の渇き
    }
    if (p.bleed) { this.directHp(p, Math.floor(R.BLEED_DMG * this.dotMult(p) + 0.5), "出血"); if (this.over) return; }
    if (c.type === "attack") {
      const amt = this.incoming(o, this.outgoing(p, this.attackPower(p, c), this.cardMult(c, p)));
      const after = { atk: this.idx(p), seat: this.idx(o), amt, src: c.name, drain: !!c.drain, recoil: c.recoil || 0 };
      if (o.kyoka && amt > 0) {
        // 鏡花水月：受ける側が跳ね返すか選ぶ。人なら選ぶまで止める（オンラインでは相手の画面で選ぶ）
        if (!o.isAI) { this.pending = { type: "reflect", ...after, rest: [], pairBuff: false }; return "halt"; }
        return this.finishAttack(after, AI.chooseReflect(o, amt));
      }
      return this.finishAttack(after, false);
    } else if (c.type === "heal") {
      this.heal(p, c.power, c.name);
      if (c.cure && (p.poison || p.bleed)) { p.poison = 0; p.bleed = 0; this.log("毒と出血が治った"); }
    } else if (c.type === "poison") {
      const n = c.power + (p.buffs.has("virulent") ? 2 : 0);   // 秘奥・猛毒
      o.poison += n;
      this.log(`${o.name}に毒${n}（合計${o.poison}）`);
    } else if (c.type === "bleed") {
      o.bleed += c.power + (p.buffs.has("virulent") ? 2 : 0);
      this.log(`${o.name}は出血した（${o.bleed}ターン、カードを使うたびHP-${R.BLEED_DMG}）`);
    } else if (c.type === "counter") {
      p.counter = true;
      this.log(`${p.name}は反撃の構えをとった`);
    } else if (c.type === "bloodshield") {
      const b = p.shield;
      p.shield = Math.min(R.SHIELD_CAP, p.shield + c.power);
      this.log(`血の盾で${p.name}のシールド ${b}→${p.shield}`, "shield", this.idx(p), p.shield - b);
    } else if (c.type === "regen") {
      p.regen = Math.max(p.regen || 0, c.power);
      p.regenTurns = Math.max(p.regenTurns || 0, c.turns);
      this.log(`${p.name}は再生を得た（${p.regenTurns}ターン、毎ターンHP+${p.regen}）`);
    } else if (c.type === "summon") {
      p.monsters.push({ name: c.name, attr: c.attr, atk: c.power, turns: c.turns });
      this.log(`${p.name}は${c.name}を召喚した（${c.turns}ターン）`);
    }
  }
  /* 攻撃カードの命中と、その後の吸血・捨て身の反動。reflect なら鏡花水月で跳ね返す */
  finishAttack(a, reflect) {
    const p = this.players[a.atk], o = this.players[a.seat];
    let dealt = 0;
    if (reflect) {
      o.kyoka = false;
      this.log(`${o.name}は鏡花水月で${a.src}を${R.KYOKA_MULT}倍にして跳ね返した`, "kyoka", a.seat);
      this.dealDamage(p, Math.floor(a.amt * R.KYOKA_MULT + 0.5), "鏡花水月");
    } else {
      dealt = this.hit(o, a.amt, a.src, p);
    }
    if (this.over) return;
    if (a.drain && dealt) this.heal(p, Math.floor(dealt / 2), "吸血");
    if (p.buffs.has("lifesteal") && dealt) this.heal(p, Math.floor(dealt / 4), "吸命");   // 秘奥・吸命
    if (a.recoil) this.directHp(p, a.recoil, "捨て身の反動");
  }
  /* 鏡花水月の選択を受け取り、止めていた続き（同時使用の残りのカードと秘奥）を進める */
  resolveReflect(yes) {
    const pd = this.pending;
    if (!pd || pd.type !== "reflect") return;
    this.pending = null;
    if (!yes) this.log(`${this.players[pd.seat].name}は鏡花水月を温存した`);
    this.finishAttack(pd, yes);
    if (this.over) return;
    this.continuePair(this.players[pd.atk], pd.rest, pd.pairBuff);
  }
  continuePair(p, cards, pairBuff) {
    for (let i = 0; i < cards.length; i++) {
      if (this.resolve(p, cards[i], "use") === "halt") {
        this.pending.rest = cards.slice(i + 1);
        this.pending.pairBuff = pairBuff;
        return;
      }
      if (this.over) return;
    }
    if (pairBuff) this.grantPairBuff(p);
  }
  grantPairBuff(p) {
    const opts = hiouOptions(p);
    if (p.isAI) this.applyBuff(p, AI.chooseBuff(opts));
    else this.pending = { type: "buff", opts, seat: this.idx(p) };
  }
  useOugi(p, c) {
    const key = c.id;
    p.stackUsed.push(key);
    const stack = (p.stacks[key] ||= []);
    stack.push(c);
    const k = stack.length;
    this.log(`${p.name}は${c.name}を溜めた（${k}/${R.OUGI_AT}）`, "buddha");
    if (k >= R.OUGI_AT) {
      p.drop.push(...stack); p.stacks[key] = [];
      this.fireOugi(p, key);
    } else if (key === "buddha" && k >= R.WRATH_AT && !p.wrath) {
      p.wrath = true;
      p.wrathTurns = 0;
      this.log(`${p.name}は怒り状態になった（受けるダメージ-${R.WRATH_REDUCE}）`, "wrath", this.idx(p));
    }
  }
  /* 奥義の必殺技 */
  fireOugi(p, key) {
    const o = this.opp(p);
    this.log(`${p.name}の${OUGI[key].name}、発動`, "finisher", this.idx(p), key);
    if (key === "buddha") {
      const base = finisherBase(p);
      if (p.wrathTurns) this.log(`待った${p.wrathTurns}ターン分、必殺技が+${base - R.FINISH_DMG}`, "buff");
      p.wrath = false;
      p.wrathTurns = 0;
      this.dealDamage(o, this.outgoing(p, base, 1), "仏の怒り", p);
    } else if (key === "amaterasu") {
      if (!p.blessing.includes("day")) p.blessing.push("day");
      this.log(`以降、${p.name}の昼属性カードは常に1.5倍`, "buff");
      this.dealDamage(o, this.outgoing(p, R.AMATERASU_DMG, 1), "天照", p);
    } else if (key === "tsukuyomi") {
      if (!p.blessing.includes("night")) p.blessing.push("night");
      o.recoverHalf = true;
      this.log(`以降、${o.name}のシールド回復量は半分。${p.name}の夜属性カードは常に1.5倍`, "buff");
      this.dealDamage(o, this.outgoing(p, R.TSUKUYOMI_DMG, 1), "月読", p);
    } else if (key === "kodoku") {
      p.kodoku = true;
      o.poison += R.KODOKU_POISON;
      this.log(`${o.name}に毒${R.KODOKU_POISON}。以降、${p.name}が与える毒と出血は${R.KODOKU_MULT}倍`, "buff");
    } else if (key === "shura") {
      p.shura = true;
      this.heal(p, BLOOD.SHURA_HEAL, "修羅");
      this.log(`以降、${p.name}のHPを払うカードのダメージは${BLOOD.SHURA_MULT}倍`, "buff");
    } else if (key === "kyoka") {
      p.kyoka = true;
      this.log(`以降、${p.name}は相手の攻撃を1回だけ${R.KYOKA_MULT}倍にして跳ね返せる`, "buff");
    }
  }
  /* 日没・夜明けに同時使用できる [昼の指定カード, 夜の指定カード] の組（種類ごとに1組） */
  pairOptions(p) {
    if (!this.buffReady(p) || p.wrath) return [];
    const pick = attr => [...new Map(p.hand.filter(c => p.designated[attr].includes(c.id)).map(c => [c.id, c])).values()];
    const out = [];
    for (const d of pick("day")) for (const n of pick("night"))
      if (this.canPlay(p, d, "use", false) && this.canPlay(p, n, "use", false)) out.push([d, n]);
    return out;
  }
  playPair(p, dUid, nUid) {
    const pair = this.pairOptions(p).find(([d, n]) => d.uid === dUid && n.uid === nUid);
    if (!pair) return false;
    this.log(`${p.name}は${pair[0].name}と${pair[1].name}を同時に使った`, "buff");
    for (const c of pair) p.hand.splice(p.hand.indexOf(c), 1);
    this.continuePair(p, pair, true);
    return true;
  }
  applyBuff(p, ch) {
    p.buffs.add(ch); p.buffRound = this.round; this.pending = null;
    this.log(`${HIOU_NAME[p.hiou || "balanced"]}：${p.name}が「${BUFFS[ch][0]}」を獲得`, "buffget", this.idx(p));
    if (ch === "search") {
      const pool = p.deck.filter(c => !isOugi(c));
      if (!pool.length) return;
      if (p.isAI) this.applySearch(p, pool.reduce((a, b) => (b.power || 0) > (a.power || 0) ? b : a).uid);
      else this.pending = { type: "search", seat: this.idx(p) };
    }
  }
  applySearch(p, uid) {
    const i = p.deck.findIndex(c => c.uid === uid);
    const c = p.deck.splice(i, 1)[0];
    p.hand.push(c); shuffle(p.deck); this.pending = null;
    this.log(`${p.name}はデッキから${c.name}を手札に加えた`);
  }
  startTurn(p) {
    this.log(`第${this.round}巡【${PHASE_JP[this.phase]}】${p.name}のターン`, "turn");
    p.counter = false;
    p.stackUsed = [];
    p.plays = 0;
    if (p.wrath) p.wrathTurns = (p.wrathTurns || 0) + 1;
    if (p.poison) {
      this.directHp(p, Math.floor(p.poison * this.dotMult(p) + 0.5), "毒");
      p.poison--;
      if (this.over) return;
    }
    if (p.regenTurns) {
      this.heal(p, p.regen, "再生");
      if (!--p.regenTurns) p.regen = 0;
    }
    // 毎ターン始めに働く秘奥
    const o = this.opp(p);
    if (p.buffs.has("sunlight")) p.shield = Math.min(R.SHIELD_CAP, p.shield + 3);
    if (p.buffs.has("moonshadow")) o.shield = Math.max(0, o.shield - 1);
    if (p.buffs.has("plague")) o.poison += 1;
    if (p.buffs.has("regenplus")) this.heal(p, 2, "再生強化");
    if (this.round === 1 && this.turnIdx === this.firstIdx) return this.draw(p, R.FIRST_DRAW);
    this.draw(p, (p.wrath ? R.WRATH_DRAW : R.DRAW) + (p.buffs.has("draw") ? 1 : 0));
  }
  endTurn(p) {
    const o = this.opp(p);
    for (const m of [...p.monsters]) {
      this.dealDamage(o, this.outgoing(p, m.atk, this.attrMult(m.attr, p)), m.name, p);
      if (this.over) return;
      m.turns--;
      if (m.turns <= 0) { p.monsters.splice(p.monsters.indexOf(m), 1); this.log(`${m.name}は去っていった`); }
    }
    if (p.bleed) p.bleed--;
    this.turnIdx = 1 - this.turnIdx;
    if (this.turnIdx === this.firstIdx) {
      const prev = this.phase;
      this.round++;
      if (this.phase !== prev) this.log({
        dusk: "日没が訪れた", night: "夜になった", dawn: "夜明けが来た", day: "昼になった",
      }[this.phase], "phase");
      if (this.round > R.MAX_ROUNDS) { this.over = true; this.winnerIdx = null; }
    }
  }
}

/* ===== 敵AI（engine.py の SimpleAI と同じ考え方） ===== */
const AI = {
  RESERVE: 6, LOW: 12,
  reserved(p) {
    const keep = new Set();
    if (!hiouOptions(p).length) return keep;
    for (const key of ["day", "night"]) {
      const c = p.hand.find(c => p.designated[key].includes(c.id));
      if (c) keep.add(c.uid);
    }
    return keep;
  },
  score(g, p, c) {
    const o = g.opp(p);
    if (c.type === "attack" && c.recoil && p.hp <= 15 + c.recoil) return null;
    if (c.hpcost && p.hp <= c.hpcost + 12) return null;   // HPを払うカードは、HPに余裕があるときだけ
    if (c.type === "bloodshield") return p.shield <= 12 ? 3 : null;
    if (c.type === "regen") return !p.regenTurns && p.hp <= R.MAX_HP - 6 ? 2.5 : null;
    if (["attack", "poison", "summon"].includes(c.type)) return g.preview(p, c) / Math.max(1, c.cost + 0.7 * (c.hpcost || 0));
    if (c.type === "bleed") return o.bleed ? null : 4 / c.cost;
    if (c.type === "counter") return p.counter ? null : 3.5 / c.cost;
    return null;
  },
  pick(g, p) {
    const o = g.opp(p), hand = p.hand;
    // 奥義は使えるならすぐ溜める
    const now = hand.find(c => isOugi(c) && g.canPlay(p, c, "use"));
    if (now) return [now.uid, "use"];
    if (p.wrath) return null;
    const pairs = g.pairOptions(p).filter(([d, n]) => p.hp + p.shield > d.cost + n.cost + 5);
    if (pairs.length) {
      const [d, n] = pairs.reduce((a, b) => (b[0].cost + b[1].cost < a[0].cost + a[1].cost ? b : a));
      return ["pair", d.uid, n.uid];
    }
    if ((p.plays || 0) >= R.PLAY_LIMIT) return null;   // 1ターンの枚数を使い切った（秘奥の同時使用だけは上で済ませてある）
    for (const c of hand)
      if (c.type === "attack" && g.preview(p, c) >= o.hp + o.shield && p.hp + p.shield > c.cost) return [c.uid, "use"];
    if (p.hp <= R.MAX_HP - 8 || ((p.poison >= 2 || p.bleed) && p.hp <= R.MAX_HP - 4))
      for (const c of hand)
        if (c.type === "heal" && p.shield >= c.cost && (c.cure || p.hp <= R.MAX_HP - 8)) return [c.uid, "use"];
    const keep = this.reserved(p);
    let best = null;
    for (const c of hand) {
      if (keep.has(c.uid) || !g.canPlay(p, c, "use") || p.shield - c.cost < this.RESERVE) continue;
      const s = this.score(g, p, c);
      if (s != null && (!best || s > best[0])) best = [s, c.uid];
    }
    if (best) return [best[1], "use"];
    if (p.shield < this.LOW) {
      let b = null;
      for (const c of hand) {
        if (keep.has(c.uid) || c.type === "heal" || isOugi(c)) continue;
        const sc = [c.recover, -g.preview(p, c)];
        if (!b || sc[0] > b[0][0] || (sc[0] === b[0][0] && sc[1] > b[0][1])) b = [sc, c.uid];
      }
      if (b) return [b[1], "recover"];
    }
    return null;
  },
  chooseBuff(opts) { return opts[0]; },   // HIOU_SETS の並び順（優先順）で選ぶ
  /* 鏡花水月で跳ね返すか。大きめの攻撃か、HPまで届く攻撃なら跳ね返す */
  chooseReflect(p, amt) { return amt >= 7 || amt > p.shield; },
};

/* ===== 画面の状態 ===== */
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = ms => new Promise(r => setTimeout(r, reduceMotion ? ms * 0.4 : ms));
let g = null;          // 今の試合
let mode = "ai";       // "ai" | "online"
let seat = 0;          // この画面のプレイヤーが players の何番目か
let busy = false;      // AIが行動中
let gameId = 0;        // AI戦のやり直しで古いループを止めるための番号
let fxGid = null, fxSeen = 0;   // 演出済みのログ番号

function nameOf(i) { return i === seat ? "あなた" : mode === "ai" ? "敵" : "相手"; }
function fmt(m) { return m.replace(/@([01])/g, (_, i) => nameOf(+i)); }

/* ===== 演出 ===== */
function sideKey(i) { return i === seat ? "me" : "enemy"; }
function pop(i, text, cls = "") {
  const el = document.createElement("span");
  el.className = `pop ${cls}`; el.textContent = text;
  const fx = $(`${sideKey(i)}-fx`);
  el.style.top = `${fx.childElementCount * 22}px`;
  fx.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
function shake(i) {
  const side = $(`side-${sideKey(i)}`);
  side.classList.remove("hit"); void side.offsetWidth; side.classList.add("hit");
}
let bannerTimer = 0;
function banner(text, sub = "", kind = "") {
  const el = $("banner");
  el.className = `banner ${kind}`;
  el.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ""}`;
  el.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.hidden = true; }, reduceMotion ? 900 : 1500);
}
/* まだ演出していないログ行を再生する（自分の操作でも、相手から届いた盤面でも同じ） */
function runFx() {
  if (fxGid !== g.gid) { fxGid = g.gid; fxSeen = g.logSeq; return; }
  for (const l of g.logs) {
    if (l.n <= fxSeen) continue;
    if (l.k === "dmg" && l.a) { pop(l.t, `-${l.a}`); shake(l.t); }
    else if (l.k === "heal") pop(l.t, `+${l.a}`, "heal");
    else if (l.k === "shield") pop(l.t, `+${l.a}`, "shield");
    else if (l.k === "phase") banner(l.m, g.isTransition() ? "昼と夜の指定カードを同時に使うと秘奥" : "", g.phase);
    else if (l.k === "finisher") banner(OUGI[l.a]?.name || "奥義", `${nameOf(l.t)}の必殺技　${OUGI[l.a]?.desc.split("。")[0] || ""}`, "finisher");
    else if (l.k === "kyoka") banner("鏡花水月", `${nameOf(l.t)}が攻撃を${R.KYOKA_MULT}倍にして跳ね返した`, "counter");
    else if (l.k === "counter") banner("反撃", `${nameOf(l.t)}の反撃の構え`, "counter");
    else if (l.k === "wrath") banner("怒り状態", `${nameOf(l.t)}は攻撃を受けるたびダメージ-${R.WRATH_REDUCE}`, "finisher");
    else if (l.k === "buffget") banner("秘奥獲得", fmt(l.m).split("：")[1] || "", "buff");
  }
  fxSeen = g.logSeq;
}

/* ===== 描画 ===== */
function sideSkeleton(key) {
  $(`side-${key}`).innerHTML = `
    <div class="side-head" id="${key}-head"></div>
    <div class="bars">
      <span>シールド</span><div class="bar"><i class="sh" id="${key}-sh"></i></div><output id="${key}-sho"></output>
      <span>HP</span><div class="bar"><i class="hp" id="${key}-hp"></i></div><output id="${key}-hpo"></output>
    </div>
    ${key === "me" ? `<div class="note">攻撃を受けると、まずシールドが減り、0になるとHPが減る。HPが0で負け。</div>` : ""}
    <div class="fx" id="${key}-fx"></div>`;
}
sideSkeleton("enemy"); sideSkeleton("me");
$("track").innerHTML = CYCLE.map((ph, i) => `<div class="cell ${ph}" id="cell-${i}">${{ day: "昼", dusk: "没", night: "夜", dawn: "明" }[ph]}</div>`).join("");

const LOG_CLASS = { heal: "good", shield: "", play: "", counter: "buff", kyoka: "buff", finisher: "buddha", wrath: "buddha", buffget: "buff" };
function renderLog() {
  const el = $("log");
  el.innerHTML = g.logs.map(l => {
    const cls = l.k === "dmg" ? (l.t === seat ? "bad" : "good") : (LOG_CLASS[l.k] ?? l.k);
    return `<p class="${cls}">${fmt(l.m)}</p>`;
  }).join("");
  el.scrollTop = el.scrollHeight;
}

function renderSide(key, p) {
  const i = g.idx(p);
  const chips = [];
  for (const m of p.monsters) chips.push(`<span class="chip mon">${m.name} 攻${m.atk}・残${m.turns}ターン</span>`);
  if (p.counter) chips.push(`<span class="chip buff">反撃の構え</span>`);
  if (p.poison) chips.push(`<span class="chip poison">毒${p.poison}</span>`);
  if (p.bleed) chips.push(`<span class="chip bleed">出血 残${p.bleed}ターン</span>`);
  if (p.wrath) chips.push(`<span class="chip wrath">怒り状態 受けるダメージ-${R.WRATH_REDUCE}・必殺技${finisherBase(p)}</span>`);
  for (const [id, s] of Object.entries(p.stacks)) if (s.length) chips.push(`<span class="chip buddha">${OUGI[id].name} ${s.length}/${R.OUGI_AT}</span>`);
  if (p.kyoka) chips.push(`<span class="chip buff">鏡花水月：攻撃を1回跳ね返せる</span>`);
  if (p.blessing.includes("day")) chips.push(`<span class="chip buddha">天照の加護：昼カード常に1.5倍</span>`);
  if (p.blessing.includes("night")) chips.push(`<span class="chip buddha">月読の加護：夜カード常に1.5倍</span>`);
  if (p.kodoku) chips.push(`<span class="chip poison">蠱毒：与える毒・出血${R.KODOKU_MULT}倍</span>`);
  if (p.shura) chips.push(`<span class="chip bleed">修羅：HPを払うカード${BLOOD.SHURA_MULT}倍</span>`);
  if (p.regenTurns) chips.push(`<span class="chip poison">再生 HP+${p.regen}・残${p.regenTurns}ターン</span>`);
  if (p.recoverHalf) chips.push(`<span class="chip bleed">シールド回復半減</span>`);
  for (const b of BUFF_ORDER) if (p.buffs.has(b)) chips.push(`<span class="chip buff">${BUFFS[b][0]}</span>`);
  if (i !== seat) chips.push(`<span class="chip">手札${p.hand.length}枚</span>`);
  $(`${key}-head`).innerHTML = `<span class="side-name">${nameOf(i)}</span>${chips.join("")}`;
  const hp = Math.max(0, p.hp);
  const hpBar = $(`${key}-hp`);
  hpBar.style.width = `${hp / R.MAX_HP * 100}%`;
  hpBar.classList.toggle("low", hp <= R.MAX_HP / 3);
  $(`${key}-hpo`).textContent = `${hp}/${R.MAX_HP}`;
  $(`${key}-sh`).style.width = `${p.shield / R.SHIELD_CAP * 100}%`;
  $(`${key}-sho`).textContent = `${p.shield}/${R.SHIELD_CAP}`;
}

function cardMain(p, c) {
  if (c.type === "attack") {
    const v = g.preview(p, c);
    const m = g.cardMult(c);
    let extra = m > 1 ? `（${PHASE_JP[g.phase]}で${m}倍）` : "";
    if (c.drain) extra += "与ダメの半分HP回復";
    if (c.rage) extra += `減ったHP${BLOOD.RAGE_STEP}ごとに+1`;
    if (c.recoil) extra += `自分もHP-${c.recoil}`;
    if (c.eclipse && m === 1) extra += "日没・夜明けは2倍";
    return `<big class="${v > c.power ? "boost" : ""}">${v}</big>ダメージ ${extra}`;
  }
  if (c.type === "heal") return `<big>+${c.power}</big>HPを回復${c.cure ? "・毒と出血も治す" : ""}`;
  if (c.type === "poison") return `<big>${c.power}</big>毒を与える（毎ターンHPに直接）`;
  if (c.type === "bleed") return `<big>${c.power}</big>ターン出血。相手はカードを使うたびHP-${R.BLEED_DMG}`;
  if (c.type === "counter") return `<big>½</big>次に受ける攻撃を半分にし、半分を返す`;
  if (c.type === "bloodshield") return `<big>+${c.power}</big>HPを${c.hpcost}払ってシールドを増やす`;
  if (c.type === "regen") return `<big>+${c.power}×${c.turns}</big>毎ターン始めにHP回復`;
  if (c.type === "summon") {
    const per = g.incoming(g.opp(p), g.outgoing(p, c.power, c.attr === g.phase ? R.ATTR_BONUS : 1));
    return `<big class="${per > c.power ? "boost" : ""}">${per}×${c.turns}</big>毎ターン攻撃する仲間`;
  }
  const k = stackOf(p, c.id).length, next = k + 1;
  const hint = next >= R.OUGI_AT ? `次で必殺技：${OUGI[c.id].desc.split("＋")[0]}`
    : c.id === "buddha" && next >= R.WRATH_AT ? "次で怒り状態" : `${R.OUGI_AT}枚で必殺技`;
  return `<big>${k}/${R.OUGI_AT}</big>${hint}。1ターン1枚`;
}

function myTurnNow() { return !!g && !busy && !g.over && !g.pending && g.turnIdx === seat; }

function guideHTML(me) {
  if (g.over) return `<div class="guide-title">試合終了</div>`;
  if (g.pending?.type === "reflect") {
    return g.pending.seat === seat
      ? `<div class="guide-title">鏡花水月</div><div class="guide-text">跳ね返すかどうか選ぼう。</div>`
      : `<div class="guide-title">${nameOf(g.pending.seat)}が鏡花水月を使うか選んでいる</div><div class="guide-text">少し待とう。</div>`;
  }
  if (g.turnIdx !== seat) {
    return mode === "ai"
      ? `<div class="guide-title">敵のターン</div><div class="guide-text">敵が行動している。少し待とう。</div>`
      : `<div class="guide-title">相手のターン</div><div class="guide-text">相手が操作している。相手がターンを終えると、ここに反映される。</div>`;
  }
  const endBtn = `<button class="btn primary" data-act="end">ターン終了</button>`;
  if (me.wrath) return `<div class="guide-row"><div><div class="guide-title">怒り状態</div><div class="guide-text">仏の怒り以外のカードは使えない。攻撃を受けるたびにダメージ-${R.WRATH_REDUCE}（毒と出血は減らない）。待ったターンごとに必殺技が強くなる（今は${finisherBase(me)}）。4枚目の仏の怒りを引いたら使おう。</div></div>${endBtn}</div>`;
  const pairs = g.pairOptions(me);
  if (pairs.length) {
    return `<div class="guide-title">今は${PHASE_JP[g.phase]}。昼と夜の指定カードを同時に使うと${HIOU_NAME[me.hiou || "balanced"]}</div>
      <div class="pairs">${pairs.map(([d, n]) => `<button class="btn" data-act="pair" data-d="${d.uid}" data-n="${n.uid}">${d.name}＋${n.name}を同時に使う（シールド-${g.shieldCost(me, d) + g.shieldCost(me, n)}）</button>`).join("")}</div>
      <div class="guide-row"><div class="guide-text">組み合わせを選べる。秘奥の同時使用は1ターン${R.PLAY_LIMIT}枚に数えない。${playsLeftText(me)}</div>${endBtn}</div>`;
  }
  let hint;
  if (me.bleed) hint = `<b>出血中</b>：カードを「使う」たびにHP-${R.BLEED_DMG}。応急処置で治せる。`;
  else if (g.isTransition() && me.buffRound === g.round) hint = "秘奥を獲得した。あとは普通に戦おう。";
  else if (g.isTransition()) hint = `今は${PHASE_JP[g.phase]}だが、昼と夜の指定カードが手札に揃っていない。日蝕は今2倍。`;
  else {
    const [k, nxt] = g.roundsToTransition();
    hint = `あと${k}巡で${PHASE_JP[nxt]}。昼と夜の<b>指定カード</b>（★の付いたカード）を1枚ずつ手札に残しておこう。`;
  }
  return `<div class="guide-row"><div><div class="guide-title">あなたのターン</div>
    <div class="guide-text"><b>${playsLeftText(me)}</b>（使う・回復・奥義を数える）。${hint}</div></div>${endBtn}</div>`;
}
function playsLeftText(p) {
  const left = Math.max(0, R.PLAY_LIMIT - (p.plays || 0));
  return left ? `このターンあと${left}枚使える` : "このターンはもうカードを使えない";
}

function render() {
  if (!g) return;
  const me = g.players[seat], en = g.players[1 - seat];
  const myTurn = myTurnNow();
  document.documentElement.dataset.phase = g.phase;
  $("modeFlag").textContent = mode === "online" ? `オンライン・部屋 ${room?.code || ""}` : "AI対戦";

  const idx = (g.round - 1) % CYCLE.length;
  CYCLE.forEach((_, i) => {
    const cell = $(`cell-${i}`);
    cell.classList.toggle("cur", i === idx);
    cell.classList.toggle("past", i < idx);
  });
  $("phaseName").textContent = `第${g.round}巡　${PHASE_JP[g.phase]}`;
  const [k, nxt] = g.roundsToTransition();
  const esc = g.escalation();
  $("phaseInfo").textContent = (k === 0 ? "秘奥のチャンス・日蝕が2倍" : `次の${PHASE_JP[nxt]}まであと${k}巡${g.phase === "day" || g.phase === "night" ? `　${PHASE_JP[g.phase]}のカードが1.5倍` : ""}`)
    + (esc > 1 ? `　日蝕の深まり：全ダメージ×${esc}` : "");

  renderSide("enemy", en);
  renderSide("me", me);
  renderLog();

  const guide = $("guide");
  guide.innerHTML = guideHTML(me);
  guide.classList.toggle("big", myTurn && g.pairOptions(me).length > 0);

  $("deckInfo").textContent = `${me.hand.length}枚　デッキ残り${me.deck.length}`;
  $("hand").innerHTML = me.hand.map(c => {
    const mark = me.designated.day.includes(c.id) ? "★昼の指定" : me.designated.night.includes(c.id) ? "★夜の指定" : "";
    const canUse = myTurn && g.canPlay(me, c, "use");
    const canRec = myTurn && g.canPlay(me, c, "recover");
    const cost = g.shieldCost(me, c);
    const short = Math.max(0, cost - me.shield);
    const special = isOugi(c);
    const useLabel = isOugi(c) ? `<span>溜める</span>${me.stackUsed.includes(c.id) ? "<span>今ターンは使用済み</span>" : ""}`
      : `<span>使う</span><span>${[cost ? `シールド-${cost}${short ? `（HP-${short}）` : ""}` : "", c.hpcost ? `HP-${c.hpcost}` : ""].filter(Boolean).join("・") || "消費なし"}</span>`;
    return `<div class="card a-${c.attr} t-${c.type}${canUse || canRec ? "" : " off"}">
      ${mark ? `<span class="c-mark">${mark}</span>` : ""}
      <span class="c-top"><span>${special ? "特殊" : ATTR_JP[c.attr] + "属性"}</span><span>${TYPE_JP[c.type]}</span></span>
      <span class="c-name">${c.name}</span>
      <span class="c-main">${cardMain(me, c)}</span>
      <span class="c-btns">
        <button class="c-btn use" data-act="use" data-uid="${c.uid}" ${canUse ? "" : "disabled"}>${useLabel}</button>
        ${special ? "" : `<button class="c-btn rec" data-act="rec" data-uid="${c.uid}" ${canRec ? "" : "disabled"}><span>回復</span><span>シールド+${c.recover}</span></button>`}
      </span>
    </div>`;
  }).join("") || `<p style="margin:0;color:var(--muted)">手札がない</p>`;

  runFx();
}

/* ===== ダイアログ ===== */
function showDialog(html, kind = "") { $("dialog").innerHTML = html; $("dialog").dataset.kind = kind; $("overlay").hidden = false; $("dialog").querySelector("button, input")?.focus(); }
function hideDialog() { $("overlay").hidden = true; $("dialog").dataset.kind = ""; }

function howToHTML() {
  return `<ol>
    <li><b>カードの「使う」</b>を押すと、シールドを消費して攻撃や回復ができる。<b>「回復」</b>を押すと、そのカードを捨ててシールドを増やせる。<b>1ターンに使えるのは${R.PLAY_LIMIT}枚まで</b>。</li>
    <li>シールドは<b>攻撃のコスト</b>であり、<b>敵の攻撃を受け止める壁</b>でもある。攻めるほど守りが薄くなる。終わったら<b>ターン終了</b>。</li>
    <li>${PHASE_ROUNDS}巡ごとに<b>日没</b>と<b>夜明け</b>が来る。そのとき昼と夜の<b>指定カード</b>を1枚ずつ同時に使うと、試合中ずっと続く<b>秘奥</b>がもらえる（${R.PLAY_LIMIT}枚には数えない）。選べる秘奥はデッキのタイプで変わる。</li>
  </ol>`;
}
function showHowTo() {
  const names = ids => ids.map(id => `<b>${CARDS[id].name}</b>`).join("・");
  const me = g?.players[seat];
  showDialog(`<h2>遊び方</h2>${howToHTML()}
    ${me ? `<p>この試合の指定カード　昼：${names(me.designated.day)}　夜：${names(me.designated.night)}</p>
      <p>あなたのデッキの秘奥：<b>${HIOU_NAME[me.hiou || "balanced"]}</b>（${HIOU_SETS[me.hiou || "balanced"].map(b => BUFFS[b][0]).join("・")}）</p>` : ""}
    <button class="btn" data-act="close">閉じる</button>`, "howto");
}

function showPending() {
  if (!g.pending || g.pending.seat !== seat) return;
  const me = g.players[seat];
  if (g.pending.type === "reflect") {
    const pd = g.pending, back = Math.floor(pd.amt * R.KYOKA_MULT + 0.5);
    showDialog(`<h2>鏡花水月</h2>
      <p>${nameOf(pd.atk)}の<b>${pd.src}</b>が来る（${pd.amt}ダメージ）。</p>
      <p>跳ね返すと、${nameOf(pd.atk)}に<b>${back}ダメージ</b>を返し、あなたは無傷。鏡花水月は1回しか使えない。</p>
      <div class="join">
        <button class="btn" data-reflect="yes">跳ね返す</button>
        <button class="btn sub" data-reflect="no">受けて温存する</button>
      </div>`, "pending");
    return;
  }
  if (g.pending.type === "buff") {
    showDialog(`<h2>${PHASE_JP[g.phase]}の${HIOU_NAME[me.hiou || "balanced"]}</h2><p>1つ選んでください。試合中ずっと続き、同じものは二度と取れません。</p>
      ${g.pending.opts.map(b => `<button class="opt" data-buff="${b}"><b>${BUFFS[b][0]}</b><span>${BUFFS[b][1]}</span></button>`).join("")}`, "pending");
  } else {
    const counts = {};
    for (const c of me.deck) if (!isOugi(c)) (counts[c.id] ||= { c, n: 0 }).n++;
    showDialog(`<h2>サーチ</h2><p>デッキから手札に加えるカードを選んでください。</p>
      ${Object.values(counts).map(({ c, n }) => `<button class="opt" data-search="${c.uid}"><b>${c.name}（${ATTR_JP[c.attr]}・${TYPE_JP[c.type]}）</b><span>デッキに${n}枚　消費${c.cost}／回復+${c.recover}</span></button>`).join("")}`, "pending");
  }
}

function showFinish() {
  const me = g.players[seat];
  const [title, text] = g.winnerIdx === seat ? ["勝利", `第${g.round}巡で${nameOf(1 - seat)}を倒した。`]
    : g.winnerIdx != null ? ["敗北", `第${g.round}巡で倒された。`]
    : ["引き分け", "決着がつかなかった。"];
  showDialog(`<h2>${title}</h2><p>${text}獲得した秘奥：${[...me.buffs].map(b => BUFFS[b][0]).join("・") || "なし"}</p>
    <div class="join">
      <button class="btn" data-act="again">${mode === "online" ? "同じ相手ともう一度" : "もう一度遊ぶ"}</button>
      <button class="btn sub" data-act="menu">メニューへ</button>
    </div>`, "finish");
}

/* ===== 自分のデッキ（保存と編集） =====
   ブラウザに保存し、claude.ai で開いているときは自分専用の保存場所（data/users/<id>/deck）にも保存して別の端末でも使えるようにする */
const DECK_KEY = "eclipse-deck";
let myDeck = loadLocalDeck();   // { name, cards: {id: 枚数} }
let draft = null;               // 編集中のデッキ

function cleanDeck(d) {
  const cards = sanitizeDeck(d?.cards);
  const chosen = d?.designated && typeof d.designated === "object" ? d.designated : {};
  const designated = {};   // 選んだ指定カードのうち、デッキに入っていて属性が合うものだけ残す
  for (const attr of ["day", "night"])
    designated[attr] = (Array.isArray(chosen[attr]) ? chosen[attr] : [])
      .filter(id => cards[id] && CARDS[id].attr === attr && !isOugi(CARDS[id])).slice(0, DESIGNATED_PER_ATTR);
  return { name: String(d?.name || "マイデッキ").slice(0, 20), cards, designated };
}
function loadLocalDeck() {
  try { const d = JSON.parse(localStorage.getItem(DECK_KEY) || "null"); if (d?.cards) return cleanDeck(d); } catch {}
  return { name: PRESETS[DEFAULT_PRESET].name, cards: { ...DECK } };
}
async function loadCloudDeck() {
  if (backend !== "claude") return;   // 自分のサイトではデッキはこの端末のブラウザにだけ保存する
  try {
    const s = await dbApi.doc(`data/users/${uid}/deck`).get();
    if (s.exists) { myDeck = cleanDeck(s.data()); try { localStorage.setItem(DECK_KEY, JSON.stringify(myDeck)); } catch {} }
  } catch {}
}
async function saveDeck(deck) {
  myDeck = cleanDeck(deck);
  try { localStorage.setItem(DECK_KEY, JSON.stringify(myDeck)); } catch {}
  if (backend === "claude") { try { await dbApi.doc(`data/users/${uid}/deck`).set({ name: myDeck.name, cards: myDeck.cards }); } catch {} }
}

/* デッキ編集画面に出すカードの説明（試合中でなくても出せる固定の文） */
function cardBrief(c, id = c.id) {   // カード一覧（CARDS）の中身には id が入っていないので、呼ぶ側から渡す
  switch (c.type) {
    case "attack": return `${c.power}ダメージ${c.drain ? "・与ダメの半分HP回復" : ""}${c.recoil ? `・自分もHP-${c.recoil}` : ""}${c.eclipse ? "・日没と夜明けは2倍" : ""}${c.rage ? `・減ったHP${BLOOD.RAGE_STEP}ごとに+1` : ""}${c.hpcost ? `・HPを${c.hpcost}払う` : ""}`;
    case "heal": return `HP+${c.power}${c.cure ? "・毒と出血を治す" : ""}`;
    case "poison": return `毒${c.power}（毎ターンHPに直接）`;
    case "bleed": return `${c.power}ターン出血（カードを使うたびHP-${R.BLEED_DMG}）`;
    case "counter": return "次に受ける攻撃を半分にし、半分を返す";
    case "bloodshield": return `HPを${c.hpcost}払ってシールド+${c.power}`;
    case "regen": return `${c.turns}ターンの間、毎ターンHP+${c.power}`;
    case "summon": return `攻撃${c.power}の仲間×${c.turns}ターン`;
    case "buddha": case "ougi": return `${R.OUGI_AT}枚目で必殺技：${OUGI[id]?.desc || ""}`;
  }
  return "";
}

function showDeckEditor() {
  draft = { name: myDeck.name, cards: { ...myDeck.cards }, designated: JSON.parse(JSON.stringify(myDeck.designated || {})) };
  renderDeckEditor();
}
function renderDeckEditor() {
  const dlg = $("dialog");
  const scroll = dlg.scrollTop;
  const focus = document.activeElement?.dataset;
  const focusKey = focus?.act ? `${focus.act}|${focus.id || focus.p || ""}` : "";
  const def = draft.cards;
  const size = deckSize(def), probs = deckProblems(def), warns = deckWarnings(def);
  const byAttr = attr => Object.entries(def).filter(([id]) => CARDS[id].attr === attr && !isOugi(CARDS[id])).reduce((a, [, n]) => a + n, 0);
  const ougiCount = Object.entries(def).filter(([id]) => isOugi(CARDS[id])).reduce((a, [, n]) => a + n, 0);
  const chosen = draft.designated || {};
  const finalDes = autoDesignated(def, chosen);   // 選んでいない分は自動で埋めた結果
  const desName = attr => finalDes[attr].map(id => `${CARDS[id].name}${(chosen[attr] || []).includes(id) ? "" : "（自動）"}`).join("・") || "なし";
  const row = (id, c) => {
    const n = def[id] || 0;
    const canDes = (c.attr === "day" || c.attr === "night") && !isOugi(c);
    const isDes = canDes && (chosen[c.attr] || []).includes(id);
    return `<div class="dk-row">
      <div class="dk-info"><b>${c.name}</b><span>${TYPE_JP[c.type]}　${cardBrief(c, id)}</span><span class="dk-cost">消費${c.cost}／回復+${c.recover}</span></div>
      ${canDes ? `<button class="dk-des${isDes ? " on" : ""}" data-act="dk-des" data-id="${id}" ${n ? "" : "disabled"} aria-pressed="${isDes}">★指定</button>` : ""}
      <div class="dk-count">
        <button class="dk-btn" data-act="dk-minus" data-id="${id}" ${n ? "" : "disabled"} aria-label="${c.name}を1枚減らす">−</button>
        <output class="${n ? "" : "zero"}">${n}</output>
        <button class="dk-btn" data-act="dk-plus" data-id="${id}" ${n >= maxCopies(id) ? "disabled" : ""} aria-label="${c.name}を1枚増やす">＋</button>
      </div>
    </div>`;
  };
  const group = (attr, label) => `<h3 class="dk-group g-${attr}">${label}</h3>` +
    Object.entries(CARDS).filter(([, c]) => (attr === "ougi" ? isOugi(c) : c.attr === attr && !isOugi(c))).map(([id, c]) => row(id, c)).join("");
  const html = `<h2>デッキ編集</h2>
    <div class="dk-presets"><span>見本から読み込む</span>
      ${Object.entries(PRESETS).map(([k, p]) => `<button class="btn sub small" data-act="dk-preset" data-p="${k}">${p.name}</button>`).join("")}
    </div>
    <div class="dk-summary">
      <b class="${probs.length ? "ng" : ""}">${size}枚</b>
      <span>昼${byAttr("day")}・夜${byAttr("night")}・無${byAttr("none")}・奥義${ougiCount}</span>
      <span>秘奥：<b class="dk-type">${HIOU_NAME[deckType(def)]}</b>（${HIOU_SETS[deckType(def)].map(b => BUFFS[b][0]).join("・")}）</span>
      <span>指定カード　昼：${desName("day")}　夜：${desName("night")}</span>
    </div>
    <p class="dk-rule">★指定で、日没・夜明けの秘奥に使うカードを昼2種・夜2種まで選べる（発動には昼1枚＋夜1枚）。選ばなかった分は枚数の多いカードが自動で入る。</p>
    <p class="dk-rule">${R.DECK_MIN}〜${R.DECK_MAX}枚。同じカードは${R.MAX_COPIES}枚まで（仏の怒りは${R.BUDDHA_MAX}枚まで）。</p>
    ${[...probs.map(t => `<p class="msg">${t}</p>`), ...warns.map(t => `<p class="msg warn">${t}</p>`)].join("")}
    ${group("day", "昼属性：昼に1.5倍")}${group("night", "夜属性：夜に1.5倍")}${group("none", "無属性")}${group("ougi", `奥義：${R.OUGI_AT}枚溜めると必殺技`)}
    <div class="join dk-foot">
      <button class="btn" data-act="dk-save" ${probs.length ? "disabled" : ""}>保存して戻る</button>
      <button class="btn sub" data-act="menu">保存せずに戻る</button>
    </div>`;
  if (dlg.dataset.kind === "deck") dlg.innerHTML = html; else showDialog(html, "deck");
  dlg.scrollTop = scroll;
  if (focusKey) {
    const [act, key] = focusKey.split("|");
    const el = [...dlg.querySelectorAll(`[data-act="${act}"]`)].find(b => (b.dataset.id || b.dataset.p || "") === key);
    (el && !el.disabled ? el : dlg.querySelector("[data-act=dk-save]:not(:disabled), [data-act=menu]"))?.focus({ preventScroll: true });
  }
}
function deckEdit(act, b) {
  if (act === "dk-plus" || act === "dk-minus") {
    const id = b.dataset.id;
    const n = (draft.cards[id] || 0) + (act === "dk-plus" ? 1 : -1);
    if (n < 0 || n > maxCopies(id)) return;
    if (n) draft.cards[id] = n; else {
      delete draft.cards[id];
      for (const attr of ["day", "night"]) if (draft.designated?.[attr]) draft.designated[attr] = draft.designated[attr].filter(x => x !== id);
    }
    draft.name = "マイデッキ";
  } else if (act === "dk-preset") {
    const p = PRESETS[b.dataset.p];
    draft = { name: p.name, cards: { ...p.cards }, designated: {} };
  } else if (act === "dk-des") {   // 指定カードの選択・解除（各属性2種まで。3種目を選ぶと古い方が外れる）
    const id = b.dataset.id, attr = CARDS[id].attr;
    draft.designated ||= {};
    const list = draft.designated[attr] || [];
    if (list.includes(id)) draft.designated[attr] = list.filter(x => x !== id);
    else draft.designated[attr] = [...list, id].slice(-DESIGNATED_PER_ATTR);
  }
  renderDeckEditor();
}

/* ===== メニュー ===== */
function showMenu(msg = "", ok = false) {
  const saved = loadSavedRoom();
  let online;
  if (onlineState === "loading") online = `<p>オンライン対戦を準備中…</p>`;
  else if (onlineState === "off") online = `<p>オンライン対戦の準備ができていない（claude.ai で開くか、firebase-config.js に Firebase の設定を書くと使える）。</p>`;
  else if (canWrite === false) online = `<p>この共有設定では対戦データを保存できない。ページの持ち主に「編集者」として招待してもらおう。</p>`;
  else online = `
    <div class="join">
      <button class="btn" data-act="mkroom">部屋を作る</button>
      ${saved ? `<button class="btn sub" data-act="resume">部屋 ${saved} に戻る</button>` : ""}
    </div>
    <div class="join">
      <input id="codeIn" maxlength="4" placeholder="コード" autocomplete="off" aria-label="部屋コード">
      <button class="btn sub" data-act="join">コードで入る</button>
    </div>`;
  showDialog(`<h2>Eclipse Cards</h2>
    ${howToHTML()}
    <h3>デッキ</h3>
    <div class="join"><span class="deckname">使うデッキ：<b>${myDeck.name}</b>（${deckSize(myDeck.cards)}枚・${HIOU_NAME[deckType(myDeck.cards)]}）</span>
      <button class="btn sub" data-act="deck">デッキ編集</button></div>
    <h3>AIと対戦</h3>
    <div class="join"><button class="btn" data-act="ai">AIと対戦する</button></div>
    <h3>オンライン対戦</h3>
    ${online}
    <p class="msg${ok ? " ok" : ""}" id="menuMsg">${msg}</p>`, "menu");
}

/* ===== AI対戦 ===== */
function startAI() {
  leaveRoom();
  gameId++;
  mode = "ai"; seat = 0; busy = false;
  const keys = Object.keys(PRESETS);
  const enemy = PRESETS[keys[Math.floor(Math.random() * keys.length)]];
  g = new Game({ ai: [false, true], firstIdx: Math.random() < 0.5 ? 0 : 1, decks: [myDeck.cards, enemy.cards], designated: [myDeck.designated, null] });
  g.log(`試合開始。先攻は@${g.firstIdx}。@0のデッキ：${myDeck.name}／@1のデッキ：${enemy.name}`, "phase");
  hideDialog();
  render();
  runAITurn(gameId);
}
async function runAITurn(id) {
  if (id !== gameId || mode !== "ai") return;
  if (g.over) return finish();
  const p = g.active;
  g.startTurn(p);
  render();
  if (g.over) return finish();
  if (!p.isAI) { busy = false; render(); return; }
  busy = true; render();
  await sleep(700);
  for (let i = 0; i < 80 && !g.over; i++) {
    if (id !== gameId) return;
    const a = AI.pick(g, p);
    if (!a) break;
    const ok = a[0] === "pair" ? g.playPair(p, a[1], a[2]) : g.play(p, a[0], a[1]);
    if (!ok) break;   // 使えないカードを選んだら、そのターンは終える（止まらないように）
    render();
    if (g.pending) {   // あなたが鏡花水月を使うか選ぶのを待つ
      showPending();
      while (g.pending && id === gameId) await sleep(150);
      if (id !== gameId) return;
      render();
    }
    await sleep(850);
  }
  if (id !== gameId) return;
  if (g.over) return finish();
  g.endTurn(p);
  render();
  if (g.over) return finish();
  await sleep(500);
  runAITurn(id);
}
function finish() { busy = false; render(); setTimeout(showFinish, 900); }

/* ===== 自分の操作（AI戦・オンライン共通） ===== */
function afterMyAction() {
  render();
  if (mode === "online") save();
  if (g.over) return finish();
  if (g.pending) showPending();
}
function humanPlay(uid, m) { if (myTurnNow() && g.play(g.players[seat], uid, m)) afterMyAction(); }
function humanPair(d, n) { if (myTurnNow() && g.playPair(g.players[seat], d, n)) afterMyAction(); }
async function endMyTurn() {
  if (!myTurnNow()) return;
  g.endTurn(g.players[seat]);
  if (mode === "online") {
    if (!g.over) g.startTurn(g.active);   // 相手のターン開始（ドロー）までこちらで進めて保存する
    render(); save();
    if (g.over) finish();
    return;
  }
  const id = gameId;
  busy = true;
  render();
  if (g.over) return finish();
  await sleep(450);
  runAITurn(id);
}

/* ===== オンライン対戦 =====
   部屋ごとに games/<コード> の1ドキュメント。手番のプレイヤーだけが盤面を書き込み、相手は変更を受け取って描画する。
   claude.ai で開いたときは claude.ai の共有データ、自分のサイト（GitHub Pages など）で開いたときは Firebase を使う。
   どちらも doc(path) → { get, set, onSnapshot, acquire } の同じ形で扱う。 */
let dbApi = null, userApi = null, uid = null, canWrite = null, onlineState = "loading";
let backend = null;         // "claude" | "firebase" | null
let room = null;            // { code, ref, unsub, hostId, guestId }
let localSeq = 0;
let writeChain = Promise.resolve();
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SAVE_KEY = "eclipse-room";

function loadSavedRoom() { try { return localStorage.getItem(SAVE_KEY) || ""; } catch { return ""; } }
function storeRoom(code) { try { code ? localStorage.setItem(SAVE_KEY, code) : localStorage.removeItem(SAVE_KEY); } catch {} }

/* ---- Firebase（自分のサイトで公開したとき） ----
   firebase-config.js に window.FIREBASE_CONFIG があれば使う。アカウントは不要で、端末ごとにランダムなIDを作る。
   Realtime Database は空の配列や null を保存しないので、中身は JSON の文字列にして1つの値として保存する。 */
const FIREBASE_VER = "10.12.2";
function loadScript(src) {
  return new Promise((ok, ng) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ng; document.head.appendChild(s); });
}
function localUid() {
  try {
    let id = localStorage.getItem("eclipse-uid");
    if (!id) { id = "p_" + Math.random().toString(36).slice(2, 12); localStorage.setItem("eclipse-uid", id); }
    return id;
  } catch { return "p_" + Math.random().toString(36).slice(2, 12); }
}
function firebaseDb() {
  const fdb = firebase.database();
  const snap = s => { const raw = s.val(); const v = raw?.json ? JSON.parse(raw.json) : null; return { exists: v != null, data: () => v }; };
  return {
    doc(path) {
      const ref = fdb.ref(path);
      return {
        async get() { return snap(await ref.get()); },
        async set(v) { await ref.set({ json: JSON.stringify(v), updated: Date.now() }); },
        /* 短い時間だけ部屋を押さえる（2人が同時に入ろうとしたとき用） */
        async acquire({ holder, ttlMs = 5000 }) {
          const r = await fdb.ref(`locks/${path}`).transaction(cur => (!cur || cur.until < Date.now() || cur.holder === holder) ? { holder, until: Date.now() + ttlMs } : undefined);
          return { acquired: r.committed };
        },
        onSnapshot(next, error) {
          const cb = s => next(snap(s));
          ref.on("value", cb, e => error?.(e));
          return () => ref.off("value", cb);
        },
      };
    },
  };
}
async function connectFirebase(config) {
  await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-app-compat.js`);
  await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-database-compat.js`);
  if (!firebase.apps.length) firebase.initializeApp(config);
  return firebaseDb();
}

(async () => {
  try {
    if (window.claude?.use) {
      [dbApi, userApi] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (userApi) { uid = await userApi.id(); canWrite = await userApi.can("data.write"); }
      if (dbApi && uid) backend = "claude";
    }
  } catch { dbApi = null; }
  if (!backend && window.FIREBASE_CONFIG) {
    try { dbApi = await connectFirebase(window.FIREBASE_CONFIG); uid = localUid(); canWrite = true; backend = "firebase"; }
    catch { dbApi = null; }
  }
  onlineState = backend ? "on" : "off";
  await loadCloudDeck();
  if ($("dialog").dataset.kind === "menu") showMenu();
})();

function menuMsg(text, ok = false) { const el = $("menuMsg"); if (el) { el.textContent = text; el.classList.toggle("ok", ok); } }
function newCode() { return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(""); }
function dbErr(e) {
  const c = e?.code;
  if (backend === "firebase" && /permission/i.test(`${c} ${e?.message}`))
    return "Firebase に保存できなかった。Firebase の Realtime Database のルールを手順書どおりに設定したか確認しよう。";
  if (c === "invalid_argument") return "保存できなかった。このページを「編集者」として共有してもらっているか確認しよう。";
  if (c === "quota_exceeded") return "保存領域がいっぱいで部屋を作れない。";
  return "通信できなかった。少し待ってからもう一度試そう。";
}

function leaveRoom() {
  room?.unsub?.();
  room = null; localSeq = 0;
}

async function createRoom() {
  menuMsg("部屋を作っています…", true);
  try {
    let code, ref;
    for (let i = 0; i < 5; i++) {
      code = newCode(); ref = dbApi.doc(`games/${code}`);
      const s = await ref.get();
      if (!s.exists || s.data().status === "over" && Date.now() - (s.data().updated || 0) > 864e5) break;
      code = null;
    }
    if (!code) return menuMsg("部屋コードを作れなかった。もう一度押そう。");
    await ref.set({ v: 1, status: "waiting", hostId: uid, guestId: null, hostDeck: myDeck.cards, guestDeck: null,
                    hostDes: myDeck.designated || null, guestDes: null,
                    seq: 0, writer: uid, updated: Date.now() });
    enterRoom(code, ref);
    showDialog(`<h2>部屋ができた</h2>
      <p>相手にこのコードを伝えて、「コードで入る」から入ってもらおう。</p>
      <div class="roomcode">${code}</div>
      <p>相手が入ると自動で試合が始まる。</p>
      <button class="btn sub" data-act="menu">やめる</button>`, "waiting");
  } catch (e) { menuMsg(dbErr(e)); }
}

async function joinRoom(code) {
  code = (code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return menuMsg("4文字のコードを入力しよう。");
  menuMsg("部屋を探しています…", true);
  try {
    const ref = dbApi.doc(`games/${code}`);
    let s = await ref.get();
    if (!s.exists) return menuMsg("その部屋は見つからない。コードを確認しよう。");
    let d = s.data();
    if (d.hostId === uid || d.guestId === uid) { enterRoom(code, ref); hideDialog(); return; }   // 自分の部屋に戻る
    if (d.guestId) return menuMsg("その部屋はもう2人そろっている。");
    const lease = await ref.acquire({ holder: uid, ttlMs: 5000 });
    if (!lease.acquired) return menuMsg("相手が同時に入ろうとしている。少し待ってもう一度。");
    s = await ref.get(); d = s.data();
    if (d.guestId && d.guestId !== uid) return menuMsg("その部屋はもう2人そろっている。");
    const hostDeck = sanitizeDeck(d.hostDeck);
    const ng = new Game({ ai: [false, false], firstIdx: Math.random() < 0.5 ? 0 : 1, decks: [hostDeck, myDeck.cards],
                          designated: [d.hostDes, myDeck.designated] });
    ng.log(`試合開始。先攻は@${ng.firstIdx}`, "phase");
    ng.startTurn(ng.active);
    await ref.set({ v: 1, status: "playing", hostId: d.hostId, guestId: uid, hostDeck, guestDeck: myDeck.cards,
                    hostDes: d.hostDes ?? null, guestDes: myDeck.designated || null,
                    seq: (d.seq || 0) + 1, writer: uid, updated: Date.now(), state: ng.serialize() });
    enterRoom(code, ref);
    hideDialog();
  } catch (e) { menuMsg(dbErr(e)); }
}

function enterRoom(code, ref) {
  gameId++;   // 走っているAI戦を止める
  leaveRoom();
  mode = "online"; busy = false;
  room = { code, ref, unsub: null };
  storeRoom(code);
  room.unsub = ref.onSnapshot(onRoomSnap, () => {
    showMenu("部屋との接続が切れた。「部屋に戻る」から入り直そう。");
  });
}

function onRoomSnap(snap) {
  if (!room || !snap.exists) return;
  const d = snap.data();
  room.hostId = d.hostId; room.guestId = d.guestId;
  room.hostDeck = d.hostDeck ?? null; room.guestDeck = d.guestDeck ?? null;
  room.hostDes = d.hostDes ?? null; room.guestDes = d.guestDes ?? null;
  const mySeat = d.hostId === uid ? 0 : d.guestId === uid ? 1 : null;
  if (mySeat === null) { storeRoom(""); leaveRoom(); return showMenu("この部屋の参加者ではない。"); }
  seat = mySeat;
  // 自分の書き込みの反映や古い状態は無視。同じ番号でも相手が書いたもの（同時の再戦など）は相手の版に合わせる
  const sq = d.seq || 0;
  if (!d.state || sq < localSeq || (sq === localSeq && d.writer === uid)) return;
  localSeq = sq;
  g = Game.load(d.state);
  busy = false;
  const kind = $("dialog").dataset.kind;
  if (kind === "waiting" || kind === "finish" || kind === "menu") hideDialog();
  render();
  if (g.over) return finish();
  if (g.pending) showPending();
}

function save() {
  if (!room) return;
  localSeq++;
  const body = { v: 1, status: g.over ? "over" : "playing", hostId: room.hostId, guestId: room.guestId,
                 hostDeck: room.hostDeck ?? null, guestDeck: room.guestDeck ?? null,
                 hostDes: room.hostDes ?? null, guestDes: room.guestDes ?? null,
                 seq: localSeq, writer: uid, updated: Date.now(), state: g.serialize() };
  const ref = room.ref;
  writeChain = writeChain.then(() => ref.set(body)).catch(e => {
    showDialog(`<h2>保存できなかった</h2><p>${dbErr(e)}</p><button class="btn" data-act="close">閉じる</button>`, "error");
  });
}

function rematch() {
  if (!room) return;
  g = new Game({ ai: [false, false], firstIdx: Math.random() < 0.5 ? 0 : 1,
                 decks: [sanitizeDeck(room.hostDeck), sanitizeDeck(room.guestDeck)],
                 designated: [room.hostDes, room.guestDes] });
  g.log(`再戦開始。先攻は@${g.firstIdx}`, "phase");
  g.startTurn(g.active);
  hideDialog();
  render();
  save();
}

/* ===== クリック ===== */
document.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "use") humanPlay(+b.dataset.uid, "use");
  else if (act === "rec") humanPlay(+b.dataset.uid, "recover");
  else if (act === "pair") humanPair(+b.dataset.d, +b.dataset.n);
  else if (act === "end") endMyTurn();
  else if (act === "close") hideDialog();
  else if (act === "deck") showDeckEditor();
  else if (act === "dk-plus" || act === "dk-minus" || act === "dk-preset" || act === "dk-des") deckEdit(act, b);
  else if (act === "dk-save") { saveDeck(draft); showMenu(`「${myDeck.name}」を保存した。次の試合から使われる。`, true); }
  else if (act === "ai") startAI();
  else if (act === "mkroom") createRoom();
  else if (act === "join") joinRoom($("codeIn")?.value);
  else if (act === "resume") joinRoom(loadSavedRoom());
  else if (act === "menu") { if ($("dialog").dataset.kind === "waiting") { leaveRoom(); storeRoom(""); } showMenu(); }
  else if (act === "again") mode === "online" ? rematch() : startAI();
  else if (b.id === "howBtn") showHowTo();
  else if (b.id === "menuBtn") showMenu();
  else if (b.dataset.reflect) {
    if (g.pending?.type !== "reflect" || g.pending.seat !== seat) return;
    g.resolveReflect(b.dataset.reflect === "yes");
    hideDialog();
    render();
    if (mode === "online") save();
    if (g.over) return finish();
    if (g.pending) showPending();
  }
  else if (b.dataset.buff) { g.applyBuff(g.players[seat], b.dataset.buff); hideDialog(); afterMyAction(); }
  else if (b.dataset.search) { g.applySearch(g.players[seat], +b.dataset.search); hideDialog(); afterMyAction(); }
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "codeIn") joinRoom(e.target.value);
});

/* 最初はメニューを出す。裏ではAI戦の盤面を用意しておく */
g = new Game({ ai: [false, true], firstIdx: 0 });
render();
showMenu();
