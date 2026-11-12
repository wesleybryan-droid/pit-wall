/* Pit Wall — screens and input. */
"use strict";
(function () {
const app = document.getElementById("app");
const S = () => PW.state();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const M = PW.money;
let tab = "hq", W = null, R = null, raf = 0, newColor = PW.PLAYER_COLORS[0], openRole = null;

/* ---------- sound ---------- */
const Snd = (() => {
  let ac = null, hum = null, on = true;
  try { on = localStorage.getItem("pitwall-sound") !== "off"; } catch (e) {}
  const ctx = () => { if (!on) return null; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch (e) { return null; } return ac; };
  const beep = (f, d, type = "square", v = .05, when = 0) => { const a = ctx(); if (!a) return; const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .02); };
  const noise = (d, v, f) => { const a = ctx(); if (!a) return; const n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), x = b.getChannelData(0); for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; const fl = a.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = f; const g = a.createGain(); const t = a.currentTime; g.gain.setValueAtTime(.001, t); g.gain.linearRampToValueAtTime(v, t + d * .2); g.gain.exponentialRampToValueAtTime(.001, t + d); s.connect(fl).connect(g).connect(a.destination); s.start(); };
  return {
    get on() { return on; },
    toggle() { on = !on; try { localStorage.setItem("pitwall-sound", on ? "on" : "off"); } catch (e) {} if (!on) this.humStop(); },
    click() { beep(900, .03, "square", .025); },
    radio() { beep(1400, .05, "sine", .05); beep(1100, .05, "sine", .05, .07); },
    light() { beep(330, .25, "sine", .09); },
    go() { beep(660, .5, "sine", .1); },
    cheer() { noise(1.8, .25, 1400); beep(523, .15, "triangle", .08); beep(659, .15, "triangle", .08, .15); beep(784, .3, "triangle", .08, .3); },
    bad() { beep(160, .3, "sawtooth", .06); },
    humStart() {
      const a = ctx(); if (!a || hum) return;
      const g = a.createGain(); g.gain.value = .0; g.connect(a.destination);
      const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; lp.connect(g);
      const o1 = a.createOscillator(), o2 = a.createOscillator(); o1.type = "sawtooth"; o2.type = "sawtooth"; o1.frequency.value = 92; o2.frequency.value = 138.5;
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = .35; lg.gain.value = 18; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      o1.connect(lp); o2.connect(lp); [o1, o2, lfo].forEach(o => o.start());
      g.gain.linearRampToValueAtTime(.022, a.currentTime + 1.2);
      hum = { g, nodes: [o1, o2, lfo], lp };
    },
    humRate(r) { if (hum && ac) hum.lp.frequency.value = 300 + r * 200; },
    humStop() { if (!hum || !ac) return; const h = hum; hum = null; h.g.gain.linearRampToValueAtTime(0, ac.currentTime + .5); setTimeout(() => h.nodes.forEach(o => { try { o.stop(); } catch (e) {} }), 700); },
  };
})();

/* ---------- toast ---------- */
let toastT = 0;
function toast(msg, bad) {
  const t = document.getElementById("toast"); t.textContent = msg; t.className = "on" + (bad ? " bad" : "");
  clearTimeout(toastT); toastT = setTimeout(() => t.className = "", 2400);
}
function result(err, ok) { if (err) { toast(err, true); Snd.bad(); } else { if (ok) toast(ok); Snd.click(); } render(); }

/* ---------- small builders ---------- */
const bar = (v, max = 100, cls = "") => `<div class="bar"><i class="${cls}" style="width:${Math.max(0, Math.min(100, v / max * 100))}%"></i></div>`;
const tyre = t => `<span class="tyre" style="--c:${PW.TYRES[t].color}">${t}</span>`;
const ord = n => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
const level = (v, a, b, words) => v < a ? words[0] : v < b ? words[1] : words[2];
function teamRank(area) { const vals = Object.values(S().teams).map(t => t.car[area]).sort((a, b) => b - a); return vals.indexOf(S().teams.you.car[area]) + 1; }

/* ---------- top-level render ---------- */
function render() { renderCore(); if (PW.afterRender) PW.afterRender(); }
function renderCore() {
  cancelAnimationFrame(raf);
  const s = S();
  if (!s) return renderTitle();
  document.documentElement.style.setProperty("--team", s.teams.you.color);
  if (s.over) return renderGameOver();
  if (W) return renderWeekend();
  if (s.phase === "seasonEnd") return renderSeasonEnd();
  renderShell();
}
PW.render = render;

function renderTitle() {
  const saved = PW.load();
  if (saved) { renderCore(); return; }
  PW.screen = "title";
  app.innerHTML = `<div class="title"><div class="box">
    <div class="pill red" style="margin-bottom:14px">Team management</div>
    <h1>Pit<span>/</span>Wall</h1>
    <p>Take over the slowest team on the grid. Research upgrades, hire drivers and engineers, sign sponsors, and make the calls that win races from the pit wall.</p>
    <label class="field"><span>Team name</span><input id="tname" maxlength="24" value="Pit Wall Racing"></label>
    <div class="field"><span>Team color</span><div class="swatches">${PW.PLAYER_COLORS.map(c => `<button data-a="color" data-v="${c}" class="${c === newColor ? "on" : ""}" style="background:${c}" aria-label="color ${c}"></button>`).join("")}</div></div>
    <label class="row" style="margin-top:6px;cursor:pointer;font-weight:600"><input type="checkbox" id="tut" checked style="width:18px;height:18px"> Show me how to play (recommended)</label>
    <div class="row" style="margin-top:22px"><button class="btn go" data-a="new">Start career</button><button class="btn ghost" data-a="guide">How to play</button></div>
    <p class="dim" style="font-size:12px;margin-top:28px">Unofficial fan game. Not affiliated with Formula 1 or any team, driver or circuit. Teams and drivers are fictional.</p>
  </div></div>`;
}

function trophyShelf(compact) {
  const s = S(), have = s.trophies || {};
  const n = Object.keys(have).length;
  return `<div class="${compact ? "" : "card"}" style="${compact ? "margin:16px 0" : "margin-top:16px"}"><h3>Trophy cabinet · ${n} of ${PW.TROPHIES.length}</h3><div class="trophies">${PW.TROPHIES.map(t => { const h = have[t.id]; return `<div class="trophy ${h ? "got" : ""}" title="${esc(t.desc)}"><div class="ti">${h ? t.icon : "🔒"}</div><b>${esc(t.name)}</b><span>${h ? `Season ${h.season}, round ${h.round + 1}` : esc(t.desc)}</span></div>`; }).join("")}</div></div>`;
}
function renderGameOver() {
  const s = S();
  app.innerHTML = `<div class="title"><div class="box card">
    <div class="pill red">Game over</div>
    ${s.overReason === "fired" ? `<h1 style="font-size:44px;margin-top:10px">You're fired</h1>
    <p>After season ${s.season}, the board of ${esc(s.teams.you.name)} lost confidence and replaced you as team principal.</p>
    <p class="muted">Tip: the board sets a target finishing position each season (shown on HQ). Missing it badly drains their confidence fast.</p>` : `<h1 style="font-size:44px;margin-top:10px">In administration</h1>
    <p>${esc(s.teams.you.name)} ran out of money in season ${s.season}, round ${s.round}. The bank has taken the keys to the factory.</p>
    <p class="muted">Tip: keep an eye on the net per race on the HQ page. Salaries and research add up fast.</p>`}
    ${trophyShelf(true)}
    <button class="btn go" data-a="wipe">New career</button>
  </div></div>`;
}

function shellTop() {
  const s = S(), me = s.teams.you, c = PW.circuit();
  const tabs = [["hq", "HQ"], ["factory", "Factory"], ["team", "Team"], ["sponsors", "Sponsors"], ["standings", "Standings"]];
  const sponsorDot = s.sponsors.length < PW.sponsorSlots() && s.sponsorOffers.length;
  const factoryDot = s.research.active.length < PW.slots();
  return `<div class="top"><div class="topbar">
      <div class="logo"><div class="stripe"></div><div>${esc(me.name)}<small>Season ${s.season} · Round ${Math.min(s.round + 1, 12)} of 12</small></div></div>
      <div class="kpis">
        <div class="kpi"><b class="num ${s.cash < 0 ? "bad" : ""}">${M(s.cash)}</b><span>Cash</span></div>
        <div class="kpi hide-sm"><b class="num">${ord(PW.myPos())}</b><span>Constructors</span></div>
        <div class="kpi"><b class="num">${me.points}</b><span>Points</span></div>
        <button class="iconbtn" data-a="sound" title="Sound">${Snd.on ? "🔊" : "🔇"}</button>
        <button class="iconbtn" data-a="guide" title="How to play">?</button>
        <button class="iconbtn" data-a="menu" title="Menu">☰</button>
      </div></div>
    <div class="tabs">${tabs.map(([id, n]) => `<button class="tab ${tab === id ? "on" : ""}" data-a="tab" data-v="${id}">${n}${(id === "sponsors" && sponsorDot) || (id === "factory" && factoryDot) ? '<span class="dot"></span>' : ""}</button>`).join("")}</div></div>`;
}

