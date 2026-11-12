/* Pit Wall — career state: money, research, staff, drivers, sponsors, seasons. */
"use strict";
(function () {
const { rand, randi, pick, clamp } = PW;
const SAVE_KEY = "pitwall-save-v1";
let S = null;
PW.state = () => S;

/* ---------- new career ---------- */
PW.newCareer = function (teamName, color) {
  const teams = {};
  PW.TEAMS.forEach(t => {
    const base = 62 + (t.tier - 0.78) / 0.22 * 22;
    teams[t.id] = { id: t.id, name: t.name, short: t.short, color: t.color, dev: t.dev, points: 0,
      car: Object.fromEntries(PW.AREAS.map(a => [a.id, Math.round(base + rand(-3, 3))])) };
  });
  teams.you = { id: "you", name: teamName || "Pit Wall Racing", short: (teamName || "PWR").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "PWR",
    color: color || PW.PLAYER_COLORS[0], dev: 0, points: 0, player: true,
    car: { aero: 61, engine: 62, chassis: 63, rel: 65, tyre: 62 } };

  const drivers = PW.DRIVERS.map(([name, code, age, pace, racecraft, consistency, tyre, wet, team]) => {
    const d = { id: code, name, code, age, pace, racecraft, consistency, tyre, wet, morale: 65, points: 0, wins: 0, podiums: 0, careerPts: 0 };
    d.salary = PW.driverSalary(d);
    if (team === "you") { d.team = "you"; d.role = null; d.contract = randi(1, 2); }
    else if (team === "you-r") { d.team = "you"; d.role = "res"; d.contract = 1; d.salary = 0.4; }
    else { d.team = team || ""; d.role = team ? "race" : null; d.contract = team ? randi(1, 3) : 0; }
    return d;
  });
  const mine = drivers.filter(d => d.team === "you" && d.role !== "res");
  mine[0].role = "d1"; mine[1].role = "d2";

  const staff = {};
  PW.ROLES.forEach(r => { const rating = randi(48, 60); staff[r.id] = { name: PW.newName(), rating, salary: PW.staffSalary(rating) }; });

  S = {
    v: 1, season: 1, round: 0, cash: 32, devSpent: 0, teams, drivers, staff,
    research: { active: [], tier: Object.fromEntries(PW.AREAS.map(a => [a.id, 0])) },
    sponsors: [], sponsorOffers: [], staffMarket: null, mods: { wearMul: 1, capCut: 0, aiDev: 1 }, ruleNote: "",
    news: [], lastResult: null, history: [], over: false, phase: "hq",
    board: { target: 9, conf: 60 }, trophies: {},
  };
  // two starter sponsors so the first races pay something
  S.sponsors.push(makeSponsor(0.9), makeSponsor(0.7));
  S.sponsors.forEach(s => s.signedRound = 0);
  refreshSponsorOffers(); refreshStaffMarket();
  news(`Welcome to the pit wall. ${teams.you.name} starts the season as the slowest car on the grid. Time to change that.`);
  PW.save();
  return S;
};

function news(msg, kind) { S.news.unshift({ msg, kind: kind || "", season: S.season, round: S.round }); S.news = S.news.slice(0, 40); }
PW.news = news;

/* ---------- save / load ---------- */
PW.save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} };
PW.load = () => { try { const t = localStorage.getItem(SAVE_KEY); if (t) { S = JSON.parse(t); upgradeSave(); return S; } } catch (e) {} return null; };
function upgradeSave() { if (!S.board) S.board = { target: S.season === 1 ? 9 : 8, conf: 60 }; if (!S.trophies) S.trophies = {}; }
PW.wipe = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} S = null; };

/* ---------- lookups ---------- */
PW.circuit = (i = S.round) => PW.CIRCUITS[i];
PW.me = () => S.teams.you;
PW.myDrivers = () => ["d1", "d2"].map(r => S.drivers.find(d => d.team === "you" && d.role === r));
PW.reserve = () => S.drivers.find(d => d.team === "you" && d.role === "res");
PW.teamDrivers = id => id === "you" ? PW.myDrivers() : S.drivers.filter(d => d.team === id && d.role === "race");
PW.freeAgents = () => S.drivers.filter(d => !d.team);
PW.carPerf = (team, c) => team.car.aero * c.aero + team.car.engine * c.power + team.car.chassis * c.mech;
PW.standings = () => Object.values(S.teams).sort((a, b) => b.points - a.points || PW.carPerf(b, PW.CIRCUITS[0]) - PW.carPerf(a, PW.CIRCUITS[0]));
PW.driverStandings = () => S.drivers.filter(d => d.points > 0 || (d.team && d.role !== "res")).sort((a, b) => b.points - a.points || b.wins - a.wins);
PW.myPos = () => PW.standings().findIndex(t => t.id === "you") + 1;
PW.devCap = () => PW.DEV_CAP - S.mods.capCut;
PW.slots = () => S.staff.td.rating >= 80 ? 3 : 2;
PW.sponsorSlots = () => S.staff.com.rating >= 80 ? 3 : 2;
PW.wageBill = () => {
  const dr = S.drivers.filter(d => d.team === "you").reduce((s, d) => s + d.salary, 0);
  const st = Object.values(S.staff).reduce((s, x) => s + x.salary, 0);
  return { drivers: dr, staff: st, total: dr + st };
};
PW.OPS_PER_RACE = 1.0;
PW.TV_PER_RACE = 2.2;

