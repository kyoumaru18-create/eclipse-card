/* Eclipse Cards — ポイント・賭け・ショップ・カードパック・コレクション・プロフィール
   ポイントはゲームの中だけのもの（お金では買えない）。
   保存：この端末のブラウザ＋Supabase（予備で Firebase）。Googleでログインしていれば players/<アカウントのid>、
   していなければ players/<引き継ぎコード>（claude.ai では自分専用の場所）。
   eclipse-cards.js の後に読み込み、window.Meta として本体から呼ばれる。 */
(() => {
  const KEY_LS = "eclipse-key", PROF_LS = "eclipse-profile";
  const START_POINTS = 300, DAILY_BONUS = 50, WIN_BONUS = 20, PLAY_BONUS = 5;
  /* 持っているポイントが多いほど、1試合に賭けられる上限が上がる [これ以上持っていたら, 上限] */
  const CAPS = [[0, 20], [200, 50], [500, 100], [1000, 200], [3000, 500], [10000, 1000]];
  const BET_STEPS = [0, 10, 20, 50, 100, 200, 500, 1000];
  const DUPE_CARD = 10, DUPE_ART = 15;   // 持てる上限を超えたカード・持っている絵柄が出たら、ポイントに変える

  /* カードの希少度：基本のカードはコモン、デッキの型ごとのカードはレア、奥義はスーパーレア */
  const BASIC = ["strike", "bomb", "slash", "ambush", "jab", "drain", "heal", "firstaid", "counter", "eclipse", "needle", "bleed", "recoil", "sunwolf", "nightowl",
    "mushibami", "zanshou", "nichirin", "oborozuki", "shingetsu", "kamaenaoshi", "katsu", "nembutsu", "rengeki", "zazen", "fudoushin"];   // デッキごとの個性のある基本カードもコモン
  const rarity = id => isOugi(CARDS[id]) ? "SR" : BASIC.includes(id) ? "C" : "R";
  const RARITY_JP = { C: "コモン", R: "レア", SR: "スーパーレア" };
  /* 絵柄違い [名前, 出やすさ] */
  const ARTS = { holo: ["キラ", 50], gold: ["金枠", 35], eclipse: ["日蝕版", 15] };
  const SHOP = {
    sleeve: { label: "スリーブ", note: "デッキの山とカードの裏", items: { basic: ["夜空", 0], crimson: ["紅蓮", 120], azure: ["蒼天", 120], sakura: ["桜", 200], starry: ["星屑", 300], gold: ["黄金", 500] } },
    mat: { label: "プレイマット", note: "自分の枠の背景", items: { basic: ["無地", 0], forest: ["森", 200], sea: ["海", 200], temple: ["寺院", 300], galaxy: ["銀河", 500] } },
    icon: { label: "アイコン", note: "名前の横", items: { sun: ["☀", 0], moon: ["☾", 0], star: ["✦", 60], flower: ["❀", 60], sword: ["⚔", 80], crown: ["♛", 300] } },
    title: { label: "称号", note: "名前の横", items: { rookie: ["新米", 0], day: ["昼の使い手", 100], night: ["夜の住人", 100], gambler: ["賭博師", 300], master: ["日蝕の覇者", 1000] } },
    frame: { label: "プロフィール枠", note: "アイコンの枠", items: { plain: ["なし", 0], silver: ["銀", 150], gold: ["金", 400] } },
  };
  const PACKS = { card: ["カードパック", 100, "カード5枚（1枚はレア以上）。デッキに入れられるカードが増える"], art: ["絵柄パック", 150, "絵柄違い3つ（キラ・金枠・日蝕版）。強さは変わらない"] };

  let prof = null, key = null, saveTimer = 0, armed = "", shopTab = "pack";
  let user = null;   // Googleでログインしているアカウント { id, name, email }
  const M = { roomBet: 0 };
  const today = () => new Date().toLocaleDateString("sv");   // 2026-10-19 の形
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  function newKey() {
    const a = new Uint8Array(15); crypto.getRandomValues(a);
    return Array.from(a, b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");   // 引き継ぎコード（15文字）
  }

  /* ---------- 保存と読み込み ---------- */
  function remoteDoc() {
    if (!dbApi) return null;
    if (backend === "claude") return dbApi.doc(`data/users/${uid}/profile`);
    return dbApi.doc(`players/${user ? user.id : key}`);
  }
  const owner = () => user ? `google:${backend}:${user.id}` : `key:${key}`;   // この保存データが誰のものか
  function save() {
    if (!prof) return;
    prof.updated = Date.now();
    prof.owner = owner();
    try { localStorage.setItem(PROF_LS, JSON.stringify(prof)); } catch {}
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { remoteDoc()?.set(prof).catch(() => {}); }, 400);
  }
  function fix(p) {   // 古い保存データでも動くように足りない所を埋める
    p.items ||= {}; p.equip ||= {}; p.arts ||= {}; p.artUse ||= {}; p.owned ||= {};
    p.stats ||= { win: 0, lose: 0, draw: 0 }; p.escrow ||= {}; p.settled ||= [];
    for (const [kind, sec] of Object.entries(SHOP)) for (const [id, [, price]] of Object.entries(sec.items)) if (!price) p.items[`${kind}:${id}`] = 1;
    p.equip.sleeve ||= "basic"; p.equip.mat ||= "basic"; p.equip.icon ||= "sun"; p.equip.title ||= "rookie"; p.equip.frame ||= "plain";
    return p;
  }
  function dailyBonus() {
    if (!prof || prof.bonusDay === today()) return 0;
    prof.bonusDay = today(); prof.points += DAILY_BONUS; save();
    return DAILY_BONUS;
  }
  let bonusMsg = "";
  try { key = localStorage.getItem(KEY_LS); } catch {}
  if (!key) { key = newKey(); try { localStorage.setItem(KEY_LS, key); } catch {} }
  try { const v = JSON.parse(localStorage.getItem(PROF_LS) || "null"); if (v?.name) prof = fix(v); } catch {}
  if (prof && dailyBonus()) bonusMsg = `今日のボーナス +${DAILY_BONUS}pt`;

  /* Firebase などにつながったら、ログインの状態を確かめてから保存してある方を読む */
  let backendDone = false;
  M.onBackend = async () => {
    if (backendDone || !dbApi) return;
    backendDone = true;
    if (authApi) {
      try { user = await authApi.current(); } catch { user = null; }
      authApi.onChange(async u => {   // あとからのログイン・ログアウト
        if ((u?.id || null) === (user?.id || null)) return;
        user = u;
        await loadRemote();
        if ($("dialog").dataset.kind === "profile") showProfile(u ? `${u.name || "Googleアカウント"}でログインした。` : "ログアウトした。この端末の保存に戻った。");
        else refreshHome();
      });
    }
    await loadRemote();
    refreshHome();
  };
  /* 保存場所のデータを読む。ログインしたアカウントにデータがあればそれを使う。
     なければ今この端末にあるデータをアカウントに移す */
  async function loadRemote() {
    try {
      const s = await remoteDoc().get();
      const remote = s.exists ? s.data() : null;
      const mine = prof && prof.owner === owner();
      if (remote?.name && (!mine || (remote.updated || 0) > (prof.updated || 0))) {
        prof = fix(remote);
        try { localStorage.setItem(PROF_LS, JSON.stringify(prof)); } catch {}
        if (dailyBonus()) bonusMsg = `今日のボーナス +${DAILY_BONUS}pt`;
      } else if (prof) save();
    } catch {}
  }
  async function login() {
    try { const r = await authApi.login(); if (r?.error) throw r.error; }
    catch (e) {
      const why = {
        "auth/popup-blocked": "ログインの小さい画面がブロックされた。ブラウザでポップアップを許可して、もう一度押そう。",
        "auth/popup-closed-by-user": "ログインをやめた。",
        "auth/cancelled-popup-request": "ログインをやめた。",
        "auth/unauthorized-domain": "このサイトのアドレスが Firebase の「承認済みドメイン」に入っていない。",
        "auth/operation-not-allowed": "Firebase の Authentication で Google が有効になっていない。",
      }[e?.code] || `ログインできなかった（${e?.code || e?.message || e}）。`;
      showProfile(why);
    }
  }
  function refreshHome() {
    if (document.body.dataset.view === "home" && $("overlay").hidden) showHome(bonusMsg, true);
    if (!prof && $("overlay").hidden) showStarter();
  }

  /* ---------- 見た目（試合に持ち込む） ---------- */
  M.cos = () => prof && {
    name: prof.name, icon: SHOP.icon.items[prof.equip.icon]?.[0] || "☀", title: SHOP.title.items[prof.equip.title]?.[0] || "",
    frame: prof.equip.frame, sleeve: prof.equip.sleeve, mat: prof.equip.mat, arts: { ...prof.artUse },
  };
  M.aiCos = () => ({ name: "AI", icon: pick(["☾", "✦", "⚔"]), title: "", frame: "plain", sleeve: pick(["basic", "crimson", "azure"]), mat: "basic", arts: {} });
  M.owned = id => prof ? (prof.owned[id] || 0) : maxCopies(id);

  /* ---------- 賭け ---------- */
  M.cap = (pts = prof?.points || 0) => CAPS.filter(([at]) => pts >= at).pop()[1];
  M.betOptions = () => BET_STEPS.filter(b => b <= M.cap() && b <= (prof?.points || 0));
  M.canBet = bet => {
    if (!prof) return "先にプロフィールを作ろう。";
    if (bet > prof.points) return `この部屋は${bet}pt賭ける。ポイントが足りない（所持${prof.points}pt）。`;
    if (bet > M.cap()) return `この部屋は${bet}pt賭ける。今の上限は${M.cap()}pt（ポイントが増えると上がる）。`;
    return "";
  };
  /* 試合が始まったら賭けを預ける（同じ試合は1回だけ） */
  M.escrow = (gid, bet) => {
    if (!prof || !bet || prof.escrow[gid] != null || prof.settled.includes(gid)) return;
    bet = Math.min(bet, prof.points);
    prof.points -= bet; prof.escrow[gid] = bet; save();
  };
  /* 試合が終わったら精算（勝ち：賭けの2倍＋20、負け：5、引き分け：賭けが戻る＋5） */
  M.settle = (gid, res) => {
    if (!prof || prof.settled.includes(gid)) return null;
    const bet = prof.escrow[gid] || 0;
    delete prof.escrow[gid];
    const gain = res === "win" ? bet * 2 + WIN_BONUS : res === "draw" ? bet + PLAY_BONUS : PLAY_BONUS;
    prof.points += gain; prof.stats[res]++;
    prof.settled = [...prof.settled, gid].slice(-40);
    save();
    return { bet, gain, points: prof.points };
  };
  function capTable() {
    return `<table class="cap-table"><tr><th>所持ポイント</th><th>賭けられる上限</th></tr>${CAPS.map(([at, cap]) =>
      `<tr class="${M.cap() === cap ? "on" : ""}"><td>${at}pt〜</td><td>${cap}pt</td></tr>`).join("")}</table>`;
  }
  M.askBet = () => {
    if (!prof) return showStarter();
    const ng = deckOwnedProblem();
    if (ng) return showHome(ng);
    showDialog(`<h2>AIと対戦</h2>
      <p>ポイントを賭けられる。勝つと賭けの<b>2倍＋${WIN_BONUS}pt</b>、負けると賭けは失って<b>+${PLAY_BONUS}pt</b>。所持 <b>${prof.points}pt</b>・上限 <b>${M.cap()}pt</b>。</p>
      <div class="bets">${M.betOptions().map(b => `<button class="btn${b ? "" : " sub"}" data-act="bet-ai" data-bet="${b}">${b ? `${b}pt賭ける` : "賭けずに遊ぶ"}</button>`).join("")}</div>
      ${capTable()}
      <button class="btn sub" data-act="close">やめる</button>`, "bet");
  };
  M.roomBetHTML = () => prof ? `<div class="bets small"><span>賭け（部屋を作るとき）：</span>${M.betOptions().map(b =>
    `<button class="btn small${M.roomBet === b ? " on" : ""}" data-act="room-bet" data-bet="${b}">${b ? `${b}pt` : "なし"}</button>`).join("")}</div>` : "";
  M.confirmJoin = (code, bet) => {
    showDialog(`<h2>部屋 ${code}</h2><p>この部屋は <b>${bet}pt</b> を賭ける。勝つと${bet * 2 + WIN_BONUS}pt、負けると賭けを失う。所持 ${prof.points}pt。</p>
      <div class="join"><button class="btn" data-act="join-ok" data-code="${code}">${bet}pt賭けて入る</button><button class="btn sub" data-act="online">やめる</button></div>`, "online");
  };
  /* 自分のデッキに、持っていないカードが入っていないか */
  function deckOwnedProblem() {
    const lack = Object.entries(myDeck.cards).filter(([id, n]) => n > M.owned(id)).map(([id]) => CARDS[id].name);
    return lack.length ? `デッキに持っていないカードがある（${lack.slice(0, 4).join("・")}${lack.length > 4 ? "など" : ""}）。デッキ編集で直そう。` : "";
  }

  /* ---------- ホーム ---------- */
  M.homeHTML = () => {
    if (!prof) return `<div class="prof-card"><b>ようこそ</b><span>最初にプロフィールと最初のデッキを決めよう。</span><button class="btn" data-act="starter">はじめる</button></div>`;
    const c = M.cos();
    return `<button class="prof-card" data-act="profile">
      <span class="p-icon big frame-${c.frame}">${c.icon}</span>
      <span class="prof-main"><b>${esc(prof.name)}</b><small>${c.title}　${prof.stats.win}勝${prof.stats.lose}敗</small></span>
      <span class="prof-pts"><b>${prof.points}</b><small>pt・賭け上限${M.cap()}</small></span>
    </button>${M.loginHTML()}`;
  };
  const canLogin = () => !!authApi;
  M.loginHTML = () => !prof || !canLogin() ? "" : user
    ? `<p class="login-line">Googleでログイン中（${esc(user.name || user.email || "")}）。どの端末でも同じデータ。</p>`
    : `<p class="login-line"><button class="btn small" data-act="login">Googleでログイン</button> どの端末でも同じデータで遊べる</p>`;
  M.tilesHTML = () => `
    <button class="tile" data-act="shop"><b>ショップ</b><span>パック・スリーブ・マット・装飾</span></button>
    <button class="tile" data-act="collection"><b>コレクション</b><span>持っているカードと絵柄</span></button>`;

  /* ---------- はじめて：名前と最初のデッキ ---------- */
  function showStarter() {
    showDialog(`<h2>はじめよう</h2>
      <p>名前と、最初にもらうデッキを選ぶ。選んだデッキのカード全部と、基本のカード（各2枚）がもらえる。ほかのカードはショップのカードパックで集める。</p>
      <label class="field">名前 <input id="nameIn" maxlength="12" value="プレイヤー" autocomplete="off"></label>
      <div class="starters">${Object.entries(PRESETS).map(([k, p]) => `<button class="opt" data-act="start-with" data-p="${k}"><b>${p.name}</b><span>${HIOU_NAME[deckType(p.cards)]}・${Object.entries(p.cards).filter(([id]) => isOugi(CARDS[id])).map(([id]) => CARDS[id].name).join("・") || "奥義なし"}</span></button>`).join("")}</div>`, "starter");
  }
  function createProfile(name, presetKey) {
    const owned = {};
    for (const id of BASIC) owned[id] = 2;
    for (const [id, n] of Object.entries(PRESETS[presetKey].cards)) owned[id] = Math.max(owned[id] || 0, n);
    prof = fix({ v: 1, name: (name || "プレイヤー").slice(0, 12), points: START_POINTS, owned, bonusDay: today(), created: Date.now() });
    save();
    saveDeck({ name: PRESETS[presetKey].name, cards: { ...PRESETS[presetKey].cards }, designated: {} });
  }

  /* ---------- ショップ ---------- */
  function showShop(msg = "") {
    const tabs = [["pack", "パック"], ...Object.entries(SHOP).map(([k, s]) => [k, s.label])];
    let body;
    if (shopTab === "pack") {
      body = Object.entries(PACKS).map(([k, [name, price, note]]) => `<div class="shop-item pack-${k}">
        <div class="pack-box">${k === "card" ? "CARD" : "ART"}</div>
        <span class="si-main"><b>${name}</b><small>${note}</small></span>
        ${buyBtn(`pack:${k}`, price, false)}</div>`).join("");
    } else {
      const sec = SHOP[shopTab];
      body = `<p class="shop-note">${sec.note}に使う。</p>` + Object.entries(sec.items).map(([id, [name, price]]) => {
        const has = prof.items[`${shopTab}:${id}`], using = prof.equip[shopTab] === id;
        return `<div class="shop-item">
          <span class="swatch ${shopTab}-${id}">${shopTab === "icon" ? name : shopTab === "title" ? "称" : ""}</span>
          <span class="si-main"><b>${name}</b><small>${has ? (using ? "使っている" : "持っている") : `${price}pt`}</small></span>
          ${has ? (using ? `<span class="si-tag">使用中</span>` : `<button class="btn small" data-act="equip" data-k="${shopTab}" data-id="${id}">使う</button>`) : buyBtn(`${shopTab}:${id}`, price, true)}
        </div>`;
      }).join("");
    }
    showDialog(`<div class="shop-head"><h2>ショップ</h2><span class="pts">${prof.points}pt</span></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab${shopTab === k ? " on" : ""}" data-act="shop-tab" data-tab="${k}">${l}</button>`).join("")}</div>
      <p class="msg ok">${msg}</p>
      <div class="shop-list">${body}</div>
      <button class="btn sub" data-act="close">閉じる</button>`, "shop");
  }
  /* 買うボタン：1回目で「もう一度押すと購入」、2回目で買う */
  function buyBtn(id, price, single) {
    const ok = prof.points >= price;
    return `<button class="btn small${armed === id ? " primary" : ""}" data-act="buy" data-id="${id}" ${ok ? "" : "disabled"}>${!ok ? "ポイント不足" : armed === id ? "もう一度押すと購入" : `${price}pt${single ? "で買う" : "で開ける"}`}</button>`;
  }
  function buy(id) {
    if (armed !== id) { armed = id; return showShop(); }
    armed = "";
    const [kind, item] = id.split(":");
    if (kind === "pack") return openPack(item);
    const price = SHOP[kind].items[item][1];
    if (prof.points < price || prof.items[id]) return showShop();
    prof.points -= price; prof.items[id] = 1; prof.equip[kind] = item; save();
    showShop(`${SHOP[kind].items[item][0]}を買って使うようにした。`);
  }

  /* ---------- パックを開ける ---------- */
  function rollCard(rareSlot) {
    const r = Math.random();
    const tier = rareSlot ? (r < 0.15 ? "SR" : "R") : (r < 0.05 ? "SR" : r < 0.40 ? "R" : "C");
    return pick(Object.keys(CARDS).filter(id => rarity(id) === tier));
  }
  function rollArt() {
    let r = Math.random() * 100;
    for (const [v, [, w]] of Object.entries(ARTS)) { if ((r -= w) < 0) return v; }
    return "holo";
  }
  function openPack(kind) {
    const price = PACKS[kind][1];
    if (prof.points < price) return showShop();
    prof.points -= price;
    const got = [];
    if (kind === "card") {
      for (let i = 0; i < 5; i++) {
        const id = rollCard(i === 4);
        const full = (prof.owned[id] || 0) >= maxCopies(id);
        if (full) prof.points += DUPE_CARD; else prof.owned[id] = (prof.owned[id] || 0) + 1;
        got.push({ id, isNew: !full && prof.owned[id] === 1, extra: full ? `上限なので+${DUPE_CARD}pt` : `所持${prof.owned[id]}` });
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const id = pick(Object.keys(CARDS)), art = rollArt(), k = `${id}:${art}`;
        const dup = !!prof.arts[k];
        if (dup) prof.points += DUPE_ART; else prof.arts[k] = 1;
        got.push({ id, art, isNew: !dup, extra: dup ? `持っているので+${DUPE_ART}pt` : `${ARTS[art][0]}・コレクションで使える` });
      }
    }
    save();
    showDialog(`<h2>${PACKS[kind][0]}</h2>
      <div class="reveal">${got.map((g2, i) => {
        const c = CARDS[g2.id], r = rarity(g2.id);
        return `<div class="rv-card card a-${c.attr}${g2.art ? ` art-${g2.art}` : ""} r-${r}" style="animation-delay:${i * 0.18}s">
          <span class="rv-rare">${g2.art ? ARTS[g2.art][0] : RARITY_JP[r]}</span>
          <span class="c-name">${c.name}</span><small>${ATTR_JP[c.attr]}・${TYPE_JP[c.type]}</small>
          ${g2.isNew ? `<span class="rv-new">NEW</span>` : ""}<small class="rv-extra">${g2.extra}</small></div>`;
      }).join("")}</div>
      <p>所持 ${prof.points}pt</p>
      <div class="join"><button class="btn" data-act="buy-again" data-id="pack:${kind}" ${prof.points >= price ? "" : "disabled"}>もう1つ開ける（${price}pt）</button>
        <button class="btn sub" data-act="shop">ショップに戻る</button></div>`, "reveal");
  }

  /* ---------- コレクション（持っているカードと絵柄の切り替え） ---------- */
  function showCollection() {
    const ids = Object.keys(CARDS);
    const ownedKinds = ids.filter(id => prof.owned[id]).length;
    const row = id => {
      const c = CARDS[id], n = prof.owned[id] || 0, r = rarity(id);
      const arts = Object.keys(ARTS).filter(a => prof.arts[`${id}:${a}`]);
      const use = prof.artUse[id] || "";
      return `<div class="col-row${n ? "" : " none"}">
        <span class="col-name a-${c.attr}${use ? ` art-${use}` : ""}"><b>${c.name}</b><small>${RARITY_JP[r]}</small></span>
        <span class="col-n">${n}/${maxCopies(id)}</span>
        <span class="col-arts">${arts.length ? [["", "通常"], ...arts.map(a => [a, ARTS[a][0]])].map(([a, l]) =>
          `<button class="btn small${use === a ? " on" : ""}" data-act="art-use" data-id="${id}" data-art="${a}">${l}</button>`).join("") : ""}</span>
      </div>`;
    };
    showDialog(`<h2>コレクション</h2>
      <p>${ownedKinds}/${ids.length}種類。カードパックで集める。絵柄違いは選んだものが試合で使われる（相手にも見える）。</p>
      ${["SR", "R", "C"].map(r => `<h3>${RARITY_JP[r]}</h3>${ids.filter(id => rarity(id) === r).map(row).join("")}`).join("")}
      <button class="btn sub" data-act="close">閉じる</button>`, "collection");
  }

  /* ---------- プロフィール（名前・装飾・引き継ぎ） ---------- */
  function showProfile(msg = "") {
    const owned = kind => Object.entries(SHOP[kind].items).filter(([id]) => prof.items[`${kind}:${id}`]);
    const choose = kind => `<div class="bets small"><span>${SHOP[kind].label}：</span>${owned(kind).map(([id, [name]]) =>
      `<button class="btn small${prof.equip[kind] === id ? " on" : ""}" data-act="equip-p" data-k="${kind}" data-id="${id}">${name}</button>`).join("")}</div>`;
    showDialog(`<h2>プロフィール</h2>
      <p class="msg ok">${msg}</p>
      <label class="field">名前 <input id="nameIn" maxlength="12" value="${esc(prof.name)}" autocomplete="off"><button class="btn small" data-act="rename">変える</button></label>
      ${choose("icon")}${choose("title")}${choose("frame")}${choose("sleeve")}${choose("mat")}
      <p>戦績：${prof.stats.win}勝 ${prof.stats.lose}敗 ${prof.stats.draw}分　所持 ${prof.points}pt</p>
      ${canLogin() ? `<h3>Googleでログイン</h3>${user
        ? `<p>ログイン中：<b>${esc(user.name || "")}</b>（${esc(user.email || "")}）。データはこのアカウントに保存され、ほかの端末でもログインすれば同じになる。</p>
           <button class="btn sub small" data-act="logout">ログアウト</button>`
        : `<p>ログインすると、どの端末でも同じデータで遊べる。本人以外はデータを書き換えられない。今この端末にあるデータは、はじめてログインしたときにアカウントへ移る。</p>
           <button class="btn small" data-act="login">Googleでログイン</button>`}` : ""}
      ${user ? "" : `<h3>引き継ぎコード</h3>`}
      ${user ? "" : backend === "claude" ? `<p>claude.ai では自分のアカウントに保存されるので、引き継ぎはいらない。</p>` : `
      <p>別の端末やブラウザで同じデータを使うときに入力する。<b>人に教えないこと</b>（知っている人は誰でもこのデータを使える）。</p>
      <div class="roomcode small">${key}</div>
      <div class="join"><input id="keyIn" maxlength="20" placeholder="別の端末のコード" autocomplete="off"><button class="btn sub small" data-act="load-key">このコードのデータを使う</button></div>`}
      <button class="btn sub" data-act="close">閉じる</button>`, "profile");
  }
  async function loadKey(k) {
    k = (k || "").trim().toLowerCase();
    if (!/^[a-z0-9]{15}$/.test(k)) return showProfile("15文字のコードを入力しよう。");
    if (!dbApi) return showProfile("今はオンラインにつながっていないので読み込めない。");
    try {
      const s = await dbApi.doc(`players/${k}`).get();
      if (!s.exists) return showProfile("そのコードのデータは見つからない。");
      key = k; try { localStorage.setItem(KEY_LS, key); } catch {}
      prof = fix(s.data()); try { localStorage.setItem(PROF_LS, JSON.stringify(prof)); } catch {}
      showProfile(`「${prof.name}」のデータを読み込んだ。`);
    } catch { showProfile("読み込めなかった。もう一度試そう。"); }
  }

  /* ---------- ボタン ---------- */
  M.onAct = (act, b) => {
    switch (act) {
      case "starter": showStarter(); return true;
      case "start-with": createProfile($("nameIn")?.value.trim(), b.dataset.p); showHome(`ようこそ、${prof.name}。${START_POINTS}ptと「${PRESETS[b.dataset.p].name}」デッキをもらった。`, true); return true;
      case "bet-ai": startAI(+b.dataset.bet); return true;
      case "room-bet": M.roomBet = +b.dataset.bet; showOnline(); return true;
      case "join-ok": joinRoom(b.dataset.code, true); return true;
      case "shop": if (!prof) return showStarter(), true; armed = ""; showShop(); return true;
      case "shop-tab": shopTab = b.dataset.tab; armed = ""; showShop(); return true;
      case "buy": buy(b.dataset.id); return true;
      case "buy-again": armed = b.dataset.id; buy(b.dataset.id); return true;
      case "equip": prof.equip[b.dataset.k] = b.dataset.id; save(); showShop(); return true;
      case "equip-p": prof.equip[b.dataset.k] = b.dataset.id; save(); showProfile(); return true;
      case "collection": if (!prof) return showStarter(), true; showCollection(); return true;
      case "art-use": {
        const { id, art } = b.dataset;
        if (art) prof.artUse[id] = art; else delete prof.artUse[id];
        save(); showCollection(); return true;
      }
      case "profile": showProfile(); return true;
      case "rename": { const v = $("nameIn")?.value.trim(); if (v) { prof.name = v.slice(0, 12); save(); } showProfile("名前を変えた。"); return true; }
      case "load-key": loadKey($("keyIn")?.value); return true;
      case "login": login(); return true;
      case "logout": authApi?.logout(); return true;
      case "close": if ($("dialog").dataset.kind !== "starter" && document.body.dataset.view === "home") { showHome(); return true; } return false;
    }
    return false;
  };

  window.Meta = M;
  /* 本体のホーム画面は先に描かれているので、ポイントの表示を入れて描き直す */
  if (document.body.dataset.view === "home") { showHome(bonusMsg, true); if (!prof) showStarter(); }
  if (onlineState === "on") M.onBackend();   // 通信の準備がこのファイルより先に終わっていた場合
})();