function renderShell() {
  const pages = { hq: pageHQ, factory: pageFactory, team: pageTeam, sponsors: pageSponsors, standings: pageStandings };
  PW.screen = tab;
  app.innerHTML = shellTop() + `<div class="page">${pages[tab]()}</div>` + ruleModal();
  const cv = document.getElementById("preview");
  if (cv) PW.drawTrack(cv, { path: PW.trackPath(PW.circuit().shape), wet: false }, { static: true });
}

function ruleModal() {
  const r = S().pendingRule;
  if (!r) return eventModal();
  return `<div class="modal"><div class="box">
    <div class="pill amber">Mid-season rule change</div>
    <h2 style="margin:12px 0 8px">${esc(r.title)}</h2>
    <p>${esc(r.text)}</p>
    <p class="muted">The governing body has spoken. Check the Factory to see where you stand now.</p>
    <button class="btn primary" data-a="ruleok">Understood</button></div></div>`;
}

function eventModal() {
  const ev = PW.eventView();
  if (!ev) return "";
  return `<div class="modal"><div class="box">
    <div class="pill blue">Paddock decision</div>
    <h2 style="margin:12px 0 8px">${esc(ev.title)}</h2>
    <p>${esc(ev.text)}</p>
    <div class="choice" style="margin-top:14px">${ev.choices.map((c, i) => `<button data-a="event" data-v="${i}"><b>${esc(c.label)}</b><span>${esc(c.desc)}</span></button>`).join("")}</div>
    <p class="dim" style="font-size:12px;margin:12px 0 0">Cash: ${M(S().cash)}</p></div></div>`;
}