/* ---------- research ---------- */
PW.projectFor = function (area, opt) {
  const tier = S.research.tier[area];
  const headId = PW.AREAS.find(a => a.id === area).head, head = S.staff[headId].rating, td = S.staff.td.rating;
  const base = tier < 3 ? PW.PROJECTS[tier][opt] : (opt === "safe" ? PW.REFINE : null);
  if (!base) return null;
  const name = tier < 3 ? PW.PROJECT_NAMES[area][tier][opt === "safe" ? 0 : 1] : "Refinement package";
  return {
    area, tier, opt, name, cost: base.cost,
    races: Math.max(1, Math.round(base.races * (1.25 - td / 200))),
    gain: +(base.gain * (0.75 + head / 200)).toFixed(1),
    risk: base.risk ? +clamp(base.risk * (1.3 - head / 100), 0.05, 0.6).toFixed(2) : 0,
  };
};
PW.canStart = function (p) {
  if (!p) return "Not available";
  if (S.research.active.some(a => a.area === p.area)) return "Already researching this area";
  if (S.research.active.length >= PW.slots()) return `All ${PW.slots()} research slots busy`;
  if (S.cash < p.cost) return "Not enough cash";
  if (S.devSpent + p.cost > PW.devCap()) return "Over the development cap";
  if (S.mods.engineFreeze && (p.area === "engine")) return "Engine development is frozen this season";
  return "";
};
PW.startResearch = function (area, opt) {
  const p = PW.projectFor(area, opt), why = PW.canStart(p);
  if (why) return why;
  S.cash -= p.cost; S.devSpent += p.cost;
  S.research.active.push({ ...p, left: p.races });
  news(`Research started: ${p.name} (${PW.AREAS.find(a => a.id === area).name}).`);
  PW.save(); return "";
};
function advanceResearch(report) {
  const done = [];
  S.research.active.forEach(p => {
    p.left--;
    if (p.left > 0) return;
    done.push(p);
    const area = PW.AREAS.find(a => a.id === p.area).name;
    if (p.risk && Math.random() < p.risk) {
      if (p.area === "engine" || p.area === "aero") S.teams.you.car.rel = Math.max(40, S.teams.you.car.rel - 2);
      news(`${p.name} failed in testing. No gain${p.area === "engine" || p.area === "aero" ? ", and reliability took a hit" : ""}.`, "bad");
      report.push({ kind: "bad", text: `${p.name} failed (${area})` });
    } else {
      S.teams.you.car[p.area] = Math.min(99, +(S.teams.you.car[p.area] + p.gain).toFixed(1));
      if (p.tier < 3) S.research.tier[p.area] = p.tier + 1;
      news(`${p.name} delivered: ${area} +${p.gain}.`, "good");
      report.push({ kind: "good", text: `${p.name}: ${area} +${p.gain}` });
    }
  });
  S.research.active = S.research.active.filter(p => !done.includes(p));
}
function rivalsDevelop() {
  Object.values(S.teams).forEach(t => {
    if (t.player) return;
    const budget = t.dev * S.mods.aiDev;
    const a = pick(PW.AREAS).id;
    if (a === "engine" && S.mods.engineFreeze) return;
    t.car[a] = Math.min(99, +(t.car[a] + rand(0, 0.9) * budget).toFixed(1));
  });
}

/* ---------- staff ---------- */
function refreshStaffMarket() {
  S.staffMarket = {};
  PW.ROLES.forEach(r => {
    S.staffMarket[r.id] = [0, 1, 2].map(i => {
      const rating = clamp(Math.round(rand(52, 72) + i * rand(4, 10) + (S.season - 1) * 2), 45, 96);
      return { name: PW.newName(), rating, salary: PW.staffSalary(rating), fee: +(PW.staffSalary(rating) * 0.5).toFixed(2) };
    });
  });
}
PW.refreshStaffMarket = refreshStaffMarket;
PW.hireStaff = function (role, idx) {
  const c = S.staffMarket[role][idx];
  if (!c) return "Gone";
  if (S.cash < c.fee) return "Not enough cash for the signing fee";
  const old = S.staff[role];
  S.cash -= c.fee;
  S.staff[role] = { name: c.name, rating: c.rating, salary: c.salary };
  S.staffMarket[role].splice(idx, 1);
  news(`Hired ${c.name} as ${PW.ROLES.find(r => r.id === role).name} (rated ${c.rating}). ${old.name} leaves.`);
  PW.save(); return "";
};

