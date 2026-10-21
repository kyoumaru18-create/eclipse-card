/* Eclipse Cards — ルール・AI・画面・オンライン対戦 */

/* ===== ルール定数（engine.py と同じ値） ===== */
const R = {
  MAX_HP: 40, START_SHIELD: 15, SHIELD_CAP: 30, START_HAND: 6, DRAW: 2, FIRST_DRAW: 1, MAX_MON: 2,
  ATTR_BONUS: 1.5, ECLIPSE_BONUS: 2, ATK_BUFF: 1.2, DEF_BUFF: 0.7, BLEED_DMG: 2,
  WRATH_AT: 3, FINISH_AT: 4, FINISH_DMG: 18, WAIT_BONUS: 2, WRATH_REDUCE: 7, WRATH_DRAW: 2, MAX_ROUNDS: 40,
  ESCALATION: 0.5,   // 日蝕の深まり：昼夜が1周するごとに与えるダメージ+50%（膠着して終わらない試合を防ぐ）
  OUGI_AT: 4,        // 奥義（仏の怒りを含む）：この枚数目を使うと必殺技
  AMATERASU_DMG: 10, TSUKUYOMI_DMG: 10, KODOKU_POISON: 12, KODOKU_MULT: 3, KYOKA_MULT: 1.5,
  DECK_SIZE: 36, MAX_COPIES: 3, BUDDHA_MAX: 4,   // デッキはちょうど36枚。同じカードは3枚まで（奥義は4枚まで）
  KYOKA_CUT: 0.15,   // 鏡花水月を溜めている間、k枚ごとに受ける攻撃をこの割合ずつ減らす（受けた攻撃の半分を返す）
  KARMA_MULT: 1.5,   // 因果応報：溜めた特殊ダメージをこの倍率で、相手のHPに直接返す
  KARMA_HEAL: 0.5,   // 因果応報：溜めた特殊ダメージのこの割合だけ、自分のHPを回復する
  PLAY_LIMIT: 2,     // 1ターンに使えるカードの枚数（使う・回復・奥義を数える。秘奥の同時使用は数えない）
};
const PHASE_ROUNDS = 3;   // 昼・夜それぞれの巡数
const CYCLE = [...Array(PHASE_ROUNDS).fill("day"), "dusk", ...Array(PHASE_ROUNDS).fill("night"), "dawn"];
const PHASE_JP = { day: "昼", dusk: "日没", night: "夜", dawn: "夜明け" };
const ATTR_JP = { day: "昼", night: "夜", none: "無", both: "昼夜" };   // both：昼でも夜でも1.5倍
const TYPE_JP = { attack: "攻撃", heal: "HP回復", poison: "毒", bleed: "出血", counter: "反撃", summon: "召喚", bloodshield: "血の盾", regen: "再生",
  parry: "見切り", karma: "因果応報", thorns: "棘", corrode: "腐食", bloom: "毒の開花", convert: "属性変化",
  draw: "ドロー", sutra: "サーチ", gassho: "シールド", linger: "毒", calm: "守り", dohatsu: "守り", berserk: "強化", koromo: "守り", wait: "反撃", sunshield: "シールド", shieldbreak: "シールド破壊", nembutsu: "シールド", guard: "守り", buddha: "奥義", ougi: "奥義" };
const MONSTER_EXPECT = 3;   // モンスターが倒されるまでに攻撃する回数の目安（AIの見積もり用）
const REVENGE_RATE = 0.5;   // 報復：前の相手ターンに受けたダメージのこの割合を上乗せ
const BLOOD = { SHURA_HEAL: 10, SHURA_MULT: 1.25, RAGE_STEP: 4 };   // 自傷デッキ用（修羅の回復量・倍率、狂血の増え方）
/* パックの奥義の数値（engine.py と同じ） */
const NEW_OUGI = { GYOKUTO_DMG: 16, GYOKUTO_CHARGE: 1, NEHAN_HEAL: 20, NEHAN_CHARGE: 1, MEIKYO_CHARGE: 3, MEIKYO_CUT: 5, CHIMATSURI_CHARGE: 2 };
/* 奥義：4枚溜めると必殺技（同じ奥義は1ターン1枚） */
/* charge(k)：k枚（1〜3）溜めている間の効果。4枚目で必殺技を撃つとリセット */
const OUGI = {
  buddha:    { name: "仏の怒り", desc: "18ダメージ（怒り状態で待ったターンごとに+2）。3枚目から怒り状態（受けるダメージ-7・「怒り状態でも使える」カードと仏の怒りしか使えない）",
               charge: k => k >= R.WRATH_AT ? `怒り状態：受ける攻撃-${R.WRATH_REDUCE}` : `受ける攻撃-${2 * k}` },
  amaterasu: { name: "天照",     desc: "10ダメージ＋以降、自分の昼カードは常に1.5倍", charge: k => `昼カードのダメージ+${2 * k}` },
  tsukuyomi: { name: "月読",     desc: "10ダメージ＋以降、相手のシールド回復量が半分・自分の夜カードは常に1.5倍", charge: k => `相手のシールド回復-${k}` },
  kodoku:    { name: "蠱毒",     desc: "相手に毒8＋以降、自分が与える毒と出血のダメージが3倍", charge: k => `毎ターン相手のHPに直接${k}` },
  kyoka:     { name: "鏡花水月", desc: "相手の攻撃カードを1回だけ1.5倍にして跳ね返せる（受けるときに選ぶ）",
               charge: k => `受ける攻撃-${Math.round(R.KYOKA_CUT * k * 100)}%・受けた半分を返す` },
  shura:     { name: "修羅",     desc: "HP10回復＋以降、HPを払うカードのダメージが1.25倍", charge: k => `HPを払うカードのダメージ+${k}` },
  /* ここから下はカードパックで手に入る奥義 */
  kinu:      { name: "金烏",     desc: "陽光+2＋そのターンは影討ち（使えるカード3枚・与えるダメージ2倍）", charge: k => `昼カードを使うたびシールド+${k}` },
  gyokuto:   { name: "玉兎",     desc: `${NEW_OUGI.GYOKUTO_DMG}ダメージ＋相手の手札を1枚捨てさせる`, charge: k => `相手のターンの始めに相手のシールド-${NEW_OUGI.GYOKUTO_CHARGE * k}` },
  ekishin:   { name: "疫神",     desc: "相手の毒を2倍にする", charge: k => `毒を与えるたび毒+${k}` },
  meikyo:    { name: "明鏡止水", desc: "次の自分のターンまで、受ける攻撃を0にしてそのまま返す",
               charge: k => `受ける攻撃-${NEW_OUGI.MEIKYO_CUT * k}・反撃の構えで返す量+${NEW_OUGI.MEIKYO_CHARGE * k}` },
  nehan:     { name: "涅槃",     desc: `HP+${NEW_OUGI.NEHAN_HEAL}＋毒と出血を治す`, charge: k => `毎ターンHP+${NEW_OUGI.NEHAN_CHARGE * k}` },
  chimatsuri:{ name: "血祭り",   desc: "減っているHPの半分を相手に与える", charge: k => `HPを払うたび相手のHPに直接${NEW_OUGI.CHIMATSURI_CHARGE * k}` },
};
/* このターンに使えるカードの枚数（痺れていれば減る。最低1枚） */
function playLimit(p) { return Math.max(1, (p.kageuchi ? KAGEUCHI_LIMIT : R.PLAY_LIMIT) - (p.numb || 0)); }
function charge(p, key) { return (p.stacks?.[key] || []).length; }
/* 昼は、毒のダメージが半分・毒の減り方が2倍（engine.py と同じ） */
const DAY_POISON_CUT = 0.5, DAY_POISON_DECAY = 2, NIGHT_POISON_MULT = 1;
/* モンスターの特徴 */
function monExtra(c) {
  return (c.mpoison ? `・当たると毒${c.mpoison}` : "") + (c.mthorn ? `・場にいる間、あなたが攻撃されるたび${c.mthorn}返す` : "")
    + (c.mzeal ? "・仏の怒りの溜め1つごとに攻撃+1" : "") + (c.mdrain ? `・攻撃するたびHP+${c.mdrain}` : "") + (c.hpcost ? `・HPを${c.hpcost}払う` : "");
}
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
/* 昼特化・夜特化は秘奥のかわりに、自分の場がずっと白夜（昼）・極夜（夜）。日没・夜明けも来ない。指定カードは自分の属性だけで4種
   白夜：自分のターン3回ごとに陽光+1（攻撃+1ずつ）。指定カード3枚を捨てると日蝕（そのターンは影討ち：使えるカード3枚・与えるダメージ2倍）
   極夜：自分のターン3回ごとに零度+1（攻撃+1・受ける攻撃-1ずつ）。指定カード3枚を捨てると月食（相手のHPとシールドの2割を奪う）。
         自分の12ターン目に1回だけ、新月（相手とHPを入れ替える）を使える */
const POLAR = { day: { name: "白夜", stack: "陽光", trio: "日蝕" }, night: { name: "極夜", stack: "零度", trio: "月食" } };
const POLAR_EVERY = 3, YOUKOU_DMG = 1, REIDO_DMG = 1, REIDO_CUT = 1, TRIO = 3;
const BYAKUYA_POISON_FREE = 3;   // 白夜の人は、毒の昼の効果（半分・2ずつ減る）を受けないかわりに、毒が3以下ならダメージを受けない
const KAGEUCHI_LIMIT = 3, KAGEUCHI_MULT = 2, GESSHOKU_RATE = 0.2, NEWMOON_TURN = 12;
function polarAtk(p) { return p.polar ? (p.hiou === "day" ? YOUKOU_DMG : REIDO_DMG) * p.polar : 0; }
const HIOU_NAME = { day: "白夜", night: "極夜", balanced: "蝕の秘奥", venom: "毒の秘奥", counter: "鏡の秘奥", blood: "血の秘奥" };
const HIOU_LEAN = 4;   // 昼（夜）カードが夜（昼）カードよりこの枚数以上多ければ昼寄り（夜寄り）
/* デッキのタイプ。蠱毒→毒、鏡花水月→カウンター、修羅→自傷、天照→昼、月読→夜。それ以外は昼と夜のカードの枚数で決まる */
function deckType(def) {
  const map = [["kodoku", "venom"], ["kyoka", "counter"], ["shura", "blood"], ["amaterasu", "day"], ["tsukuyomi", "night"],
               ["ekishin", "venom"], ["meikyo", "counter"], ["chimatsuri", "blood"], ["kinu", "day"], ["gyokuto", "night"]];
  for (const [id, kind] of map) if (def[id] > 0) return kind;
  let day = 0, night = 0;
  for (const [id, n] of Object.entries(def)) { if (CARDS[id].attr === "day") day += n; else if (CARDS[id].attr === "night") night += n; }
  return day - night >= HIOU_LEAN ? "day" : night - day >= HIOU_LEAN ? "night" : "balanced";
}