/* ---------- HQ ---------- */
function pageHQ() {
  const s = S(), c = PW.circuit(), me = s.teams.you;
  const teams = Object.values(s.teams).map(t => ({ t, p: PW.carPerf(t, c) })).sort((a, b) => b.p - a.p);
  const maxP = teams[0].p, minP = teams[teams.length - 1].p;
  const myRank = teams.findIndex(x => x.t.player) + 1;
  const w = PW.wageBill(), spons = s.sponsors.reduce((a, x) => a + x.perRace, 0);
  const net = PW.TV_PER_RACE + spons - w.total / 12 - PW.OPS_PER_RACE;
  const favors = [["Aero", c.aero], ["Engine", c.power], ["Chassis", c.mech]].sort((a, b) => b[1] - a[1])[0][0];
  const lr = s.lastResult;
  const [d1, d2] = PW.myDrivers();
  return `<div class="grid g-hq">
    <div class="grid">
      <div class="card team"><div class="hero">
        <div>
          <div class="round">Round ${s.round + 1} of 12 · ${esc(c.country)}</div>
          <h1>${esc(c.name)}</h1>
          <div class="muted">${esc(c.tag)}</div>
          <div class="traits">
            <div class="trait"><span>Favors</span><b>${favors}</b></div>
            <div class="trait"><span>Tire wear</span><b>${level(c.wear, .95, 1.12, ["Low", "Medium", "High"])}</b></div>
            <div class="trait"><span>Rain chance</span><b>${Math.round(c.rain * 100)}%</b></div>
            <div class="trait"><span>Overtaking</span><b>${level(c.pass, .7, 1.15, ["Hard", "Normal", "Easy"])}</b></div>
            <div class="trait"><span>Laps</span><b>${c.laps}</b></div>
            <div class="trait"><span>Our pace rank</span><b class="${myRank <= 3 ? "good" : myRank >= 8 ? "bad" : ""}">${ord(myRank)} of 10</b></div>
          </div>
          <button class="btn go" data-a="weekend">Go to race weekend ›</button>
        </div>
        <canvas id="preview"></canvas>
      </div></div>
      <div class="card"><h3>Car pace at ${esc(c.name)}</h3>
        <div class="cmp">${teams.map(({ t, p }) => `<div class="nm ${t.player ? "me" : ""}"><span class="sw" style="background:${t.color}"></span>${esc(t.name)}</div>${bar(p - minP + 4, maxP - minP + 4, t.player ? "" : "alt")}<div class="num ${t.player ? "me" : "muted"}" style="text-align:right">${p.toFixed(1)}</div>`).join("")}</div>
        <p class="muted" style="margin:10px 0 0;font-size:13px">${myRank === 1 ? "We have the fastest car here. Don't waste it." : `We're ${(maxP - teams[myRank - 1].p).toFixed(1)} rating points off the fastest car here. Every point is about 0.07s a lap.`}</p>
      </div>
    </div>
    <div class="grid" style="align-content:start">
      <div class="card" id="status"><h3>Team status</h3>
        <div class="spread"><span>Income per race</span><b class="num good">${M(PW.TV_PER_RACE + spons)}</b></div>
        <div class="spread"><span>Salaries + operations</span><b class="num bad">−${M(w.total / 12 + PW.OPS_PER_RACE).slice(1)}</b></div>
        <div class="spread" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--line)"><span>Net per race</span><b class="num ${net >= 0 ? "good" : "bad"}">${M(net)}</b></div>
        <hr>
        <div class="spread"><span>Development spent</span><b class="num">${M(s.devSpent)} / ${M(PW.devCap())}</b></div>
        ${bar(s.devSpent, PW.devCap())}
        <hr>
        <div class="spread"><span>Drivers</span><span>${[d1, d2].map(d => `<b>${d.code}</b> <span class="muted">${d.points} pts</span>`).join(" · ")}</span></div>
        <hr><div class="spread"><span>Board target</span><b class="${PW.myPos() <= s.board.target ? "good" : "warn"}">${ord(s.board.target)} or better · now ${ord(PW.myPos())}</b></div>
        <div class="stat" style="grid-template-columns:110px 1fr 38px;margin-bottom:0"><span class="muted">Board confidence</span>${bar(s.board.conf, 100, s.board.conf < 35 ? "lowconf" : "")}<b class="num ${s.board.conf < 35 ? "bad" : ""}">${s.board.conf}</b></div>
        ${s.ruleNote ? `<hr><div class="warn" style="font-size:13px">⚠ ${esc(s.ruleNote)}</div>` : ""}
      </div>
      ${lr ? `<div class="card"><h3>Last race: ${esc(lr.report.circuit)}</h3>${lr.classified.map((e, i) => ({ e, i })).filter(x => x.e.mine).map(({ e, i }) => `<div class="spread"><b>${e.name}</b><span class="${e.dnf ? "dnf" : i < 10 ? "good" : ""}">${e.dnf ? "DNF " + e.dnf : "P" + (i + 1)}${e.pts ? ` · +${e.pts} pts` : ""}</span></div>`).join("")}<div class="muted" style="font-size:13px;margin-top:6px">Net money ${M(lr.report.net)}</div></div>` : ""}
      <div class="card"><h3>Paddock news</h3><ul class="news">${s.news.map(n => `<li class="${n.kind}"><span class="when">S${n.season} R${n.round + 1}</span><span class="msg">${esc(n.msg)}</span></li>`).join("")}</ul></div>
    </div>
  </div>`;
}

/* ---------- Factory ---------- */
function pageFactory() {
  const s = S(), me = s.teams.you, slots = PW.slots();
  const ratings = PW.AREAS.map(a => `<div class="stat"><span>${a.name}</span>${bar(me.car[a.id] - 40, 60)}<b class="num">${Math.round(me.car[a.id])}</b></div><div class="stat" style="margin-top:-6px"><span></span><span class="rank">${ord(teamRank(a.id))} on the grid · best ${Math.round(Math.max(...Object.values(s.teams).map(t => t.car[a.id])))}</span><span></span></div>`).join("");
  const slotHtml = [0, 1, 2].map(i => {
    const p = s.research.active[i];
    if (i >= slots) return `<div class="slot locked"><b>Locked</b><div class="muted" style="font-size:12px">Hire a Technical Director rated 80+</div></div>`;
    if (!p) return `<div class="slot"><b class="muted">Empty slot</b><div class="dim" style="font-size:12px">Pick a project below</div></div>`;
    const done = p.races - p.left;
    return `<div class="slot busy"><div class="spread"><b>${esc(p.name)}</b>${p.risk ? `<span class="pill amber">${Math.round(p.risk * 100)}% risk</span>` : ""}</div>
      <div class="muted" style="font-size:12px;margin:2px 0 8px">${PW.AREAS.find(a => a.id === p.area).name} +${p.gain} · ${p.left} race${p.left > 1 ? "s" : ""} to go</div>${bar(done, p.races)}</div>`;
  }).join("");
  const areas = PW.AREAS.map(a => {
    const tier = s.research.tier[a.id], busy = s.research.active.some(p => p.area === a.id);
    const opts = tier < 3 ? ["safe", "bold"] : ["safe"];
    const head = s.staff[a.head];
    return `<div class="card area"><div class="spread"><b style="font-size:17px">${a.name}</b><span class="ovr num">${Math.round(me.car[a.id])}</span></div>
      <div class="muted" style="font-size:12px">${a.desc}</div>
      <div class="tiers">${[0, 1, 2].map(i => `<i class="${i < tier ? "on" : ""}"></i>`).join("")}</div>
      <div class="dim" style="font-size:11px">Led by ${esc(head.name)} (${head.rating})</div>
      ${busy ? `<div class="opt"><span class="pill blue">In development</span></div>` : opts.map(o => {
        const p = PW.projectFor(a.id, o), why = PW.canStart(p);
        return `<div class="opt ${o}"><div class="spread"><span class="nm">${esc(p.name)}</span>${o === "bold" ? `<span class="pill amber">Bold</span>` : `<span class="pill">${tier < 3 ? "Safe" : "Refine"}</span>`}</div>
          <div class="meta">+${p.gain} ${a.name} · ${M(p.cost)} · ${p.races} race${p.races > 1 ? "s" : ""}${p.risk ? ` · <span class="warn">${Math.round(p.risk * 100)}% chance to fail</span>` : ""}</div>
          <button class="btn sm ${why ? "" : "primary"}" data-a="research" data-v="${a.id}" data-o="${o}" ${why ? `disabled title="${esc(why)}"` : ""}>${why ? esc(why) : "Start project"}</button></div>`;
      }).join("")}</div>`;
  }).join("");
  return `<div class="grid g2" style="margin-bottom:16px">
    <div class="card team"><h3>Car ratings</h3>${ratings}</div>
    <div class="card"><h3>Research slots (${s.research.active.length}/${slots})</h3><div class="slots">${slotHtml}</div>
      <hr><div class="spread"><span>Development cap</span><b class="num">${M(s.devSpent)} of ${M(PW.devCap())}</b></div>${bar(s.devSpent, PW.devCap())}
      <p class="muted" style="font-size:13px;margin:10px 0 0">Projects finish after the race weekends shown. Bold projects pay off big but can fail in testing. Rivals develop every race, so standing still means going backwards.</p></div>
  </div><div class="areas">${areas}</div>`;
}

/* ---------- Team ---------- */
function driverCard(d, label) {
  const s = S();
  if (!d) return `<div class="card"><h3>${label}</h3><p class="muted">Empty seat. Sign someone from the market below.</p></div>`;
  const swap = d.role !== "res" && PW.reserve() ? `<button class="btn sm" data-a="swapres" data-v="${d.role}">Swap with reserve</button>` : "";
  return `<div class="card team"><h3>${label}</h3><div class="person"><div class="helmet"></div><div>
      <div class="spread"><b style="font-size:18px">${esc(d.name)}</b><span class="ovr num">${PW.ovr(d)}</span></div>
      <div class="muted" style="font-size:13px">${d.code} · Age ${d.age} · ${M(d.salary)}/season · ${d.contract} season${d.contract === 1 ? "" : "s"} left</div>
      <div class="mini">${[["Pace", d.pace], ["Craft", d.racecraft], ["Consis.", d.consistency], ["Tires", d.tyre], ["Wet", d.wet]].map(([k, v]) => `<div><span>${k}</span><b class="num">${v}</b></div>`).join("")}</div>
      <div class="stat" style="grid-template-columns:60px 1fr 30px"><span class="muted">Morale</span>${bar(d.morale)}<b class="num ${d.morale < 45 ? "bad" : d.morale > 75 ? "good" : ""}">${d.morale}</b></div>
      <div class="row" style="margin-top:4px"><span class="muted" style="font-size:12px">${d.points} pts · ${d.wins} wins · ${d.podiums} podiums</span><span style="margin-left:auto">${swap}</span></div>
    </div></div></div>`;
}
function pageTeam() {
  const s = S(), [d1, d2] = PW.myDrivers();
  const staff = PW.ROLES.map(r => {
    const st = s.staff[r.id], open = openRole === r.id;
    return `<div class="card"><div class="person"><div class="avatar" style="background:${st.rating >= 80 ? "var(--green)" : st.rating >= 65 ? "var(--team)" : "#5d6678"}">${st.rating}</div><div>
      <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700">${r.name}</div>
      <b style="font-size:16px">${esc(st.name)}</b><div class="muted" style="font-size:12px">${M(st.salary)}/season</div>
      <div style="font-size:12px;margin-top:6px">${r.perk}</div>
      <button class="btn sm" style="margin-top:8px" data-a="role" data-v="${r.id}">${open ? "Close" : "Find a replacement"}</button>
    </div></div>
    ${open ? `<hr>${s.staffMarket[r.id].length ? s.staffMarket[r.id].map((c, i) => `<div class="spread" style="margin:8px 0"><div><b>${esc(c.name)}</b> <span class="ovr num" style="margin-left:6px">${c.rating}</span><div class="muted" style="font-size:12px">${M(c.salary)}/season · signing fee ${M(c.fee)}</div></div><button class="btn sm primary" data-a="hire" data-v="${r.id}" data-i="${i}" ${c.rating <= st.rating ? "" : ""}>Hire</button></div>`).join("") : `<p class="muted">No candidates left this season.</p>`}` : ""}</div>`;
  }).join("");
  const fa = PW.freeAgents().sort((a, b) => PW.ovr(b) - PW.ovr(a));
  return `<div class="grid g3" style="margin-bottom:16px">${driverCard(d1, "Driver 1")}${driverCard(d2, "Driver 2")}${driverCard(PW.reserve(), "Reserve")}</div>
    <h2 style="margin:22px 0 12px">Key staff</h2><div class="grid g3" id="staff" style="margin-bottom:16px">${staff}</div>
    <h2 style="margin:22px 0 12px">Driver market</h2>
    <div class="card" style="overflow-x:auto"><table><thead><tr><th>Driver</th><th>Age</th><th>OVR</th><th>Pace</th><th>Craft</th><th>Consis.</th><th>Tires</th><th>Wet</th><th>Asks</th><th>Sign as</th></tr></thead><tbody>
      ${fa.map(d => { const ask = PW.askSalary(d); return `<tr><td><b>${esc(d.name)}</b> <span class="dim">${d.code}</span></td><td>${d.age}</td><td><span class="ovr num">${PW.ovr(d)}</span></td><td>${d.pace}</td><td>${d.racecraft}</td><td>${d.consistency}</td><td>${d.tyre}</td><td>${d.wet}</td><td class="num">${M(ask)}<div class="dim" style="font-size:11px">fee ${M(ask * .5)}</div></td>
        <td style="white-space:nowrap">${["d1", "d2", "res"].map(sl => `<button class="btn sm" data-a="sign" data-v="${d.id}" data-s="${sl}">${sl === "res" ? "Res" : sl.toUpperCase()}</button>`).join(" ")}</td></tr>`; }).join("")}
    </tbody></table><p class="muted" style="font-size:12px;margin:10px 0 0">Signing a driver into a seat releases whoever is in it (race drivers get a 30% payoff). Stars ask for more to join a team low in the standings.</p></div>`;
}

/* ---------- Sponsors ---------- */
function goalProgress(sp) {
  if (sp.done) return `<span class="pill green">Bonus paid</span>`;
  if (sp.goal.type === "points") return `${sp.progress} of ${sp.goal.n} ${bar(sp.progress, sp.goal.n)}`;
  if (sp.goal.type === "beat") { const st = PW.standings(); const ok = st.findIndex(t => t.id === "you") < st.findIndex(t => t.id === sp.goal.team); return `<span class="pill ${ok ? "green" : "red"}">${ok ? "Currently ahead" : "Currently behind"}</span>`; }
  return `<span class="pill">Not yet</span>`;
}
function pageSponsors() {
  const s = S(), slots = PW.sponsorSlots();
  const active = [0, 1, 2].map(i => {
    const sp = s.sponsors[i];
    if (i >= slots) return `<div class="card" style="opacity:.45"><h3>Locked slot</h3><p class="muted">Hire a Commercial Director rated 80+.</p></div>`;
    if (!sp) return `<div class="card"><h3>Open slot</h3><p class="muted">Sign one of the offers below.</p></div>`;
    return `<div class="card team"><h3>${esc(sp.name)}</h3><div style="font-size:26px;font-weight:900" class="num">${M(sp.perRace)}<span class="muted" style="font-size:13px"> per race</span></div>
      <div style="margin:8px 0 4px">${esc(sp.goal.text)} → <b class="good">${M(sp.bonus)}</b></div>${goalProgress(sp)}
      <div style="margin-top:10px"><button class="btn sm ghost" data-a="drop" data-v="${i}">End deal ($1M)</button></div></div>`;
  }).join("");
  const offers = s.sponsorOffers.map((o, i) => `<div class="card"><h3>${esc(o.name)}</h3><div style="font-size:22px;font-weight:900" class="num">${M(o.perRace)}<span class="muted" style="font-size:13px"> per race</span></div>
    <div style="margin:8px 0 12px">Bonus ${M(o.bonus)}: ${esc(o.goal.text)}</div>
    <button class="btn sm primary" data-a="sponsor" data-v="${i}" ${s.sponsors.length >= slots ? "disabled" : ""}>Sign deal</button></div>`).join("");
  return `<h2 style="margin-bottom:12px">Active sponsors</h2><div class="grid g3">${active}</div>
    <h2 style="margin:22px 0 4px">Offers</h2><p class="muted" style="margin:0 0 12px">New offers arrive every 3 races. Deals run to the end of the season. Better results and a better Commercial Director bring bigger money.</p>
    <div class="grid g3">${offers || `<p class="muted">No offers right now.</p>`}</div>`;
}

/* ---------- Standings ---------- */
function pageStandings() {
  const s = S();
  const cons = PW.standings().map((t, i) => `<tr class="${t.player ? "me" : ""}"><td>${i + 1}</td><td><span class="sw" style="background:${t.color}"></span>${esc(t.name)}</td><td class="num"><b>${t.points}</b></td><td class="num muted">${(PW.AREAS.reduce((a, x) => a + t.car[x.id], 0) / 5).toFixed(1)}</td></tr>`).join("");
  const drv = PW.driverStandings().slice(0, 22).map((d, i) => { const t = s.teams[d.team]; return `<tr class="${d.team === "you" ? "me" : ""}"><td>${i + 1}</td><td><span class="sw" style="background:${t ? t.color : "#555"}"></span>${esc(d.name)}</td><td class="muted">${t ? esc(t.short) : "—"}</td><td class="num"><b>${d.points}</b></td><td class="num">${d.wins}</td><td class="num">${d.podiums}</td></tr>`; }).join("");
  const cal = PW.CIRCUITS.map((c, i) => { const h = s.history.find(x => x.season === s.season && x.round === i); return `<tr class="${i === s.round ? "me" : ""}"><td>${i + 1}</td><td>${esc(c.name)}</td><td class="muted">${esc(c.tag)}</td><td>${h ? h.mine.map(m => `${m.code} ${m.dnf ? '<span class="dnf">DNF</span>' : "P" + m.pos}`).join(" · ") : i === s.round ? '<span class="pill red">Next</span>' : ""}</td></tr>`; }).join("");
  return `<div class="grid g2"><div class="card"><h3>Constructors</h3><table><thead><tr><th>#</th><th>Team</th><th>Pts</th><th>Car avg</th></tr></thead><tbody>${cons}</tbody></table></div>
    <div class="card"><h3>Drivers</h3><table><thead><tr><th>#</th><th>Driver</th><th>Team</th><th>Pts</th><th>W</th><th>Pod</th></tr></thead><tbody>${drv}</tbody></table></div></div>
    <div class="card" style="margin-top:16px;overflow-x:auto"><h3>Season ${s.season} calendar</h3><table><tbody>${cal}</tbody></table></div>${trophyShelf()}`;
}