/* ---------- drivers ---------- */
PW.askSalary = function (d) {
  // stars want more to join a backmarker
  const pos = PW.myPos();
  const star = PW.ovr(d) >= 82;
  return +(PW.driverSalary(d) * (star ? 1 + Math.max(0, pos - 4) * 0.07 : 1)).toFixed(2);
};
PW.signDriver = function (id, slot) {
  const d = S.drivers.find(x => x.id === id);
  if (!d || d.team) return "Not available";
  const salary = PW.askSalary(d), fee = +(salary * 0.5).toFixed(2);
  if (S.cash < fee) return "Not enough cash for the signing fee";
  const out = S.drivers.find(x => x.team === "you" && x.role === slot);
  if (out) {
    const payoff = slot === "res" ? 0 : +(out.salary * 0.3).toFixed(2);
    S.cash -= payoff;
    out.team = ""; out.role = null; out.contract = 0;
    news(`${out.name} released${payoff ? ` (payoff ${PW.money(payoff)})` : ""}.`);
  }
  S.cash -= fee;
  Object.assign(d, { team: "you", role: slot, salary, contract: 2, morale: 70 });
  news(`Signed ${d.name} as ${slot === "res" ? "reserve" : "race driver"} for ${PW.money(salary)} a season.`, "good");
  PW.save(); return "";
};
PW.swapReserve = function (slot) {
  const r = PW.reserve(), d = S.drivers.find(x => x.team === "you" && x.role === slot);
  if (!r || !d) return "No reserve";
  r.role = slot; d.role = "res";
  r.morale = Math.min(100, r.morale + 10); d.morale = Math.max(20, d.morale - 15);
  news(`${r.name} promoted to the race seat. ${d.name} drops to reserve.`);
  PW.save(); return "";
};

/* ---------- sponsors ---------- */
function makeSponsor(scale) {
  const pos = S ? PW.myPos() : 10;
  const com = S ? S.staff.com.rating : 55;
  const rep = (11 - pos) / 10 * 0.9 + 0.55;
  const name = pick(PW.SPONSOR_NAMES.filter(n => !(S && (S.sponsors.concat(S.sponsorOffers)).some(s => s.name === n))));
  const types = ["points", "top", "beat"];
  const type = pick(types);
  let goal, bonus;
  if (type === "points") { const n = randi(2, 5); goal = { type, n, text: `Score points in ${n} races this season` }; bonus = n * rand(1.2, 1.8); }
  else if (type === "top") { const k = pick([10, 8, 6, 5, 3]); goal = { type, k, text: k === 3 ? "Get a podium this season" : `Finish a race in the top ${k}` }; bonus = (14 - k) * rand(0.6, 0.9); }
  else {
    const st = S ? PW.standings() : [];
    const myIdx = S ? st.findIndex(t => t.id === "you") : 9;
    const target = S && myIdx > 0 ? st[Math.max(0, myIdx - randi(1, 3))] : { id: "mer", name: "Meridian" };
    goal = { type, team: target.id, text: `Beat ${target.name} in the constructors' championship` }; bonus = rand(4, 9);
  }
  return { name, perRace: +(rand(0.55, 1.25) * scale * rep * (0.8 + com / 250)).toFixed(2), goal, bonus: +(bonus * (0.8 + com / 250)).toFixed(1), progress: 0, done: false };
}
function refreshSponsorOffers() { S.sponsorOffers = [0, 1, 2].map(() => makeSponsor(1)); }
PW.signSponsor = function (idx) {
  if (S.sponsors.length >= PW.sponsorSlots()) return "No free sponsor slots. Drop one first.";
  const o = S.sponsorOffers.splice(idx, 1)[0];
  if (!o) return "Gone";
  o.signedRound = S.round;
  S.sponsors.push(o);
  news(`${o.name} signs on: ${PW.money(o.perRace)} a race.`, "good");
  PW.save(); return "";
};
PW.dropSponsor = function (idx) {
  const s = S.sponsors.splice(idx, 1)[0];
  if (s) { S.cash -= 1; news(`${s.name} contract ended early ($1M exit fee).`); }
  PW.save();
};