/* ===== カードデータ（cards.json と同じ） ===== */
const CARDS = {
  strike:   { name: "打撃",       attr: "day",   type: "attack",  power: 5, cost: 3, recover: 3 },
  bomb:     { name: "爆撃",       attr: "day",   type: "attack",  power: 8, cost: 5, recover: 5 },
  sunwolf:  { name: "陽の狼",     attr: "day",   type: "summon",  power: 3, hp: 8, cost: 5, recover: 5 },
  slash:    { name: "斬撃",       attr: "night", type: "attack",  power: 5, cost: 3, recover: 3 },
  ambush:   { name: "闇討ち",     attr: "night", type: "attack",  power: 8, cost: 5, recover: 5 },
  nightowl: { name: "夜の梟",     attr: "night", type: "summon",  power: 4, hp: 8, cost: 5, recover: 5 },
  drain:    { name: "吸血",       attr: "night", type: "attack",  power: 6, drain: true, cost: 4, recover: 4 },
  jab:      { name: "突き",       attr: "day",   type: "attack",  power: 3, cost: 2, recover: 2 },
  recoil:   { name: "捨て身",     attr: "night", type: "attack",  power: 12, recoil: 3, cost: 4, recover: 4 },
  eclipse:  { name: "日蝕",       attr: "none",  type: "attack",  power: 6, eclipse: true, cost: 4, recover: 4 },
  needle:   { name: "毒針",       attr: "night", type: "poison",  power: 5, sleep: 1, cost: 3, recover: 3 },
  bleed:    { name: "裂傷",       attr: "night", type: "bleed",   power: 3, numbing: 1, cost: 3, recover: 3 },
  counter:  { name: "反撃の構え", attr: "day",   type: "counter", cost: 3, recover: 3 },
  heal:     { name: "治癒",       attr: "day",   type: "heal",    power: 8, cost: 0, recover: 2 },
  firstaid: { name: "応急処置",   attr: "none",  type: "heal",    power: 4, cure: true, cost: 0, recover: 2 },
  buddha:   { name: "仏の怒り",   attr: "none",  type: "buddha",  cost: 0, recover: 0 },
  amaterasu:{ name: "天照",       attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  tsukuyomi:{ name: "月読",       attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  kodoku:   { name: "蠱毒",       attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  kyoka:    { name: "鏡花水月",   attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  bloodblade:  { name: "血刃",   attr: "night", type: "attack",      power: 5, hpcost: 3, cost: 0, recover: 4 },
  bloodlust:   { name: "狂血",   attr: "night", type: "attack",      power: 3, rage: true, hpcost: 2, cost: 2, recover: 4 },
  bloodshield: { name: "血の盾", attr: "day",   type: "bloodshield", power: 8, hpcost: 4, cost: 0, recover: 5 },
  regen:       { name: "再生",   attr: "day",   type: "regen",       power: 3, turns: 4, cost: 2, recover: 4 },
  parry:    { name: "見切り",   attr: "day",   type: "parry",   cost: 2, recover: 3 },
  karma:    { name: "因果応報", attr: "night", type: "karma",   turns: 3, cost: 3, recover: 3 },
  revenge:  { name: "報復",     attr: "night", type: "attack",  power: 4, revenge: true, cost: 3, recover: 3 },
  thorns:   { name: "棘の鎧",   attr: "night", type: "thorns",  power: 3, turns: 3, cost: 3, recover: 4 },
  metsubushi: { name: "目潰し", attr: "day",   type: "attack",  power: 3, blind: 2, cost: 2, recover: 2 },
  fang:     { name: "毒牙",     attr: "day",   type: "attack",  power: 4, poison: 3, numbing: 1, cost: 3, recover: 3 },
  corrode:  { name: "腐食",     attr: "night", type: "corrode", cost: 2, recover: 3 },
  bloom:    { name: "毒の開花", attr: "day",   type: "bloom",   cost: 3, recover: 3 },
  mushibami:   { name: "蝕み",     attr: "night", type: "linger",  power: 1, turns: 3, cost: 3, recover: 3 },
  zanshou:     { name: "残照",     attr: "day",   type: "attack",  power: 5, allday: true, cost: 3, recover: 3 },
  nichirin:    { name: "日輪の盾", attr: "day",   type: "sunshield", power: 4, cost: 0, recover: 2 },
  oborozuki:   { name: "朧月",     attr: "night", type: "attack",  power: 6, allday: true, cost: 3, recover: 3 },
  shingetsu:   { name: "新月",     attr: "night", type: "shieldbreak", power: 7, cost: 2, recover: 3 },
  kamaenaoshi: { name: "構え直し", attr: "day",   type: "counter", draw: 1, cost: 3, recover: 3 },
  katsu:       { name: "喝",       attr: "night", type: "attack",  power: 5, zeal: true, cost: 3, recover: 3 },
  nembutsu:    { name: "念仏",     attr: "day",   type: "nembutsu", power: 5, cost: 0, recover: 2 },
  rengeki:     { name: "血の連撃", attr: "night", type: "attack",  power: 1, fury: true, hpcost: 2, cost: 0, recover: 3 },
  sunturn:  { name: "陽転",     attr: "day",   type: "convert", to: "day",   free: true, draw: 1, cost: 1, recover: 2 },
  moonturn: { name: "月転",     attr: "night", type: "convert", to: "night", free: true, draw: 1, cost: 1, recover: 2 },
  twilight: { name: "薄明の刃", attr: "both",  type: "attack",  power: 5, cost: 3, recover: 3 },
  bloodpact:  { name: "血の契約", attr: "night", type: "draw",   power: 2, hpcost: 5, cost: 0, recover: 3 },
  backsplash: { name: "返り血",   attr: "day",   type: "attack", power: 4, splash: true, hpcost: 3, cost: 0, recover: 3 },
  bloodwaltz: { name: "鮮血の舞", attr: "night", type: "attack", power: 4, frenzy: true, hpcost: 3, cost: 0, recover: 3 },
  sutra:    { name: "読経",     attr: "day",   type: "sutra",   cost: 1, recover: 3 },
  gassho:   { name: "合掌",     attr: "night", type: "gassho",  power: 5, wrathok: true, cost: 0, recover: 2 },
  kongo:    { name: "金剛",     attr: "day",   type: "guard",   power: 4, wrathok: true, cost: 2, recover: 3 },
  zazen:    { name: "座禅",     attr: "day",   type: "heal",    power: 4, cure: true, wrathok: true, cost: 0, recover: 2 },
  fudoushin:{ name: "不動心",   attr: "night", type: "calm",    wrathok: true, cost: 2, recover: 3 },
  dokugiri: { name: "毒霧",     attr: "day",   type: "poison",  power: 4, cost: 2, recover: 3 },
  koromo:   { name: "毒の衣",   attr: "night", type: "koromo",  power: 3, cut: 5, turns: 3, cost: 1, recover: 3 },
  machi:    { name: "待ちの構え", attr: "day", type: "wait",    cost: 2, recover: 3 },
  dokugumo: { name: "毒蜘蛛",   attr: "night", type: "summon",  power: 2, hp: 8, mpoison: 3, cost: 3, recover: 4 },
  monban:   { name: "門番",     attr: "day",   type: "summon",  power: 2, hp: 12, mthorn: 2, cost: 5, recover: 5 },
  niou:     { name: "仁王",     attr: "day",   type: "summon",  power: 3, hp: 10, mzeal: true, cost: 5, recover: 5 },
  koumori:  { name: "血の蝙蝠", attr: "night", type: "summon",  power: 2, hp: 6, mdrain: 1, hpcost: 3, cost: 3, recover: 4 },
  kinu:     { name: "金烏",     attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  gyokuto:  { name: "玉兎",     attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  ekishin:  { name: "疫神",     attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  meikyo:   { name: "明鏡止水", attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  nehan:    { name: "涅槃",     attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  chimatsuri: { name: "血祭り", attr: "none",  type: "ougi",    cost: 0, recover: 0 },
  berserk:  { name: "狂乱",     attr: "night", type: "berserk", turns: 3, cost: 2, recover: 3 },
  dohatsu:  { name: "怒髪天",   attr: "night", type: "dohatsu", power: 2, turns: 3, wrathok: true, cost: 2, recover: 3 },
  shura:   { name: "修羅",       attr: "none",  type: "ougi",    cost: 0, recover: 0 },
};
/* 見本デッキ（cards.json の decks と同じ） */
const PRESETS = {
  sun: { name: "昼特化", cards: {
    strike: 3, bomb: 3, sunwolf: 3, eclipse: 2, jab: 3, sunturn: 2, twilight: 2, zanshou: 3, nichirin: 3, regen: 3, heal: 3, firstaid: 2, amaterasu: 4 } },
  moon: { name: "夜特化", cards: {
    slash: 3, ambush: 3, nightowl: 3, drain: 3, eclipse: 2, moonturn: 2, twilight: 3, oborozuki: 3, shingetsu: 3, bleed: 3, gassho: 1, firstaid: 3, tsukuyomi: 4 } },
  venom: { name: "状態異常", cards: {
    needle: 3, bleed: 3, drain: 3, fang: 3, metsubushi: 2, corrode: 1, bloom: 2, mushibami: 3, dokugumo: 2, dokugiri: 2, koromo: 2, counter: 1, firstaid: 3, heal: 2, kodoku: 4 } },
  counter: { name: "カウンター", cards: {
    counter: 3, parry: 3, revenge: 3, thorns: 2, kyoka: 4, karma: 3, strike: 2, slash: 2, monban: 2, kamaenaoshi: 2, machi: 2, drain: 2, heal: 3, firstaid: 3 } },
  buddha: { name: "仏の怒り", cards: {
    buddha: 4, sutra: 2, gassho: 2, kongo: 2, zazen: 2, fudoushin: 2, dohatsu: 2, counter: 3, heal: 3, firstaid: 3, katsu: 2, nembutsu: 2, slash: 2, niou: 2, drain: 2, needle: 1 } },
  blood: { name: "自傷", cards: {
    bloodblade: 3, bloodlust: 3, bloodshield: 3, regen: 3, recoil: 3, shura: 4, bloodpact: 2, backsplash: 2, bloodwaltz: 2, koumori: 2, rengeki: 2, berserk: 2, heal: 2, firstaid: 3 } },
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
  return size === R.DECK_SIZE ? out : { ...DECK };
}
function deckProblems(def) {
  const out = [];
  const size = deckSize(def);
  if (size < R.DECK_SIZE) out.push(`あと${R.DECK_SIZE - size}枚必要（${R.DECK_SIZE}枚ちょうど）`);
  if (size > R.DECK_SIZE) out.push(`${size - R.DECK_SIZE}枚多い（${R.DECK_SIZE}枚ちょうど）`);
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
  const own = POLAR[deckType(def)] ? deckType(def) : null;   // 昼特化・夜特化は、自分の属性だけで4種
  for (const attr of ["day", "night"]) {
    if (own && attr !== own) { out[attr] = []; continue; }
    const max = desMax(own, attr);
    const ids = Object.keys(def).filter(id => CARDS[id]?.attr === attr && !isOugi(CARDS[id]) && def[id] > 0);
    const want = [...(chosen?.[attr] || []), ...(own ? chosen?.[attr === "day" ? "night" : "day"] || [] : [])];
    const picked = [...new Set(want.filter(id => ids.includes(id)))].slice(0, max);
    for (const id of ids.sort((a, b) => def[b] - def[a] || a.localeCompare(b)))
      if (picked.length < max && !picked.includes(id)) picked.push(id);
    out[attr] = picked;
  }
  return out;
}
/* 指定カードの種類の上限（昼特化・夜特化は自分の属性で4種、相手の属性は0） */
function desMax(own, attr) { return own ? (attr === own ? 2 * DESIGNATED_PER_ATTR : 0) : DESIGNATED_PER_ATTR; }
/* cos：見た目 { name, icon, title, frame, sleeve, mat, arts: {カードid: 絵柄} }（ショップで買ったもの。強さには関係しない） */
function newPlayer(name, isAI, def, chosen, cos = null) {
  const deck = makeDeck(def);
  for (const c of deck) if (cos?.arts?.[c.id]) c.art = cos.arts[c.id];
  const designated = autoDesignated(sanitizeDeck(def), chosen);
  return { name, isAI, cos, hp: R.MAX_HP, shield: R.START_SHIELD, deck, hand: [], drop: [], monsters: [],
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
           parry: false,        // 見切り（次に受ける攻撃を0にする）
           thorns: 0, thornsTurns: 0,   // 棘の鎧（攻撃を受けるたびに相手へダメージ）
           taken: 0, revengeBase: 0,    // 受けた攻撃ダメージ（報復で使う。自分のターン開始で revengeBase へ）
           guard: 0,            // 金剛（次の自分のターンまで、受ける攻撃-この値）
           karmaTurns: 0, karmaStore: 0,   // 因果応報の残りターン数と、その間に溜めた特殊ダメージ
           numbNext: 0, numb: 0, drowsyNext: 0,   // 痺れ（次の自分のターン、使えるカード-1）・眠り（引く枚数-1）
           blind: 0,            // 暗闇の残りターン数。その間に引いたカードは裏向き（hidden）
           ownTurns: 0, polar: 0,   // 自分のターンの回数・陽光（白夜）／零度（極夜）の数
           kageuchi: false, trioTurn: -1, newmoonUsed: false,   // 日蝕の影討ち（このターン）・日蝕／月食を使ったターン・新月を使った
         };
}
function hiouOptions(p) { return HIOU_SETS[p.hiou || "balanced"].filter(b => !p.buffs.has(b)); }
function stackOf(p, id) { return p.stacks[id] || []; }
/* 仏の怒りの必殺技の基本ダメージ（怒り状態で待ったターンだけ増える） */
/* 狂乱：その間は自分のデバフの数だけ攻撃+1（毒・出血はその量だけ）。返されるダメージ（反撃・鏡花水月・水月・棘の鎧）は2倍 */
const BERSERK_REFLECT = 2, REFLECT_SOURCES = ["反撃", "鏡花水月", "水月", "棘の鎧", "迎え撃ち", "明鏡止水", "門番"];
const WAIT_MULT = 2.5;   // 待ちの構え：次に受けたダメージをこの倍率で返す
const DOHATSU_PER = 2;   // 怒髪天：受けたダメージこの量ごとに、必殺技+1・HP+1
/* 自分についているデバフの数。毒は毒の量、出血は残りターン、ほか（眠り・痺れ・暗闇・蝕み）は1つ1（engine.py の debuffs と同じ） */
function debuffs(p) { return (p.poison || 0) + (p.bleed || 0) + [p.drowsy, p.numb, p.blind, p.lingerTurns].filter(Boolean).length; }
function finisherBase(p) { return R.FINISH_DMG + R.WAIT_BONUS * (p.wrathTurns || 0) + Math.floor((p.anger || 0) / DOHATSU_PER); }

/* ===== 戦闘エンジン（engine.py の移植）
   プレイヤー名は "@0" "@1" の記号で記録し、画面に出すときに見る人ごとに「あなた」「相手」に置き換える。
   ログの1行1行が演出（ダメージ表示・大きな文字）の元になるので、相手の画面でも同じ演出が再現される ===== */
class Game {
  constructor({ ai = [false, false], firstIdx = 0, decks = [DECK, DECK], designated = [null, null], cos = [null, null] } = {}) {
    this.gid = Math.random().toString(36).slice(2, 10);
    this.players = [newPlayer("@0", ai[0], decks[0], designated[0], cos[0]), newPlayer("@1", ai[1], decks[1], designated[1], cos[1])];
    this.firstIdx = firstIdx; this.turnIdx = firstIdx;
    this.override = {}; this.polarOwner = {};   // 白夜・極夜で時間帯が変わった巡 {巡: "day"/"night"} と、起こした人 {巡: 席}
    this.round = 1; this.over = false; this.winnerIdx = null; this.pending = null; this.logs = []; this.logSeq = 0;
    for (const p of this.players) this.draw(p, R.START_HAND);
  }
  static load(s) {
    const g = Object.create(Game.prototype);
    Object.assign(g, JSON.parse(JSON.stringify(s)));
    for (const p of g.players) {
      p.buffs = new Set(p.buffs);
      for (const c of [...p.deck, ...p.hand, ...p.drop, ...(p.monsters || []), ...Object.values(p.stacks || {}).flat()]) uidSeq = Math.max(uidSeq, c.uid);
    }
    return g;
  }
  serialize() {
    return {
      gid: this.gid, players: this.players.map(p => ({ ...p, buffs: [...p.buffs] })),
      firstIdx: this.firstIdx, turnIdx: this.turnIdx, round: this.round, override: this.override, polarOwner: this.polarOwner, over: this.over,
      winnerIdx: this.winnerIdx, pending: this.pending, logs: this.logs.slice(-80), logSeq: this.logSeq,
    };
  }
  /* m: 文章, k: 種類, t: 対象プレイヤー, a: 量 */
  log(m, k = "", t = null, a = 0) {
    this.logs.push({ m, k, t, a, n: ++this.logSeq });
    if (this.logs.length > 150) this.logs.shift();
  }
  idx(p) { return this.players.indexOf(p); }
  /* 1つの行動の前後で両者のHP・シールドがどう変わったかを1行にまとめて記録する（画面の「結果」とまとめた数字の演出の元） */
  snap() { return this.players.map(p => [p.hp, p.shield]); }
  summary(label, before) {
    const d = this.players.map((p, i) => [before[i][0], p.hp, before[i][1], p.shield]);
    if (d.some(([h0, h1, s0, s1]) => h0 !== h1 || s0 !== s1)) this.log(label, "sum", null, d);
  }
  get phase() { return this.override?.[this.round] || CYCLE[(this.round - 1) % CYCLE.length]; }
  get active() { return this.players[this.turnIdx]; }
  opp(p) { return p === this.players[0] ? this.players[1] : this.players[0]; }
  /* p から見た時間帯。昼特化はずっと昼（白夜）、夜特化はずっと夜（極夜） */
  phaseFor(p) { return p && POLAR[p.hiou] ? p.hiou : this.phase; }
  isTransition(p = null) { const ph = this.phaseFor(p); return ph === "dusk" || ph === "dawn"; }
  buffReady(p) {
    if (POLAR[p.hiou]) return false;   // 昼特化・夜特化は秘奥のかわりに白夜・極夜
    return this.isTransition() && p.buffRound !== this.round && hiouOptions(p).length > 0;
  }
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
    if (c.eclipse) return this.isTransition(p) ? R.ECLIPSE_BONUS : 1;
    if (c.allday) return this.attrMult("both", p);   // 残照・朧月：昼でも夜でも1.5倍（日没・夜明けは等倍）
    return this.attrMult(c.attr, p);
  }
  attrMult(attr, p = null) {
    const ph = this.phaseFor(p);
    if (attr === "both")   // 薄明の刃：昼でも夜でも1.5倍（日没・夜明けは等倍）
      return ph === "day" || ph === "night" || (p && p.blessing.length) ? R.ATTR_BONUS : 1;
    return attr === ph || (p && p.blessing.includes(attr)) ? R.ATTR_BONUS : 1; }
  /* 毒・出血のダメージ倍率（日蝕の深まり×相手の蠱毒） */
  dotMult(victim) { return this.escalation() * (this.opp(victim).kodoku ? R.KODOKU_MULT : 1); }
  poisonMult(victim) {
    if (victim.hiou === "day") return victim.poison <= BYAKUYA_POISON_FREE ? 0 : this.dotMult(victim);   // 白夜
    const ph = this.phaseFor(victim); return this.dotMult(victim) * (ph === "day" ? DAY_POISON_CUT : ph === "night" ? NIGHT_POISON_MULT : 1); }
  /* 日蝕の深まり。昼夜が1周するごとにダメージ倍率が上がる */
  escalation() { return 1 + R.ESCALATION * Math.floor((this.round - 1) / CYCLE.length); }
  outgoing(p, base, mult) {
    let d = base * mult * this.escalation();
    if (p.kageuchi) d *= KAGEUCHI_MULT;   // 日蝕（影討ち）
    if (p.buffs.has("attack")) d *= R.ATK_BUFF;
    return d;
  }
  incoming(t, a) {
    if (t.buffs.has("defense")) a *= R.DEF_BUFF;
    a -= NEW_OUGI.MEIKYO_CUT * charge(t, "meikyo");   // 明鏡止水を溜めている間
    if (t.koromoTurns) a -= t.koromoCut || 0;   // 毒の衣
    if (t.hiou === "night") a -= REIDO_CUT * (t.polar || 0);   // 零度
    if (t.wrath) a -= R.WRATH_REDUCE;
    else a -= 2 * charge(t, "buddha");      // 仏の怒りを溜めている間：-2k
    if (t.buffs.has("steadfast")) a -= 5;   // 秘奥・不動
    a -= t.guard || 0;                      // 金剛
    if (t.dohatsuTurns) a -= t.dohatsuCut || 0;   // 怒髪天
    return Math.max(0, Math.floor(a + 0.5));
  }
  /* シールド消費（秘奥・灼光なら昼カードは-1） */
  shieldCost(p, c) { return p.buffs.has("scorch") && c.attr === "day" ? Math.max(0, c.cost - 1) : c.cost; }
  /* 攻撃カードの基本ダメージ（狂血は減っているHPで増え、修羅はHPを払うカードを強くする） */
  attackPower(p, c) {
    let power = c.power;
    power += polarAtk(p);   // 陽光・零度
    if (c.zeal) power += 2 * charge(p, "buddha");   // 喝：仏の怒りの溜め×2
    if (c.fury) power += 2 * (p.usedTurn || 0) + Math.floor((p.hpPaidTurn || 0) / 3);   // 血の連撃：このターン使ったカード・払ったHP
    if (c.rage) power += Math.floor(Math.max(0, R.MAX_HP - p.hp) / BLOOD.RAGE_STEP);
    if (p.berserkTurns) power += debuffs(p);   // 狂乱：自分のデバフの数だけ
    if (c.revenge) power += Math.floor((p.revengeBase || 0) * REVENGE_RATE);
    if (c.attr === "day") power += 2 * charge(p, "amaterasu");   // 天照を溜めている間：+2k
    if (c.hpcost) power += charge(p, "shura");                    // 修羅を溜めている間：+k
    if (c.frenzy && p.hp <= Math.floor(R.MAX_HP / 2)) power *= 2;  // 鮮血の舞：HPが半分以下なら2倍
    if (p.shura && c.hpcost) power *= BLOOD.SHURA_MULT;
    return power;
  }
  preview(p, c) {
    const o = this.opp(p);
    if (c.type === "attack") {
      const n = c.poison || 0, k = charge(o, "kyoka");
      const amt = this.incoming(o, this.outgoing(p, this.attackPower(p, c), this.cardMult(c, p)));
      return (k ? Math.floor(amt * (1 - R.KYOKA_CUT * k) + 0.5) : amt) + n * (n + 1) / 2;   // 相手が鏡花水月を溜めていれば減る
    }
    if (c.type === "summon") return this.incoming(o, this.outgoing(p, c.power, this.cardMult(c, p))) * MONSTER_EXPECT;   // 場に残る間（目安3回）攻撃する
    if (c.type === "poison") return c.power * (c.power + 1) / 2;
    return 0;
  }
  /* 攻撃を当てる。attacker があれば反撃の構えが発動しうる。実際に与えた量を返す */
  dealDamage(t, amount, src, attacker = null) {
    if (t.berserkTurns && REFLECT_SOURCES.includes(src)) amount *= BERSERK_REFLECT;   // 狂乱：返されると痛い
    return this.hit(t, this.incoming(t, amount), src, attacker);
  }
  /* 受け手側の補正（防御強化・怒り状態）を計算済みのダメージを当てる */
  hit(t, amt, src, attacker = null) {
    if (attacker && t.meikyo && amt > 0) {   // 明鏡止水：攻撃を0にして、そのまま返す
      this.log(`${t.name}の明鏡止水：${src}を0にして返した`, "counter", this.idx(t));
      this.dealDamage(attacker, amt, "明鏡止水");
      return 0;
    }
    if (attacker && t.parry && amt > 0) {   // 見切り：最初の攻撃を0にする
      t.parry = false;
      this.log(`${t.name}は${src}を見切った（ダメージ0）`, "counter", this.idx(t));
      this.thornsHit(t, attacker);
      return 0;
    }
    let mirror = 0;
    const k = charge(t, "kyoka");
    if (attacker && k && amt > 0) {   // 鏡花水月を溜めている間：受けるダメージを減らし、受けた半分を返す
      amt = Math.floor(amt * (1 - R.KYOKA_CUT * k) + 0.5);
      mirror = Math.floor(amt / 2);
    }
    let reflect = 0;
    if (attacker && t.counter && amt > 0) {
      t.counter = false;
      const half = Math.floor(amt / 2);
      reflect = t.buffs.has("riposte") ? amt : half;   // 秘奥・返し刃なら全部返す
      reflect += NEW_OUGI.MEIKYO_CHARGE * charge(t, "meikyo");   // 明鏡止水を溜めている間
      amt -= half;
    }
    const ab = Math.min(t.shield, amt);
    t.shield -= ab;
    const th = amt - ab;
    t.hp -= th;
    if (attacker) t.taken = (t.taken || 0) + amt;
    this.angerHit(t, amt);
    this.log(`${src} → ${t.name}に${amt}ダメージ（シールド-${ab}${th ? `、HP-${th}` : ""}）`, "dmg", this.idx(t), amt);
    this.checkDead();
    if (reflect && !this.over) {
      this.log(`${t.name}の反撃！`, "counter", this.idx(t));
      this.dealDamage(attacker, reflect, "反撃");
    }
    if (mirror && !this.over) this.dealDamage(attacker, mirror, "水月");
    this.waitHit(t, amt);
    if (attacker) this.thornsHit(t, attacker);
    return amt;
  }
  /* モンスターにダメージ（シールドがないので直接HPへ）。HPが0になったら破壊されてドロップゾーンへ。与えた量を返す */
  hitMonster(owner, uid, amt, src) {
    const m = owner.monsters.find(m => m.uid === uid);
    if (!m) return 0;
    m.hpNow -= amt;
    this.log(`${src} → ${m.name}に${amt}ダメージ（残りHP${Math.max(0, m.hpNow)}）`, "mdmg", this.idx(owner), uid);
    if (m.hpNow <= 0) {
      owner.monsters.splice(owner.monsters.indexOf(m), 1);
      owner.drop.push(m);
      this.log(`${m.name}は破壊された（ドロップゾーンへ）`, "mdead", this.idx(owner), uid);
    }
    return amt;
  }
  /* 棘の鎧：攻撃を受けるたびに相手へダメージ（返したダメージには棘は反応しない） */
  thornsHit(t, attacker) {
    if (t.thornsTurns && !this.over) this.dealDamage(attacker, t.thorns * this.escalation(), "棘の鎧");
    for (const m of [...t.monsters]) if (m.mthorn && !this.over) this.dealDamage(attacker, m.mthorn * this.escalation(), "門番");
  }
  /* 毒・出血を付ける */
  /* 血祭りを溜めている間：HPを払うたび、相手のHPにも直接 */
  bloodFeast(p) {
    const k = NEW_OUGI.CHIMATSURI_CHARGE * charge(p, "chimatsuri");
    if (k && !this.over) this.dotHit(this.opp(p), k, "血祭り");
  }
  afflict(src, t, poison = 0, bleed = 0) {
    if (poison && src !== t) poison += charge(src, "ekishin");   // 疫神を溜めている間：毒+k
    t.poison += poison; t.bleed += bleed;
    if (poison) this.log(`${t.name}に毒${poison}（合計${t.poison}）`);
    if (bleed) this.log(`${t.name}は出血した（${t.bleed}ターン、カードを使うたびHP-${R.BLEED_DMG}）`);
  }
  /* 特殊ダメージ（毒・出血・蠱毒の気配・毒の開花）：シールドも守りも無視してHPに直接。因果応報の間なら、受けた分を溜める */
  dotHit(p, amount, reason) {
    if (p.calm) amount /= 2;   // 不動心：特殊ダメージが半分
    if (p.dohatsuTurns) amount = Math.max(0, amount - (p.dohatsuCut || 0));   // 怒髪天：-2
    const n = Math.floor(amount + 0.5);
    this.directHp(p, n, reason);
    this.angerHit(p, n);
    this.waitHit(p, n);
    if (p.karmaTurns) p.karmaStore = (p.karmaStore || 0) + n;
  }
  /* 怒髪天の間：受けたダメージ2ごとに、必殺技+1・HP+1 */
  /* 待ちの構え：ダメージを受けたら、その2.5倍を相手に返して待ちが終わる */
  waitHit(p, n) {
    if (!p.waiting || n <= 0 || this.over) return;
    p.waiting = false;
    this.log(`${p.name}の待ちの構え：受けた${n}の${WAIT_MULT}倍を返す`, "counter", this.idx(p));
    this.dealDamage(this.opp(p), n * WAIT_MULT, "迎え撃ち");
  }
  angerHit(p, n) {
    if (!p.dohatsuTurns || n <= 0 || this.over) return;
    const before = p.anger || 0;
    p.anger = before + n;
    const gain = Math.floor(p.anger / DOHATSU_PER) - Math.floor(before / DOHATSU_PER);
    if (gain) {
      p.hp = Math.min(R.MAX_HP, p.hp + gain);
      this.log(`怒髪天：${p.name}はHP+${gain}、必殺技+${gain}`, "heal", this.idx(p), gain);
    }
  }
  /* 因果応報：自分のターンの始めに1ターン進める。終わったら溜めた分の半分を回復し、1.5倍を相手のHPに直接返す */
  karmaTick(p) {
    if (!p.karmaTurns || --p.karmaTurns) return;
    const store = p.karmaStore || 0;
    p.karmaStore = 0;
    if (!store) return this.log(`${p.name}の因果応報は何も溜まらなかった`);
    const back = Math.floor(store * R.KARMA_MULT);
    this.log(`${p.name}の因果応報：受けた特殊ダメージ${store}の半分を回復し、${back}を返す`, "karma", this.idx(p), back);
    this.heal(p, Math.floor(store * R.KARMA_HEAL), "因果応報");
    this.directHp(this.opp(p), back, "因果応報");
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
    if (s) { p.hp -= s; p.hpPaidTurn = (p.hpPaidTurn || 0) + s; this.log(`シールド不足。${p.name}は${s}をHPで支払った`, "dmg", this.idx(p), s); this.checkDead(); this.bloodFeast(p); }
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
    if (counted && (p.plays || 0) >= playLimit(p) && !(mode === "use" && c.free)) return false;
    // 奥義は溜めるだけ。同じ奥義は1ターン1枚。怒り状態でも仏の怒りだけは使える
    if (isOugi(c)) return mode === "use" && !p.stackUsed.includes(c.id) && (!p.wrath || c.id === "buddha");
    if (p.wrath) return mode === "use" && !!c.wrathok;   // 怒り状態では、合掌（を使う）だけ
    if (mode === "use" && c.type === "summon" && p.monsters.length >= R.MAX_MON) return false;
    return true;
  }
  /* target：攻撃カードで狙う相手のモンスターの uid（null なら相手プレイヤー） */
  play(p, uid, mode, target = null) {
    const c = p.hand.find(c => c.uid === uid);
    if (!c || !this.canPlay(p, c, mode)) return false;
    this.target = this.opp(p).monsters.some(m => m.uid === target) ? target : null;
    p.hand.splice(p.hand.indexOf(c), 1);
    delete c.hidden;   // 使えば中身が分かる
    if (!(mode === "use" && c.free)) p.plays = (p.plays || 0) + 1;   // 陽転・月転は使う枚数に数えない
    const before = this.snap();
    this.resolve(p, c, mode);
    p.usedTurn = (p.usedTurn || 0) + 1;
    this.target = null;   // 狙いはこのカードだけ（同時使用などに持ち越さない）
    this.summary(`${p.name}の${c.name}${mode === "recover" ? "（回復）" : ""}`, before);
    return true;
  }
  resolve(p, c, mode) {
    if (mode === "recover") {
      p.drop.push(c);
      const b = p.shield;
      const gain = Math.max(0, (p.recoverHalf ? Math.ceil(c.recover / 2) : c.recover) - charge(this.opp(p), "tsukuyomi"));   // 相手が月読を溜めている間：-k
      p.shield = Math.min(R.SHIELD_CAP, p.shield + gain);
      this.log(`${p.name}は${c.name}をシールド回復に使った（${b}→${p.shield}${p.recoverHalf ? "・月読で半減" : ""}）`, "shield", this.idx(p), p.shield - b);
      return;
    }
    if (isOugi(c)) return this.useOugi(p, c);
    const r = this.resolveUse(p, c);
    if (!this.over) this.slowDown(p, c);
    return r;
  }
  /* おまけの効果：相手の次のターンを鈍らせる（眠り＝引く枚数-1、痺れ＝使えるカード-1） */
  slowDown(p, c) {
    const o = this.opp(p);
    if (c.sleep && !o.drowsyNext) { o.drowsyNext = 1; this.log(`${o.name}は眠くなった（次のターン、引く枚数が1枚減る）`); }
    if (c.blind) { o.blind = Math.max(o.blind || 0, c.blind); this.log(`${o.name}は暗闇になった（${o.blind}ターンの間、引いたカードが裏向きになる）`, "", this.idx(o)); }
    if (c.numbing && !o.numbNext) { o.numbNext = 1; this.log(`${o.name}は痺れた（次のターン、使えるカードが1枚減る）`); }
  }
  resolveUse(p, c) {
    if (c.type !== "summon") p.drop.push(c);   // モンスターのカードは場に残り、破壊されたらドロップゾーンへ
    const o = this.opp(p);
    const cost = this.shieldCost(p, c);
    this.log(`${p.name}は${c.name}を使った${cost ? `（シールド-${cost}）` : ""}`, "play");
    this.payCost(p, cost);
    if (this.over) return;
    if (charge(p, "kinu") && c.attr === "day") p.shield = Math.min(R.SHIELD_CAP, p.shield + charge(p, "kinu"));   // 金烏を溜めている間
    if (c.hpcost) {
      this.directHp(p, c.hpcost, "血の代償");
      p.hpPaidTurn = (p.hpPaidTurn || 0) + c.hpcost;
      this.bloodFeast(p);
      if (this.over) return;
      if (p.buffs.has("bloodthirst")) p.shield = Math.min(R.SHIELD_CAP, p.shield + c.hpcost);   // 秘奥・血の渇き
    }
    if (p.bleed) { this.dotHit(p, R.BLEED_DMG * this.dotMult(p), "出血"); if (this.over) return; }
    if (c.type === "attack") {
      const raw = this.outgoing(p, this.attackPower(p, c), this.cardMult(c, p));
      const mon = this.target; this.target = null;
      const amt = mon != null ? Math.max(0, Math.floor(raw + 0.5)) : this.incoming(o, raw);
      const after = { atk: this.idx(p), seat: this.idx(o), amt, src: c.name, drain: !!c.drain, recoil: c.recoil || 0, poison: c.poison || 0, splash: !!c.splash, mon };
      if (mon != null) return this.finishAttack(after, false);   // モンスターを狙う：反撃・見切り・鏡花水月・毒は対象外
      if (o.kyoka && amt > 0 && !o.parry) {   // 見切りがあれば、そちらが先に攻撃を止める
        // 鏡花水月：受ける側が跳ね返すか選ぶ。人なら選ぶまで止める（オンラインでは相手の画面で選ぶ）
        if (!o.isAI) { this.pending = { type: "reflect", ...after, rest: [], pairBuff: false }; return "halt"; }
        return this.finishAttack(after, AI.chooseReflect(o, amt));
      }
      return this.finishAttack(after, false);
    } else if (c.type === "heal") {
      this.heal(p, c.power, c.name);
      if (c.cure && (p.poison || p.bleed)) { p.poison = 0; p.bleed = 0; this.log("毒と出血が治った"); }
    } else if (c.type === "poison") {
      this.afflict(p, o, c.power + (p.buffs.has("virulent") ? 2 : 0));   // 秘奥・猛毒で+2
    } else if (c.type === "bleed") {
      this.afflict(p, o, 0, c.power + (p.buffs.has("virulent") ? 2 : 0));
    } else if (c.type === "counter") {
      p.counter = true;
      this.log(`${p.name}は反撃の構えをとった`);
      if (c.draw) this.draw(p, c.draw);   // 構え直し
    } else if (c.type === "bloodshield") {
      const b = p.shield;
      p.shield = Math.min(R.SHIELD_CAP, p.shield + c.power);
      this.log(`血の盾で${p.name}のシールド ${b}→${p.shield}`, "shield", this.idx(p), p.shield - b);
    } else if (c.type === "regen") {
      p.regen = Math.max(p.regen || 0, c.power);
      p.regenTurns = Math.max(p.regenTurns || 0, c.turns);
      this.log(`${p.name}は再生を得た（${p.regenTurns}ターン、毎ターンHP+${p.regen}）`);
    } else if (c.type === "draw") {
      this.draw(p, c.power);
      this.log(`${p.name}は${c.power}枚引いた`);
    } else if (c.type === "sutra") {
      const i = p.deck.findIndex(x => x.id === "buddha");
      if (i >= 0) { p.hand.push(p.deck.splice(i, 1)[0]); this.log(`${p.name}はデッキから仏の怒りを手札に加えた`, "buff"); }
      else this.log("デッキに仏の怒りがなかった");
    } else if (c.type === "calm") {
      p.calm = true;
      this.log(`${p.name}は不動心（次の自分のターンまで、毒・出血などの特殊ダメージが半分）`);
    } else if (c.type === "koromo") {   // 毒の衣：自分に毒、そのかわり受ける攻撃が減る
      this.afflict(p, p, c.power);
      p.koromoTurns = c.turns; p.koromoCut = c.cut;
      this.log(`${p.name}は毒の衣をまとった（${c.turns}ターン、受ける攻撃-${c.cut}）`, "buff", this.idx(p));
    } else if (c.type === "wait") {
      p.waiting = true;
      this.log(`${p.name}は待ちの構えに入った（ダメージを受けるまでドローできない。受けたら${WAIT_MULT}倍で返す）`, "buff", this.idx(p));
    } else if (c.type === "berserk") {
      p.berserkTurns = c.turns;
      this.log(`${p.name}は狂乱した（${c.turns}ターン、自分のデバフの数だけ攻撃+1。今は+${debuffs(p)}）`, "buff", this.idx(p));
    } else if (c.type === "dohatsu") {
      p.dohatsuTurns = c.turns; p.dohatsuCut = c.power;
      this.log(`${p.name}は怒髪天（${c.turns}ターンの間、受けるダメージ-${c.power}。受けたダメージ2ごとに必殺技+1・HP+1）`, "wrath", this.idx(p));
    } else if (c.type === "linger") {
      o.lingerTurns = c.turns; o.lingerAmt = c.power + (p.buffs.has("virulent") ? 2 : 0);
      this.log(`${o.name}は蝕まれた（${c.turns}ターンの間、ターンの始めに毒${o.lingerAmt}）`);
    } else if (c.type === "sunshield") {
      const b = p.shield;
      p.shield = Math.min(R.SHIELD_CAP, p.shield + c.power * (this.phaseFor(p) === "night" ? 2 : 1));
      this.log(`日輪の盾で${p.name}のシールド ${b}→${p.shield}`, "shield", this.idx(p), p.shield - b);
    } else if (c.type === "shieldbreak") {
      const n = Math.min(o.shield, c.power);
      o.shield -= n;
      this.log(`新月で${o.name}のシールド-${n}`, "dmg", this.idx(o), n);
    } else if (c.type === "nembutsu") {
      const b = p.shield;
      p.shield = Math.min(R.SHIELD_CAP, p.shield + c.power + 2 * charge(p, "buddha"));
      this.log(`念仏で${p.name}のシールド ${b}→${p.shield}`, "shield", this.idx(p), p.shield - b);
    } else if (c.type === "gassho") {
      const b = p.shield;
      p.shield = Math.min(R.SHIELD_CAP, p.shield + c.power);
      this.log(`合掌で${p.name}のシールド ${b}→${p.shield}`, "shield", this.idx(p), p.shield - b);
    } else if (c.type === "guard") {
      p.guard = c.power;
      this.log(`${p.name}は金剛の構え（次の自分のターンまで、受ける攻撃-${c.power}）`);
    } else if (c.type === "karma") {
      p.karmaTurns = c.turns; p.karmaStore = 0;
      this.log(`${p.name}は因果応報の構え（${c.turns}ターンの間に受けた特殊ダメージの半分を回復し、${R.KARMA_MULT}倍にして返す）`);
    } else if (c.type === "parry") {
      p.parry = true;
      this.log(`${p.name}は見切りの構えをとった（次に受ける攻撃を0にする）`);
    } else if (c.type === "thorns") {
      p.thorns = c.power; p.thornsTurns = c.turns;
      this.log(`${p.name}は棘の鎧をまとった（${c.turns}ターン、攻撃を受けるたび相手に${c.power}ダメージ）`);
    } else if (c.type === "corrode") {
      const n = Math.min(o.shield, o.poison);
      o.shield -= n;
      this.log(`腐食で${o.name}のシールド-${n}（毒${o.poison}）`, "dmg", this.idx(o), n);
    } else if (c.type === "bloom") {
      const n = Math.floor(o.poison * this.poisonMult(o) + 0.5);
      o.poison = 0;
      if (n) this.dotHit(o, n, "毒の開花"); else this.log("毒がないので何も起きなかった");
    } else if (c.type === "convert") {
      const src = c.to === "day" ? "night" : "day";
      const changed = p.hand.filter(x => x.attr === src);
      for (const x of changed) x.attr = c.to;
      this.log(`${p.name}の手札の${ATTR_JP[src]}カード${changed.length}枚が${ATTR_JP[c.to]}属性になった`, "buff");
      if (c.draw) this.draw(p, c.draw);
    } else if (c.type === "summon") {
      c.hpNow = c.hp;
      p.monsters.push(c);
      this.log(`${p.name}は${c.name}を場にコールした（攻撃${c.power}・HP${c.hp}）`, "call", this.idx(p), c.uid);
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
    } else if (a.mon != null) {
      dealt = this.hitMonster(o, a.mon, a.amt, a.src);
    } else {
      dealt = this.hit(o, a.amt, a.src, p);
    }
    if (this.over) return;
    if (a.drain && dealt) this.heal(p, Math.floor(dealt / 2), "吸血");
    if (p.buffs.has("lifesteal") && dealt) this.heal(p, Math.floor(dealt / 4), "吸命");   // 秘奥・吸命
    if (a.splash && dealt) {   // 返り血：与えた分シールド回復
      const b = p.shield;
      p.shield = Math.min(R.SHIELD_CAP, p.shield + dealt);
      this.log(`返り血で${p.name}のシールド ${b}→${p.shield}`, "shield", a.atk, p.shield - b);
    }
    if (a.recoil) this.directHp(p, a.recoil, "捨て身の反動");
    if (a.poison && !this.over && a.mon == null) {   // 毒牙
      this.afflict(p, o, a.poison + (p.buffs.has("virulent") ? 2 : 0));
    }
  }
  /* 鏡花水月の選択を受け取り、止めていた続き（同時使用の残りのカードと秘奥）を進める */
  resolveReflect(yes) {
    const pd = this.pending;
    if (!pd || pd.type !== "reflect") return;
    this.pending = null;
    const before = this.snap();
    if (!yes) this.log(`${this.players[pd.seat].name}は鏡花水月を温存した`);
    this.finishAttack(pd, yes);
    if (!this.over) this.continuePair(this.players[pd.atk], pd.rest, pd.pairBuff);
    this.summary(`${this.players[pd.atk].name}の${pd.src}`, before);
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
    if (pairBuff) POLAR[p.hiou] ? this.triggerPolar(p) : this.grantPairBuff(p);
  }
  /* 白夜・極夜：そのあとの時間帯（3巡）を、両者にとって昼（夜）にする */
  triggerPolar(p) {
    const po = POLAR[p.hiou];
    for (let r = this.round + 1; r <= this.round + PHASE_ROUNDS; r++) { this.override[r] = po.to; this.polarOwner[r] = this.idx(p); }
    p.buffRound = this.round;
    this.log(`${po.name}：${p.name}が起こした。このあと${PHASE_ROUNDS}巡は${PHASE_JP[po.to]}（${p.name}の${PHASE_JP[po.to]}カードは${POLAR_MULT}倍）`, "polar", this.idx(p), po.name);
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
      if (base > R.FINISH_DMG) this.log(`待った${p.wrathTurns || 0}ターンと怒髪天の分、必殺技が+${base - R.FINISH_DMG}`, "buff");
      p.anger = 0;
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
      this.log(`${o.name}に毒${R.KODOKU_POISON}。以降、${p.name}が与える毒と出血は${R.KODOKU_MULT}倍`, "buff");
      this.afflict(p, o, R.KODOKU_POISON);
    } else if (key === "shura") {
      p.shura = true;
      this.heal(p, BLOOD.SHURA_HEAL, "修羅");
      this.log(`以降、${p.name}のHPを払うカードのダメージは${BLOOD.SHURA_MULT}倍`, "buff");
    } else if (key === "kinu") {
      p.polar = (p.polar || 0) + 2; p.kageuchi = true;
      this.log(`金烏：${p.name}は陽光+2（${p.polar}つ）。このターンは影討ち（使えるカード${KAGEUCHI_LIMIT}枚・与えるダメージ${KAGEUCHI_MULT}倍）`, "buff");
    } else if (key === "gyokuto") {
      this.log(`玉兎：${NEW_OUGI.GYOKUTO_DMG}ダメージ＋${o.name}の手札を1枚捨てさせる`, "buff");
      this.dealDamage(o, this.outgoing(p, NEW_OUGI.GYOKUTO_DMG, 1), "玉兎", p);
      if (o.hand.length && !this.over) {
        const c = o.hand.splice(Math.floor(Math.random() * o.hand.length), 1)[0];
        o.drop.push(c); delete c.hidden;
        this.log(`${o.name}は${c.name}を捨てた`);
      }
    } else if (key === "ekishin") {
      this.log(`疫神：${o.name}の毒が2倍（${o.poison}→${o.poison * 2}）`, "buff");
      o.poison *= 2;
    } else if (key === "meikyo") {
      p.meikyo = true;
      this.log(`明鏡止水：次の${p.name}のターンまで、受ける攻撃を0にしてそのまま返す`, "buff");
    } else if (key === "nehan") {
      const b = p.hp;
      p.hp = Math.min(R.MAX_HP, p.hp + NEW_OUGI.NEHAN_HEAL); p.poison = 0; p.bleed = 0;
      this.log(`涅槃：${p.name}のHP ${b}→${p.hp}。毒と出血が治った`, "heal", this.idx(p), p.hp - b);
    } else if (key === "chimatsuri") {
      const n = Math.floor((R.MAX_HP - p.hp) / 2);
      this.log(`血祭り：減っているHPの半分（${n}）を与える`, "buff");
      if (n) this.dealDamage(o, this.outgoing(p, n, 1), "血祭り", p);
    } else if (key === "kyoka") {
      p.kyoka = true;
      this.log(`以降、${p.name}は相手の攻撃を1回だけ${R.KYOKA_MULT}倍にして跳ね返せる`, "buff");
    }
  }
  /* 日没・夜明けに同時使用できる [昼の指定カード, 夜の指定カード] の組（種類ごとに1組） */
  pairOptions(p) {
    if (!this.buffReady(p) || p.wrath) return [];
    const pick = attr => [...new Map(p.hand.filter(c => p.designated[attr].includes(c.id)).map(c => [c.id, c])).values()];
    const ok = c => this.canPlay(p, c, "use", false);
    const out = [];
    const one = ["day", "night"].find(k => !p.designated[k].length);
    if (one) {   // 昼（夜）のカードしかないデッキは、残りの指定カード2枚で発動する（engine.py と同じ）
      const cs = p.hand.filter(c => p.designated[one === "day" ? "night" : "day"].includes(c.id) && ok(c));
      const seen = new Set();
      cs.forEach((a, i) => cs.slice(i + 1).forEach(b => {
        const key = [a.id, b.id].sort().join();
        if (!seen.has(key)) { seen.add(key); out.push([a, b]); }
      }));
      return out;
    }
    for (const d of pick("day")) for (const n of pick("night"))
      if (ok(d) && ok(n)) out.push([d, n]);
    return out;
  }
  /* 日蝕・月食に使える手札の指定カード（3枚以上あれば発動できる。1ターン1回） */
  trioCards(p) {
    if (!POLAR[p.hiou] || p.trioTurn === p.ownTurns || p.wrath || this.over) return [];
    const ids = [...p.designated.day, ...p.designated.night];
    const cs = p.hand.filter(c => ids.includes(c.id));
    return cs.length >= TRIO ? cs : [];
  }
  /* 指定カード3枚を捨てて（効果は出ない・枚数に数えない）、白夜なら日蝕（影討ち）、極夜なら月食 */
  playTrio(p, uids) {
    const ok = this.trioCards(p);
    const cs = uids.map(u => ok.find(c => c.uid === u));
    if (cs.length !== TRIO || cs.some(c => !c) || new Set(uids).size !== TRIO) return false;
    const before = this.snap();
    for (const c of cs) { p.hand.splice(p.hand.indexOf(c), 1); delete c.hidden; p.drop.push(c); }
    p.trioTurn = p.ownTurns;
    const names = cs.map(c => c.name).join("・"), o = this.opp(p);
    if (p.hiou === "day") {
      p.kageuchi = true;
      this.log(`日蝕：${p.name}は${names}を捨てて影討ちに入った（このターン、使えるカード${KAGEUCHI_LIMIT}枚・与えるダメージ${KAGEUCHI_MULT}倍）`, "polar", this.idx(p), "日蝕");
    } else {
      const hp = Math.floor(o.hp * GESSHOKU_RATE), sh = Math.floor(o.shield * GESSHOKU_RATE);
      o.hp -= hp; o.shield -= sh;
      p.hp = Math.min(R.MAX_HP, p.hp + hp); p.shield = Math.min(R.SHIELD_CAP, p.shield + sh);
      this.log(`月食：${p.name}は${names}を捨てて、${o.name}のHP${hp}・シールド${sh}を奪った`, "polar", this.idx(p), "月食");
      this.checkDead();
    }
    this.summary(`${p.name}の${POLAR[p.hiou].trio}`, before);
    return true;
  }
  newmoonReady(p) { return p.hiou === "night" && p.ownTurns === NEWMOON_TURN && !p.newmoonUsed && !this.over; }
  /* 新月：自分の12ターン目に1回だけ、相手とHPを入れ替える */
  newMoon(p) {
    if (!this.newmoonReady(p)) return false;
    const o = this.opp(p), before = this.snap();
    p.newmoonUsed = true;
    [p.hp, o.hp] = [Math.min(R.MAX_HP, o.hp), Math.min(R.MAX_HP, p.hp)];
    this.log(`新月：${p.name}と${o.name}のHPが入れ替わった（${p.hp}・${o.hp}）`, "polar", this.idx(p), "新月");
    this.summary(`${p.name}の新月`, before);
    return true;
  }
  playPair(p, dUid, nUid) {
    const pair = this.pairOptions(p).find(([d, n]) => d.uid === dUid && n.uid === nUid);
    if (!pair) return false;
    this.log(`${p.name}は${pair[0].name}と${pair[1].name}を同時に使った`, "buff");
    for (const c of pair) p.hand.splice(p.hand.indexOf(c), 1);
    const before = this.snap();
    this.continuePair(p, pair, true);
    this.summary(`${p.name}の${pair[0].name}＋${pair[1].name}`, before);
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
    const before = this.snap();
    this.beginTurn(p);
    this.summary(`${p.name}のターン開始時`, before);
  }
  beginTurn(p) {
    this.log(`第${this.round}巡【${PHASE_JP[this.phase]}】${p.name}のターン`, "turn");
    p.usedTurn = 0; p.hpPaidTurn = 0;
    p.kageuchi = false; p.meikyo = false;
    const nk = NEW_OUGI.NEHAN_CHARGE * charge(p, "nehan");
    if (nk && p.hp < R.MAX_HP) { p.hp = Math.min(R.MAX_HP, p.hp + nk); this.log(`涅槃：${p.name}はHP+${nk}`, "heal", this.idx(p), nk); }   // 涅槃を溜めている間
    const gk = Math.min(p.shield, NEW_OUGI.GYOKUTO_CHARGE * charge(this.opp(p), "gyokuto"));
    if (gk) { p.shield -= gk; this.log(`玉兎：${p.name}のシールド-${gk}`, "dmg", this.idx(p), gk); }   // 相手が玉兎を溜めている間
    p.ownTurns = (p.ownTurns || 0) + 1;
    const po = POLAR[p.hiou];
    if (po && p.ownTurns % POLAR_EVERY === 0) {
      p.polar = (p.polar || 0) + 1;
      this.log(`${po.name}：${p.name}に${po.stack}が付いた（${p.polar}つ、攻撃+${polarAtk(p)}${p.hiou === "night" ? `・受ける攻撃-${REIDO_CUT * p.polar}` : ""}）`, "buff", this.idx(p));
    }
    if (p.lingerTurns) { this.afflict(this.opp(p), p, p.lingerAmt); p.lingerTurns--; }   // 蝕み：ターンの始めに毒（毒のダメージより先）
    p.numb = p.numbNext || 0; p.numbNext = 0;   // 痺れ・眠りは、受けた次の自分のターンだけ
    const drowsy = p.drowsyNext || 0; p.drowsyNext = 0; p.drowsy = drowsy;
    p.counter = false;
    p.parry = false;
    p.guard = 0;
    p.revengeBase = p.taken || 0; p.taken = 0;
    if (p.thornsTurns) p.thornsTurns--;
    p.stackUsed = [];
    p.plays = 0;
    if (p.wrath) p.wrathTurns = (p.wrathTurns || 0) + 1;
    if (p.poison) {
      if (p.hiou === "day" && p.poison <= BYAKUYA_POISON_FREE) this.log(`白夜：${p.name}は毒${p.poison}を受けない（${BYAKUYA_POISON_FREE}以下）`);
      this.dotHit(p, p.poison * this.poisonMult(p), "毒");
      p.poison = Math.max(0, p.poison - (this.phaseFor(p) === "day" && p.hiou !== "day" ? DAY_POISON_DECAY : 1));   // 白夜は2ずつ減らない
      if (this.over) return;
    }
    p.calm = false;   // 不動心は、このターンの毒を受けたところまで
    if (p.dohatsuTurns) p.dohatsuTurns--;   // 怒髪天も、このターンの毒を受けたところで1ターン進む
    if (p.koromoTurns) p.koromoTurns--;   // 毒の衣も同じ
    if (p.berserkTurns) p.berserkTurns--;   // 狂乱も同じ
    this.karmaTick(p);   // このターンの毒まで溜めてから返す
    if (this.over) return;
    if (p.regenTurns) {
      this.heal(p, p.regen, "再生");
      if (!--p.regenTurns) p.regen = 0;
    }
    // 毎ターン始めに働く秘奥
    const o = this.opp(p);
    const kk = charge(p, "kodoku");
    if (kk) {   // 蠱毒を溜めている間：相手のHPへ直接k
      this.dotHit(o, kk * this.escalation(), "蠱毒の気配");
      if (this.over) return;
    }
    if (p.buffs.has("sunlight")) p.shield = Math.min(R.SHIELD_CAP, p.shield + 3);
    if (p.buffs.has("moonshadow")) o.shield = Math.max(0, o.shield - 1);
    if (p.buffs.has("plague")) this.afflict(p, o, 1);
    if (p.buffs.has("regenplus")) this.heal(p, 2, "再生強化");
    if (!p.blind) for (const c of p.hand) delete c.hidden;   // 暗闇が解けたら、裏向きのカードを表に戻す
    const before = p.hand.length;
    if (p.waiting) this.log(`${p.name}は待ちの構えで引けない`);
    else if (this.round === 1 && this.turnIdx === this.firstIdx) this.draw(p, R.FIRST_DRAW);
    else {
      if (drowsy) this.log(`${p.name}は眠り（引く枚数-${drowsy}）`);
      this.draw(p, (p.wrath ? R.WRATH_DRAW : R.DRAW) + (p.buffs.has("draw") ? 1 : 0) - drowsy);
    }
    if (p.blind) {   // 暗闇：このターンに引いたカードは裏向き
      for (const c of p.hand.slice(before)) c.hidden = true;
      p.blind--;
    }
  }
  endTurn(p) {
    const o = this.opp(p);
    const before = this.snap();
    for (const m of [...p.monsters]) {   // 場のモンスターが攻撃する（反撃の構え・棘の鎧で倒れることもある）
      if (!p.monsters.includes(m)) continue;
      const power = m.power + (m.mzeal ? charge(p, "buddha") : 0);   // 仁王：仏の怒りの溜め1つごとに+1
      const dealt = this.dealDamage(o, this.outgoing(p, power, this.attrMult(m.attr, p)), m.name, p);
      if (this.over) return this.summary(`${p.name}の仲間の攻撃`, before);
      if (m.mpoison && dealt) this.afflict(p, o, m.mpoison);   // 毒蜘蛛
      if (m.mdrain && p.hp < R.MAX_HP) { p.hp = Math.min(R.MAX_HP, p.hp + m.mdrain); this.log(`${m.name}：${p.name}のHP+${m.mdrain}`, "heal", this.idx(p), m.mdrain); }   // 血の蝙蝠
    }
    this.summary(`${p.name}の仲間の攻撃`, before);
    if (p.bleed) p.bleed--;
    this.turnIdx = 1 - this.turnIdx;
    if (this.turnIdx === this.firstIdx) {
      const prev = this.phase;
      this.round++;
      if (this.override[this.round] && this.phase !== prev) this.log(this.phase === "day" ? "白夜：夜が来ない" : "極夜：昼が来ない", "phase");
      else if (this.phase !== prev) this.log({
        dusk: "日没が訪れた", night: "夜になった", dawn: "夜明けが来た", day: "昼になった",
      }[this.phase], "phase");
      if (this.round > R.MAX_ROUNDS) { this.over = true; this.winnerIdx = null; }
    }
  }
}

/* ===== 敵AI（engine.py の SimpleAI と同じ考え方） ===== */
const AI = {
  RESERVE: 6, LOW: 12,
  /* 日蝕：捨てる3枚のほかに攻撃カードが2枚以上あるとき。月食：相手のHPとシールドが多いとき（engine.py の want_trio と同じ） */
  trioPick(g, p) {
    const cs = g.trioCards(p).filter(c => !c.hidden);
    if (cs.length < TRIO) return null;
    const drop = [...cs].sort((a, b) => (this.score(g, p, a) || 0) - (this.score(g, p, b) || 0)).slice(0, TRIO);
    const o = g.opp(p);
    if (p.hiou === "night") return o.hp + o.shield >= 25 ? drop.map(c => c.uid) : null;
    const rest = p.hand.filter(c => !drop.includes(c) && c.type === "attack" && !c.hidden);
    return (p.plays || 0) === 0 && rest.length >= 2 ? drop.map(c => c.uid) : null;
  },
  reserved(p) {
    const keep = new Set();
    if (!hiouOptions(p).length) return keep;
    for (const key of ["day", "night"]) {
      const c = p.hand.find(c => p.designated[key].includes(c.id));
      if (c) keep.add(c.uid);
    }
    const one = ["day", "night"].find(k => !p.designated[k].length);
    if (one) {   // 片方の属性しかないデッキは、指定カードを2枚温存
      keep.clear();
      for (const c of p.hand.filter(c => p.designated[one === "day" ? "night" : "day"].includes(c.id)).slice(0, 2)) keep.add(c.uid);
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
    if (c.type === "draw") return p.hand.length <= 5 ? 3 : null;   // 血の契約：手札が少ないとき
    if (c.type === "sutra") {
      const have = charge(p, "buddha") + p.hand.filter(x => x.id === "buddha").length;
      return p.deck.some(x => x.id === "buddha") && have < R.OUGI_AT ? 3 : null;
    }
    if (c.type === "dohatsu") return p.dohatsuTurns ? null : 5 / Math.max(1, c.cost);
    if (c.type === "koromo") return p.koromoTurns || p.hp <= 15 ? null : 4 / Math.max(1, c.cost);   // HPに余裕があって、まだまとっていないとき
    if (c.type === "wait") return p.waiting || p.hand.length < 4 ? null : 4 / Math.max(1, c.cost);   // 手札が多くて、まだ待っていないとき
    if (c.type === "berserk") {   // デバフが多いほど、手札の攻撃が強くなる（engine.py と同じ）
      const hurt = debuffs(p) * p.hand.filter(x => x.type === "attack" && x !== c).length;
      return p.berserkTurns || hurt < 2 ? null : hurt / Math.max(1, c.cost);
    }
    if (c.type === "calm") {   // 毒などを受けていて、まだ不動心でないとき
      const danger = p.poison || p.bleed || o.kodoku || charge(o, "kodoku") || o.lingerTurns;
      return p.calm || !danger ? null : 4.5 / Math.max(1, c.cost);
    }
    if (c.type === "linger") return o.lingerTurns ? null : 9 / Math.max(1, c.cost);
    if (c.type === "sunshield") return p.shield <= 20 ? 3 * (g.phaseFor(p) === "night" ? 1.5 : 1) : null;
    if (c.type === "shieldbreak") { const n = Math.min(o.shield, c.power); return n >= 3 ? n / Math.max(1, c.cost) : null; }
    if (c.type === "nembutsu") return p.shield <= 22 ? 3 + charge(p, "buddha") : null;
    if (c.type === "gassho") return p.shield <= 20 ? 3 : null;
    if (c.type === "guard") return p.guard ? null : 4 / c.cost;
    if (c.type === "karma") {   // 相手が毒や出血を使ってきているときだけ（蠱毒を溜めている・毒をもらっている）
      const hint = o.kodoku || charge(o, "kodoku") || p.poison || p.bleed;
      return p.karmaTurns || !hint ? null : 5 / Math.max(1, c.cost);
    }
    if (c.type === "parry") return p.parry || p.counter ? null : 6 / c.cost;
    if (c.type === "thorns") return p.thornsTurns ? null : 5 / c.cost;
    if (c.type === "corrode") { const n = Math.min(o.shield, o.poison); return n >= 4 ? n / c.cost : null; }
    if (c.type === "bloom") {   // 毒は放っておくと減るので、とどめになるか、毒が多いときだけ一気に入れる
      const n = o.poison * g.poisonMult(o);
      return n >= o.hp || n >= 8 ? n / c.cost : null;
    }
    if (c.type === "convert") {   // 今の時間帯に合う属性へ、合わない攻撃カードがあれば変える
      const src = c.to === "day" ? "night" : "day";
      const n = p.hand.filter(x => x !== c && x.attr === src && ["attack", "summon", "poison"].includes(x.type)).length;
      return g.phaseFor(p) === c.to && n >= 1 ? 3 : null;
    }
    return null;
  },
  pick(g, p) {
    const o = g.opp(p), hand = p.hand.filter(c => !c.hidden);   // 裏向き（暗闇）のカードは中身が分からないので考えない
    const hidden = p.hand.filter(c => c.hidden);
    // 奥義は使えるならすぐ溜める
    const now = hand.find(c => isOugi(c) && g.canPlay(p, c, "use"));
    if (now) return [now.uid, "use"];
    if (p.wrath) {   // 怒り状態で使えるのは「怒り状態でも使える」カードだけ。役に立つものから
      let best = null;
      for (const c of hand) {
        if (!g.canPlay(p, c, "use")) continue;
        const s = this.wrathScore(g, p, c);
        if (s != null && (!best || s > best[0])) best = [s, c.uid];
      }
      return best ? [best[1], "use"] : null;
    }
    if (g.newmoonReady(p) && g.opp(p).hp > p.hp) return ["newmoon"];   // 新月：相手のHPの方が多ければ入れ替える
    const trio = this.trioPick(g, p);
    if (trio) return ["trio", trio];
    const pairs = g.pairOptions(p).filter(([d, n]) => p.hp + p.shield > d.cost + n.cost + 5 && !d.hidden && !n.hidden);
    if (pairs.length) {
      const [d, n] = pairs.reduce((a, b) => (b[0].cost + b[1].cost < a[0].cost + a[1].cost ? b : a));
      return ["pair", d.uid, n.uid];
    }
    for (const c of hand)   // 陽転・月転（枚数に数えない）は、合う時間帯なら先に使う
      if (c.type === "convert" && g.canPlay(p, c, "use") && this.score(g, p, c) != null) return [c.uid, "use"];
    if ((p.plays || 0) >= playLimit(p)) return null;   // 1ターンの枚数を使い切った（秘奥の同時使用だけは上で済ませてある）
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
    if (hidden.length && p.shield >= this.LOW) return [hidden[0].uid, "use"];   // 暗闇：シールドに余裕があれば、裏向きのカードを賭けで使ってみる
    if (p.shield < this.LOW) {
      let b = null;
      for (const c of hand) {
        if (keep.has(c.uid) || c.type === "heal" || isOugi(c)) continue;
        const sc = [c.recover, -g.preview(p, c)];
        if (!b || sc[0] > b[0][0] || (sc[0] === b[0][0] && sc[1] > b[0][1])) b = [sc, c.uid];
      }
      if (b) return [b[1], "recover"];
      if (hidden.length) return [hidden[0].uid, "recover"];   // 表のカードがなければ、裏向きのカードを回復に回してみる
    }
    return null;
  },
  /* 攻撃カードの狙い（engine.py の choose_target と同じ）：とどめを刺せるなら相手、倒せるモンスターがいればその中で一番強いもの */
  chooseTarget(g, p, c) {
    const o = g.opp(p);
    if (c.type !== "attack" || !o.monsters.length || g.preview(p, c) >= o.hp + o.shield) return null;
    const raw = Math.floor(g.outgoing(p, g.attackPower(p, c), g.cardMult(c, p)) + 0.5);
    const kill = o.monsters.filter(m => m.hpNow <= raw);
    if (kill.length) return kill.reduce((a, b) => (b.power > a.power ? b : a)).uid;
    if (o.monsters.length >= 2) return o.monsters.reduce((a, b) => (b.hpNow < a.hpNow ? b : a)).uid;
    return null;
  },
  /* 怒り状態で使えるカードの価値（engine.py の wrath_score と同じ） */
  wrathScore(g, p, c) {
    const o = g.opp(p);
    const danger = p.poison || p.bleed || o.kodoku || charge(o, "kodoku") || o.lingerTurns;
    if (c.type === "heal") return c.cure && (p.poison >= 2 || p.bleed) ? 5 : p.hp <= R.MAX_HP - 6 ? 3 : null;
    if (c.type === "dohatsu") return p.dohatsuTurns ? null : 5;
    if (c.type === "calm") return p.calm || !danger ? null : 4.5;
    if (c.type === "guard") return p.guard ? null : 3.5;
    if (c.type === "gassho") return p.shield <= 24 ? 3 : null;
    return null;
  },
  chooseBuff(opts) { return opts[0]; },   // HIOU_SETS の並び順（優先順）で選ぶ
  /* 鏡花水月で跳ね返すか。大きめの攻撃か、HPまで届く攻撃なら跳ね返す */
  chooseReflect(p, amt) { return amt >= 7 || amt > p.shield; },
};

/* ===== 設定（この端末のブラウザに保存） ===== */
const CFG_KEY = "eclipse-settings";
const cfg = { motion: true, confirm2: true, fast: false };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || "{}")); } catch {}
function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch {} }
/* AIの「考えている時間」。設定で速くできる */
function aiWait(ms) { return sleep(cfg.fast ? ms * 0.4 : ms); }

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
    // 数字は1つの行動の最後に、HPとシールドそれぞれの合計の変化だけを出す（細かい増減が入り乱れないように）
    if (l.k === "dmg" && l.a) shake(l.t);
    else if (l.k === "sum") l.a.forEach(([h0, h1, s0, s1], i) => {
      if (s1 !== s0) pop(i, `シールド${s1 > s0 ? "+" : ""}${s1 - s0}`, "shield");
      if (h1 !== h0) pop(i, `HP${h1 > h0 ? "+" : ""}${h1 - h0}`, h1 > h0 ? "heal" : "");
    });
    else if (l.k === "phase") banner(l.m, g.isTransition() ? "昼と夜の指定カードを同時に使うと秘奥" : "", g.phase);
    else if (l.k === "finisher") banner(OUGI[l.a]?.name || "奥義", `${nameOf(l.t)}の必殺技　${OUGI[l.a]?.desc.split("。")[0] || ""}`, "finisher");
    else if (l.k === "kyoka") banner("鏡花水月", `${nameOf(l.t)}が攻撃を${R.KYOKA_MULT}倍にして跳ね返した`, "counter");
    else if (l.k === "counter") banner("反撃", `${nameOf(l.t)}の反撃の構え`, "counter");
    else if (l.k === "karma") banner("因果応報", `${nameOf(l.t)}が受けた特殊ダメージを返した（${l.a}）`, "counter");
    else if (l.k === "wrath") banner("怒り状態", `${nameOf(l.t)}は攻撃を受けるたびダメージ-${R.WRATH_REDUCE}`, "finisher");
    else if (l.k === "buffget") banner("秘奥獲得", fmt(l.m).split("：")[1] || "", "buff");
    else if (l.k === "polar") banner(l.a, fmt(l.m).split("：")[1] || "", l.a === "白夜" ? "day" : "night");
  }
  fxSeen = g.logSeq;
}

/* ===== カードの動き：デッキ→手札（ドロー）、手札→場（コール）、手札・場→ドロップゾーン =====
   描き直す前と後の盤面を比べて、増えたカードを元の場所から飛ばす */
let view = null;   // 前回描いたときの { gid, hand, drop: [Set, Set], mons: [Set, Set], handN: [n, n], deckN: [n, n] }
function captureRects() {
  const r = {};
  document.querySelectorAll("[data-pick]").forEach(el => { r[`h${el.dataset.pick}`] = el.getBoundingClientRect(); });
  document.querySelectorAll("[data-mon]").forEach(el => { r[`m${el.dataset.mon}`] = el.getBoundingClientRect(); });
  return r;
}
function viewOf() {
  return {
    gid: g.gid, hand: new Set(g.players[seat].hand.map(c => c.uid)),
    drop: g.players.map(p => new Set(p.drop.map(c => c.uid))),
    mons: g.players.map(p => new Set(p.monsters.map(c => c.uid))),
    handN: g.players.map(p => p.hand.length), deckN: g.players.map(p => p.deck.length),
  };
}
const center = r => [r.left + r.width / 2, r.top + r.height / 2];
function rectOf(id) { const el = $(id); return el ? el.getBoundingClientRect() : null; }
/* from の位置から to の位置へ、小さなカードを飛ばす（face が null なら裏向き） */
function fly(from, to, face, delay = 0, sleeve = "basic") {
  if (!from || !to) return;
  const el = document.createElement("div");
  el.className = `flyer ${face ? `a-${face.attr}${face.art ? ` art-${face.art}` : ""}` : `back sleeve-${sleeve}`}`;
  el.textContent = face ? face.name : "";
  document.body.appendChild(el);
  const [fx, fy] = center(from), [tx, ty] = center(to);
  el.style.left = `${fx - 30}px`; el.style.top = `${fy - 42}px`;
  el.animate([
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: `translate(${tx - fx}px, ${ty - fy}px) scale(.55)`, opacity: .85 },
  ], { duration: 480, delay, easing: "cubic-bezier(.3,.7,.4,1)", fill: "backwards" }).onfinish = () => el.remove();
  setTimeout(() => el.remove(), 480 + delay + 200);   // 画面が裏に回って演出が止まっても残らないように
}
/* 描いた要素そのものを、from の位置から今の位置へ動かして見せる */
function arrive(el, from, delay = 0) {
  if (!el || !from) return;
  const [fx, fy] = center(from), [tx, ty] = center(el.getBoundingClientRect());
  el.animate([
    { transform: `translate(${fx - tx}px, ${fy - ty}px) scale(.45)`, opacity: .2 },
    { transform: "none", opacity: 1 },
  ], { duration: 460, delay, easing: "cubic-bezier(.3,.7,.4,1)", fill: "backwards" });
}
function animateMoves(rects) {
  const cur = viewOf();
  const prev = view;
  view = cur;
  if (!prev || prev.gid !== cur.gid || reduceMotion || !cfg.motion) return;
  g.players.forEach((p, i) => {
    const key = sideKey(i);
    const handRect = i === seat ? rectOf("hand") : rectOf(`${key}-handchip`) || rectOf(`side-${key}`);
    let k = 0;
    // 場にコールされたモンスター
    for (const m of p.monsters) if (!prev.mons[i].has(m.uid))
      arrive(document.querySelector(`[data-mon="${m.uid}"]`), rects[`h${m.uid}`] || handRect, 80 * k++);
    // ドロップゾーンに来たカード（使った・回復に回した・破壊された）
    const dropRect = rectOf(`${key}-drop`);
    for (const c of p.drop) if (!prev.drop[i].has(c.uid))
      fly(rects[`h${c.uid}`] || rects[`m${c.uid}`] || handRect, dropRect, c, 80 * k++);
    // ドロー：自分はデッキから手札のカードそのものが飛んでくる。相手は裏向きのカードが手札へ
    const deckRect = rectOf(`${key}-deck`);
    if (i === seat) {
      let d = 0;
      for (const c of p.hand) if (!prev.hand.has(c.uid)) arrive(document.querySelector(`[data-pick="${c.uid}"]`), deckRect, 120 * d++);
    } else {
      for (let d = 0; d < Math.max(0, prev.deckN[i] - cur.deckN[i]); d++) fly(deckRect, handRect, null, 120 * d, p.cos?.sleeve || "basic");
    }
  });
}
/* ドロップゾーンの中身（新しい順） */
function showDrop(i) {
  const p = g.players[i];
  const list = [...p.drop].reverse();
  showDialog(`<h2>${nameOf(i)}のドロップゾーン（${list.length}枚）</h2>
    ${list.length ? `<div class="drop-list">${list.map(c => `<span class="drop-card a-${c.attr}${c.art ? ` art-${c.art}` : ""}"><b>${c.name}</b><small>${ATTR_JP[c.attr]}・${TYPE_JP[c.type]}</small></span>`).join("")}</div>`
      : `<p>まだ何もない。</p>`}
    <p>デッキが0枚になると、ドロップゾーンのカードをシャッフルしてデッキに戻す。</p>
    <button class="btn" data-act="close">閉じる</button>`, "drop");
}

/* ===== 描画 ===== */
function sideSkeleton(key) {
  $(`side-${key}`).innerHTML = `
    <div class="side-head" id="${key}-head"></div>
    <div class="bars">
      <span>シールド</span><div class="bar"><i class="sh" id="${key}-sh"></i><b class="gh" id="${key}-shg"></b></div><output id="${key}-sho"></output>
      <span>HP</span><div class="bar"><i class="hp" id="${key}-hp"></i><b class="gh" id="${key}-hpg"></b></div><output id="${key}-hpo"></output>
    </div>
    <div class="board" id="${key}-board"></div>
    <div class="result" id="${key}-res"></div>
    <div class="status" id="${key}-status"></div>
    <div class="fx" id="${key}-fx"></div>`;
}
sideSkeleton("enemy"); sideSkeleton("me");
$("track").innerHTML = CYCLE.map((ph, i) => `<div class="cell ${ph}" id="cell-${i}">${{ day: "昼", dusk: "没", night: "夜", dawn: "明" }[ph]}</div>`).join("");

/* 「結果」の1行：HPとシールドが最終的にいくつになったか */
function changeText([h0, h1, s0, s1]) {
  const part = (label, a, b, cls) => a === b ? "" :
    `<span class="chg ${cls}">${label} ${a}→<b>${Math.max(0, b)}</b><small>（${b > a ? "+" : ""}${b - a}）</small></span>`;
  return part("シールド", s0, s1, "sh") + part("HP", h0, h1, h1 > h0 ? "up" : "down");
}
const LOG_CLASS = { heal: "good", shield: "", play: "", counter: "buff", kyoka: "buff", finisher: "buddha", wrath: "buddha", buffget: "buff" };
function renderLog() {
  const el = $("log");
  el.innerHTML = g.logs.map(l => {
    if (l.k === "sum") {
      const parts = l.a.map((d, i) => { const t = changeText(d); return t ? `<span class="who">${nameOf(i)}</span>${t}` : ""; }).join("");
      return `<p class="sum">結果　${parts}</p>`;
    }
    const cls = l.k === "dmg" ? (l.t === seat ? "bad" : "good") : (LOG_CLASS[l.k] ?? l.k);
    return `<p class="${cls}">${fmt(l.m)}</p>`;
  }).join("");
  el.scrollTop = el.scrollHeight;
}

/* 状態は「良い効果」「悪い効果」に分け、効果の中身まで書く */
function statusChips(p) {
  const good = [], bad = [];
  const tag = (list, name, desc, cls = "") => list.push(`<span class="st ${cls}"><b>${name}</b>${desc ? `<small>${desc}</small>` : ""}</span>`);
  if (p.wrath) tag(bad, "怒り状態", `受ける攻撃-${R.WRATH_REDUCE}・合掌と仏の怒りしか使えない・必殺技${finisherBase(p)}`, "wrath");
  if (POLAR[p.hiou]) {
    const po = POLAR[p.hiou];
    tag(good, po.name, `自分の場はずっと${PHASE_JP[p.hiou]}（日没・夜明けも来ない）。自分のターン${POLAR_EVERY}回ごとに${po.stack}+1`);
    if (p.polar) tag(good, `${po.stack}${p.polar}`, `攻撃+${polarAtk(p)}${p.hiou === "night" ? `・受ける攻撃-${REIDO_CUT * p.polar}` : ""}`);
    if (p.kageuchi) tag(good, "影討ち", `このターン、使えるカード${KAGEUCHI_LIMIT}枚・与えるダメージ${KAGEUCHI_MULT}倍`);
    if (p.hiou === "night" && !p.newmoonUsed && (p.ownTurns || 0) <= NEWMOON_TURN)
      tag(good, (p.ownTurns || 0) === NEWMOON_TURN ? "新月が使える" : `新月まで${NEWMOON_TURN - (p.ownTurns || 0)}ターン`, "自分の12ターン目に1回だけ、相手とHPを入れ替えられる");
  }
  if (p.poison) tag(bad, `毒${p.poison}`, `ターン開始にHP-${Math.floor(p.poison * g.poisonMult(p) + 0.5)}${p.hiou === "day" ? `（白夜：毒${BYAKUYA_POISON_FREE}以下は効かない）` : g.phaseFor(p) === "day" ? "（昼は半分・2ずつ減る）" : ""}`, "poison");
  if (p.bleed) tag(bad, `出血 残${p.bleed}`, `カードを使うたびHP-${Math.floor(R.BLEED_DMG * g.dotMult(p) + 0.5)}`, "bleed");
  if (p.recoverHalf) tag(bad, "回復半減", "月読：シールド回復が半分");
  if (p.numbNext) tag(bad, "痺れ", "次のターン、使えるカードが1枚減る");
  if (p.numb && p === g.active) tag(bad, "痺れ中", "このターン使えるカードが1枚減っている");
  if (p.drowsyNext) tag(bad, "眠り", "次のターン、引く枚数が1枚減る");
  if (p.calm) tag(good, "不動心", "特殊ダメージが半分");
  if (p.koromoTurns) tag(good, `毒の衣 残${p.koromoTurns}`, `受ける攻撃-${p.koromoCut}`);
  if (p.waiting) tag(good, "待ちの構え", `ドローできない・次に受けたダメージを${WAIT_MULT}倍で返す`);
  if (p.berserkTurns) tag(good, `狂乱 残${p.berserkTurns}`, `攻撃+${debuffs(p)}（デバフの数）・返されるダメージ2倍`);
  if (p.dohatsuTurns) tag(good, `怒髪天 残${p.dohatsuTurns}`, `受けるダメージ-${p.dohatsuCut}・溜め${Math.floor((p.anger || 0) / DOHATSU_PER)}（必殺技に上乗せ）`);
  else if (p.anger >= DOHATSU_PER) tag(good, "怒りの溜め", `必殺技+${Math.floor(p.anger / DOHATSU_PER)}`);
  if (p.lingerTurns) tag(bad, `蝕み 残${p.lingerTurns}`, `ターンの始めに毒${p.lingerAmt}`);
  if (p.blind || p.hand.some(c => c.hidden)) tag(bad, `暗闇${p.blind ? ` 残${p.blind}` : ""}`, "引いたカードが裏向き");
  const ot = charge(g.opp(p), "tsukuyomi");
  if (ot) tag(bad, `回復-${ot}`, "相手の月読：シールド回復が減る");
  if (p.counter) tag(good, "反撃の構え", "次の攻撃を半分にして半分返す");
  if (p.parry) tag(good, "見切り", "次の攻撃を0にする");
  if (p.karmaTurns) tag(good, `因果応報 残${p.karmaTurns}`, `溜めた特殊ダメージ${p.karmaStore || 0}→終わるとHP+${Math.floor((p.karmaStore || 0) * R.KARMA_HEAL)}・${Math.floor((p.karmaStore || 0) * R.KARMA_MULT)}を返す`);
  if (p.guard) tag(good, `金剛-${p.guard}`, "次の自分のターンまで受ける攻撃が減る");
  if (p.thornsTurns) tag(good, `棘の鎧 残${p.thornsTurns}`, `攻撃を受けるたび相手に${p.thorns}`);
  if (p.regenTurns) tag(good, `再生 残${p.regenTurns}`, `ターン開始にHP+${p.regen}`);
  if (p.kyoka) tag(good, "鏡花水月", `攻撃を1回${R.KYOKA_MULT}倍で跳ね返せる`);
  if (p.blessing.includes("day")) tag(good, "天照の加護", "昼カードが常に1.5倍");
  if (p.blessing.includes("night")) tag(good, "月読の加護", "夜カードが常に1.5倍");
  if (p.kodoku) tag(good, "蠱毒", `与える毒と出血が${R.KODOKU_MULT}倍`);
  if (p.shura) tag(good, "修羅", `HPを払うカードが${BLOOD.SHURA_MULT}倍`);
  for (const b of BUFF_ORDER) if (p.buffs.has(b)) tag(good, BUFFS[b][0], BUFFS[b][1].replace("以降、", ""), "hiou");
  return { good, bad };
}
/* シールドとHPのゲージ。pv（選んでいるカードの見込み [HP前, HP後, シールド前, シールド後]）があれば、
   変わる部分をゲージと同じ色で薄く点滅させる */
function renderBars(key, p, pv = null) {
  const [h1, s1] = pv ? [pv[1], pv[3]] : [p.hp, p.shield];
  const bar = (k, now, after, cap) => {
    const a = Math.max(0, now) / cap * 100, b = Math.max(0, after) / cap * 100;
    $(`${key}-${k}`).style.width = `${Math.min(a, b)}%`;
    const gh = $(`${key}-${k}g`);
    gh.className = `gh ${k}${b < a ? " loss" : b > a ? " gain" : ""}`;
    gh.style.left = `${Math.min(a, b)}%`; gh.style.width = `${Math.abs(a - b)}%`;
    const cur = Math.max(0, now), nxt = Math.max(0, after);
    $(`${key}-${k}o`).innerHTML = cur === nxt ? `${cur}/${cap}` : `${cur}→<b class="${nxt < cur ? "down" : "up"}">${nxt}</b>`;
  };
  const low = Math.max(0, h1) <= R.MAX_HP / 3;
  $(`${key}-hp`).classList.toggle("low", low);
  $(`${key}-hpg`).classList.toggle("low", low);
  bar("hp", p.hp, h1, R.MAX_HP);
  bar("sh", p.shield, s1, R.SHIELD_CAP);
}
/* 盤面：デッキの山・モンスターの場（2枠）・ドロップゾーン。mons は選んでいる攻撃の見込み {uid: 残りHP} */
function renderBoard(key, p, mons = null) {
  const i = g.idx(p), o = g.opp(p);
  const aiming = i !== seat && selAiming();
  const slots = Array.from({ length: R.MAX_MON }, (_, k) => {
    const m = p.monsters[k];
    if (!m) return `<div class="slot empty"><small>場</small></div>`;
    const per = g.incoming(o, g.outgoing(p, m.power, g.attrMult(m.attr, p)));
    const now = Math.max(0, m.hpNow), after = mons && m.uid in mons ? Math.max(0, mons[m.uid]) : now;
    const a = now / m.hp * 100, b = after / m.hp * 100;
    return `<div class="slot mon a-${m.attr}${m.art ? ` art-${m.art}` : ""}${aiming ? " aimable" : ""}${aiming && sel.target === m.uid ? " aimed" : ""}" data-mon="${m.uid}"${aiming ? ` data-aim="${m.uid}"` : ""}>
      <b class="m-name">${m.name}</b>
      <span class="m-atk" title="ターン終了時に相手を攻撃">攻${per}</span>
      <div class="bar mbar"><i class="mhp" style="width:${Math.min(a, b)}%"></i><b class="gh mhp${b < a ? " loss" : ""}" style="left:${b}%;width:${Math.max(0, a - b)}%"></b></div>
      <small class="m-hp">HP ${now === after ? `${now}/${m.hp}` : `${now}→<b class="down">${after}</b>${after === 0 ? " 破壊" : ""}`}</small>
    </div>`;
  }).join("");
  const top = p.drop[p.drop.length - 1];
  $(`${key}-board`).innerHTML = `
    <div class="pile deck sleeve-${p.cos?.sleeve || "basic"}" id="${key}-deck"><span class="pile-n">${p.deck.length}</span><small>デッキ</small></div>
    <div class="slots">${slots}</div>
    <button class="pile drop" id="${key}-drop" data-act="drop" data-seat="${i}" aria-label="${nameOf(i)}のドロップゾーンを見る">
      <span class="pile-n">${p.drop.length}</span><small>ドロップ</small>${top ? `<em class="a-${top.attr}">${top.name}</em>` : ""}</button>`;
}
function renderSide(key, p, pv = null, mons = null) {
  const i = g.idx(p);
  const cos = p.cos || {};
  const head = [`<span class="side-name">${cos.icon ? `<span class="p-icon frame-${cos.frame || "plain"}">${cos.icon}</span>` : ""}${nameOf(i)}${mode === "online" && i !== seat && cos.name ? `<small>（${cos.name}）</small>` : ""}</span>`];
  if (cos.title) head.push(`<span class="chip p-title">${cos.title}</span>`);
  $(`side-${key}`).dataset.mat = cos.mat || "basic";
  if (i !== seat) head.push(`<span class="chip" id="${key}-handchip">手札${p.hand.length}枚</span>`);
  $(`${key}-head`).innerHTML = head.join("");
  renderBars(key, p, pv);
  renderBoard(key, p, mons);

  // 直前の結果：この人のHPかシールドが変わった一番新しい行動
  const last = [...g.logs].reverse().find(l => l.k === "sum" && changeText(l.a[i]));
  $(`${key}-res`).innerHTML = last ? `<span class="res-label">直前の結果：${fmt(last.m)}</span>${changeText(last.a[i])}` : "";

  const rows = [];
  const stacks = Object.entries(p.stacks).filter(([, s]) => s.length);
  if (stacks.length) {
    rows.push(`<div class="st-row"><span class="st-head">溜め</span><div class="stacks">${stacks.map(([id, s]) =>
      `<div class="stack"><b>${OUGI[id].name}</b><span class="pips gold">${"●".repeat(s.length)}${"○".repeat(R.OUGI_AT - s.length)}</span>
        <small>${OUGI[id].charge(s.length)}${s.length === R.OUGI_AT - 1 ? "・次で必殺技" : ""}</small></div>`).join("")}</div></div>`);
  }
  const { good, bad } = statusChips(p);
  if (bad.length) rows.push(`<div class="st-row"><span class="st-head bad">悪い</span><div class="sts">${bad.join("")}</div></div>`);
  if (good.length) rows.push(`<div class="st-row"><span class="st-head good">良い</span><div class="sts">${good.join("")}</div></div>`);
  $(`${key}-status`).innerHTML = rows.join("");
}

function cardMain(p, c) {
  if (c.type === "attack") {
    const v = g.preview(p, c) - (c.poison || 0) * ((c.poison || 0) + 1) / 2;   // 毒牙の毒は数字に混ぜない
    const m = g.cardMult(c);
    let extra = m > 1 ? `（${POLAR[p.hiou] ? POLAR[p.hiou].name : PHASE_JP[g.phase]}で${m}倍）` : "";
    if (c.drain) extra += "与ダメの半分HP回復";
    if (c.rage) extra += `減ったHP${BLOOD.RAGE_STEP}ごとに+1`;
    if (c.recoil) extra += `自分もHP-${c.recoil}`;
    if (c.eclipse && m === 1) extra += "日没・夜明けは2倍";
    if (c.revenge) extra += `前の相手ターンに受けたダメージ（${p.revengeBase || 0}）の半分を上乗せ`;
    if (c.poison) extra += `＋毒${c.poison}`;
    if (c.numbing) extra += "＋相手を痺れさせる";
    if (c.allday && m === 1) extra += "昼でも夜でも1.5倍";
    if (c.zeal) extra += "＋仏の怒りの溜め×2";
    if (c.fury) extra += `（このターン使った${p.usedTurn || 0}枚・払ったHP${p.hpPaidTurn || 0}で上がる）`;
    if (c.blind) extra += `＋相手を${c.blind}ターン暗闇（引いたカードが裏向き）`;
    if (c.attr === "both" && m === 1) extra += "昼でも夜でも1.5倍";
    if (c.splash) extra += "与えた分シールド回復";
    if (c.frenzy) extra += p.hp <= R.MAX_HP / 2 ? "（HP半分以下で2倍）" : "HPが半分以下なら2倍";
    return `<big class="${v > c.power ? "boost" : ""}">${v}</big>ダメージ ${extra}`;
  }
  if (c.type === "heal") return `<big>+${c.power}</big>HPを回復${c.cure ? "・毒と出血も治す" : ""}${c.wrathok ? "。<b>怒り状態でも使える</b>" : ""}`;
  if (c.type === "poison") return `<big>${c.power}</big>毒を与える（毎ターンHPに直接）${c.sleep ? "＋相手の次のターン、引く枚数-1" : ""}`;
  if (c.type === "bleed") return `<big>${c.power}</big>ターン出血。相手はカードを使うたびHP-${R.BLEED_DMG}${c.numbing ? "＋相手の次のターン、使えるカード-1" : ""}`;
  if (c.type === "counter") return `<big>½</big>次に受ける攻撃を半分にし、半分を返す${c.draw ? "。1枚引く" : ""}`;
  if (c.type === "bloodshield") return `<big>+${c.power}</big>HPを${c.hpcost}払ってシールドを増やす`;
  if (c.type === "regen") return `<big>+${c.power}×${c.turns}</big>毎ターン始めにHP回復`;
  if (c.type === "draw") return `<big>${c.power}枚</big>HPを${c.hpcost}払って引く`;
  if (c.type === "sutra") return `<big>仏</big>デッキから仏の怒りを1枚手札へ（残り${p.deck.filter(x => x.id === "buddha").length}枚）`;
  if (c.type === "gassho") return `<big>+${c.power}</big>シールド回復。<b>怒り状態でも使える</b>`;
  if (c.type === "calm") return `<big>½</big>次の自分のターンまで、毒・出血などの特殊ダメージが半分。<b>怒り状態でも使える</b>`;
  if (c.type === "koromo") return `<big>-${c.cut}</big>自分に毒${c.power}。${c.turns}ターン、受ける攻撃-${c.cut}`;
  if (c.type === "wait") return `<big>×${WAIT_MULT}</big>ダメージを受けるまでドローできない。次に受けたダメージを${WAIT_MULT}倍で返す`;
  if (c.type === "berserk") return `<big>+${debuffs(p)}</big>${c.turns}ターン、自分のデバフの数だけ攻撃+1（毒・出血はその量だけ）。ただし反撃などで返されるダメージは2倍`;
  if (c.type === "dohatsu") return `<big>-${c.power}</big>${c.turns}ターン、受けるダメージが減り、受けたダメージ2ごとに必殺技+1・HP+1。<b>怒り状態でも使える</b>`;
  if (c.type === "linger") return `<big>${c.turns}</big>ターンの間、相手のターンの始めに毒${c.power}`;
  if (c.type === "sunshield") return `<big>+${c.power * (g.phaseFor(p) === "night" ? 2 : 1)}</big>シールド回復（夜は2倍）`;
  if (c.type === "shieldbreak") return `<big>-${c.power}</big>相手のシールドを削る`;
  if (c.type === "nembutsu") return `<big>+${c.power + 2 * charge(p, "buddha")}</big>シールド回復（仏の怒りの溜め×2を足す）`;
  if (c.type === "guard") return `<big>-${c.power}</big>次の自分のターンまで、受ける攻撃が全部減る${c.wrathok ? "。<b>怒り状態でも使える</b>" : ""}`;
  if (c.type === "parry") return `<big>0</big>次に受ける攻撃をダメージ0にする`;
  if (c.type === "karma") return `<big>${c.turns}</big>ターンの間に受けた特殊ダメージ（毒・出血・蠱毒）を溜め、終わったら半分を回復し、${R.KARMA_MULT}倍にして相手のHPに直接返す`;
  if (c.type === "thorns") return `<big>${c.power}</big>${c.turns}ターンの間、攻撃を受けるたび相手にダメージ`;
  if (c.type === "corrode") { const o = g.opp(p); return `<big>-${Math.min(o.shield, o.poison)}</big>相手の毒の量だけ相手のシールドを削る`; }
  if (c.type === "bloom") { const o = g.opp(p); return `<big>${Math.floor(o.poison * g.poisonMult(o) + 0.5)}</big>相手の毒を今すぐ全部HPに入れる（毒は0になる）`; }
  if (c.type === "convert") {
    const src = c.to === "day" ? "night" : "day";
    return `<big>${p.hand.filter(x => x.attr === src).length}</big>枚の${ATTR_JP[src]}カードを${ATTR_JP[c.to]}属性に変えて1枚引く。<b>枚数に数えない</b>`;
  }
  if (c.type === "summon") {
    const per = g.incoming(g.opp(p), g.outgoing(p, c.power, g.attrMult(c.attr, p)));
    return `<big class="${per > c.power ? "boost" : ""}">攻${per}</big>HP${c.hp}。場にコールし、ターン終了時に相手を攻撃${monExtra(c)}。倒されるとドロップゾーンへ`;
  }
  const k = stackOf(p, c.id).length, next = k + 1;
  const hint = next >= R.OUGI_AT ? `次で必殺技：${OUGI[c.id].desc.split("＋")[0]}`
    : c.id === "buddha" && next >= R.WRATH_AT ? "次で怒り状態" : `溜めると：${OUGI[c.id].charge(next)}`;
  return `<big>${k}/${R.OUGI_AT}</big>${hint}。1ターン1枚`;
}

/* 「使う」「回復」とどうなるかを、盤面の写しで実際に試して求める。両者の [HP前, HP後, シールド前, シールド後] を返す */
function simulate(uid, m, target = null) {
  try {
    const sim = Game.load(g.serialize());
    sim.players[1 - seat].isAI = true;   // 鏡花水月で跳ね返すかは、AIの判断で見積もる
    const before = sim.snap();
    if (!sim.play(sim.players[seat], uid, m, target)) return null;
    const mons = {};   // 相手のモンスターの残りHP（破壊されたら0）
    for (const x of g.players[1 - seat].monsters) mons[x.uid] = sim.players[1 - seat].monsters.find(y => y.uid === x.uid)?.hpNow ?? 0;
    return { d: sim.players.map((p, i) => [before[i][0], p.hp, before[i][1], p.shield]), mons };
  } catch { return null; }
}

/* ===== カードを選ぶ → 使うか回復かを選ぶとゲージに結果が出る → もう一度押すと決定 ===== */
let sel = null;   // { uid, mode: null | "use" | "recover", target: 狙う相手のモンスターの uid（null なら相手） }
function selectedCard() { return sel && g.players[seat].hand.find(c => c.uid === sel.uid); }
function checkSel() {
  const c = selectedCard();
  // 裏向き（暗闇）のカードは、使えるかどうかを確かめない（確かめると中身が分かってしまう）
  if (!c || !myTurnNow() || (sel.mode && !c.hidden && !g.canPlay(g.players[seat], c, sel.mode))) sel = null;
  else if (sel.target != null && !g.players[1 - seat].monsters.some(m => m.uid === sel.target)) sel.target = null;
}
/* 攻撃カードを「使う」で選んでいて、相手の場にモンスターがいる（狙いを選べる） */
function selAiming() {
  const c = selectedCard();
  return !!c && sel.mode === "use" && c.type === "attack" && g.players[1 - seat].monsters.length > 0;
}
function selPreview() {
  checkSel();
  return sel?.mode && !selectedCard()?.hidden ? simulate(sel.uid, sel.mode, sel.target ?? null) : null;
}
function selGuideHTML(me) {
  const c = selectedCard();
  if (c.hidden) return `<div class="act-row sel"><b class="sel-name">裏向きのカード</b><span class="act-hint">暗闇で中身が分からない。もう一度押すと使う（使えないカードだったら何も起きない）</span>
    <span class="grow"></span>${[["use", "使う"], ["recover", "回復"]].map(([m, l]) => `<button class="btn small${sel.mode === m ? " primary" : ""}" data-act="${m === "use" ? "use" : "rec"}" data-uid="${c.uid}">${sel.mode === m ? `${l}で決定` : l}</button>`).join("")}
    <button class="btn small" data-act="cancel">やめる</button></div>`;
  const modes = isOugi(c) ? [["use", "溜める"]] : [["use", "使う"], ["recover", "回復"]];
  const btns = modes.map(([m, label]) => {
    const ok = g.canPlay(me, c, m), on = sel.mode === m;
    return `<button class="btn small${on ? " primary" : ""}" data-act="${m === "use" ? "use" : "rec"}" data-uid="${c.uid}" ${ok ? "" : "disabled"}>${on ? `${label}で決定` : label}</button>`;
  }).join("");
  const warn = sel.mode === "use" && g.players[1 - seat].kyoka && c.type === "attack" && sel.target == null ? `<span class="o-warn">鏡花水月で跳ね返されるかも</span>` : "";
  const aim = selAiming() ? `<span class="aim"><span class="aim-label">狙い</span>${[
    `<button class="btn small${sel.target == null ? " on" : ""}" data-act="aim" data-t="">${nameOf(1 - seat)}</button>`,
    ...g.players[1 - seat].monsters.map(m => `<button class="btn small${sel.target === m.uid ? " on" : ""}" data-act="aim" data-t="${m.uid}">${m.name}</button>`),
  ].join("")}</span>` : "";
  const hint = c.hidden ? "暗闇で中身が分からない。使うまで何が起きるか分からない" : sel.mode ? (cfg.confirm2 ? "点滅している部分が変わる・もう一度押すと決定" : "") : "使うか回復を選ぶ";
  return `<div class="act-row sel"><b class="sel-name">${c.name}</b>${hint ? `<span class="act-hint">${hint}</span>` : ""}${aim}${warn}
    <span class="grow"></span>${btns}<button class="btn small" data-act="cancel">やめる</button></div>`;
}

function myTurnNow() { return !!g && !busy && !g.over && !g.pending && g.turnIdx === seat; }

function guideHTML(me) {
  const row = inner => `<div class="act-row">${inner}</div>`;
  if (g.over) return row(`<span class="turn-chip">試合終了</span>`);
  if (g.pending?.type === "reflect")
    return row(`<span class="turn-chip">${g.pending.seat === seat ? "鏡花水月：跳ね返すか選ぼう" : `${nameOf(g.pending.seat)}が鏡花水月を使うか選んでいる…`}</span>`);
  if (g.turnIdx !== seat)
    return row(`<span class="turn-chip foe">${nameOf(1 - seat)}のターン</span><span class="act-hint">${mode === "ai" ? "行動中…" : "相手の操作を待っている"}</span>`);
  if (selectedCard()) return selGuideHTML(me);
  const lim = playLimit(me), left = Math.max(0, lim - (me.plays || 0));
  const pips = `<span class="plays" title="このターンに使える残りの枚数（使う・回復・奥義）"><span class="pip-row">${"●".repeat(left)}${"○".repeat(lim - left)}</span><small>${left ? `あと${left}枚` : "使い切った"}${me.numb ? "（痺れ）" : ""}${me.kageuchi ? "（影討ち）" : ""}</small></span>`;
  const pairs = g.pairOptions(me);
  const po = POLAR[me.hiou];
  let polarHTML = "";
  if (po) {   // 日蝕・月食（指定カード3枚を捨てる。捨てる3枚は、いま役に立たないものから自動で選ぶ）と新月
    const cs = g.trioCards(me).filter(c => !c.hidden);
    const drop = cs.length >= TRIO ? [...cs].sort((a, b) => (AI.score(g, me, a) || 0) - (AI.score(g, me, b) || 0)).slice(0, TRIO) : [];
    const what = me.hiou === "day" ? `影討ち：このターン、使えるカード${KAGEUCHI_LIMIT}枚・与えるダメージ${KAGEUCHI_MULT}倍` : `相手のHPとシールドの${GESSHOKU_RATE * 100}%を奪う`;
    const btns = [drop.length ? `<button class="btn small" data-act="trio" data-u="${drop.map(c => c.uid).join(",")}">${po.trio}（${drop.map(c => c.name).join("・")}を捨てる）</button>` : "",
      g.newmoonReady(me) ? `<button class="btn small" data-act="newmoon">新月（HPを入れ替える：あなた${me.hp}⇄相手${g.opp(me).hp}）</button>` : ""].join("");
    if (btns) polarHTML = `<div class="pairs"><span class="act-hint"><b>${po.name}</b>：${drop.length ? `${po.trio}＝${what}（枚数に数えない）` : ""}${g.newmoonReady(me) ? "　新月はこのターンだけ" : ""}</span>${btns}</div>`;
  }
  const pairHTML = polarHTML + (pairs.length ? `<div class="pairs"><span class="act-hint"><b>${PHASE_JP[g.phase]}</b>：昼と夜の指定カードを同時に使うと${HIOU_NAME[me.hiou || "balanced"]}（枚数に数えない）</span>
    ${pairs.map(([d, n]) => `<button class="btn small" data-act="pair" data-d="${d.uid}" data-n="${n.uid}">${d.name}＋${n.name}（シールド-${g.shieldCost(me, d) + g.shieldCost(me, n)}）</button>`).join("")}</div>` : "");
  const note = me.wrath ? `<span class="act-hint">怒り状態：仏の怒りと「怒り状態でも使える」カードだけ使える</span>` : me.bleed ? `<span class="act-hint">出血中：使うたびHP-${R.BLEED_DMG}</span>` : "";
  return `${pairHTML}${row(`${pips}${note}<span class="grow"></span><button class="btn primary" data-act="end">ターン終了</button>`)}`;
}

function render() {
  if (!g) return;
  const me = g.players[seat], en = g.players[1 - seat];
  const myTurn = myTurnNow();
  document.documentElement.dataset.phase = g.phase;
  $("modeFlag").textContent = mode === "online" ? `オンライン・部屋 ${room?.code || ""}` : "AI対戦";

  const idx = (g.round - 1) % CYCLE.length;
  CYCLE.forEach((ph, i) => {
    const cell = $(`cell-${i}`);
    const ov = g.override?.[g.round - idx + i];   // 白夜・極夜で変わった巡
    cell.className = `cell ${ov || ph}${ov ? " polar" : ""}`;
    cell.textContent = ov ? (ov === "day" ? "白" : "極") : { day: "昼", dusk: "没", night: "夜", dawn: "明" }[ph];
    cell.classList.toggle("cur", i === idx);
    cell.classList.toggle("past", i < idx);
  });
  const myPolar = POLAR[g.players[seat]?.hiou];
  $("phaseName").textContent = `第${g.round}巡　${PHASE_JP[g.phase]}${myPolar ? `（あなたの場は${myPolar.name}）` : ""}`;
  const [k, nxt] = g.roundsToTransition();
  const esc = g.escalation();
  $("phaseInfo").textContent = (k === 0 ? "秘奥のチャンス・日蝕が2倍" : `次の${PHASE_JP[nxt]}まであと${k}巡${g.phase === "day" || g.phase === "night" ? `　${PHASE_JP[g.phase]}のカードが1.5倍` : ""}`)
    + (esc > 1 ? `　日蝕の深まり：全ダメージ×${esc}` : "");

  const rects = captureRects();   // 動きの演出用：描き直す前のカードの位置
  const pv = selPreview();
  renderSide("enemy", en, pv?.d[1 - seat], pv?.mons);
  renderSide("me", me, pv?.d[seat]);
  renderBars("mini", me, pv?.d[seat]);   // スマホ用：手札の帯の上に出す自分のゲージ
  renderLog();

  const guide = $("guide");
  guide.innerHTML = guideHTML(me);
  guide.classList.toggle("big", myTurn && !sel && g.pairOptions(me).length > 0);
  guide.classList.toggle("mine", myTurn);
  guide.classList.toggle("picking", !!sel);

  $("deckInfo").textContent = `${me.hand.length}枚　デッキ残り${me.deck.length}`;
  $("hand").innerHTML = me.hand.map(c => {
    if (c.hidden) {   // 暗闇：中身は見せない。使えるかどうかも、使ってみるまで分からない
      const picked = sel?.uid === c.uid, armed = m => picked && sel.mode === m;
      const can = myTurn && (me.plays || 0) < playLimit(me) && !me.wrath;
      return `<div class="card hidden-card${can ? "" : " off"}${picked ? " lifted" : sel ? " dim" : ""}" data-pick="${c.uid}">
        <span class="c-top"><span>暗闇</span><span>？</span></span>
        <span class="c-name">？？？</span>
        <span class="c-main"><big>？</big>暗闇で見えない。使うまで何のカードか分からない</span>
        <span class="c-btns">
          <button class="c-btn use${armed("use") ? " armed" : ""}" data-act="use" data-uid="${c.uid}" ${can ? "" : "disabled"}>${armed("use") ? "<span>決定する</span>" : "<span>使う</span><span>？</span>"}</button>
          <button class="c-btn rec${armed("recover") ? " armed" : ""}" data-act="rec" data-uid="${c.uid}" ${can ? "" : "disabled"}>${armed("recover") ? "<span>決定する</span>" : "<span>回復</span><span>？</span>"}</button>
        </span></div>`;
    }
    const mark = me.designated.day.includes(c.id) ? "★昼の指定" : me.designated.night.includes(c.id) ? "★夜の指定" : "";
    const canUse = myTurn && g.canPlay(me, c, "use");
    const canRec = myTurn && g.canPlay(me, c, "recover");
    const cost = g.shieldCost(me, c);
    const short = Math.max(0, cost - me.shield);
    const special = isOugi(c);
    const picked = sel?.uid === c.uid;
    const armed = m => picked && sel.mode === m;   // 見込みを表示中：もう一度押すと決定
    const useLabel = armed("use") ? `<span>決定する</span>`
      : isOugi(c) ? `<span>溜める</span>${me.stackUsed.includes(c.id) ? "<span>今ターンは使用済み</span>" : ""}`
      : `<span>使う</span><span>${[cost ? `シールド-${cost}${short ? `（HP-${short}）` : ""}` : "", c.hpcost ? `HP-${c.hpcost}` : ""].filter(Boolean).join("・") || "消費なし"}</span>`;
    const recLabel = armed("recover") ? `<span>決定する</span>` : `<span>回復</span><span>シールド+${c.recover}</span>`;
    return `<div class="card a-${c.attr} t-${c.type}${c.art ? ` art-${c.art}` : ""}${canUse || canRec ? "" : " off"}${picked ? " lifted" : sel ? " dim" : ""}" data-pick="${c.uid}">
      ${mark ? `<span class="c-mark">${mark}</span>` : ""}
      <span class="c-top"><span>${special ? "特殊" : ATTR_JP[c.attr] + "属性"}</span><span>${TYPE_JP[c.type]}</span></span>
      <span class="c-name">${c.name}</span>
      <span class="c-main">${cardMain(me, c)}</span>
      <span class="c-btns">
        <button class="c-btn use${armed("use") ? " armed" : ""}" data-act="use" data-uid="${c.uid}" ${canUse ? "" : "disabled"}>${useLabel}</button>
        ${special ? "" : `<button class="c-btn rec${armed("recover") ? " armed" : ""}" data-act="rec" data-uid="${c.uid}" ${canRec ? "" : "disabled"}>${recLabel}</button>`}
      </span>
    </div>`;
  }).join("") || `<p style="margin:0;color:var(--muted)">手札がない</p>`;

  runFx();
  animateMoves(rects);
}

/* ===== ダイアログ ===== */
function showDialog(html, kind = "") { $("dialog").innerHTML = html; $("dialog").dataset.kind = kind; $("overlay").hidden = false; $("dialog").querySelector("button, input")?.focus(); }
function hideDialog() { $("overlay").hidden = true; $("dialog").dataset.kind = ""; }

function howToHTML() {
  return `<ol>
    <li><b>カードの「使う」</b>を押すと、シールドを消費して攻撃や回復ができる。<b>「回復」</b>を押すと、そのカードを捨ててシールドを増やせる。<b>1ターンに使えるのは${R.PLAY_LIMIT}枚まで</b>。</li>
    <li>1回押すと、カードが浮かんで<b>HPとシールドがどうなるかがゲージに出る</b>（変わる部分が点滅する）。<b>同じボタンをもう一度押すと決定</b>。やめるときはカードをもう一度押すか「やめる」。</li>
    <li>攻撃カードを選ぶと、<b>相手のモンスターを押してそちらを狙える</b>。モンスターはシールドがなく、HPが0になると破壊されてドロップゾーンへ行く。</li>
    <li>シールドは<b>攻撃のコスト</b>であり、<b>敵の攻撃を受け止める壁</b>でもある。攻めるほど守りが薄くなる。終わったら<b>ターン終了</b>。</li>
    <li>${PHASE_ROUNDS}巡ごとに<b>日没</b>と<b>夜明け</b>が来る。そのとき昼と夜の<b>指定カード</b>を1枚ずつ同時に使うと、試合中ずっと続く<b>秘奥</b>がもらえる（${R.PLAY_LIMIT}枚には数えない）。選べる秘奥はデッキのタイプで変わる。</li>
  </ol>`;
}
function showHowTo() {
  const names = ids => ids.map(id => `<b>${CARDS[id].name}</b>`).join("・");
  const me = g?.players[seat];
  showDialog(`<h2>遊び方</h2>${howToHTML()}
    ${me ? `<p>この試合の指定カード　昼：${names(me.designated.day) || "なし"}　夜：${names(me.designated.night) || "なし"}${!me.designated.day.length || !me.designated.night.length ? "（片方しかないので、指定カード2枚で発動）" : ""}</p>
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

function showFinish(pay = null) {
  const me = g.players[seat];
  const [title, text] = g.winnerIdx === seat ? ["勝利", `第${g.round}巡で${nameOf(1 - seat)}を倒した。`]
    : g.winnerIdx != null ? ["敗北", `第${g.round}巡で倒された。`]
    : ["引き分け", "決着がつかなかった。"];
  showDialog(`<h2>${title}</h2><p>${text}獲得した秘奥：${[...me.buffs].map(b => BUFFS[b][0]).join("・") || "なし"}</p>
    ${pay ? `<p class="pay">${pay.bet ? `賭け ${pay.bet}pt ／ ` : ""}<b>+${pay.gain}pt</b>　所持 ${pay.points}pt</p>` : ""}
    <div class="join">
      <button class="btn" data-act="again">${mode === "online" ? "同じ相手ともう一度" : "もう一度遊ぶ"}</button>
      <button class="btn sub" data-act="menu">ホームへ</button>
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
    case "attack": return `${c.power}ダメージ${c.drain ? "・与ダメの半分HP回復" : ""}${c.recoil ? `・自分もHP-${c.recoil}` : ""}${c.eclipse ? "・日没と夜明けは2倍" : ""}${c.rage ? `・減ったHP${BLOOD.RAGE_STEP}ごとに+1` : ""}${c.hpcost ? `・HPを${c.hpcost}払う` : ""}${c.revenge ? "・前の相手ターンに受けたダメージの半分を上乗せ" : ""}${c.poison ? `・毒${c.poison}` : ""}${c.numbing ? "・相手の次のターン、使えるカード-1" : ""}${c.blind ? `・相手を${c.blind}ターン暗闇（引いたカードが裏向き）` : ""}${c.allday ? "・昼でも夜でも1.5倍" : ""}${c.zeal ? "・仏の怒りの溜め×2を足す" : ""}${c.fury ? "・このターン使ったカード1枚ごとに+2、払ったHP3ごとに+1" : ""}${c.attr === "both" ? "・昼でも夜でも1.5倍" : ""}${c.splash ? "・与えた分シールド回復" : ""}${c.frenzy ? "・HPが半分以下なら2倍" : ""}`;
    case "draw": return `HPを${c.hpcost}払って${c.power}枚引く`;
    case "sutra": return "デッキから仏の怒りを1枚手札に加える";
    case "gassho": return `シールド+${c.power}。怒り状態でも使える`;
    case "calm": return "次の自分のターンまで、特殊ダメージが半分。怒り状態でも使える";
    case "koromo": return `自分に毒${c.power}。${c.turns}ターン、受ける攻撃-${c.cut}`;
    case "wait": return `ダメージを受けるまでドローできない。次に受けたダメージを${WAIT_MULT}倍で返す`;
    case "berserk": return `${c.turns}ターン、自分のデバフの数だけ攻撃+1（毒・出血はその量だけ）。返されるダメージは2倍`;
    case "dohatsu": return `${c.turns}ターン、受けるダメージ-${c.power}。受けたダメージ2ごとに必殺技+1・HP+1。怒り状態でも使える`;
    case "linger": return `${c.turns}ターンの間、相手のターンの始めに毒${c.power}`;
    case "sunshield": return `シールド+${c.power}（夜なら+${c.power * 2}）`;
    case "shieldbreak": return `相手のシールド-${c.power}`;
    case "nembutsu": return `シールド+${c.power}＋仏の怒りの溜め×2`;
    case "guard": return `次の自分のターンまで、受ける攻撃が全部-${c.power}`;
    case "parry": return "次に受ける攻撃をダメージ0にする";
    case "karma": return `${c.turns}ターンの間に受けた特殊ダメージを溜め、終わったら半分を回復し、${R.KARMA_MULT}倍にして相手のHPに直接返す`;
    case "thorns": return `${c.turns}ターンの間、攻撃を受けるたび相手に${c.power}ダメージ`;
    case "corrode": return "相手の毒の量だけ相手のシールドを削る";
    case "bloom": return "相手の毒を今すぐ全部HPに入れて、毒を0にする";
    case "convert": return `手札の${c.to === "day" ? "夜" : "昼"}カードを${ATTR_JP[c.to]}属性に変えて1枚引く（1ターンの枚数に数えない）`;
    case "heal": return `HP+${c.power}${c.cure ? "・毒と出血を治す" : ""}`;
    case "poison": return `毒${c.power}（毎ターンHPに直接）${c.sleep ? "・相手の次のターン、引く枚数-1" : ""}`;
    case "bleed": return `${c.power}ターン出血（カードを使うたびHP-${R.BLEED_DMG}）${c.numbing ? "・相手の次のターン、使えるカード-1" : ""}`;
    case "counter": return `次に受ける攻撃を半分にし、半分を返す${c.draw ? "。1枚引く" : ""}`;
    case "bloodshield": return `HPを${c.hpcost}払ってシールド+${c.power}`;
    case "regen": return `${c.turns}ターンの間、毎ターンHP+${c.power}`;
    case "summon": return `場にコール：攻撃${c.power}・HP${c.hp}（ターン終了時に攻撃${monExtra(c)}。倒されるとドロップゾーンへ）`;
    case "buddha": case "ougi": return `溜めている間：${[1, 2, 3].map(k => OUGI[id]?.charge(k)).join(" → ")}。${R.OUGI_AT}枚目で必殺技：${OUGI[id]?.desc || ""}`;
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
  const own = id => window.Meta ? Meta.owned(id) : maxCopies(id);   // 持っている枚数（ショップのカードパックで増える）
  const row = (id, c) => {
    const n = def[id] || 0;
    const has = Math.min(own(id), maxCopies(id));
    const canDes = (c.attr === "day" || c.attr === "night") && !isOugi(c);
    const isDes = canDes && (chosen[c.attr] || []).includes(id);
    return `<div class="dk-row">
      <div class="dk-info"><b>${c.name}</b><span class="dk-own${has ? "" : " none"}">所持${own(id)}</span><span>${TYPE_JP[c.type]}　${cardBrief(c, id)}</span><span class="dk-cost">消費${c.cost}／回復+${c.recover}</span></div>
      ${canDes ? `<button class="dk-des${isDes ? " on" : ""}" data-act="dk-des" data-id="${id}" ${n ? "" : "disabled"} aria-pressed="${isDes}">★指定</button>` : ""}
      <div class="dk-count">
        <button class="dk-btn" data-act="dk-minus" data-id="${id}" ${n ? "" : "disabled"} aria-label="${c.name}を1枚減らす">−</button>
        <output class="${n ? "" : "zero"}">${n}</output>
        <button class="dk-btn" data-act="dk-plus" data-id="${id}" ${n >= has ? "disabled" : ""} aria-label="${c.name}を1枚増やす">＋</button>
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
      <span>${POLAR[deckType(def)] ? `秘奥のかわりに：<b class="dk-type">${POLAR[deckType(def)].name}</b>（自分の場がずっと${PHASE_JP[deckType(def)]}。${POLAR[deckType(def)].stack}が溜まり、指定カード3枚で${POLAR[deckType(def)].trio}${deckType(def) === "night" ? "。12ターン目に新月" : ""}）`
        : `秘奥：<b class="dk-type">${HIOU_NAME[deckType(def)]}</b>（${HIOU_SETS[deckType(def)].map(b => BUFFS[b][0]).join("・")}）`}</span>
      <span>指定カード　昼：${desName("day")}　夜：${desName("night")}</span>
    </div>
    <p class="dk-rule">★指定で、日没・夜明けの秘奥に使うカードを昼2種・夜2種まで選べる（発動には昼1枚＋夜1枚）。選ばなかった分は枚数の多いカードが自動で入る。</p>
    <p class="dk-rule">${R.DECK_SIZE}枚ちょうど。同じカードは${R.MAX_COPIES}枚まで（奥義は${R.BUDDHA_MAX}枚まで）。</p>
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
    if (n < 0 || n > Math.min(maxCopies(id), window.Meta ? Meta.owned(id) : 99)) return;
    if (n) draft.cards[id] = n; else {
      delete draft.cards[id];
      for (const attr of ["day", "night"]) if (draft.designated?.[attr]) draft.designated[attr] = draft.designated[attr].filter(x => x !== id);
    }
    draft.name = "マイデッキ";
  } else if (act === "dk-preset") {
    const p = PRESETS[b.dataset.p];
    const cards = {};   // 持っていない分は入れない
    for (const [id, n] of Object.entries(p.cards)) { const k = Math.min(n, window.Meta ? Meta.owned(id) : n); if (k) cards[id] = k; }
    draft = { name: p.name, cards, designated: {} };
  } else if (act === "dk-des") {   // 指定カードの選択・解除（各属性2種まで。3種目を選ぶと古い方が外れる）
    const id = b.dataset.id, attr = CARDS[id].attr;
    draft.designated ||= {};
    const list = draft.designated[attr] || [];
    if (list.includes(id)) draft.designated[attr] = list.filter(x => x !== id);
    else draft.designated[attr] = [...list, id].slice(-desMax(POLAR[deckType(draft.cards)] ? deckType(draft.cards) : null, attr));
  }
  renderDeckEditor();
}

/* ===== メニュー ===== */
/* ===== ホーム画面（AI対戦・オンライン・デッキ編集・チュートリアル・設定） ===== */
let playing = false;   // 試合を始めたか（「続きから」を出す）
function setView(v) { document.body.dataset.view = v; if (v === "game") render(); }
function showHome(msg = "", ok = false) {
  hideDialog();
  setView("home");
  const cont = playing && g && !g.over ? `<button class="tile main" data-act="continue"><b>続きから</b><span>${mode === "online" ? `オンライン・部屋 ${room?.code || ""}` : "AI対戦"}の試合に戻る</span></button>` : "";
  $("homeMain").innerHTML = `
    <header class="home-head"><h1>Eclipse Cards</h1><p>昼と夜がめぐる、シールドの駆け引きのカードバトル</p></header>
    ${window.Meta?.homeHTML() || ""}
    <div class="home-deck">使うデッキ：<b>${myDeck.name}</b>（${deckSize(myDeck.cards)}枚・${HIOU_NAME[deckType(myDeck.cards)]}）</div>
    <div class="tiles">
      ${cont}
      <button class="tile main" data-act="ai"><b>AIと対戦</b><span>新しい試合を始める</span></button>
      <button class="tile" data-act="online"><b>オンライン対戦</b><span>部屋を作る・コードで入る</span></button>
      <button class="tile" data-act="deck"><b>デッキ編集</b><span>36枚のデッキを組む</span></button>
      ${window.Meta?.tilesHTML() || ""}
      <button class="tile" data-act="tutorial"><b>チュートリアル</b><span>遊び方を順番に</span></button>
      <button class="tile" data-act="settings"><b>設定</b><span>演出・操作・AIの速さ</span></button>
    </div>
    <p class="msg${ok ? " ok" : ""}" id="homeMsg">${msg}</p>`;
}
function showOnline(msg = "", ok = false) {
  const saved = loadSavedRoom();
  let online;
  if (onlineState === "loading") online = `<p>オンライン対戦を準備中…</p>`;
  else if (onlineState === "off") online = `<p>オンライン対戦の準備ができていない（claude.ai で開くか、supabase-config.js に Supabase の設定を書くと使える）。</p>`;
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
  showDialog(`<h2>オンライン対戦</h2>
    <p>部屋を作ってコードを相手に伝えるか、相手のコードで入る。デッキは「${myDeck.name}」を使う。</p>
    ${window.Meta?.roomBetHTML() || ""}
    ${online}
    <p class="msg${ok ? " ok" : ""}" id="menuMsg">${msg}</p>
    <button class="btn sub" data-act="home">ホームへ</button>`, "online");
}
function showSettings() {
  const opt = (key, label, desc) => `<label class="cfg"><input type="checkbox" data-cfg="${key}" ${cfg[key] ? "checked" : ""}><span><b>${label}</b><small>${desc}</small></span></label>`;
  showDialog(`<h2>設定</h2>
    ${opt("motion", "カードの動き", "ドロー・コール・ドロップゾーンへの移動を動きで見せる")}
    ${opt("confirm2", "2回押して決定", "1回目でHP・シールドの変化をゲージで見せ、もう一度押すと使う。切ると1回で使う")}
    ${opt("fast", "AIを速くする", "AIが考える時間を短くする")}
    <p>設定はこの端末のブラウザに保存される。</p>
    <button class="btn" data-act="close">閉じる</button>`, "settings");
}
/* チュートリアル：1ページずつ */
const TUTORIAL = [
  ["勝ち方", `相手の<b>HP（${R.MAX_HP}）を0</b>にしたら勝ち。受けたダメージはまず<b>シールド</b>が受け止め、0になるとHPに通る。<br>シールドは<b>カードを使うコスト</b>でもある。攻めるほど守りが薄くなる。`],
  ["カードを使う", `1ターンに使えるのは<b>${R.PLAY_LIMIT}枚まで</b>。毎ターン2枚引く。<br><b>使う</b>：シールドを払って効果を出す（足りない分はHPで払う）。<br><b>回復</b>：効果は出さず、そのカードを捨ててシールドを増やす。`],
  ["2回押して決定", `カードを押すと浮かび上がる。「使う」か「回復」を押すと、<b>HPとシールドの変わる部分がゲージで点滅</b>する。<br>同じボタンを<b>もう一度押すと決定</b>。やめるときは「やめる」。`],
  ["場とモンスター", `陽の狼・夜の梟は<b>場にコール</b>するモンスター（最大2体）。ターン終了時に相手を攻撃する。<br>攻撃カードを選んだら<b>相手のモンスターを押して狙える</b>。モンスターにはシールドがなく、HPが0になると<b>破壊されてドロップゾーン</b>へ。`],
  ["デッキとドロップゾーン", `使ったカードはドロップゾーンへ行く。デッキが0枚になると、ドロップゾーンをシャッフルしてデッキに戻す。<br>ドロップゾーンを押すと中身が見られる。`],
  ["昼と夜", `${PHASE_ROUNDS}巡ごとに昼と夜が入れ替わる。<b>昼カードは昼に、夜カードは夜に1.5倍</b>。<br>その間の<b>日没・夜明け</b>に、昼と夜の<b>指定カード（★）</b>を1枚ずつ同時に使うと、試合中ずっと続く<b>秘奥</b>がもらえる。`],
  ["奥義", `仏の怒り・天照などの<b>奥義</b>は、使うと溜まり、<b>4枚目で必殺技</b>。溜めている間も少しずつ効果がある。<br>同じ奥義は1ターンに1枚まで。`],
  ["準備完了", `あとは試しながら覚えよう。「AIと対戦」から始められる。デッキは「デッキ編集」で36枚に組める。`],
];
function showTutorial(i = 0) {
  const [title, body] = TUTORIAL[i];
  showDialog(`<p class="tut-step">${i + 1} / ${TUTORIAL.length}</p><h2>${title}</h2><p class="tut-body">${body}</p>
    <div class="join">
      ${i > 0 ? `<button class="btn sub" data-act="tut" data-step="${i - 1}">前へ</button>` : ""}
      ${i < TUTORIAL.length - 1 ? `<button class="btn" data-act="tut" data-step="${i + 1}">次へ</button>`
        : `<button class="btn" data-act="ai">AIと対戦する</button>`}
      <button class="btn sub" data-act="close">閉じる</button>
    </div>`, "tutorial");
}

/* ===== AI対戦 ===== */
function startAI(bet = 0) {
  leaveRoom();
  gameId++;
  mode = "ai"; seat = 0; busy = false;
  const keys = Object.keys(PRESETS);
  const enemy = PRESETS[keys[Math.floor(Math.random() * keys.length)]];
  g = new Game({ ai: [false, true], firstIdx: Math.random() < 0.5 ? 0 : 1, decks: [myDeck.cards, enemy.cards], designated: [myDeck.designated, null],
                 cos: [window.Meta?.cos() || null, window.Meta?.aiCos() || null] });
  window.Meta?.escrow(g.gid, bet);
  g.log(`試合開始。先攻は@${g.firstIdx}。@0のデッキ：${myDeck.name}／@1のデッキ：${enemy.name}`, "phase");
  hideDialog();
  playing = true; sel = null;
  setView("game");
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
  await aiWait(700);
  for (let i = 0; i < 80 && !g.over; i++) {
    if (id !== gameId) return;
    const a = AI.pick(g, p);
    if (!a) break;
    const ok = a[0] === "pair" ? g.playPair(p, a[1], a[2]) : a[0] === "trio" ? g.playTrio(p, a[1]) : a[0] === "newmoon" ? g.newMoon(p)
      : g.play(p, a[0], a[1], a[1] === "use" ? AI.chooseTarget(g, p, p.hand.find(c => c.uid === a[0])) : null);
    if (!ok) break;   // 使えないカードを選んだら、そのターンは終える（止まらないように）
    render();
    if (g.pending) {   // あなたが鏡花水月を使うか選ぶのを待つ
      showPending();
      while (g.pending && id === gameId) await sleep(150);
      if (id !== gameId) return;
      render();
    }
    await aiWait(850);
  }
  if (id !== gameId) return;
  if (g.over) return finish();
  g.endTurn(p);
  render();
  if (g.over) return finish();
  await aiWait(500);
  runAITurn(id);
}
function finish() {
  busy = false; render();
  const res = g.winnerIdx === seat ? "win" : g.winnerIdx != null ? "lose" : "draw";
  const pay = window.Meta?.settle(g.gid, res);   // 賭けたポイントの精算（同じ試合は1回だけ）
  setTimeout(() => showFinish(pay), 900);
}

/* ===== 自分の操作（AI戦・オンライン共通） ===== */
function afterMyAction() {
  render();
  if (mode === "online") save();
  if (g.over) return finish();
  if (g.pending) showPending();
}
function humanPlay(uid, m, target = null) {
  if (!myTurnNow()) return;
  const me = g.players[seat], c = me.hand.find(x => x.uid === uid);
  if (g.play(me, uid, m, target)) return afterMyAction();
  if (c?.hidden) { g.log(`裏向きのカードは${m === "use" ? "今は使えない" : "回復に回せない"}カードだった`, "warn"); render(); }   // 暗闇：使えないカードだったと分かる
}
function humanPair(d, n) { if (myTurnNow() && g.playPair(g.players[seat], d, n)) afterMyAction(); }
function humanTrio(uids) { if (myTurnNow() && g.playTrio(g.players[seat], uids)) afterMyAction(); }
function humanNewMoon() { if (myTurnNow() && g.newMoon(g.players[seat])) afterMyAction(); }
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
let backend = null;         // "claude" | "supabase" | "firebase" | null
let authApi = null;         // Googleでログイン { current, onChange, login, logout }（Supabase か Firebase のとき）
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
  await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-auth-compat.js`);   // Googleでログイン
  await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-database-compat.js`);
  if (!firebase.apps.length) firebase.initializeApp(config);
  const auth = firebase.auth();
  const who = u => u && { id: u.uid, name: u.displayName || "", email: u.email || "" };
  authApi = {
    current: () => new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(who(u)); }); }),
    onChange: cb => auth.onAuthStateChanged(u => cb(who(u))),
    login: () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()),
    logout: () => auth.signOut(),
  };
  return firebaseDb();
}