/* ---------- race weekend ---------- */
function startWeekend() {
  const c = PW.circuit();
  const wetStart = Math.random() < c.rain * 0.5, wx = PW.weatherPlan(c, wetStart);
  W = { round: S().round, step: "practice", practice: [], bonus: {}, qualiMode: "std", wetStart, wx, outlook: PW.rainOutlook(wx, wetStart), advice: PW.setupAdvice(), gapMode: "leader", grid: null, plans: {}, presets: null };
  W.setup = W.advice;
  render();
}
function weekendHeader(stepIdx) {
  const c = PW.circuit(W.round);
  return `<div class="top"><div class="topbar"><div class="logo"><div class="stripe"></div><div>${esc(c.name)}<small>Round ${W.round + 1} · ${esc(c.country)}</small></div></div>
    <div class="kpis"><span class="pill ${W.wetStart ? "blue" : ""}">${W.wetStart ? "🌧 Wet" : "☀ Dry"} · radar ${W.outlook}% rain</span><button class="iconbtn" data-a="sound">${Snd.on ? "🔊" : "🔇"}</button><button class="iconbtn" data-a="guide" title="How to play">?</button></div></div></div>
    <div class="page" style="padding-bottom:0"><div class="steps">${[0, 1, 2, 3, 4].map(i => `<div class="${i <= stepIdx ? "on" : ""}"></div>`).join("")}</div></div>`;
}
const PRACTICE = [
  { id: "setup", icon: "🔧", name: "Setup work", desc: "Find the exact best setup (your engineer's pick is guaranteed right) and +0.3 car performance this weekend." },
  { id: "long",  icon: "🛞", name: "Tire long runs", desc: "Exact tire-life data, a perfect strategy recommendation, and 6% less tire wear in the race." },
  { id: "quali", icon: "⏱️", name: "Qualifying simulations", desc: "Practice low-fuel laps. About 0.2s faster in qualifying." },
  { id: "rel",   icon: "🔩", name: "Reliability checks", desc: "Strip and inspect the cars. 40% fewer breakdowns in the race." },
];
function practiceBonus(list) {
  const b = {};
  if (list.includes("setup")) b.perf = 0.3;
  if (list.includes("long")) b.wearMul = 0.94;
  if (list.includes("quali")) b.quali = 0.2;
  if (list.includes("rel")) b.failMul = 0.6;
  return b;
}
function renderWeekend() {
  PW.screen = W.step === "grid" ? "strategy" : W.step;
  if (W.step === "race") return renderRace();
  if (W.step === "results") return renderResults();
  const c = PW.circuit(), [d1, d2] = PW.myDrivers();
  if (W.step === "practice") {
    const progs = PRACTICE.map(p => `<button class="${W.practice.includes(p.id) ? "on" : ""}" data-a="prac" data-v="${p.id}"><div class="spread"><b>${p.icon} ${p.name}</b>${W.practice.includes(p.id) ? '<span class="pill green">Selected</span>' : ""}</div><span>${p.desc}</span></button>`).join("");
    app.innerHTML = weekendHeader(0) + `<div class="page"><div class="grid g2">
      <div class="card team"><h3>Friday practice</h3><h2 style="margin-bottom:6px">Choose two programs</h2>
        <p class="muted">There's only time for two programs before qualifying. Pick the ones that fit this circuit and your plan.</p>
        <div class="choice">${progs}</div>
        <div style="margin-top:18px"><button class="btn go" data-a="pracdone" ${W.practice.length ? "" : "disabled"}>${W.practice.length < 2 ? `Pick ${2 - W.practice.length} more` : "Go to qualifying ›"}</button>
        ${W.practice.length === 1 ? '<button class="btn ghost" data-a="pracdone" style="margin-left:6px">Skip the second</button>' : ""}</div></div>
      <div class="card"><h3>About ${esc(c.name)}</h3><p>${esc(c.tag)}.</p>
        <div class="traits">
          <div class="trait"><span>Tire wear</span><b>${level(c.wear, .95, 1.12, ["Low", "Medium", "High"])}</b></div>
          <div class="trait"><span>Overtaking</span><b>${level(c.pass, .7, 1.15, ["Hard", "Normal", "Easy"])}</b></div>
          <div class="trait"><span>Radar</span><b class="${W.outlook >= 50 ? "warn" : ""}">${W.outlook}% rain</b></div>
        </div>
        <p class="muted" style="font-size:13px">Hard to pass here? Qualifying sims pay off. Tires wear fast? Long runs help. Weak reliability? Check it now rather than on Sunday.</p></div></div></div>`;
    return;
  }
  if (W.step === "quali") {
    const ideal = PW.SETUPS[W.advice];
    app.innerHTML = weekendHeader(1) + `<div class="page"><div class="grid g2">
      <div class="card team"><h3>Car setup</h3><h2 style="margin-bottom:6px">How much downforce?</h2>
        <p class="muted">${esc(c.name)} favors ${[["aero", c.aero], ["engine power", c.power], ["mechanical grip", c.mech]].sort((x, y) => y[1] - x[1])[0][0]}. The setup is used for qualifying and the race. Matching it to the circuit, and to your car's strengths, is worth real lap time.</p>
        <div class="choice">${Object.entries(PW.SETUPS).map(([k, st]) => `<button class="${W.setup === k ? "on" : ""}" data-a="setup" data-v="${k}"><div class="spread"><b>${st.name}</b>${W.advice === k ? '<span class="pill green">Engineer\'s pick</span>' : ""}</div><span>${st.desc}</span></button>`).join("")}</div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card"><h3>Qualifying</h3><h2 style="margin-bottom:6px">Engine mode</h2>
          <p class="muted">${c.pass < .7 ? "Overtaking is hard here. Grid position matters a lot." : c.pass > 1.15 ? "Easy to overtake here, so a bad grid slot can be fixed." : "Grid position matters, but races can be won from the midfield."}</p>
          <div class="choice qmode">
            <button class="${W.qualiMode === "std" ? "on" : ""}" data-a="qmode" data-v="std"><b>Standard</b><span>Normal power. No extra risk.</span></button>
            <button class="${W.qualiMode === "max" ? "on" : ""}" data-a="qmode" data-v="max"><b>Max attack</b><span>About 0.25s faster per lap. Engine strain raises the chance of a breakdown in the race by 30%.</span></button>
          </div>
          <div style="margin-top:18px"><button class="btn go" data-a="runquali">Run qualifying ›</button></div></div>
        <div class="card"><h3>Weather radar</h3>
          <div class="spread"><span>${W.wetStart ? "🌧 Raining now. Wet start." : "☀ Dry now."}</span><b class="${W.outlook >= 50 ? "warn" : ""}">${W.outlook}% chance of ${W.wetStart ? "staying wet" : "rain in the race"}</b></div>
          ${bar(W.outlook)}
          <p class="muted" style="font-size:12px;margin:8px 0 0">Your race engineer reads the radar (rated ${S().staff.re.rating}). Better engineers give more accurate forecasts, and during the race the radar warns you a few laps before the weather changes.</p>
          <hr><h3>Our drivers</h3>${[d1, d2].map(d => `<div class="spread" style="margin:6px 0"><b>${esc(d.name)}</b><span class="muted">Pace ${d.pace} · Wet ${d.wet} · Morale ${d.morale}</span></div>`).join("")}
        </div></div></div></div>`;
    return;
  }
  if (W.step === "grid" || W.step === "strategy") {
    if (!W.presets) W.presets = PW.strategyPresets(W.wetStart, W.practice.includes("long"));
    [d1, d2].forEach(d => { if (!W.plans[d.id]) W.plans[d.id] = (W.presets.find(p => p.recommended) || W.presets[0]); });
    const gridHtml = W.grid.map((g, i) => `<div class="gslot ${g.mine ? "me" : ""} ${W.animGrid ? "anim" : ""}" style="animation-delay:${i * 70}ms"><span class="p">${i + 1}</span><span class="sw" style="background:${g.color}"></span><b>${g.code}</b><span class="muted">${esc(S().teams[g.team].short)}</span><span class="t num">${i === 0 ? g.time.toFixed(3) : "+" + (g.time - W.grid[0].time).toFixed(3)}</span></div>`).join("");
    W.animGrid = false;
    const stratCard = d => {
      const pos = W.grid.findIndex(g => g.id === d.id) + 1;
      return `<div class="card team"><div class="spread"><h3 style="margin:0">${esc(d.name)}</h3><span class="pill">Starts P${pos}</span></div>
        <div class="choice" style="margin-top:10px">${W.presets.map(p => `<button class="${W.plans[d.id] === p ? "on" : ""}" data-a="plan" data-v="${d.id}" data-p="${p.id}">
          <div class="row" style="gap:6px">${p.stints.map(tyre).join('<span class="dim">›</span>')}${p.recommended ? '<span class="pill green" style="margin-left:auto">Engineer\'s pick</span>' : ""}</div>
          <b style="margin-top:6px">${p.name}</b><span>${p.stops.length ? "Box on lap " + p.stops.map(s => s.lap).join(" and ") : esc(p.note || "")}${p.delta > 0.05 ? ` · est. +${p.delta.toFixed(1)}s` : p.stops.length ? " · fastest on paper" : ""}</span></button>`).join("")}</div></div>`;
    };
    app.innerHTML = weekendHeader(2) + `<div class="page"><div class="grid g2">
      <div class="card"><h3>Starting grid</h3><div class="gridlist">${gridHtml}</div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><h3>Race strategy</h3><p class="muted" style="margin:0">Pick a plan for each car. In a dry race you must use two different dry compounds or take a 20s penalty. You can change everything live from the pit wall.</p>
          ${W.practice.includes("long") && !W.wetStart ? `<p style="margin:8px 0 0;font-size:13px">Long-run data: ${["S", "M", "H"].map(t => `${tyre(t)} about ${Math.round(PW.TYRES[t].life / (c.wear * S().mods.wearMul) * (0.8 + S().teams.you.car.tyre / 300) / ((W.bonus.wearMul || 1) * PW.SETUPS[W.setup].wear))} laps`).join(" · ")}</p>` : ""}
          <p style="margin:8px 0 0;font-size:13px">Setup: <b>${PW.SETUPS[W.setup].name}</b> · Radar: <b class="${W.outlook >= 50 ? "warn" : ""}">${W.outlook}% ${W.wetStart ? "chance it stays wet" : "chance of rain"}</b></p></div>
        ${stratCard(d1)}${stratCard(d2)}
        <button class="btn go" data-a="lightsout">Lights out ›</button>
      </div></div></div>`;
  }
}