/* ---------- after a race ---------- */
PW.applyRace = function (res) {
  const c = PW.circuit();
  const report = { round: S.round, circuit: c.name, finances: [], research: [], sponsor: [], morale: [] };
  // points
  res.classified.forEach((e, i) => {
    const d = S.drivers.find(x => x.id === e.id);
    const pts = !e.dnf && i < 10 ? PW.POINTS[i] : 0;
    e.pts = pts;
    if (d) { d.points += pts; d.careerPts += pts; if (i === 0 && !e.dnf) d.wins++; if (i < 3 && !e.dnf) d.podiums++; }
    S.teams[e.team].points += pts;
  });
  const mine = res.classified.map((e, i) => ({ ...e, pos: i + 1 })).filter(e => e.team === "you");
  // morale
  mine.forEach(e => {
    const d = S.drivers.find(x => x.id === e.id), mate = mine.find(m => m !== e);
    let dm = 0;
    if (e.dnf) dm -= 3; else if (e.pos <= 10) dm += 4;
    if (mate && !e.dnf && (mate.dnf || e.pos < mate.pos)) dm += 3; else if (mate) dm -= 2;
    if (e.pos <= 3 && !e.dnf) dm += 8;
    dm += (60 - d.morale) * 0.1;
    d.morale = clamp(Math.round(d.morale + dm + (e.moraleDelta || 0)), 15, 100);
    report.morale.push({ name: d.name, delta: Math.round(dm + (e.moraleDelta || 0)), morale: d.morale });
  });
  // sponsors
  const best = Math.min(...mine.filter(e => !e.dnf).map(e => e.pos), 99);
  const ptsRaces = mine.some(e => !e.dnf && e.pos <= 10) ? 1 : 0;
  S.sponsors.forEach(s => {
    if (s.done) return;
    if (s.goal.type === "points" && ptsRaces) { s.progress++; if (s.progress >= s.goal.n) achieve(s, report); }
    if (s.goal.type === "top" && best <= s.goal.k) achieve(s, report);
  });
  // money
  const w = PW.wageBill();
  const spons = S.sponsors.reduce((a, s) => a + s.perRace, 0);
  const lines = [
    ["TV and prize money", PW.TV_PER_RACE], ["Sponsors", spons],
    ["Driver salaries", -w.drivers / 12], ["Staff salaries", -w.staff / 12], ["Operations", -PW.OPS_PER_RACE],
  ];
  if (res.damageCost) lines.push(["Crash repairs", -res.damageCost]);
  lines.forEach(([k, v]) => { S.cash += v; report.finances.push([k, +v.toFixed(2)]); });
  report.net = +lines.reduce((a, l) => a + l[1], 0).toFixed(2);
  report.trophies = raceTrophies(res);
  advanceResearch(report.research);
  rivalsDevelop();
  S.lastResult = { ...res, report }; delete S.lastResult.lapChart;
  S.history.push({ season: S.season, round: S.round, circuit: c.name, mine: mine.map(e => ({ code: e.code, pos: e.pos, dnf: e.dnf })) });
  const mineTxt = mine.map(e => `${e.code} ${e.dnf ? "DNF" : "P" + e.pos}`).join(", ");
  news(`${c.name}: ${mineTxt}. Winner ${res.classified[0].name}.`, best <= 3 ? "good" : "");
  S.round++;
  if (S.round === 6) ruleChange();
  if (S.round % 3 === 0) refreshSponsorOffers();
  if (S.cash < -10) { S.over = true; S.overReason = "money"; news("The bank has called in the loans. The team is in administration.", "bad"); }
  S.phase = S.round >= PW.CIRCUITS.length ? "seasonEnd" : "hq";
  if (S.phase === "hq" && !S.over && Math.random() < 0.6) S.pendingEvent = rollEvent();
  PW.save();
  return report;
};
function achieve(s, report) {
  s.done = true; S.cash += s.bonus;
  news(`Sponsor goal hit: ${s.name} pays a ${PW.money(s.bonus)} bonus.`, "good");
  report.sponsor.push(`${s.name}: goal hit, +${PW.money(s.bonus)}`);
}