/* ===== Supabase（単語リングと同じプロジェクト。Eclipse Cards 用のテーブルを使う）=====
   部屋：eclipse_rooms（code, data）。変わったらリアルタイムで知らせてもらう
   プレイヤー：eclipse_player_get / eclipse_player_put（本人か引き継ぎコードのときだけ読み書きできる関数）
   部屋を押さえる：eclipse_acquire */
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js";
function supabaseDb(sb) {
  const snap = v => ({ exists: v != null, data: () => v });
  return {
    doc(path) {
      const [kind, id] = path.split("/");
      if (kind === "players") return {
        async get() { const { data, error } = await sb.rpc("eclipse_player_get", { p_id: id }); if (error) throw error; return snap(data); },
        async set(v) { const { error } = await sb.rpc("eclipse_player_put", { p_id: id, p_data: v }); if (error) throw error; },
      };
      const get = async () => {
        const { data, error } = await sb.from("eclipse_rooms").select("data").eq("code", id).maybeSingle();
        if (error) throw error;
        return snap(data?.data ?? null);
      };
      return {
        get,
        async set(v) {
          const { error } = await sb.from("eclipse_rooms").upsert({ code: id, data: v, updated_at: new Date().toISOString() });
          if (error) throw error;
        },
        /* 短い時間だけ部屋を押さえる（2人が同時に入ろうとしたとき用） */
        async acquire({ holder, ttlMs = 5000 }) {
          const { data, error } = await sb.rpc("eclipse_acquire", { p_code: id, p_holder: holder, p_ttl_ms: ttlMs });
          if (error) throw error;
          return { acquired: !!data };
        },
        /* 部屋が書き換わるたびに最新を読み直して知らせる（つながった直後にも1回） */
        onSnapshot(next, error) {
          let alive = true;
          const pull = () => get().then(s => { if (alive) next(s); }, e => alive && error?.(e));
          const ch = sb.channel(`eclipse-room-${id}-${Math.random().toString(36).slice(2, 7)}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "eclipse_rooms", filter: `code=eq.${id}` }, pull)
            .subscribe(st => {
              if (st === "SUBSCRIBED") pull();
              else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") error?.(new Error(st));
            });
          return () => { alive = false; sb.removeChannel(ch); };
        },
      };
    },
  };
}
async function connectSupabase(config) {
  await loadScript(SUPABASE_JS);
  const sb = supabase.createClient(config.url, config.key,
    { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const who = u => u && { id: u.id, name: u.user_metadata?.full_name || u.user_metadata?.name || "", email: u.email || "" };
  authApi = {
    current: async () => who((await sb.auth.getSession()).data.session?.user),
    /* Supabase の決まり：この通知の中で直接データベースを呼ぶと止まることがあるので、一拍おいてから知らせる */
    onChange: cb => sb.auth.onAuthStateChange((_, session) => { const u = who(session?.user); setTimeout(() => cb(u), 0); }),
    /* Googleの画面に移って、ログインしたらこのページに戻ってくる */
    /* 戻り先はいつも「同じフォルダの eclipse-cards.html」。.html を省いたアドレスで開いていても、
       Supabase の Redirect URLs に登録したアドレスと一致するように */
    login: () => sb.auth.signInWithOAuth({ provider: "google",
      options: { redirectTo: location.origin + location.pathname.replace(/[^/]*$/, "") + "eclipse-cards.html" } }),
    logout: () => sb.auth.signOut(),
  };
  return supabaseDb(sb);
}

(async () => {
  try {
    if (window.claude?.use) {
      [dbApi, userApi] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (userApi) { uid = await userApi.id(); canWrite = await userApi.can("data.write"); }
      if (dbApi && uid) backend = "claude";
    }
  } catch { dbApi = null; }
  if (!backend && window.SUPABASE_CONFIG) {
    try { dbApi = await connectSupabase(window.SUPABASE_CONFIG); uid = localUid(); canWrite = true; backend = "supabase"; }
    catch { dbApi = null; authApi = null; }
  }
  if (!backend && window.FIREBASE_CONFIG) {
    try { dbApi = await connectFirebase(window.FIREBASE_CONFIG); uid = localUid(); canWrite = true; backend = "firebase"; }
    catch { dbApi = null; }
  }
  onlineState = backend ? "on" : "off";
  await loadCloudDeck();
  window.Meta?.onBackend();
  if ($("dialog").dataset.kind === "online") showOnline();
  else if (document.body.dataset.view === "home") showHome();
})();

function menuMsg(text, ok = false) { const el = $("menuMsg") || $("homeMsg"); if (el) { el.textContent = text; el.classList.toggle("ok", ok); } }
function newCode() { return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(""); }
function dbErr(e) {
  const c = e?.code;
  if (backend === "firebase" && /permission/i.test(`${c} ${e?.message}`))
    return "Firebase に保存できなかった。Firebase の Realtime Database のルールを手順書どおりに設定したか確認しよう。";
  if (backend === "supabase" && /^(PGRST20[25]|42P01|42883)$/.test(c || ""))
    return "Supabase に Eclipse Cards のテーブルがまだない。supabase-setup.sql を SQL Editor で実行したか確認しよう。";
  if (backend === "supabase" && c === "42501") return "Supabase のルールで保存が止められた。supabase-setup.sql をもう一度実行しよう。";
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
    const bet = window.Meta?.roomBet || 0;
    await ref.set({ v: 1, status: "waiting", hostId: uid, guestId: null, hostDeck: myDeck.cards, guestDeck: null,
                    hostDes: myDeck.designated || null, guestDes: null, bet, hostCos: window.Meta?.cos() || null, guestCos: null,
                    seq: 0, writer: uid, updated: Date.now() });
    enterRoom(code, ref);
    showDialog(`<h2>部屋ができた</h2>
      <p>相手にこのコードを伝えて、「コードで入る」から入ってもらおう。</p>
      <div class="roomcode">${code}</div>
      <p>賭け：<b>${window.Meta?.roomBet || 0}pt</b>。相手が入ると自動で試合が始まる。</p>
      <button class="btn sub" data-act="menu">やめる</button>`, "waiting");
  } catch (e) { menuMsg(dbErr(e)); }
}

async function joinRoom(code, agreed = false) {
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
    if (d.bet && window.Meta) {   // 賭けのある部屋：払えるか確かめ、額を見せてから入る
      const ng = Meta.canBet(d.bet);
      if (ng) return menuMsg(ng);
      if (!agreed) return Meta.confirmJoin(code, d.bet);
    }
    const lease = await ref.acquire({ holder: uid, ttlMs: 5000 });
    if (!lease.acquired) return menuMsg("相手が同時に入ろうとしている。少し待ってもう一度。");
    s = await ref.get(); d = s.data();
    if (d.guestId && d.guestId !== uid) return menuMsg("その部屋はもう2人そろっている。");
    const hostDeck = sanitizeDeck(d.hostDeck);
    const guestCos = window.Meta?.cos() || null;
    const ng = new Game({ ai: [false, false], firstIdx: Math.random() < 0.5 ? 0 : 1, decks: [hostDeck, myDeck.cards],
                          designated: [d.hostDes, myDeck.designated], cos: [d.hostCos || null, guestCos] });
    ng.log(`試合開始。先攻は@${ng.firstIdx}`, "phase");
    ng.startTurn(ng.active);
    await ref.set({ v: 1, status: "playing", hostId: d.hostId, guestId: uid, hostDeck, guestDeck: myDeck.cards,
                    hostDes: d.hostDes ?? null, guestDes: myDeck.designated || null,
                    bet: d.bet || 0, hostCos: d.hostCos || null, guestCos,
                    seq: (d.seq || 0) + 1, writer: uid, updated: Date.now(), state: ng.serialize() });
    enterRoom(code, ref);
    hideDialog();
  } catch (e) { menuMsg(dbErr(e)); }
}

function enterRoom(code, ref) {
  gameId++;   // 走っているAI戦を止める
  leaveRoom();
  mode = "online"; busy = false;
  room = { code, ref, unsub: null, shown: false };
  storeRoom(code);
  room.unsub = ref.onSnapshot(onRoomSnap, () => {
    showHome("部屋との接続が切れた。「部屋に戻る」から入り直そう。");
  });
}

function onRoomSnap(snap) {
  if (!room || !snap.exists) return;
  const d = snap.data();
  room.hostId = d.hostId; room.guestId = d.guestId;
  room.hostDeck = d.hostDeck ?? null; room.guestDeck = d.guestDeck ?? null;
  room.hostDes = d.hostDes ?? null; room.guestDes = d.guestDes ?? null;
  room.bet = d.bet || 0; room.hostCos = d.hostCos || null; room.guestCos = d.guestCos || null;
  const mySeat = d.hostId === uid ? 0 : d.guestId === uid ? 1 : null;
  if (mySeat === null) { storeRoom(""); leaveRoom(); return showHome("この部屋の参加者ではない。"); }
  seat = mySeat;
  // 自分の書き込みの反映や古い状態は無視。同じ番号でも相手が書いたもの（同時の再戦など）は相手の版に合わせる
  const sq = d.seq || 0;
  if (!d.state || sq < localSeq || (sq === localSeq && d.writer === uid)) return;
  localSeq = sq;
  g = Game.load(d.state);
  busy = false;
  if (!g.over) window.Meta?.escrow(g.gid, room.bet);   // 新しい試合なら賭けを預ける（同じ試合は1回だけ）
  const kind = $("dialog").dataset.kind;
  if (kind === "waiting" || kind === "finish" || kind === "online") hideDialog();
  playing = true;
  if (!room.shown) { room.shown = true; setView("game"); }   // 試合が始まったら（入り直したら）盤面へ
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
                 bet: room.bet || 0, hostCos: room.hostCos ?? null, guestCos: room.guestCos ?? null,
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
                 designated: [room.hostDes, room.guestDes], cos: [room.hostCos, room.guestCos] });
  g.log(`再戦開始。先攻は@${g.firstIdx}`, "phase");
  window.Meta?.escrow(g.gid, room.bet);
  g.startTurn(g.active);
  hideDialog();
  render();
  save();
}

/* ===== クリック ===== */
/* 1回目：そのカードを浮かせて、ゲージに見込みを出す。同じボタンをもう一度押すと決定 */
function choose(uid, m) {
  if (!myTurnNow()) return;
  // 設定で「2回押して決定」を切っていれば、1回で使う（狙いは相手プレイヤー）
  if (!cfg.confirm2 || (sel?.uid === uid && sel.mode === m)) { const t = sel?.uid === uid ? sel.target ?? null : null; sel = null; humanPlay(uid, m, t); return; }
  sel = { uid, mode: m, target: sel?.uid === uid ? sel.target ?? null : null };
  render();
}
document.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) {
    const aim = e.target.closest("[data-aim]");   // 攻撃を選んでいるとき、相手のモンスターを押すとそちらを狙う
    if (aim && sel) { sel.target = sel.target === +aim.dataset.aim ? null : +aim.dataset.aim; render(); return; }
    // カードの本体を押す：浮かせる／もう一度押すと戻す
    const card = e.target.closest("[data-pick]");
    if (card && myTurnNow()) { const uid = +card.dataset.pick; sel = sel?.uid === uid ? null : { uid, mode: null }; render(); }
    return;
  }
  const act = b.dataset.act;
  if (window.Meta?.onAct(act, b)) return;
  if (act === "use") choose(+b.dataset.uid, "use");
  else if (act === "rec") choose(+b.dataset.uid, "recover");
  else if (act === "cancel") { sel = null; render(); }
  else if (act === "aim") { if (sel) { sel.target = b.dataset.t ? +b.dataset.t : null; render(); } }
  else if (act === "drop") showDrop(+b.dataset.seat);
  else if (act === "pair") humanPair(+b.dataset.d, +b.dataset.n);
  else if (act === "trio") humanTrio(b.dataset.u.split(",").map(Number));
  else if (act === "newmoon") humanNewMoon();
  else if (act === "end") endMyTurn();
  else if (act === "close") hideDialog();
  else if (act === "deck") showDeckEditor();
  else if (act === "dk-plus" || act === "dk-minus" || act === "dk-preset" || act === "dk-des") deckEdit(act, b);
  else if (act === "dk-save") { saveDeck(draft); showHome(`「${myDeck.name}」を保存した。次の試合から使われる。`, true); }
  else if (act === "ai") window.Meta ? Meta.askBet() : startAI();
  else if (act === "mkroom") createRoom();
  else if (act === "join") joinRoom($("codeIn")?.value);
  else if (act === "resume") joinRoom(loadSavedRoom());
  else if (act === "menu" || act === "home") { if ($("dialog").dataset.kind === "waiting") { leaveRoom(); storeRoom(""); } showHome(); }
  else if (act === "continue") { hideDialog(); setView("game"); if (g.pending) showPending(); }
  else if (act === "online") showOnline();
  else if (act === "tutorial") showTutorial(0);
  else if (act === "tut") showTutorial(+b.dataset.step);
  else if (act === "settings") showSettings();
  else if (act === "again") mode === "online" ? rematch() : startAI();
  else if (b.id === "howBtn") showHowTo();
  else if (b.id === "menuBtn") showHome();
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
document.addEventListener("change", e => {   // 設定のチェック
  const k = e.target.dataset?.cfg;
  if (!k) return;
  cfg[k] = e.target.checked; saveCfg();
  if (k === "confirm2") { sel = null; render(); }
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "codeIn") joinRoom(e.target.value);
  if (e.key === "Escape" && sel) { sel = null; render(); }
});

/* 最初はホーム画面を出す。裏ではAI戦の盤面を用意しておく */
g = new Game({ ai: [false, true], firstIdx: 0 });
render();
showHome();