/* ---------- live race ---------- */
function renderRace() {
  const c = R.c;
  app.innerHTML = `<div class="race">
    <div class="rbar"><div class="lap num" id="rLap"></div><div id="rFlag"></div>
      <div class="speed">${[["pause", "❚❚"], [1, "1×"], [2, "2×"], [4, "4×"], [8, "8×"]].map(([v, l]) => `<button class="btn sm" data-pd="speed" data-v="${v}" id="sp-${v}">${l}</button>`).join("")}<button class="btn sm" data-pd="simend" title="Skip to the finish">⏭</button><button class="btn sm" data-pd="autopause" id="apBtn" title="Pause automatically when there's a decision to make"></button><button class="iconbtn" data-pd="sound">${Snd.on ? "🔊" : "🔇"}</button><button class="iconbtn" data-pd="guide" title="How to play">?</button></div></div>
    <div class="mapwrap"><canvas id="map"></canvas><div class="tvbanner" id="rBanner"></div><div id="rDecision"></div><div class="lights" id="lights">${R.started ? "" : `<div class="rig">${"<i></i>".repeat(5)}</div>`}</div></div>
    <div class="tower"><div class="hd" data-pd="gapmode" title="Tap to switch between gap to leader and interval to car ahead"><span id="rGapMode"></span><span id="rWeather"></span></div><div id="tower"></div></div>
    <div class="ctl" id="ctl"></div>
    <div class="radio" id="radio"></div>
  </div>`;
  updateRaceDom(true);
  if (!R.started && !R.lightsRunning) runLights();
  let last = performance.now(), domT = 0;
  const loop = now => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (R.started && !R.paused && !R.finished) {
      const simDt = dt * R.speed * (c.base / 6); // 1x is about 6 seconds a lap
      const n = Math.ceil(simDt / 0.5);
      for (let i = 0; i < n; i++) { PW.stepRace(R, simDt / n); if (R.paused) break; }
      Snd.humRate(R.speed);
    }
    PW.drawTrack(document.getElementById("map"), R);
    domT += dt;
    if (domT > 0.2) { domT = 0; updateRaceDom(false); }
    if (R.finished && !R.doneAt) { R.doneAt = now; Snd.humStop(); updateRaceDom(true); }
  };
  raf = requestAnimationFrame(loop);
}
function runLights() {
  R.lightsRunning = true;
  const lights = [...document.querySelectorAll("#lights i")];
  lights.forEach((l, i) => setTimeout(() => { if (W && W.step === "race") { const el = document.querySelectorAll("#lights i")[i]; if (el) el.classList.add("on"); Snd.light(); } }, 500 + i * 650));
  setTimeout(() => {
    if (!W || W.step !== "race") return;
    document.querySelectorAll("#lights i").forEach(l => l.classList.remove("on"));
    R.started = true; Snd.go(); Snd.humStart();
    setTimeout(() => { const el = document.getElementById("lights"); if (el) el.innerHTML = ""; }, 400);
    PW.onRadio && PW.onRadio("Lights out and away we go!", "flag");
    R.radio.unshift({ text: "Lights out and away we go!", kind: "flag", t: 0 });
  }, 500 + 5 * 650 + 400 + Math.random() * 800);
}
function updateRaceDom(full) {
  if (!R) return;
  const order = PW.raceOrder(R), leader = order[0];
  const lap = Math.min(R.laps, Math.max(1, leader.lapIdx + 1));
  const set = (id, h) => { const el = document.getElementById(id); if (el && el.innerHTML !== h) el.innerHTML = h; };
  set("rLap", R.finished ? `FINISHED <small>${R.laps} laps</small>` : `LAP ${lap}<small> / ${R.laps}</small>`);
  set("rFlag", R.sc ? `<span class="flag sc">Safety car</span>` : R.wet ? `<span class="flag rain">Wet track</span>` : R.leaderDone ? `<span class="flag green">Chequered flag</span>` : "");
  set("rWeather", (R.wet ? "🌧 Wet" : "☀ Dry") + (R.forecast ? (R.forecast.wet ? ` · rain ~L${R.forecast.lap}` : ` · drying ~L${R.forecast.lap}`) : ""));
  set("rGapMode", W.gapMode === "leader" ? "Gap to leader ⇄" : "Interval ⇄");
  set("apBtn", R.autoPause ? "Auto-pause on" : "Auto-pause off");
  const ap = document.getElementById("apBtn"); if (ap) ap.classList.toggle("on", R.autoPause);
  set("rDecision", decisionCard());
  const bn = document.getElementById("rBanner");
  if (bn) {
    const on = R.banner && performance.now() - R.banner.at < 3800;
    const html = on ? `<span class="tvb ${R.banner.kind}">${esc(R.banner.text)}</span>` : "";
    if (bn.dataset.key !== (on ? R.banner.at + "" : "")) { bn.innerHTML = html; bn.dataset.key = on ? R.banner.at + "" : ""; }
  }
  ["pause", 1, 2, 4, 8].forEach(v => { const b = document.getElementById("sp-" + v); if (b) b.classList.toggle("on", v === "pause" ? R.paused : (!R.paused && R.speed === v)); });
  set("tower", order.map((car, i) => {
    const fl = R.flash[car.id] && R.t - R.flash[car.id] < 3;
    const st = car.dnf ? "OUT" : car.pitTimer > 0 ? "PIT" : car.finished ? "🏁" : car.boost ? "⚡" : "";
    return `<div class="trow ${car.mine ? "me" : ""} ${fl ? "flash" : ""} ${car.dnf ? "out" : ""}"><span class="p num">${i + 1}</span><span class="c" style="background:${car.color}"></span><span class="cd">${car.code}</span><span class="st">${st}</span><span class="g num">${W.gapMode === "interval" && i > 0 ? intervalText(R, car, order[i - 1], leader) : PW.gapText(R, car, leader)}</span>${car.dnf ? "<span></span>" : tyre(car.tyre)}</div>`;
  }).join(""));
  // my cars
  const mine = R.cars.filter(c => c.mine);
  const swap = PW.canSwap(R);
  set("ctl", mine.map(car => {
    const ahead = order[car.pos - 2], gapA = ahead && !car.dnf ? ((ahead.dist - car.dist) * car.lapTime) : null;
    const wearPct = Math.round(car.wear * 100);
    const plan = car.dnf ? `<span class="dnf">Out: ${car.dnf}</span>` : car.finished ? "Finished" : car.pitReq ? `<b class="warn">Boxing this lap for ${PW.TYRES[car.pitReq].name}s</b> <button class="btn sm ghost" data-pd="cancelbox" data-v="${car.id}">Stay out</button>` : car.plan[0] ? `Plan: box lap ${car.plan[0].lap} for ${PW.TYRES[car.plan[0].tyre].name}s` : car.pitTimer > 0 ? "In the pits" : "No more stops planned";
    return `<div class="carctl"><div class="head"><div class="pos num">${car.dnf ? "—" : "P" + car.pos}</div><div style="flex:1"><div class="nm">${esc(car.name)}</div><div class="sub num">${car.lastLap ? "Last " + car.lastLap.toFixed(2) + "s" : "Grid P" + car.startPos}${gapA != null && gapA > 0 && gapA < 60 && !car.finished ? ` · ${gapA.toFixed(1)}s to ${ahead.code}` : ""}</div></div>${car.dnf ? "" : tyre(car.tyre)}</div>
      ${car.dnf || car.finished ? `<div class="plan">${plan}</div>` : `
      <div class="wear"><span>Tires</span><div class="bar"><i style="width:${Math.max(0, 100 - wearPct)}%;background:${wearPct > 80 ? "var(--red)" : wearPct > 55 ? "var(--amber)" : "var(--green)"}"></i></div><span class="num">${Math.max(0, 100 - wearPct)}%</span></div>
      <div class="ers"><span class="muted">⚡ Battery</span><div class="bar"><i style="width:${Math.round(car.ers)}%"></i></div><button class="btn sm boostbtn ${car.boost ? "on" : ""}" data-pd="boost" data-v="${car.id}" ${R.sc || car.pitTimer > 0 || (!car.boost && car.ers < 5) ? "disabled" : ""}>${car.boost ? "⚡ Boosting" : "⚡ Boost"}</button></div>
      ${!car.boost && gapA != null && gapA > 0 && gapA < 1.0 && !R.sc ? `<div class="attack">Within 1s of ${ahead.code}. Boost to attack!</div>` : ""}
      <div class="seg">${["save", "normal", "push"].map(m => `<button class="${car.mode === m ? "on " + m : ""}" data-pd="mode" data-v="${car.id}" data-m="${m}">${m === "save" ? "Save tires" : m === "push" ? "Push" : "Balanced"}</button>`).join("")}</div>
      <div class="boxrow"><span class="muted" style="font-size:12px;margin-right:4px">BOX FOR</span>${["S", "M", "H", "W"].map(t => `<button class="tbtn ${car.pitReq === t ? "sel" : ""}" data-pd="box" data-v="${car.id}" data-t="${t}" title="${PW.TYRES[t].name}">${tyre(t)}</button>`).join("")}</div>
      <div class="plan">${plan}</div>`}</div>`;
  }).join("") + (swap ? `<div style="grid-column:1/-1"><button class="btn sm" data-pd="swap">Team orders: let ${swap.back.code} past ${swap.front.code}</button></div>` : "")
    + (R.finished ? `<div style="grid-column:1/-1"><button class="btn go" data-pd="results">See results ›</button></div>` : ""));
  set("radio", R.radio.map(m => `<div class="msg ${m.kind}">${esc(m.text)}</div>`).join(""));
}
PW.onRadio = (text, kind) => { Snd.radio(); };