/* ---------- trophies ---------- */
PW.TROPHIES = [
  { id: "points",  icon: "🎯", name: "Off the mark",        desc: "Score your first points" },
  { id: "both",    icon: "✌️", name: "Double points",       desc: "Both cars finish in the points" },
  { id: "podium",  icon: "🥉", name: "Podium",              desc: "Finish in the top 3" },
  { id: "win",     icon: "🏆", name: "Race winner",         desc: "Win a race" },
  { id: "onetwo",  icon: "🥇", name: "One-two",             desc: "Your cars finish first and second" },
  { id: "pole",    icon: "⏱️", name: "Pole position",       desc: "Qualify on pole" },
  { id: "fastest", icon: "💜", name: "Fastest lap",         desc: "Set the fastest lap of a race" },
  { id: "rain",    icon: "🌧️", name: "Rain master",         desc: "Win a race that had rain" },
  { id: "charge",  icon: "🚀", name: "From the back",       desc: "Win from 10th on the grid or lower" },
  { id: "monaco",  icon: "⚓", name: "Jewel in the crown",  desc: "Win at Monaco" },
  { id: "perfect", icon: "💎", name: "Perfect weekend",     desc: "Pole, win and fastest lap at the same race" },
  { id: "board",   icon: "📈", name: "Board pleaser",       desc: "Hit the board's season target" },
  { id: "cons",    icon: "👑", name: "Constructors' champions", desc: "Win the constructors' championship" },
  { id: "drivers", icon: "🏁", name: "Drivers' champion",   desc: "One of your drivers wins the title" },
];
function award(id) {
  if (!S.trophies) S.trophies = {};
  if (S.trophies[id]) return null;
  const t = PW.TROPHIES.find(x => x.id === id);
  S.trophies[id] = { season: S.season, round: S.round };
  news(`🏆 Trophy unlocked: ${t.name}. ${t.desc}.`, "good");
  return t;
}
PW.award = id => { const t = award(id); PW.save(); return t; };
function raceTrophies(res) {
  const got = [];
  const mine = res.classified.map((e, i) => ({ ...e, pos: i + 1 })).filter(e => e.team === "you" && !e.dnf);
  const add = id => { const t = award(id); if (t) got.push(t); };
  const best = mine.length ? Math.min(...mine.map(e => e.pos)) : 99;
  const winner = mine.find(e => e.pos === 1);
  if (best <= 10) add("points");
  if (mine.length === 2 && mine.every(e => e.pos <= 10)) add("both");
  if (best <= 3) add("podium");
  if (winner) add("win");
  if (mine.length === 2 && mine.every(e => e.pos <= 2)) add("onetwo");
  if (res.pole) add("pole");
  const fl = res.fastest && res.fastest.team === "you";
  if (fl) add("fastest");
  if (winner && res.wet) add("rain");
  if (winner && winner.grid >= 10) add("charge");
  if (winner && PW.circuit().name === "Monaco") add("monaco");
  if (winner && res.pole && fl && res.poleId === winner.id && res.fastest.code === winner.code) add("perfect");
  return got;
}

/* ---------- paddock events (decisions between races) ---------- */
const findD = id => S.drivers.find(d => d.id === id);
const roleName = id => PW.ROLES.find(r => r.id === id).name;
const EVENTS = {
  unhappy: {
    cond: () => PW.myDrivers().some(d => d && d.morale < 62),
    make: () => ({ d: PW.myDrivers().filter(Boolean).sort((a, b) => a.morale - b.morale)[0].id }),
    view: x => { const d = findD(x.d); return { title: `${d.name} wants number-one status`, text: `${d.name} (morale ${d.morale}) feels the team favors their teammate and wants to be the priority in strategy calls.`,
      choices: [{ label: "Give them #1 status", desc: "+15 morale for them, −10 for their teammate" }, { label: "Pay a loyalty bonus", desc: "−$1M, +8 morale" }, { label: "Refuse", desc: "−10 morale" }] }; },
    apply: [
      x => { const d = findD(x.d), m = PW.myDrivers().find(o => o && o.id !== x.d); d.morale = clamp(d.morale + 15, 15, 100); if (m) m.morale = clamp(m.morale - 10, 15, 100); return `${d.name} is now the team's number one. Their teammate is not pleased.`; },
      x => { const d = findD(x.d); S.cash -= 1; d.morale = clamp(d.morale + 8, 15, 100); return `${d.name} accepts the bonus and calms down.`; },
      x => { const d = findD(x.d); d.morale = clamp(d.morale - 10, 15, 100); return `${d.name} storms out of the meeting.`; },
    ],
  },
  poach: {
    cond: () => Object.values(S.staff).some(x => x.rating >= 58),
    make: () => ({ role: Object.entries(S.staff).sort((a, b) => b[1].rating - a[1].rating)[0][0], team: pick(PW.TEAMS).id }),
    view: x => { const st = S.staff[x.role], t = S.teams[x.team]; return { title: `${t.name} wants your ${roleName(x.role)}`, text: `${st.name} (rated ${st.rating}) has an offer from ${t.name}. They'll stay if you match it.`,
      choices: [{ label: "Match the offer", desc: `Salary rises to ${PW.money(+(Math.max(st.salary * 1.5, st.salary + 0.4)).toFixed(2))} a season` }, { label: "Let them go", desc: "+$3M transfer fee, replaced by someone about 12 points weaker" }] }; },
    apply: [
      x => { const st = S.staff[x.role]; st.salary = +(Math.max(st.salary * 1.5, st.salary + 0.4)).toFixed(2); return `${st.name} stays, on a bigger contract.`; },
      x => { const st = S.staff[x.role], r = Math.max(40, st.rating - 12); S.cash += 3; S.staff[x.role] = { name: PW.newName(), rating: r, salary: PW.staffSalary(r) }; return `${st.name} leaves for ${S.teams[x.team].name}. ${S.staff[x.role].name} (rated ${r}) steps up.`; },
    ],
  },
  overtime: {
    cond: () => S.research.active.some(p => p.left >= 2),
    make: () => ({}),
    view: () => ({ title: "Factory night shifts", text: "The factory can run around the clock. Every project with two or more races to go would finish one race sooner.",
      choices: [{ label: "Pay for overtime", desc: "−$2.5M (doesn't count toward the development cap)" }, { label: "No thanks", desc: "Keep the money" }] }),
    apply: [
      () => { S.cash -= 2.5; S.research.active.forEach(p => { if (p.left >= 2) p.left--; }); return "The lights stay on all night. Projects are ahead of schedule."; },
      () => "The factory keeps normal hours.",
    ],
  },
  promo: {
    cond: () => true,
    make: () => ({ sp: pick(PW.SPONSOR_NAMES) }),
    view: x => ({ title: `${x.sp} wants a promo day`, text: `${x.sp} will pay for a day of filming with your drivers, right before the next race weekend.`,
      choices: [{ label: "Send both race drivers", desc: "+$1.5M, −5 morale each (they hate filming)" }, { label: "Send the reserve", desc: "+$0.6M, no morale cost" }, { label: "Decline", desc: "Nothing happens" }] }),
    apply: [
      () => { S.cash += 1.5; PW.myDrivers().forEach(d => d && (d.morale = clamp(d.morale - 5, 15, 100))); return "The drivers grumble through a day of filming. The cheque clears."; },
      () => { S.cash += 0.6; return "The reserve driver enjoys the spotlight."; },
      () => "You politely decline.",
    ],
  },
  sim: {
    cond: () => S.cash > 6,
    make: () => ({}),
    view: () => ({ title: "New driver simulator", text: "A supplier offers a state-of-the-art simulator. Your drivers would get faster, especially in the wet.",
      choices: [{ label: "Buy it", desc: "−$4M, both race drivers +1 pace and +2 wet" }, { label: "Not now", desc: "Keep the money" }] }),
    apply: [
      () => { S.cash -= 4; PW.myDrivers().forEach(d => { if (d) { d.pace = Math.min(99, d.pace + 1); d.wet = Math.min(99, d.wet + 2); } }); return "The new simulator is installed. Lap times are coming down."; },
      () => "Maybe next season.",
    ],
  },
  parts: {
    cond: () => S.teams.you.car.rel > 55,
    make: () => ({}),
    view: () => ({ title: "Bargain parts supplier", text: "A new supplier offers cheap parts and cash up front to sign. Their quality record is... mixed.",
      choices: [{ label: "Sign the deal", desc: "+$3M, −3 Reliability" }, { label: "Stick with quality", desc: "Nothing changes" }] }),
    apply: [
      () => { S.cash += 3; S.teams.you.car.rel = +(S.teams.you.car.rel - 3).toFixed(1); return "Cheap parts arrive. Let's hope they hold together."; },
      () => "You stick with the parts you trust.",
    ],
  },
  fans: {
    cond: () => S.cash > 2,
    make: () => ({}),
    view: () => ({ title: "Fan festival", text: "Host a fan day at the factory. Drivers love it, and sponsors notice the crowds.",
      choices: [{ label: "Throw the party", desc: "−$1M, +8 morale for both drivers, better new sponsor offers" }, { label: "Skip it", desc: "Nothing happens" }] }),
    apply: [
      () => { S.cash -= 1; PW.myDrivers().forEach(d => d && (d.morale = clamp(d.morale + 8, 15, 100))); S.sponsorOffers.forEach(o => o.perRace = +(o.perRace * 1.2).toFixed(2)); return "Thousands of fans turn up. Sponsor offers on the table just got richer."; },
      () => "The factory stays closed to fans.",
    ],
  },
  leak: {
    cond: () => S.cash > 3,
    make: () => ({ area: pick(["aero", "engine", "chassis"]), team: pick(PW.TEAMS.slice(0, 4)).id }),
    view: x => ({ title: "A shady offer", text: `A former ${S.teams[x.team].name} engineer offers you their ${x.area} data. It would be a big step forward, if nobody finds out.`,
      choices: [{ label: "Buy the data", desc: `−$2M, +5 ${x.area}. 30% chance you're caught and fined $6M` }, { label: "Report it", desc: "Do the right thing. +4 morale for both drivers" }] }),
    apply: [
      x => { S.cash -= 2; if (Math.random() < 0.3) { S.cash -= 6; return "You've been caught! The governing body fines the team $6M and confiscates the data."; } S.teams.you.car[x.area] = +(S.teams.you.car[x.area] + 5).toFixed(1); return `The data is gold. ${x.area[0].toUpperCase() + x.area.slice(1)} +5. Nobody needs to know.`; },
      () => { PW.myDrivers().forEach(d => d && (d.morale = clamp(d.morale + 4, 15, 100))); return "You report the offer. The paddock respects it, and so do your drivers."; },
    ],
  },
  academy: {
    cond: () => S.cash > 1.5,
    make: () => { const r = rookie(); r.pace = Math.min(90, r.pace + 4); r.wet += 2; S.drivers.push(r); return { d: r.id }; },
    view: x => { const d = findD(x.d); return { title: "Academy prospect", text: `${d.name}, age ${d.age}, is tearing up the junior series (pace ${d.pace}, overall ${PW.ovr(d)}). Young drivers improve fast.`,
      choices: [{ label: "Sign as reserve", desc: `−$0.8M. ${d.name} replaces your current reserve` }, { label: "Pass", desc: "They join the free-agent market instead" }] }; },
    apply: [
      x => { const d = findD(x.d), old = PW.reserve(); if (old) { old.team = ""; old.role = null; } S.cash -= 0.8; Object.assign(d, { team: "you", role: "res", contract: 3, salary: 0.4 }); return `${d.name} joins the team as reserve on a three-year deal.`; },
      x => `${findD(x.d).name} goes into the driver market.`,
    ],
  },
};
function rollEvent() {
  const ids = Object.keys(EVENTS).filter(id => id !== S.lastEventId && EVENTS[id].cond());
  if (!ids.length) return null;
  const id = pick(ids);
  return { id, data: EVENTS[id].make() };
}
PW.eventView = () => { const e = S.pendingEvent; if (!e || !EVENTS[e.id]) return null; return EVENTS[e.id].view(e.data); };
PW.resolveEvent = function (i) {
  const e = S.pendingEvent; if (!e) return "";
  const out = EVENTS[e.id].apply[i](e.data);
  S.lastEventId = e.id; S.pendingEvent = null;
  news(out, "event"); PW.save();
  return out;
};