function autoPausePref() { try { return localStorage.getItem("pitwall-autopause") !== "off"; } catch (e) { return true; } }
function decisionCard() {
  const d = R.decision;
  if (!d) return "";
  const cars = R.cars.filter(c => c.mine && !c.dnf && !c.finished);
  const rows = cars.map(car => {
    const grip = Math.max(0, Math.round((1 - car.wear) * 100));
    return `<div class="drow"><div class="dcar"><b>P${car.pos} ${car.code}</b><span>${tyre(car.tyre)} ${grip}% grip${car.pitTimer > 0 ? " · in pits" : ""}</span></div>
      <div class="dbtns">${["S", "M", "H", "W"].map(t => `<button class="tbtn ${car.pitReq === t ? "sel" : ""} ${d.suggest[car.id] === t ? "sug" : ""}" data-pd="box" data-v="${car.id}" data-t="${t}" title="Box for ${PW.TYRES[t].name}s">${tyre(t)}</button>`).join("")}
      <button class="btn sm ${car.pitReq ? "" : "on"}" data-pd="cancelbox" data-v="${car.id}">Stay out</button></div>
      <div class="dnote">${car.pitReq ? `<b class="warn">Boxing for ${PW.TYRES[car.pitReq].name}s at the end of this lap</b>` : d.suggest[car.id] ? `Engineer suggests: box for ${PW.TYRES[d.suggest[car.id]].name}s` : "Engineer: stay out"}</div></div>`;
  }).join("");
  return `<div class="decision ${d.kind}"><div class="dtag">Decision · race paused</div><h4>${esc(d.title)}</h4><p>${esc(d.text)}</p>${rows}
    <div class="dfoot"><button class="btn primary" data-pd="dresume">Keep racing ▶</button><span class="muted">Tap a tire to box for it.</span></div></div>`;
}
function intervalText(R, car, ahead, leader) {
  if (car.dnf) return "OUT";
  if (ahead.dnf) return PW.gapText(R, car, leader);
  if (car.finished && ahead.finished) { if (ahead.lapIdx > car.lapIdx) return "+1 lap"; return "+" + (car.finishT + car.penalty - ahead.finishT - ahead.penalty).toFixed(1); }
  const laps = ahead.dist - car.dist;
  if (laps >= 1) return `+${Math.floor(laps)} lap`;
  return "+" + (laps * leader.lapTime).toFixed(1);
}
function finishRace() {
  const res = PW.raceResult(R);
  res.pole = !!W.pole; res.poleId = W.pole;
  W.report = PW.applyRace(res);
  W.res = res;
  W.step = "results";
  R = null;
  Snd.humStop();
  render();
  const best = Math.min(...res.classified.map((e, i) => e.mine && !e.dnf ? i + 1 : 99));
  if (best <= 3) { Snd.cheer(); confetti(); }
}
function confetti() {
  const box = document.createElement("div"); box.className = "confetti";
  const cols = [S().teams.you.color, "#fff", "#ffb000", "#e8343f"];
  for (let i = 0; i < 120; i++) { const p = document.createElement("i"); p.style.left = Math.random() * 100 + "vw"; p.style.background = cols[i % cols.length]; p.style.animationDuration = (2 + Math.random() * 2.5) + "s"; p.style.animationDelay = Math.random() * .8 + "s"; box.appendChild(p); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 5500);
}
function lapChart(lc) {
  if (!lc || !lc.laps || lc.laps.length < 2) return '<p class="muted">No lap data.</p>';
  const n = lc.laps.length - 1, W2 = 640, H2 = 260, px = 28, py = 12;
  const x = i => px + (W2 - px - 10) * i / n, y = p => py + (H2 - py * 2) * (p - 1) / 19;
  const lines = lc.cars.slice().sort((a, b) => a.mine - b.mine).map(c => {
    let d = "", pen = false, last = null;
    lc.laps.forEach((snap, i) => { const p = snap[c.id]; if (p == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(p).toFixed(1) + " "; pen = true; last = [x(i), y(p)]; });
    const end = last ? `<text x="${last[0] + 3}" y="${last[1] + 3}" font-size="9" fill="${c.mine ? "#fff" : c.color}" font-weight="700">${c.code}</text>` : "";
    return `<path d="${d}" fill="none" stroke="${c.color}" stroke-width="${c.mine ? 3 : 1.2}" stroke-opacity="${c.mine ? 1 : .45}" stroke-linejoin="round"/>${c.mine ? end : ""}`;
  }).join("");
  const grid = [1, 5, 10, 15, 20].map(p => `<line x1="${px}" x2="${W2 - 10}" y1="${y(p)}" y2="${y(p)}" stroke="rgba(255,255,255,.06)"/><text x="4" y="${y(p) + 3}" font-size="9" fill="#8b95a7">P${p}</text>`).join("");
  return `<svg viewBox="0 0 ${W2 + 24} ${H2}" style="width:100%;height:auto;display:block" role="img" aria-label="Position of each car on every lap">${grid}${lines}</svg><div class="muted" style="font-size:12px">Your drivers are the bold lines. Lap 0 is the starting grid.</div>`;
}
function renderResults() {
  const res = W.res, rep = W.report, s = S();
  const top3 = res.classified.slice(0, 3);
  const podium = [1, 0, 2].map(i => { const e = top3[i]; if (!e) return ""; const h = [110, 140, 90][[1, 0, 2].indexOf(i)]; return `<div><div class="nm" style="color:${e.color}">${e.code}</div><div class="muted" style="font-size:12px;margin-bottom:6px">${esc(s.teams[e.team].short)}</div><div class="blk" style="height:${h}px;border-top:4px solid ${e.color}">${i + 1}</div></div>`; }).join("");
  const rows = res.classified.map((e, i) => `<tr class="${e.mine ? "me" : ""}"><td>${i + 1}</td><td><span class="sw" style="background:${e.color}"></span>${esc(e.name)}</td><td class="muted">${esc(s.teams[e.team].short)}</td><td class="num">${e.dnf ? `<span class="dnf">DNF</span> <span class="muted">${e.dnf}</span>` : e.gap}${e.penalty ? ' <span class="bad">(+20s pen)</span>' : ""}</td><td class="num muted">${e.grid}${!e.dnf && e.grid !== i + 1 ? (e.grid > i + 1 ? ` <span class="good">▲${e.grid - i - 1}</span>` : ` <span class="bad">▼${i + 1 - e.grid}</span>`) : ""}</td><td class="num">${e.stops}</td><td class="num"><b>${e.pts || ""}</b></td></tr>`).join("");
  const mine = res.classified.map((e, i) => ({ e, p: i + 1 })).filter(x => x.e.mine);
  const best = Math.min(...mine.map(x => x.e.dnf ? 99 : x.p));
  const headline = best === 1 ? "VICTORY!" : best <= 3 ? "PODIUM!" : best <= 10 ? "Points on the board" : mine.every(x => x.e.dnf) ? "Double DNF. Ouch." : "No points this time";
  app.innerHTML = weekendHeader(4) + `<div class="page">
    <div class="card team" style="text-align:center"><div class="muted" style="text-transform:uppercase;letter-spacing:.14em;font-weight:700;font-size:12px">${esc(rep.circuit)} · Race result</div>
      <h1 class="bigh">${headline}</h1>
      <div class="muted">${mine.map(x => `${x.e.name}: ${x.e.dnf ? "DNF" : "P" + x.p}`).join(" · ")}${res.fastest ? ` · Fastest lap ${res.fastest.code} ${res.fastest.t.toFixed(2)}s` : ""}</div>
      <div class="podium">${podium}</div></div>
    <div class="grid g-hq" style="margin-top:16px">
      <div class="grid" style="align-content:start">
      <div class="card"><h3>Lap chart</h3>${lapChart(res.lapChart)}</div>
      <div class="card" style="overflow-x:auto"><h3>Classification</h3><table><thead><tr><th>#</th><th>Driver</th><th>Team</th><th>Gap</th><th>Grid</th><th>Stops</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><h3>Money</h3>${rep.finances.map(([k, v]) => `<div class="spread"><span>${k}</span><b class="num ${v >= 0 ? "good" : "bad"}">${M(v)}</b></div>`).join("")}<hr><div class="spread"><b>Net</b><b class="num ${rep.net >= 0 ? "good" : "bad"}">${M(rep.net)}</b></div><div class="spread muted"><span>Cash now</span><span class="num">${M(s.cash)}</span></div></div>
        ${rep.trophies && rep.trophies.length ? `<div class="card trophycard"><h3>Trophy unlocked!</h3>${rep.trophies.map(t => `<div class="spread" style="margin:6px 0"><span style="font-size:28px">${t.icon}</span><div style="flex:1"><b>${esc(t.name)}</b><div class="muted" style="font-size:12px">${esc(t.desc)}</div></div></div>`).join("")}</div>` : ""}
        ${rep.research.length ? `<div class="card"><h3>Factory</h3>${rep.research.map(r => `<div class="${r.kind}">${r.kind === "good" ? "✔" : "✖"} ${esc(r.text)}</div>`).join("")}</div>` : ""}
        ${rep.sponsor.length ? `<div class="card"><h3>Sponsors</h3>${rep.sponsor.map(x => `<div class="good">★ ${esc(x)}</div>`).join("")}</div>` : ""}
        <div class="card"><h3>Driver morale</h3>${rep.morale.map(m => `<div class="spread"><span>${esc(m.name)}</span><span class="num ${m.delta >= 0 ? "good" : "bad"}">${m.delta >= 0 ? "+" : ""}${m.delta} → ${m.morale}</span></div>`).join("")}</div>
        <button class="btn go" data-a="leave">${s.phase === "seasonEnd" ? "Season review ›" : s.over ? "Continue ›" : "Back to HQ ›"}</button>
      </div></div></div>`;
}

/* ---------- season end ---------- */
function renderSeasonEnd() {
  PW.screen = "seasonEnd";
  const s = S(), sum = PW.seasonSummary();
  app.innerHTML = shellTop().replace(/<div class="tabs">[\s\S]*<\/div><\/div>$/, "</div>") + `<div class="page">
    <div class="card team" style="text-align:center"><div class="muted" style="text-transform:uppercase;letter-spacing:.14em;font-weight:700;font-size:12px">Season ${s.season} complete</div>
      <h1 class="bigh">${sum.pos === 1 ? "World champions!" : ord(sum.pos) + " in the constructors'"}</h1>
      <div class="muted">${s.teams.you.points} point${s.teams.you.points === 1 ? "" : "s"} · Drivers' champion: ${esc(sum.champ.name)} (${esc(s.teams[sum.champ.team] ? s.teams[sum.champ.team].name : "")})</div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Final constructors' standings</h3><table><tbody>${sum.st.map((t, i) => `<tr class="${t.player ? "me" : ""}"><td>${i + 1}</td><td><span class="sw" style="background:${t.color}"></span>${esc(t.name)}</td><td class="num"><b>${t.points}</b></td><td class="num muted">${M(PW.PRIZE[i])}</td></tr>`).join("")}</tbody></table></div>
      <div class="grid" style="align-content:start">
        <div class="card ${sum.board.met ? "" : "boardmiss"}"><h3>The board's verdict</h3>
          <div class="spread"><span>Target: ${ord(sum.board.target)} or better</span><b class="${sum.board.met ? "good" : "bad"}">${sum.board.met ? "Target hit" : "Target missed"}</b></div>
          <div class="stat" style="grid-template-columns:110px 1fr 70px"><span class="muted">Confidence</span>${bar(sum.board.conf, 100, sum.board.conf < 35 ? "lowconf" : "")}<b class="num ${sum.board.conf < sum.board.confBefore ? "bad" : "good"}">${sum.board.confBefore} → ${sum.board.conf}</b></div>
          <p class="muted" style="font-size:13px;margin:6px 0 0">${sum.board.fired ? "<b class='bad'>The board has run out of patience. Starting next season will end your career.</b>" : sum.board.met ? `Bonus budget of ${M(sum.board.bonus)} approved. Next season's target: ${ord(sum.board.next)} or better.` : `No bonus. Next season's target: ${ord(sum.board.next)} or better. Don't miss again.`}</p></div>
        <div class="card"><h3>Payouts</h3><div class="spread"><span>Prize money (${ord(sum.pos)})</span><b class="good num">${M(sum.prize)}</b></div>
          ${sum.beat.map(b => `<div class="spread"><span>${esc(b.s.name)}: ${esc(b.s.goal.text)}</span><b class="${b.ok ? "good" : "bad"}">${b.ok ? "+" + M(b.s.bonus) : "Missed"}</b></div>`).join("")}</div>
        <div class="card"><h3>Expiring contracts</h3>${sum.expiring.length ? sum.expiring.map(d => `<label class="spread" style="margin:8px 0;cursor:pointer"><span><input type="checkbox" class="renew" value="${d.id}" checked> Renew <b>${esc(d.name)}</b> (${d.role === "res" ? "reserve" : "race seat"}, OVR ${PW.ovr(d)}, age ${d.age})</span><span class="num muted">${M(PW.driverSalary(d))}/season</span></label>`).join("") : `<p class="muted">Everyone is under contract for next season.</p>`}
          <p class="muted" style="font-size:12px">Unticked drivers leave. Empty seats are filled from your reserve or the cheapest free agent, and you can sign someone better in the Team tab.</p></div>
        <div class="card"><h3>Next season</h3><p class="muted" style="margin-top:0">New regulations pull every car 25% toward the middle of the field. Research tiers reset, sponsor deals end, and drivers age: young ones improve, veterans fade.</p>
          <button class="btn go" data-a="nextseason">Start season ${s.season + 1} ›</button></div>
      </div></div></div>`;
}

/* ---------- input ---------- */
app.addEventListener("click", e => {
  const el = e.target.closest("[data-a]"); if (!el) return;
  const a = el.dataset.a, v = el.dataset.v;
  const s = S();
  switch (a) {
    case "color": newColor = v; document.querySelectorAll(".swatches button").forEach(b => b.classList.toggle("on", b.dataset.v === v)); Snd.click(); break;
    case "guide": PW.openGuide(); break;
    case "new": { const n = (document.getElementById("tname").value || "").trim() || "Pit Wall Racing"; if (PW.tutorialStart) PW.tutorialStart(document.getElementById("tut").checked); PW.newCareer(n, newColor); tab = "hq"; Snd.click(); render(); break; }
    case "wipe": PW.wipe(); W = null; R = null; render(); break;
    case "sound": Snd.toggle(); render(); break;
    case "menu": PW.openMenu(); break;
    case "tab": tab = v; Snd.click(); render(); window.scrollTo(0, 0); break;
    case "ruleok": s.pendingRule = null; PW.save(); render(); break;
    case "event": { const out = PW.resolveEvent(+v); Snd.click(); render(); toast(out); break; }
    case "research": result(PW.startResearch(v, el.dataset.o), "Project started"); break;
    case "role": openRole = openRole === v ? null : v; render(); break;
    case "hire": result(PW.hireStaff(v, +el.dataset.i), "Hired"); break;
    case "sign": result(PW.signDriver(v, el.dataset.s), "Driver signed"); break;
    case "swapres": result(PW.swapReserve(v), "Seats swapped"); break;
    case "sponsor": result(PW.signSponsor(+v), "Deal signed"); break;
    case "drop": if (confirm("End this sponsor deal early for a $1M fee?")) { PW.dropSponsor(+v); render(); } break;
    case "weekend": Snd.click(); startWeekend(); window.scrollTo(0, 0); break;
    case "qmode": W.qualiMode = v; Snd.click(); render(); break;
    case "setup": W.setup = v; Snd.click(); render(); break;
    case "prac": { const i = W.practice.indexOf(v); if (i >= 0) W.practice.splice(i, 1); else if (W.practice.length < 2) W.practice.push(v); else { W.practice.shift(); W.practice.push(v); } Snd.click(); render(); break; }
    case "pracdone": {
      W.bonus = practiceBonus(W.practice);
      if (W.practice.includes("setup")) { const st = S(), cc = PW.circuit(); W.advice = Object.keys(PW.SETUPS).sort((a, b) => PW.setupPerf(st.teams.you, cc, b) - PW.setupPerf(st.teams.you, cc, a))[0]; W.setup = W.advice; }
      W.step = "quali"; Snd.click(); render(); window.scrollTo(0, 0); break;
    }
    case "runquali": W.grid = PW.runQualifying(W.qualiMode, W.wetStart, W.setup, W.bonus); W.pole = W.grid[0].mine ? W.grid[0].id : null; if (W.pole) toast("⏱️ Pole position!"); W.step = "grid"; W.animGrid = true; Snd.go(); render(); break;
    case "plan": W.plans[v] = W.presets.find(p => p.id === el.dataset.p); Snd.click(); render(); break;
    case "lightsout": R = PW.createRace(W.grid, W.plans, W.wetStart, W.qualiMode, W.setup, W.wx, W.bonus); R.autoPause = autoPausePref(); W.step = "race"; window.scrollTo(0, 0); render(); break;
    case "leave": W = null; tab = "hq"; render(); window.scrollTo(0, 0); break;
    case "nextseason": { const renew = [...document.querySelectorAll(".renew:checked")].map(x => x.value); PW.finishSeason(renew); tab = "hq"; render(); window.scrollTo(0, 0); break; }
  }
});
// race controls use pointerdown so the 5x-a-second refresh can't swallow a click
app.addEventListener("pointerdown", e => {
  const el = e.target.closest("[data-pd]"); if (!el || !R) return;
  e.preventDefault();
  const a = el.dataset.pd, v = el.dataset.v, car = R.cars.find(c => c.id === v);
  switch (a) {
    case "guide": PW.openGuide(); return;
    case "gapmode": W.gapMode = W.gapMode === "leader" ? "interval" : "leader"; updateRaceDom(true); return;
    case "speed": if (v === "pause") R.paused = !R.paused; else { R.speed = +v; R.paused = false; } if (!R.paused) R.decision = null; break;
    case "dresume": R.decision = null; R.paused = false; break;
    case "boost": PW.setBoost(R, car, !car.boost); break;
    case "autopause": R.autoPause = !R.autoPause; try { localStorage.setItem("pitwall-autopause", R.autoPause ? "on" : "off"); } catch (e) {} if (!R.autoPause && R.decision) { R.decision = null; R.paused = false; } break;
    case "simend": if (!R.started) return; PW.runToEnd(R); break;
    case "sound": Snd.toggle(); if (Snd.on && R.started && !R.finished) Snd.humStart(); el.textContent = Snd.on ? "🔊" : "🔇"; break;
    case "mode": PW.setMode(R, car, el.dataset.m); break;
    case "box": if (car.pitReq === el.dataset.t) PW.cancelBox(R, car); else PW.boxCar(R, car, el.dataset.t); break;
    case "cancelbox": PW.cancelBox(R, car); break;
    case "swap": PW.swapCars(R); break;
    case "results": finishRace(); return;
  }
  Snd.click();
  updateRaceDom(true);
});
document.addEventListener("keydown", e => {
  if (!R || e.target.tagName === "INPUT") return;
  if (e.key === " ") { e.preventDefault(); R.paused = !R.paused; if (!R.paused) R.decision = null; updateRaceDom(true); }
});
window.addEventListener("resize", () => { const cv = document.getElementById("preview"); if (cv && !W) PW.drawTrack(cv, { path: PW.trackPath(PW.circuit().shape), wet: false }, { static: true }); });

/* ---------- boot ---------- */
PW.load();
render();
// test hook: lets automated play-tests reach the live race and weekend
PW.debug = { get R() { return R; }, get W() { return W; }, render };
PW.ui = { get R() { return R; }, get W() { return W; }, render, setTab(t) { if (W) return; tab = t; render(); window.scrollTo(0, 0); }, reset() { W = null; R = null; Snd.humStop(); render(); } };
})();