/* ---------- mid-season rule change ---------- */
const RULES = [
  { title: "Downforce cut", text: "Every team loses 4 Aero. The aero-heavy front-runners lose 6.", apply() { Object.values(S.teams).forEach(t => t.car.aero -= (t.car.aero > 80 ? 6 : 4)); } },
  { title: "Fuel-flow limit", text: "Engine ratings drop 4 for all, 6 for the strongest power units.", apply() { Object.values(S.teams).forEach(t => t.car.engine -= (t.car.engine > 80 ? 6 : 4)); } },
  { title: "Harder tire compounds", text: "Tires wear 15% slower for the rest of the season. One-stops come into play.", apply() { S.mods.wearMul = 0.85; } },
  { title: "Softer tire compounds", text: "Tires wear 20% faster for the rest of the season. Expect more pit stops.", apply() { S.mods.wearMul = 1.2; } },
  { title: "Engine freeze", text: "No engine development for anyone for the rest of the season.", apply() { S.mods.engineFreeze = true; S.research.active = S.research.active.filter(p => { if (p.area === "engine") { S.cash += p.cost; S.devSpent -= p.cost; return false; } return true; }); } },
  { title: "Balance of performance", text: "The bottom four teams in the standings get +3 on every car rating.", apply() { PW.standings().slice(-4).forEach(t => PW.AREAS.forEach(a => t.car[a.id] += 3)); } },
  { title: "Cost cap cut", text: "The development cap drops by $10M, and rival budgets shrink too.", apply() { S.mods.capCut = 10; S.mods.aiDev = 0.85; } },
];
function ruleChange() {
  const r = pick(RULES);
  r.apply();
  S.ruleNote = `${r.title}: ${r.text}`;
  S.pendingRule = { title: r.title, text: r.text };
  news(`RULE CHANGE. ${r.title}: ${r.text}`, "rule");
}

/* ---------- season end ---------- */
PW.seasonSummary = function () {
  const st = PW.standings();
  const pos = st.findIndex(t => t.id === "you") + 1;
  const prize = PW.PRIZE[pos - 1];
  const beat = S.sponsors.filter(s => !s.done && s.goal.type === "beat").map(s => {
    const ok = st.findIndex(t => t.id === "you") < st.findIndex(t => t.id === s.goal.team);
    return { s, ok };
  });
  const champ = PW.driverStandings()[0];
  const expiring = S.drivers.filter(d => d.team === "you" && d.contract <= 1);
  const b = S.board || { target: 9, conf: 60 };
  const met = pos <= b.target, miss = pos - b.target;
  const confDelta = met ? 20 : miss >= 3 ? -35 : -15;
  const board = { target: b.target, met, bonus: met ? 8 : 0, confBefore: b.conf, conf: clamp(b.conf + confDelta, 0, 100), fired: !met && b.conf + confDelta <= 0, next: clamp(met ? pos - 2 : pos - 1, 1, 9) };
  return { st, pos, prize, beat, champ, expiring, board };
};
PW.finishSeason = function (renew) {
  const sum = PW.seasonSummary();
  S.cash += sum.prize + sum.board.bonus;
  if (sum.board.met) award("board");
  if (sum.pos === 1) award("cons");
  if (sum.champ && sum.champ.team === "you") award("drivers");
  S.board = { target: sum.board.next, conf: sum.board.conf };
  if (sum.board.fired) { S.over = true; S.overReason = "fired"; news("The board has lost confidence. You have been replaced as team principal.", "bad"); PW.save(); return; }
  sum.beat.forEach(b => { if (b.ok) { S.cash += b.s.bonus; } });
  S.history.push({ season: S.season, final: sum.pos, points: S.teams.you.points });
  // contracts and ageing
  S.drivers.forEach(d => {
    if (d.team) d.contract--;
    d.age++;
    const g = d.age <= 23 ? rand(2, 5) : d.age <= 27 ? rand(0, 2.5) : d.age <= 31 ? rand(-0.5, 1) : rand(-3, -0.5);
    ["pace", "racecraft", "consistency", "tyre", "wet"].forEach(k => {
      const extra = (k === "racecraft" || k === "consistency") && d.age > 27 ? 0.8 : 0;
      d[k] = clamp(Math.round(d[k] + g * rand(0.5, 1.2) + extra), 50, 99);
    });
    d.points = 0; d.morale = Math.round((d.morale + 65) / 2);
  });
  // my drivers: renew or release
  S.drivers.filter(d => d.team === "you" && d.contract <= 0).forEach(d => {
    if (renew && renew.includes(d.id)) { d.contract = 2; d.salary = +(PW.driverSalary(d)).toFixed(2); }
    else { d.team = ""; d.role = null; }
  });
  // AI teams: re-sign most, poach a free agent sometimes
  PW.TEAMS.forEach(t => {
    S.drivers.filter(d => d.team === t.id && d.contract <= 0).forEach(d => {
      if (d.age >= 37 || Math.random() < 0.3) {
        const fa = PW.freeAgents().sort((a, b) => PW.ovr(b) - PW.ovr(a))[randi(0, 2)];
        if (fa) { d.team = ""; d.role = null; Object.assign(fa, { team: t.id, role: "race", contract: randi(1, 3) }); fa.salary = PW.driverSalary(fa); news(`${fa.name} joins ${t.name}, replacing ${d.name}.`); }
        else d.contract = 1;
      } else d.contract = randi(1, 3);
    });
  });
  // retirements and rookies
  S.drivers.filter(d => !d.team && d.age >= 37).forEach(d => { d.retired = true; news(`${d.name} retires.`); });
  S.drivers = S.drivers.filter(d => !d.retired);
  for (let i = 0; i < 3; i++) S.drivers.push(rookie());
  // fill my empty seats from the reserve, then the best cheap free agent
  ["d1", "d2"].forEach(slot => {
    if (S.drivers.some(d => d.team === "you" && d.role === slot)) return;
    const r = PW.reserve();
    if (r) { r.role = slot; return; }
    const fa = PW.freeAgents().sort((a, b) => PW.driverSalary(a) - PW.driverSalary(b))[0];
    Object.assign(fa, { team: "you", role: slot, contract: 1, salary: PW.driverSalary(fa) });
    news(`${fa.name} fills an empty seat on a one-year deal.`);
  });
  // new regulations: everyone regresses toward the middle
  Object.values(S.teams).forEach(t => { PW.AREAS.forEach(a => t.car[a.id] = +(t.car[a.id] + (72 - t.car[a.id]) * 0.25).toFixed(1)); t.points = 0; });
  S.research = { active: [], tier: Object.fromEntries(PW.AREAS.map(a => [a.id, 0])) };
  S.mods = { wearMul: 1, capCut: 0, aiDev: 1 }; S.ruleNote = ""; S.pendingRule = null;
  S.sponsors = S.sponsors.filter(() => false);
  S.season++; S.round = 0; S.devSpent = 0; S.phase = "hq";
  refreshSponsorOffers(); refreshStaffMarket();
  news(`Season ${S.season} begins. New regulations pulled the field closer together. Sign sponsors, the old deals have ended.`, "rule");
  PW.save();
};
function rookie() {
  const name = PW.newName();
  const code = name.split(" ")[1].slice(0, 3).toUpperCase();
  const b = randi(70, 80);
  const female = PW.FEMALE_FIRST.includes(name.split(" ")[0]);
  const d = { id: code + randi(10, 99), name, code, face: pick(PW.ROOKIE_FACES[female ? "f" : "m"]), age: randi(18, 20), pace: b + randi(0, 4), racecraft: b - randi(2, 7), consistency: b - randi(4, 10), tyre: b - randi(2, 6), wet: b + randi(-4, 4), morale: 70, points: 0, wins: 0, podiums: 0, careerPts: 0, team: "", role: null, contract: 0 };
  d.salary = PW.driverSalary(d);
  return d;
}
})();
