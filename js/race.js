/* Pit Wall — race weekend engine: qualifying, strategy presets, race simulation, track drawing. */
"use strict";
(function () {
const { rand, clamp, gauss, pick } = PW;

/* ---------- shared helpers ---------- */
const BOOST_SPEED = 1.0075;  // about 0.65s a lap faster while boosting
const BOOST_DRAIN = 42;      // % of battery used per lap of boosting
// fuel load options for my cars: laps of fuel over (or under) what the race needs at normal use
const FUEL_PLANS = { light: { margin: -0.4 }, std: { margin: 0.45 }, heavy: { margin: 1.1 } };
PW.FUEL_PLANS = FUEL_PLANS;
const pitRating = team => team.player ? PW.state().staff.pit.rating : Math.round(40 + PW.TEAMS.find(t => t.id === team.id).tier * 45);
const lifeOf = (t, c, tyreRating) => PW.TYRES[t].life / (c.wear * PW.state().mods.wearMul) * (0.8 + (tyreRating || 65) / 300);

/* ---------- car setup ---------- */
PW.SETUPS = {
  low:  { name: "Low downforce",  short: "Low",      aero: .8,  power: 1.25, mech: 1,   wear: 1.07, pass: 1.15, defend: .9,  desc: "Fast on the straights, easier to overtake. Slides more, so tires wear faster." },
  bal:  { name: "Balanced",       short: "Balanced", aero: 1,   power: 1,    mech: 1,   wear: 1,    pass: 1,    defend: 1,   desc: "A safe middle ground. Never far off." },
  high: { name: "High downforce", short: "High",     aero: 1.2, power: .8,   mech: 1.1, wear: .93,  pass: .9,   defend: 1.12,desc: "Glued to the road in corners and kinder to tires. Slower on the straights." },
};
PW.idealSetup = c => c.power >= .45 ? "low" : (c.aero >= .45 || c.mech >= .5) ? "high" : "bal";
PW.setupPerf = function (team, c, setup) {
  const st = PW.SETUPS[setup || "bal"];
  const wa = c.aero * st.aero, wp = c.power * st.power, wm = c.mech * st.mech, sum = wa + wp + wm;
  let perf = (team.car.aero * wa + team.car.engine * wp + team.car.chassis * wm) / sum;
  const ideal = PW.idealSetup(c);
  if (setup === ideal) perf += 0.8;
  else if ((setup === "low" && ideal === "high") || (setup === "high" && ideal === "low")) perf -= 1.4;
  else perf -= 0.3;
  return perf;
};
PW.setupAdvice = function () {
  const S = PW.state(), c = PW.circuit(), re = S.staff.re.rating;
  const ranked = Object.keys(PW.SETUPS).map(k => ({ k, p: PW.setupPerf(S.teams.you, c, k) })).sort((a, b) => b.p - a.p);
  return Math.random() < 0.45 + re / 180 ? ranked[0].k : ranked[1].k;
};

/* ---------- weather plan (decided before the weekend, so the radar can forecast it) ---------- */
PW.weatherPlan = function (c, wetStart) {
  const L = c.laps, wx = [];
  if (wetStart) { if (Math.random() < 0.6) wx.push({ lap: PW.randi(4, Math.max(5, L - 6)), wet: false }); }
  else if (Math.random() < c.rain * 0.9) {
    const start = PW.randi(4, L - 5); wx.push({ lap: start, wet: true });
    if (Math.random() < 0.75) { const stop = start + PW.randi(3, 8); if (stop < L - 1) wx.push({ lap: stop, wet: false }); }
  }
  return wx;
};
PW.rainOutlook = function (wx, wetStart, c) {
  c = c || PW.circuit();
  const re = PW.state().staff.re.rating;
  const truth = wetStart ? (wx.length ? 0.35 : 0.85) : (wx.length ? 0.7 : Math.min(0.25, c.rain * 0.5));
  const p = clamp(truth + gauss() * (100 - re) / 450, 0.05, 0.95);
  return Math.round(p * 20) * 5;
};

/* ---------- qualifying ---------- */
PW.runQualifying = function (mode, wet, setup, bonus) {
  bonus = bonus || {};
  const S = PW.state(), c = PW.circuit();
  const entries = [];
  Object.values(S.teams).forEach(team => {
    PW.teamDrivers(team.id).forEach(d => {
      if (!d) return;
      const perf = PW.setupPerf(team, c, team.player ? setup : PW.idealSetup(c));
      let t = c.base + (100 - perf) * 0.065 + (100 - d.pace) * 0.045 + PW.TYRES.S.pace + gauss() * (0.42 - d.consistency * 0.0035);
      if (team.player) { t -= (S.staff.re.rating - 50) * 0.004; t += (60 - d.morale) * 0.006; if (mode === "max") t -= 0.25; t -= (bonus.quali || 0) + (bonus.perf || 0) * 0.065; }
      if (wet) t += 6 + (100 - d.wet) * 0.06 + Math.abs(gauss()) * 0.4;
      entries.push({ id: d.id, code: d.code, name: d.name, team: team.id, color: team.color, time: t, mine: !!team.player });
    });
  });
  entries.sort((a, b) => a.time - b.time);
  return entries;
};

/* ---------- strategy presets ---------- */
PW.strategyPresets = function (wetStart, exact) {
  const S = PW.state(), c = PW.circuit(), L = c.laps, tr = S.teams.you.car.tyre;
  if (wetStart) return [{ id: "wet", name: "Start on wets", stints: ["W"], stops: [], est: 0, note: "Track is wet. React to the weather with the Box button." }];
  const life = t => lifeOf(t, c, tr);
  const plans = [];
  const combos = [["M", "H"], ["H", "M"], ["S", "H"], ["S", "M"], ["S", "M", "S"], ["S", "M", "M"], ["M", "M", "S"], ["S", "H", "S"], ["S", "S", "M"], ["M", "H", "S"]];
  combos.forEach(st => {
    if (new Set(st).size < 2) return;
    const lives = st.map(life), sum = lives.reduce((a, b) => a + b, 0);
    if (sum < L * 0.92) return;
    const stops = []; let acc = 0;
    for (let i = 0; i < st.length - 1; i++) { acc += lives[i] / sum * L; stops.push({ lap: Math.max(2, Math.round(acc)), tyre: st[i + 1] }); }
    // estimate race time
    let time = 0, lap = 0;
    for (let i = 0; i < st.length; i++) {
      const end = i < stops.length ? stops[i].lap : L;
      let w = 0;
      for (; lap < end; lap++) { time += PW.TYRES[st[i]].pace + 2.6 * w * w + (w > 1 ? (w - 1) * 8 : 0); w += 1 / life(st[i]); }
      if (i < stops.length) time += 21;
    }
    plans.push({ id: st.join(""), name: `${st.length - 1}-stop: ${st.map(t => PW.TYRES[t].name).join(" → ")}`, stints: st, stops, est: time });
  });
  plans.sort((a, b) => a.est - b.est);
  const out = plans.slice(0, 4);
  // the race engineer recommends one; a weak engineer can misjudge
  const re = S.staff.re.rating;
  const scored = out.map(p => ({ p, s: p.est + (exact ? 0 : gauss() * (100 - re) * 0.25) })).sort((a, b) => a.s - b.s);
  if (scored[0]) scored[0].p.recommended = true;
  const best = out[0] ? out[0].est : 0;
  out.forEach(p => p.delta = p.est - best);
  return out;
};

/* ---------- race setup ---------- */
PW.createRace = function (grid, plans, wetStart, qualiMode, setup, wx, bonus, fuel) {
  bonus = bonus || {};
  const S = PW.state(), c = PW.circuit();
  const R = {
    c, path: PW.trackPath(c.shape), laps: c.laps, wet: !!wetStart, everWet: !!wetStart,
    t: 0, sc: null, scCount: 0, leaderLap: 0, finished: false, leaderDone: false,
    radio: [], events: [], flash: {}, speed: 1, paused: false, damageCost: 0, fastest: null,
    wx: (wx || PW.weatherPlan(c, wetStart)).map(e => ({ ...e })), forecast: null, banner: null, lapPos: [], decision: null, autoPause: true, noPause: false, slowmo: true, slowUntil: 0, bannerQ: [], bannerLog: {},
  };
  const ideal = PW.idealSetup(c);
  R.cars = grid.map((g, i) => {
    const team = S.teams[g.team], d = S.drivers.find(x => x.id === g.id);
    const plan = g.mine ? plans[g.id] : null;
    const start = g.mine ? (wetStart ? "W" : plan.stints[0]) : (wetStart ? "W" : pickAiStart(c, team));
    return {
      id: d.id, code: d.code, name: d.name, team: team.id, color: team.color, mine: !!team.player, d, teamObj: team,
      setup: team.player ? (setup || "bal") : ideal,
      perf: PW.setupPerf(team, c, team.player ? (setup || "bal") : ideal), rel: team.car.rel, tyreRating: team.car.tyre, pit: pitRating(team),
      dist: -i * 0.0032 - 0.002, lapIdx: -1, lapStartT: 0, lapTime: c.base + 3, lastLap: null, best: null,
      tyre: start, used: [start], age: 0, wear: 0, stops: 0, pitTimer: 0, pitReq: null,
      plan: plan ? plan.stops.map(s => ({ ...s })) : [], mode: "normal", grid: i + 1,
      dnf: null, finished: false, finishT: 0, penalty: 0, aiThresh: rand(0.78, 0.98), strain: g.mine && qualiMode === "max" ? 1.3 : 1,
      moraleDelta: 0, pos: i + 1, startPos: i + 1, ers: 100, boost: false, gapAheadS: 99, frag: team.player ? (S.fragility || 0) : 0, issue: null,
      tel: team.player ? { tyre: 84, brake: 520, engine: 96, fuel: c.laps + (FUEL_PLANS[fuel] || FUEL_PLANS.std).margin, aheadHist: [], behindHist: [], cd: {}, stuck: 0 } : null,
      wearMul: team.player ? (bonus.wearMul || 1) : 1, failMul: team.player ? (bonus.failMul || 1) : 1, perfBonus: team.player ? (bonus.perf || 0) : 0,
    };
  });
  R.delegateCalls = !!(S.delegate && S.delegate.calls);
  R.cars.forEach(car => { car.perf += car.perfBonus; car.lapTime = lapTimeFor(R, car) + 3 + car.grid * 0.05; });
  R.lapPos.push(Object.fromEntries(R.cars.map((car, i) => [car.id, i + 1])));
  return R;
};
function pickAiStart(c, team) {
  const r = Math.random();
  return c.wear > 1.15 ? (r < .5 ? "S" : "M") : r < .45 ? "M" : r < .8 ? "S" : "H";
}

/* ---------- lap time model ---------- */
function lapTimeFor(R, car) {
  const S = PW.state(), c = R.c, d = car.d;
  let t = c.base + (100 - car.perf) * 0.065 + (100 - d.pace) * 0.045;
  if (car.mine) { t -= (S.staff.re.rating - 50) * 0.004; t += (60 - d.morale) * 0.006; }
  t += PW.TYRES[car.tyre].pace;
  const w = car.wear; t += 2.6 * w * w + (w > 1 ? (w - 1) * 8 : 0);
  t += 0.045 * (car.tel ? Math.max(0, car.tel.fuel) : Math.max(0, R.laps - Math.max(0, car.lapIdx)));
  if (car.issue) t += 0.3 * car.issue.sev;
  if (car.tel) {
    const T = car.tel.tyre, E = car.tel.engine;
    if (T < 80) t += (80 - T) * 0.035; else if (T > 110) t += (T - 110) * 0.08; else if (T >= 94 && T <= 106) t -= 0.1;
    if (E > 118) t += (E - 118) * 0.09;
    if (car.tel.brake > 880) t += (car.tel.brake - 880) * 0.006; // brake fade
  }
  if (car.mode === "push") t -= 0.38; else if (car.mode === "save") t += 0.25;
  if (R.wet) { t += 6; t += car.tyre === "W" ? (100 - d.wet) * 0.05 : 7.5; }
  else if (car.tyre === "W") t += 4.2;
  t += gauss() * (0.42 - d.consistency * 0.0035);
  if (R.sc) t = Math.max(t, c.base * 1.38);
  return t;
}
function wearPerLap(R, car) {
  const S = PW.state();
  let w = 1 / (PW.TYRES[car.tyre].life / (R.c.wear * S.mods.wearMul) * (0.8 + car.tyreRating / 300));
  w *= car.mode === "push" ? 1.45 : car.mode === "save" ? 0.65 : 1;
  w *= 1.12 - car.d.tyre * 0.0025;
  if (car.tyre === "W" && !R.wet) w *= 3;
  if (car.tyre !== "W" && R.wet) w *= 0.6;
  if (R.sc) w *= 0.3;
  const heat = car.tel && car.tel.tyre > 110 ? 1 + (car.tel.tyre - 110) * 0.05 : 1;
  return w * PW.SETUPS[car.setup || "bal"].wear * (car.wearMul || 1) * heat;
}
function pitLoss(car) {
  let stop = 2.1 + (100 - car.pit) * 0.022 + Math.abs(gauss()) * 0.35, fumble = "";
  if (Math.random() < (100 - car.pit) * 0.0011) { const extra = rand(3, 8); stop += extra; fumble = `Slow stop for ${car.code}: ${stop.toFixed(1)}s`; }
  return { loss: 19 + stop, stop, fumble };
}

/* ---------- radio ---------- */
function radio(R, text, kind, car) {
  R.radio.unshift({ text, kind: kind || "", t: R.t, code: car ? car.code : "" });
  R.radio = R.radio.slice(0, 30);
  if (PW.onRadio) PW.onRadio(text, kind);
}

/* ---------- TV banners: one priority queue ----------
   P1 crash / safety car / failure / rain / win (also slows the race to 1x)
   P2 your overtakes, podium fights, fastest lap, final lap
   P3 other notable moves
   P4 filler, only in quiet stretches */
const nowMs = () => (typeof performance !== "undefined" ? performance.now() : 0);
function banner(R, text, kind, prio) {
  prio = prio || 3;
  const now = nowMs(); R.bannerLog = R.bannerLog || {};
  if (R.bannerLog[text] && now - R.bannerLog[text] < 12000) return; // no repeats
  R.bannerLog[text] = now;
  (R.bannerQ = R.bannerQ || []).push({ text, kind: kind || "", prio, at: now });
  if (PW.onEvent) PW.onEvent(R, "banner", { kind: kind || "", prio });
  if (prio <= 1) slow(R, 0.4, text);
}
PW.banner = banner;
PW.bannerTick = function (R, order) {
  const now = nowMs(), q = R.bannerQ = R.bannerQ || [], cur = R.banner;
  // drop stale low-priority items
  for (let i = q.length - 1; i >= 0; i--) if (q[i].prio >= 3 && now - q[i].at > 6000) q.splice(i, 1);
  const shownFor = cur ? now - cur.shownAt : 1e9;
  q.sort((a, b) => a.prio - b.prio || a.at - b.at);
  const top = q[0];
  if (top && (shownFor > 2600 || (cur && top.prio < cur.prio && shownFor > 600))) {
    q.shift(); R.banner = { ...top, shownAt: now }; R.lastBannerAt = now; return R.banner;
  }
  if (cur && shownFor < 3800) return cur;
  // quiet stretch: a little colour from the commentary box
  if (!R.sc && !R.finished && R.started && order && now - (R.lastBannerAt || 0) > 11000 && order.length > 3) {
    R.lastBannerAt = now;
    const f = filler(R, order);
    if (f) { R.banner = { text: f, kind: "info", prio: 4, shownAt: now }; return R.banner; }
  }
  return cur && shownFor < 3800 ? cur : null;
};
function filler(R, order) {
  const live = order.filter(c => !c.dnf && !c.finished);
  if (live.length < 3) return null;
  const lead = live[0], second = live[1], mine = live.filter(c => c.mine);
  const opts = [];
  const gap = (second.gapAheadS < 60 ? second.gapAheadS : 0);
  if (gap > 0) opts.push(gap > 3 ? `${lead.name} leads by ${gap.toFixed(1)}s` : `${second.code} is hunting ${lead.code} for the lead: ${gap.toFixed(1)}s`);
  const fight = live.slice(1, 10).find(c => c.gapAheadS < 0.8);
  if (fight) { const ahead = live[live.indexOf(fight) - 1]; opts.push(`Battle for P${ahead.pos}: ${fight.code} is ${fight.gapAheadS.toFixed(1)}s behind ${ahead.code}`); }
  mine.forEach(m => { const ahead = live[live.indexOf(m) - 1]; if (ahead && m.gapAheadS < 60) opts.push(`${m.name} runs P${m.pos}, ${m.gapAheadS.toFixed(1)}s behind ${ahead.code}`); });
  const lapsLeft = R.laps - Math.max(0, lead.lapIdx);
  if (lapsLeft > 1 && lapsLeft <= 5) opts.push(`${lapsLeft} laps to go`);
  return opts.length ? pick(opts) : null;
}
const PASS_LINES = [
  (a, b) => `${a.name} passes ${b.name}`,
  (a, b) => `${a.name} dives down the inside of ${b.name}`,
  (a, b) => `${a.name} sweeps around the outside of ${b.name}`,
  (a, b) => `${a.code} out-brakes ${b.code}`,
  (a, b) => `${a.name} gets the run on ${b.name}`,
  (a, b) => `Wheel to wheel, and ${a.code} wins it from ${b.code}`,
];
const passLine = (a, b, pos) => pick(PASS_LINES)(a, b) + (pos <= 10 ? ` for P${pos}` : "");

/* ---------- slow motion: drop to 1x when something matters ---------- */
function slow(R, laps, why) {
  if (R.noPause || !R.slowmo || !R.started) return;
  const until = R.t + laps * R.c.base;
  if (until > (R.slowUntil || 0)) { R.slowUntil = until; R.slowWhy = why; }
}
PW.slow = slow;

/* ---------- decision moments: pause so the player can make the call ---------- */
const ROUTINE = ["hot", "cold", "brakes", "engine", "fuel", "tyres"];
// the race engineer takes routine calls without pausing when that's delegated
function delegateCall(R, kind, title, suggest, extra) {
  const cars = R.cars.filter(c => c.mine && !c.dnf && !c.finished && (!extra || !extra.car || c.id === extra.car));
  cars.forEach(car => {
    const acts = [];
    const m = extra && extra.mode && extra.mode[car.id];
    if (m && car.mode !== m) { car.mode = m; car.autoMode = true; car.autoPushUntil = m === "push" ? car.lapIdx + 2 : 0; car.lapTime = lapTimeFor(R, car); acts.push(m === "save" ? "switching to Save" : m === "push" ? "pushing for a couple of laps" : "back to Balanced"); }
    const t = suggest && suggest[car.id];
    if (t && kind === "tyres" && !car.pitReq) { car.pitReq = t; acts.push(`boxing for ${PW.TYRES[t].name}s`); }
    if (acts.length) radio(R, `Engineer: ${title.replace(/^.*?'s /, car.code + "'s ")}. ${acts.join(" and ").replace(/^./, c => c.toUpperCase())}.`, "warn", car);
  });
}
function decide(R, kind, title, text, suggest, extra) {
  if (R.delegateCalls && ROUTINE.includes(kind) && !R.noPause) return delegateCall(R, kind, title, suggest, extra);
  if (!R.autoPause || R.noPause || !R.started || R.decision || R.leaderDone) return;
  const mine = R.cars.filter(c => c.mine && !c.dnf && !c.finished);
  if (!mine.length) return;
  R.decision = { kind, title, text, suggest: suggest || {}, mode: (extra && extra.mode) || null, car: (extra && extra.car) || null, at: R.t };
  if (PW.onEvent) PW.onEvent(R, "decision", { kind });
  R.paused = true;
}
function dryFor(R, car) { return bestDryFor(R, car, R.laps - Math.max(0, car.lapIdx)); }

/* ---------- AI pit decisions ---------- */
function bestDryFor(R, car, remaining) {
  const opts = ["S", "M", "H"].filter(t => lifeOf(t, R.c, car.tyreRating) >= remaining * 0.95);
  const usedDry = car.used.filter(t => t !== "W");
  let choice = opts[0] || "H";
  if (new Set(usedDry).size < 2 && !R.everWet) {
    const fresh = opts.find(t => !usedDry.includes(t));
    if (fresh) choice = fresh; else if (usedDry.includes(choice)) choice = ["S", "M", "H"].find(t => !usedDry.includes(t)) || choice;
  }
  return choice;
}
function aiPitChoice(R, car) {
  const remaining = R.laps - car.lapIdx;
  if (remaining <= 1) return null;
  if (R.wet && car.tyre !== "W") return Math.random() < 0.65 ? "W" : null;
  if (!R.wet && car.tyre === "W") return Math.random() < 0.65 ? bestDryFor(R, car, remaining) : null;
  if (R.wet) return null;
  const twoRule = !R.everWet && new Set(car.used).size < 2;
  if (car.wear >= car.aiThresh && remaining > 2) return bestDryFor(R, car, remaining);
  if (R.sc && car.wear > 0.42 && remaining > 4) return bestDryFor(R, car, remaining);
  if (twoRule && remaining <= 3) return bestDryFor(R, car, remaining);
  return null;
}

/* ---------- lap crossing ---------- */
function onCross(R, car) {
  const S = PW.state();
  car.lapIdx++;
  if (car.lapIdx === 0) { car.lapStartT = R.t; return; }
  const lt = R.t - car.lapStartT; car.lastLap = lt; car.lapStartT = R.t;
  if (!R.sc && car.lapIdx > 1 && (!car.best || lt < car.best)) {
    car.best = lt;
    if (!R.fastest || lt < R.fastest.t) {
      const changed = !R.fastest || R.fastest.code !== car.code;
      R.fastest = { t: lt, code: car.code, team: car.team };
      if (changed && car.lapIdx >= 4) banner(R, `Fastest lap: ${car.name} ${lt.toFixed(2)}s`, "purple", 2);
    }
  }
  car.age++; car.wear += wearPerLap(R, car);
  const isLeader = R.cars.filter(x => !x.dnf).every(x => x === car || x.dist <= car.dist);
  if (isLeader && car.lapIdx > R.leaderLap && !R.leaderDone) leaderLap(R, car);

  // finish
  if (car.lapIdx >= R.laps || R.leaderDone) {
    if (!R.leaderDone) { R.leaderDone = true; radio(R, `Chequered flag! ${car.name} wins.`, "flag"); banner(R, `🏁 ${car.name} wins at ${R.c.name}!`, "flag", 1); }
    car.finished = true; car.finishT = R.t;
    if (!R.everWet && new Set(car.used.filter(t => t !== "W")).size < 2) { car.penalty = 20; if (car.mine) radio(R, `${car.code}: 20-second penalty. We only used one tire compound.`, "bad", car); }
    if (car.mine) {
      const pos = R.cars.filter(x => x.finished && x.finishT + x.penalty <= car.finishT + car.penalty).length;
      radio(R, `${car.code} finishes. Provisional P${pos}.`, pos <= 3 ? "good" : "", car);
    }
    if (R.cars.every(x => x.finished || x.dnf)) R.finished = true;
    return;
  }

  // failures and crashes
  let fail = (100 - car.rel) * 0.00007 * (car.mode === "push" ? 1.6 : 1) * car.strain * (car.failMul || 1);
  let failWhat = null;
  if (car.tel) {
    if (car.tel.brake > 950) { fail += (car.tel.brake - 950) * 0.0012; failWhat = "Brakes"; }
    if (car.tel.engine > 125) { fail += (car.tel.engine - 125) * 0.0008; failWhat = "Engine overheating"; }
  }
  const crash = 0.0004 + (100 - car.d.consistency) * 0.00002 + (R.wet ? (car.tyre === "W" ? 0.0015 : 0.012) : 0) + (car.mode === "push" ? 0.0015 : 0) + (car.wear > 1.1 ? 0.02 : 0);
  if (car.issue) fail += 0.06 * car.issue.sev * (car.mode === "save" ? 0.4 : car.mode === "push" ? 1.5 : 1);
  if (Math.random() < fail) {
    if (car.issue) failWhat = car.issue.part;
    car.dnf = failWhat || pick(["Engine", "Gearbox", "Hydraulics", "Power unit", "Brakes", "Electrics"]);
    radio(R, car.mine ? `${car.code}: we have a problem. ${car.dnf} failure. Stop the car.` : `${car.name} (${car.teamObj.short}) is out: ${car.dnf.toLowerCase()} failure.`, car.mine ? "bad" : "", car);
    if (car.mine || car.pos <= 8) banner(R, `Retirement: ${car.name} (${car.dnf.toLowerCase()})`, "bad", car.mine ? 1 : 2);
    if (Math.random() < 0.25) startSC(R, "Stopped car on track");
    return;
  }
  if (Math.random() < crash) {
    car.dnf = "Crash";
    if (car.mine) R.damageCost += rand(1, 2.5);
    radio(R, car.mine ? `${car.code} is in the wall! Are you OK? ... Driver is OK, just shaken.` : `Crash! ${car.name} (${car.teamObj.short}) is out.`, car.mine ? "bad" : "", car);
    banner(R, `Crash! ${car.name} is out`, "bad", 1);
    if (Math.random() < 0.65) startSC(R, "Crash");
    return;
  }

  // mechanical issues: bold, unproven parts make them more likely
  if (car.mine && !car.issue && car.lapIdx >= 2 && R.laps - car.lapIdx > 2 && Math.random() < 0.0008 + Math.min(car.frag, 6) * 0.0018) {
    const part = pick(["Gearbox", "Hydraulics", "Power unit", "Brake-by-wire", "Water pressure", "Fuel pressure"]);
    car.issue = { part, sev: +rand(0.5, 1).toFixed(2), lap: car.lapIdx };
    radio(R, `${car.code}: we're seeing a ${part.toLowerCase()} problem in the data. Stand by.`, "bad", car);
    banner(R, `${car.name}: ${part.toLowerCase()} problem`, "bad", 1);
    decide(R, "issue", `${car.code}: ${part.toLowerCase()} problem`, `The data shows a ${part.toLowerCase()} problem on ${car.name}'s car. It's costing time and could end the race. Box to fix it (about 8 extra seconds in the pits), nurse it home in Save mode (much lower risk), or keep going and hope it holds.`, { [car.id]: R.wet ? "W" : dryFor(R, car) }, { mode: { [car.id]: "save" }, car: car.id });
  }

  // pit stops
  let tyre = null;
  if (car.mine) {
    if (car.pitReq) { tyre = car.pitReq; car.pitReq = null; if (car.plan[0] && Math.abs(car.plan[0].lap - car.lapIdx) <= 4) car.plan.shift(); }
    else if (car.plan[0] && car.lapIdx >= car.plan[0].lap) {
      const st = car.plan.shift();
      tyre = R.wet ? null : st.tyre;
      if (R.wet) radio(R, `${car.code}: skipping the planned stop, track is wet. Your call on wets.`, "warn", car);
    }
  } else {
    tyre = aiPitChoice(R, car);
    if (tyre) {
      const victim = R.cars.find(m => m.mine && !m.dnf && !m.finished && m.pitTimer <= 0 && m.pos === car.pos - 1 && car.gapAheadS < 2.5 && R.laps - m.lapIdx > 4);
      if (victim && cool(victim, "undercut", 5)) decide(R, "undercut", `${car.code} is trying to undercut ${victim.code}`, `${car.name} just pitted from ${car.gapAheadS.toFixed(1)}s behind ${victim.name}. On fresh tires they'll gain about a second a lap. Box next lap to cover it, or stay out and push to build a gap.`, { [victim.id]: R.wet ? "W" : dryFor(R, victim) }, { mode: { [victim.id]: "push" }, car: victim.id });
    }
  }
  if (tyre && R.laps - car.lapIdx >= 1) {
    const p = pitLoss(car);
    if (car.issue) { p.loss += 8; radio(R, `${car.code}: the crew fixed the ${car.issue.part.toLowerCase()} problem. Clean car again.`, "good", car); car.issue = null; }
    car.pitTimer = p.loss; car.tyre = tyre; car.wear = 0; car.age = 0; car.stops++; car.wearWarned = false;
    if (car.tel) { car.tel.tyre = 78; car.tel.stuck = 0; }
    if (!car.used.includes(tyre)) car.used.push(tyre);
    (car.stints = car.stints || [car.used[0]]).push(tyre);
    if (car.mine) { slow(R, 0.25, `${car.code} pit stop`); if (PW.onEvent) PW.onEvent(R, "pit", { code: car.code }); }
    if (car.mine) radio(R, `${car.code} in the pits: ${PW.TYRES[tyre].name}s, ${p.stop.toFixed(1)}s stop.`, "", car);
    if (p.fumble && car.mine) radio(R, p.fumble + ". Wheel gun problem.", "bad", car);
  }

  // AI pace modes
  if (!car.mine) {
    const remaining = R.laps - car.lapIdx;
    car.mode = remaining <= 4 && car.wear < 0.7 ? "push" : car.wear > 0.85 ? "save" : "normal";
  }
  // engineer advice for my cars
  if (car.mine) advise(R, car);
  if (car.tel) teleChecks(R, car);
  if (car.mine && !car.wearWarned && car.wear > 0.72 && R.laps - car.lapIdx > 3 && !car.pitReq && car.pitTimer <= 0 && !(car.plan[0] && car.plan[0].lap - car.lapIdx <= 1)) {
    car.wearWarned = true;
    decide(R, "tyres", `${car.name}'s tires are fading`, `${Math.round((1 - car.wear) * 100)}% grip left on ${PW.TYRES[car.tyre].name}s with ${R.laps - car.lapIdx} laps to go${car.plan[0] ? `. The plan says box on lap ${car.plan[0].lap}` : ""}. Lap times fall off a cliff when the tires run out. Box now, or save them?`, { [car.id]: R.wet ? "W" : dryFor(R, car) }, { car: car.id });
  }
  car.lapTime = lapTimeFor(R, car);
}
/* ---------- telemetry: temperatures, fuel, gaps ---------- */
function cool(car, kind, laps) {
  const t = car.tel; if (!t) return false;
  if ((t.cd[kind] || -99) > car.lapIdx) return false;
  t.cd[kind] = car.lapIdx + laps; return true;
}
function teleUpdate(R, car, dt) {
  const t = car.tel, c = R.c;
  if (car.pitTimer > 0) { const k = dt / 8; t.tyre += (74 - t.tyre) * k; t.brake += (420 - t.brake) * k; t.engine += (92 - t.engine) * k; return; }
  const k = dt / car.lapTime, close = car.gapAheadS < 1.0, sc = !!R.sc;
  const mode = car.mode === "push" ? 1 : car.mode === "save" ? -1 : 0;
  const tyreT = { S: 102, M: 96, H: 89, W: 82 }[car.tyre] + mode * (mode > 0 ? 12 : 9) + (close ? 5 : 0) + (car.boost ? 4 : 0) + (c.wear - 1) * 25
    + (R.wet && car.tyre !== "W" ? -18 : 0) + (!R.wet && car.tyre === "W" ? 25 : 0) - (sc ? 28 : 0);
  const brakeT = 580 + c.brk * 260 + (close ? 110 : 0) + (mode > 0 ? 70 : mode < 0 ? -60 : 0) - (sc ? 250 : 0) - (R.wet ? 60 : 0);
  const engT = 100 + (close ? 11 : 0) + (mode > 0 ? 6 : mode < 0 ? -5 : 0) + (car.boost ? 8 : 0) + c.hot * 9 - (sc ? 12 : 0);
  t.tyre += (tyreT - t.tyre) * Math.min(1, k * 1.6);
  t.brake += (brakeT - t.brake) * Math.min(1, k * 2.2);
  t.engine += (engT - t.engine) * Math.min(1, k * 1.4);
  t.fuel -= k * (sc ? 0.45 : (mode > 0 ? 1.06 : mode < 0 ? 0.9 : 1) + (car.boost ? 0.06 : 0));
  if (t.fuel <= 0 && !car.finished && !car.dnf) {
    car.dnf = "Out of fuel";
    radio(R, `${car.code}: we're out of fuel. Stop the car. I'm sorry.`, "bad", car);
    banner(R, `${car.name} has run out of fuel!`, "bad", 1);
  }
}
PW.fuelDelta = (R, car) => car.tel ? car.tel.fuel - Math.max(0, R.laps - Math.max(0, car.lapIdx) - (car.dist - Math.floor(car.dist))) : 0;
PW.pitProjection = function (R, car) {
  const loss = 21 + (2.1 + (100 - car.pit) * 0.022);
  const proj = car.dist - loss / car.lapTime;
  const others = R.cars.filter(o => o !== car && !o.dnf && !o.finished);
  const ahead = others.filter(o => o.dist > proj).sort((a, b) => a.dist - b.dist)[0];
  const behind = others.filter(o => o.dist <= proj).sort((a, b) => b.dist - a.dist)[0];
  return {
    pos: 1 + others.filter(o => o.dist > proj).length,
    ahead, gapAhead: ahead ? (ahead.dist - proj) * car.lapTime : null,
    behind, gapBehind: behind ? (proj - behind.dist) * car.lapTime : null,
  };
};
function teleChecks(R, car) {
  const t = car.tel, rem = R.laps - car.lapIdx;
  // gap trends, recorded once a lap
  const order = PW.raceOrder(R), behindCar = order[car.pos];
  t.aheadHist.push(car.gapAheadS < 60 ? car.gapAheadS : null); t.aheadHist = t.aheadHist.slice(-4);
  t.behindHist.push(behindCar && !behindCar.dnf && behindCar.gapAheadS < 60 ? behindCar.gapAheadS : null); t.behindHist = t.behindHist.slice(-4);
  t.stuck = car.gapAheadS < 1.3 && !R.sc ? t.stuck + 1 : 0;
  if (car.autoMode && !car.pitReq) {
    const fd0 = PW.fuelDelta(R, car);
    if (car.mode === "save" && t.tyre < 106 && t.brake < 870 && t.engine < 116 && fd0 > 0.1) { car.mode = "normal"; car.autoMode = false; car.lapTime = lapTimeFor(R, car); radio(R, `Engineer: ${car.code}'s temperatures and fuel are fine again. Back to Balanced.`, "", car); }
    else if (car.mode === "push" && (car.lapIdx >= (car.autoPushUntil || 0) || fd0 < 0)) { car.mode = "normal"; car.autoMode = false; car.lapTime = lapTimeFor(R, car); radio(R, `Engineer: ${car.code} back to Balanced.`, "", car); }
  }
  if (R.sc || car.lapIdx < 2 || rem < 2) return;
  const save = { mode: { [car.id]: "save" }, car: car.id }, saving = car.mode === "save";
  if (t.tyre > 112 && !saving && cool(car, "hot", 5)) decide(R, "hot", `${car.name}'s tires are overheating`, `Tires at ${Math.round(t.tyre)}°C. The working window is 95-105°C. Above it they lose grip and wear out fast. Switch to Save mode or back off out of the dirty air of the car ahead.`, {}, save);
  else if (t.tyre < 79 && car.age >= 2 && car.mode !== "push" && cool(car, "cold", 8)) decide(R, "cold", `${car.name}'s tires are cold`, `Tires at only ${Math.round(t.tyre)}°C, below the 95-105°C window. Cold tires are slow and slippery. Push for a lap or two to bring the heat back.`, {}, { mode: { [car.id]: "push" }, car: car.id });
  if (t.brake > 915 && !saving && cool(car, "brakes", 5)) decide(R, "brakes", `${car.name}'s brakes are too hot`, `Brakes at ${Math.round(t.brake)}°C. Above about 950°C they can fail. ${car.gapAheadS < 1 ? "Following closely is starving them of air. Drop back a second" : "Lift and coast into the braking zones"}, or switch to Save mode.`, {}, save);
  if (t.engine > 121 && !saving && cool(car, "engine", 5)) decide(R, "engine", `${car.name}'s engine is running hot`, `Engine at ${Math.round(t.engine)}°C. It's losing power, and above 125°C it could fail. ${car.gapAheadS < 1 ? "The dirty air of the car ahead is cooking it. Back off a little" : "Ease off the boost and pushing"}, or switch to Save mode.`, {}, save);
  const fd = PW.fuelDelta(R, car);
  if (fd < -0.2 && rem > 1 && !saving && cool(car, "fuel", 4)) decide(R, "fuel", `${car.name} is short on fuel`, `Fuel is ${Math.abs(fd).toFixed(1)} laps short of the finish at this rate. Save mode uses about 10% less per lap. If it runs dry, the car stops on track.`, {}, save);
  // undercut chance: stuck behind a car and a stop would rejoin in clear air
  if (t.stuck >= 3 && car.age >= 8 && rem > 8 && !car.pitReq && !R.wet && cool(car, "undercutGo", 8)) {
    const pp = PW.pitProjection(R, car), ahead = order[car.pos - 2];
    if (pp.gapAhead == null || pp.gapAhead > 1.5) decide(R, "undercutGo", `Undercut chance for ${car.code}`, `${car.name} has been stuck behind ${ahead ? ahead.name : "the car ahead"} for ${t.stuck} laps. A stop now rejoins P${pp.pos}${pp.ahead ? `, ${pp.gapAhead.toFixed(1)}s behind ${pp.ahead.code}` : ""} in clear air. Fresh tires could jump them when they stop.`, { [car.id]: dryFor(R, car) }, { car: car.id });
  }
}
function advise(R, car) {
  const re = PW.state().staff.re.rating, remaining = R.laps - car.lapIdx;
  const heard = Math.random() < 0.35 + re / 160;
  if (!heard) return;
  const nextStop = car.plan[0];
  if (R.wet && car.tyre !== "W" && !car.pitReq) radio(R, `${car.code}: it's wet out here. Box for wets!`, "warn", car);
  else if (!R.wet && car.tyre === "W" && !car.pitReq && car.age > 1) radio(R, `${car.code}: track is drying. The wets are cooking. Box for slicks.`, "warn", car);
  else if (car.wear > 0.8 && remaining > 2 && !car.pitReq && !(nextStop && nextStop.lap - car.lapIdx <= 1)) radio(R, `${car.code}: tires are gone (${Math.round(car.wear * 100)}%). Box this lap?`, "warn", car);
  else if (!R.everWet && new Set(car.used).size < 2 && remaining <= 4 && remaining > 1 && !car.pitReq && !nextStop) radio(R, `${car.code}: reminder, we must use a second compound or take a penalty.`, "warn", car);
  else if (car.wear > 0.6 && car.mode === "push") radio(R, `${car.code}: you're pushing hard on old tires. Consider saving them.`, "", car);
}

function leaderLap(R, car) {
  R.leaderLap = car.lapIdx;
  if (R.sc) {
    R.sc.left--;
    if (R.sc.left <= 0) { R.sc = null; radio(R, "Safety car is in this lap. Racing resumes!", "flag"); banner(R, "Green flag. Racing resumes!", "green", 2); slow(R, 0.3, "Restart"); }
  } else if (car.lapIdx < R.laps - 2 && Math.random() < 0.003) startSC(R, "Debris on track");
  // weather follows the plan; the radar warns a few laps early
  const re = PW.state().staff.re.rating;
  R.wx.forEach(e => {
    if (!e.warned && car.lapIdx >= e.lap - 3 && car.lapIdx < e.lap) {
      e.warned = true;
      const err = Math.round(gauss() * (100 - re) / 30), est = Math.max(1, e.lap - car.lapIdx + err);
      R.forecast = { wet: e.wet, lap: car.lapIdx + est };
      const sug = {};
      if (e.wet) R.cars.filter(c => c.mine && !c.dnf && !c.finished && c.tyre !== "W").forEach(c => sug[c.id] = "W");
      decide(R, "radar", e.wet ? "Rain on the radar" : "Rain clearing", e.wet
        ? `Your engineer expects rain in about ${est} lap${est > 1 ? "s" : ""} (around lap ${car.lapIdx + est}). Box for wets just as it arrives: too early and you lose about 4s a lap, too late and slicks are slow and risky.`
        : `The radar says the rain stops in about ${est} lap${est > 1 ? "s" : ""}. Plan the switch back to slicks.`, e.wet ? {} : sug);
      radio(R, e.wet ? `Radar: rain is coming. Expect it in about ${est} lap${est > 1 ? "s" : ""}. Plan the switch to wets.` : `Radar: the rain is clearing. Track should dry in about ${est} lap${est > 1 ? "s" : ""}.`, "rain");
    }
    if (car.lapIdx === e.lap && !e.done) {
      e.done = true; R.wet = e.wet; R.forecast = null;
      const sug = {};
      R.cars.filter(c => c.mine && !c.dnf && !c.finished && !c.pitReq).forEach(c => { if (e.wet && c.tyre !== "W") sug[c.id] = "W"; if (!e.wet && c.tyre === "W") sug[c.id] = dryFor(R, c); });
      if (e.wet) { R.everWet = true; radio(R, "Rain! It's raining now. Track is getting wet.", "rain"); banner(R, "🌧 Rain is falling", "rain", 1); decide(R, "rain", "It's raining!", "The track is wet. Cars on slick tires are losing seconds a lap and are much more likely to crash.", sug); }
      else { radio(R, "Rain has stopped. Track is drying fast.", "rain"); banner(R, "☀ Track drying", "rain", 2); decide(R, "dry", "Track is drying", "Wet tires overheat and lose time on a dry track. Time to go back to slicks.", sug); }
    }
  });
  if (car.lapIdx === R.laps - 1) { radio(R, "Final lap!", "flag"); banner(R, "Final lap!", "flag", 2); slow(R, 0.6, "Final lap"); }
  R.lapPos.push(Object.fromEntries(PW.raceOrder(R).map((x, i) => [x.id, x.dnf ? null : i + 1])));
}
function startSC(R, why) {
  if (R.sc || R.leaderLap >= R.laps - 2) return;
  R.sc = { left: 3, why }; R.scCount++;
  if (PW.onEvent) PW.onEvent(R, "sc", {});
  radio(R, `SAFETY CAR. ${why}. Cheap pit stop window!`, "sc");
  banner(R, `Safety car: ${why.toLowerCase()}`, "sc", 1);
  const sug = {};
  R.cars.filter(c => c.mine && !c.dnf && !c.finished).forEach(c => { if (R.laps - c.lapIdx > 3 && (c.wear > 0.3 || (!R.everWet && new Set(c.used).size < 2))) sug[c.id] = R.wet ? "W" : dryFor(R, c); });
  decide(R, "sc", "Safety car!", `${why}. The field bunches up, so a stop now costs far less time than usual. Box, or stay out and gain track position?`, sug);
}

/* ---------- step the simulation ---------- */
PW.stepRace = function (R, dt) {
  if (R.finished) return;
  R.t += dt;
  const live = R.cars.filter(c => !c.dnf && !c.finished);
  // move
  live.forEach(car => {
    if (car.pitTimer > 0) { car.pitTimer -= dt; car.boost = false; car.ers = Math.min(100, car.ers + dt * 30 / car.lapTime); return; }
    if (R.sc) car.boost = false;
    if (car.boost) { car.ers -= dt * BOOST_DRAIN / car.lapTime; if (car.ers <= 0) { car.ers = 0; car.boost = false; if (car.mine) radio(R, `${car.code}: battery is empty. Boost off.`, "", car); } }
    else car.ers = Math.min(100, car.ers + dt * (car.mode === "save" ? 22 : car.mode === "push" ? 7 : 12) / car.lapTime);
    car.dist += dt / car.lapTime * (car.boost ? BOOST_SPEED : 1);
  });
  live.forEach(car => { if (car.tel) teleUpdate(R, car, dt); });
  // following, overtaking, safety-car bunching
  const order = live.slice().sort((a, b) => b.dist - a.dist);
  if (order[0]) order[0].gapAheadS = 99;
  for (let i = 1; i < order.length; i++) {
    const car = order[i], ahead = order[i - 1];
    if (car.pitTimer > 0 || ahead.pitTimer > 0) continue;
    const gapS = (ahead.dist - car.dist) * car.lapTime;
    car.gapAheadS = gapS;
    // rivals use their battery to attack and defend
    if (!R.sc) {
      if (!car.mine) { if (!car.boost && car.lapIdx >= 2 && gapS < 0.9 && car.ers > 45 && car.lapTime < ahead.lapTime + 0.35 && Math.random() < dt * 0.04) car.boost = true; else if (car.boost && (gapS > 1.6 || car.ers < 8)) car.boost = false; }
      if (!ahead.mine) { if (!ahead.boost && ahead.lapIdx >= 2 && gapS < 0.45 && ahead.ers > 55 && Math.random() < dt * 0.02) ahead.boost = true; }
    }
    if (R.sc) {
      if (gapS > 1.2) car.dist += dt / car.lapTime * 0.6; // catch up to the queue
      if (gapS < 0.6) car.dist = ahead.dist - 0.6 / car.lapTime;
      continue;
    }
    if ((car.mine || ahead.mine) && gapS < 0.6 && (R.battleCd || 0) < R.t && car.lapIdx >= 1) { R.battleCd = R.t + 5 * R.c.base; slow(R, 0.3, `Battle: ${car.code} vs ${ahead.code}`); }
    const effCar = car.lapTime / (car.boost ? BOOST_SPEED : 1), effAhead = ahead.lapTime / (ahead.boost ? BOOST_SPEED : 1);
    if (gapS < 0.55 && effCar < effAhead) {
      const delta = effAhead - effCar;
      const pLap = R.c.pass * clamp(0.06 + delta * 0.45, 0, 0.9) * clamp(0.85 + (car.d.racecraft - ahead.d.racecraft) / 60, 0.4, 1.4) * PW.SETUPS[car.setup].pass / PW.SETUPS[ahead.setup].defend * (car.boost ? 1.5 : 1) / (ahead.boost ? 1.35 : 1);
      if (Math.random() < pLap / car.lapTime * dt * 2.2) {
        car.dist = ahead.dist + 0.0012; ahead.dist -= 0.0006;
        R.flash[car.id] = R.t;
        if (car.mine || ahead.mine) R.events.push({ t: R.t, text: `${car.code} passes ${ahead.code}` });
        const forPos = ahead.pos;
        if (forPos <= 3 || car.mine || ahead.mine) banner(R, passLine(car, ahead, forPos), car.mine ? "good" : ahead.mine ? "bad" : "", car.mine || ahead.mine || forPos <= 3 ? 2 : 3);
        else if (forPos <= 10 && Math.random() < 0.3) banner(R, passLine(car, ahead, forPos), "", 3);
        if (car.mine || ahead.mine) slow(R, 0.15, "Overtake");
        if (car.mine && Math.random() < 0.5) radio(R, `${car.code}: great move on ${ahead.code}!`, "good", car);
      } else if (gapS < 0.3) car.dist = ahead.dist - 0.3 / car.lapTime;
    }
  }
  // lap crossings
  live.forEach(car => { while (!car.dnf && !car.finished && Math.floor(car.dist) > car.lapIdx) onCross(R, car); });
  if (R.cars.every(x => x.finished || x.dnf)) R.finished = true;
  // positions
  PW.raceOrder(R).forEach((car, i) => car.pos = i + 1);
};

PW.raceOrder = function (R) {
  return R.cars.slice().sort((a, b) => {
    if (!!a.dnf !== !!b.dnf) return a.dnf ? 1 : -1;
    if (a.dnf && b.dnf) return b.dist - a.dist;
    if (a.finished && b.finished) return (b.lapIdx - a.lapIdx) || (a.finishT + a.penalty) - (b.finishT + b.penalty);
    if (a.finished !== b.finished) { const f = a.finished ? a : b, o = a.finished ? b : a; return (o.dist > f.lapIdx ? (a === o ? -1 : 1) : (a === f ? -1 : 1)); }
    return b.dist - a.dist;
  });
};
PW.gapText = function (R, car, leader) {
  if (car.dnf) return "OUT";
  if (car === leader) return R.leaderDone ? "WIN" : "Leader";
  if (car.finished && leader.finished) {
    if (leader.lapIdx - car.lapIdx >= 1) return `+${leader.lapIdx - car.lapIdx} lap`;
    return "+" + (car.finishT + car.penalty - leader.finishT - leader.penalty).toFixed(1);
  }
  const laps = leader.dist - car.dist;
  if (laps >= 1) return `+${Math.floor(laps)} lap`;
  return "+" + (laps * leader.lapTime).toFixed(1);
};

PW.raceResult = function (R) {
  const order = PW.raceOrder(R);
  return {
    classified: order.map(c => ({ stints: c.stints || [c.used[0]], id: c.id, code: c.code, name: c.name, team: c.team, color: c.color, dnf: c.dnf, mine: c.mine, grid: c.startPos, stops: c.stops, penalty: c.penalty, moraleDelta: c.moraleDelta, best: c.best, gap: PW.gapText(R, c, order[0]) })),
    fastest: R.fastest, damageCost: +R.damageCost.toFixed(2), sc: R.scCount, wet: R.everWet,
    lapChart: { laps: R.lapPos, cars: R.cars.map(c => ({ id: c.id, code: c.code, color: c.color, mine: c.mine })) },
  };
};

/* ---------- broadcast-style insight cards (strategy numbers for your cars) ---------- */
function histTrend(h) { const v = (h || []).filter(x => x != null); return v.length >= 2 ? v[v.length - 1] - v[v.length - 2] : 0; }
PW.insights = function (R) {
  const out = [];
  if (!R.started || R.finished) return out;
  const order = PW.raceOrder(R);
  R.cars.filter(c => c.mine && !c.dnf && !c.finished && c.pitTimer <= 0 && c.lapIdx >= 1).forEach(car => {
    const rem = R.laps - car.lapIdx, T = PW.TYRES[car.tyre];
    const rate = Math.max(0.01, car.age > 0 ? car.wear / car.age : wearPerLap(R, car));
    const lapsLeft = Math.max(0, (0.95 - car.wear) / rate);
    const needCompound = !R.everWet && new Set(car.used.filter(t => t !== "W")).size < 2;
    const fit = R.wet ? "W" : dryFor(R, car);
    const ahead = order[car.pos - 2], behind = order[car.pos];
    // pit window or tires to the end
    if (rem > 2 && !R.sc) {
      if (lapsLeft >= rem && !needCompound) out.push({ prio: 3, kind: "tyres", title: `Tire life · ${car.code}`, big: "To the end", sub: `${T.name}s have about ${Math.round(lapsLeft)} laps left with ${rem} to go.`, pct: 1 - car.wear });
      else {
        const from = Math.min(R.laps - 2, car.lapIdx + Math.max(1, Math.floor(lapsLeft - 2)));
        const to = Math.min(R.laps - 2, Math.max(from + 1, car.lapIdx + Math.ceil(lapsLeft)));
        const pp = PW.pitProjection(R, car);
        out.push({ prio: lapsLeft < 3 ? 1 : 2, kind: "window", title: `Pit window · ${car.code}`, big: from >= to ? `Lap ${from}` : `Laps ${from}–${to}`,
          sub: `Box for ${PW.TYRES[fit].name}s. Stopping now rejoins P${pp.pos}${pp.ahead ? `, ${pp.gapAhead.toFixed(1)}s behind ${pp.ahead.code}` : ""}.${needCompound && lapsLeft >= rem ? " You still need a second compound." : ""}`, pct: 1 - car.wear });
      }
    }
    // battle forecast: catching the car ahead
    const tA = histTrend(car.tel && car.tel.aheadHist);
    if (ahead && !ahead.dnf && !R.sc && car.gapAheadS > 0.5 && car.gapAheadS < 5 && tA < -0.05) {
      const n = Math.max(1, Math.ceil((car.gapAheadS - 0.5) / -tA));
      if (n < rem) out.push({ prio: n <= 3 ? 1 : 2, kind: "battle", title: `Battle forecast · ${car.code}`, big: `~${n} lap${n > 1 ? "s" : ""}`, sub: `to catch ${ahead.name} for P${ahead.pos}. Closing ${(-tA).toFixed(1)}s a lap, gap ${car.gapAheadS.toFixed(1)}s.` });
    }
    // under pressure: car behind closing
    const tB = histTrend(car.tel && car.tel.behindHist);
    if (behind && !behind.dnf && !R.sc && behind.gapAheadS < 3 && tB < -0.05) {
      const n = Math.max(1, Math.ceil((behind.gapAheadS - 0.5) / -tB));
      out.push({ prio: n <= 2 ? 1 : 2, kind: "defend", title: `Under pressure · ${car.code}`, big: `${behind.code} +${behind.gapAheadS.toFixed(1)}s`, sub: `closing ${(-tB).toFixed(1)}s a lap. Within striking range in about ${n} lap${n > 1 ? "s" : ""}. Boost or Push to defend.` });
    }
    // undercut chance on the car ahead
    if (ahead && !ahead.dnf && !ahead.mine && !R.wet && !R.sc && car.gapAheadS < 2.5 && rem > 6 && car.age >= 5 && ahead.age >= 4 && ahead.pitTimer <= 0) {
      const gain = 2.6 * ahead.wear * ahead.wear + (PW.TYRES[ahead.tyre].pace - PW.TYRES[fit].pace);
      const adv = 2 * gain - 0.6 - car.gapAheadS;
      const pct = clamp(0.5 + adv / 2.5, 0.05, 0.9);
      out.push({ prio: pct >= 0.55 ? 1 : 3, kind: "undercut", title: `Undercut on ${ahead.code} · ${car.code}`, big: `${Math.round(pct * 100)}%`, sub: `Fresh ${PW.TYRES[fit].name}s should be about ${Math.max(0, gain).toFixed(1)}s a lap faster than their ${ahead.age}-lap-old ${PW.TYRES[ahead.tyre].name.toLowerCase()}s. Box now to try it.`, pct });
    }
  });
  // whole field: who's fastest right now
  const live = order.filter(c => !c.dnf && !c.finished && c.lastLap && c.pitTimer <= 0);
  if (live.length > 3 && !R.sc) {
    const fast = live.slice().sort((a, b) => a.lastLap - b.lastLap)[0], lead = live[0];
    out.push({ prio: 4, kind: "pace", title: "Fastest on track", big: fast.code, sub: `${fast.lastLap.toFixed(2)}s last lap${fast !== lead && lead.lastLap ? `, ${(lead.lastLap - fast.lastLap).toFixed(1)}s quicker than leader ${lead.code}` : ", and leading"}.` });
  }
  return out.sort((a, b) => a.prio - b.prio);
};

/* ---------- player controls ---------- */
PW.boxCar = (R, car, tyre) => { car.pitReq = tyre; radio(R, `${car.code}: box, box. ${PW.TYRES[tyre].name}s ready.`, "", car); };
PW.cancelBox = (R, car) => { car.pitReq = null; radio(R, `${car.code}: stay out, stay out.`, "", car); };
PW.setMode = (R, car, m) => { car.mode = m; car.autoMode = false; car.lapTime = lapTimeFor(R, car); };
PW.setBoost = (R, car, on) => {
  if (on && (R.sc || car.ers < 5 || car.pitTimer > 0)) return false;
  car.boost = !!on; return true;
};
PW.canSwap = R => {
  const mine = R.cars.filter(c => c.mine && !c.dnf && !c.finished && c.pitTimer <= 0);
  if (mine.length < 2) return null;
  const [a, b] = mine.sort((x, y) => x.pos - y.pos);
  if (b.pos !== a.pos + 1) return null;
  if ((a.dist - b.dist) * b.lapTime > 2.5) return null;
  return { front: a, back: b };
};
PW.swapCars = R => {
  const s = PW.canSwap(R); if (!s) return;
  const fd = s.front.dist; s.front.dist = s.back.dist - 0.0005; s.back.dist = fd + 0.0005;
  s.front.moraleDelta -= 12; s.back.moraleDelta += 4;
  radio(R, `${s.front.code}: let ${s.back.code} through. Team orders. (Not a happy driver.)`, "warn", s.front);
};

/* ---------- headless run (for testing and "sim to end") ---------- */
PW.runToEnd = function (R) { let guard = 0; R.noPause = true; R.decision = null; R.paused = false; while (!R.finished && guard++ < 200000) PW.stepRace(R, 0.25); };

/* ---------- drawing ---------- */
function drawCar(ctx, x, y, heading, L, color, mine) {
  const W = L * 0.42;
  ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
  if (mine) { ctx.shadowColor = "rgba(255,255,255,.7)"; ctx.shadowBlur = 8; }
  ctx.fillStyle = "#111"; // tires
  [[-L * .34, -W * .62], [-L * .34, W * .62], [L * .26, -W * .58], [L * .26, W * .58]].forEach(([tx, ty]) => ctx.fillRect(tx - L * .08, ty - W * .14, L * .16, W * .28));
  ctx.fillStyle = color; // body
  ctx.beginPath(); ctx.moveTo(L * .5, 0); ctx.lineTo(L * .18, -W * .22); ctx.lineTo(-L * .2, -W * .4); ctx.lineTo(-L * .45, -W * .3); ctx.lineTo(-L * .45, W * .3); ctx.lineTo(-L * .2, W * .4); ctx.lineTo(L * .18, W * .22); ctx.closePath(); ctx.fill();
  ctx.fillRect(L * .38, -W * .5, L * .1, W);   // front wing
  ctx.fillRect(-L * .52, -W * .42, L * .1, W * .84); // rear wing
  ctx.shadowBlur = 0;
  ctx.lineWidth = mine ? 1.6 : .8; ctx.strokeStyle = mine ? "#fff" : "rgba(0,0,0,.65)";
  ctx.beginPath(); ctx.moveTo(L * .5, 0); ctx.lineTo(L * .18, -W * .22); ctx.lineTo(-L * .2, -W * .4); ctx.lineTo(-L * .45, -W * .3); ctx.lineTo(-L * .45, W * .3); ctx.lineTo(-L * .2, W * .4); ctx.lineTo(L * .18, W * .22); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.beginPath(); ctx.ellipse(-L * .02, 0, L * .09, W * .12, 0, 0, 7); ctx.fill(); // cockpit
  ctx.restore();
}

PW.drawTrack = function (canvas, R, opts = {}) {
  const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const path = R.path, pad = 28;
  const sc = Math.min((W - pad * 2) / path.w, (H - pad * 2) / path.h);
  const ox = (W - path.w * sc) / 2, oy = (H - path.h * sc) / 2;
  const P = p => [ox + p[0] * sc, oy + p[1] * sc];
  const line = (w, col, dash) => {
    ctx.beginPath(); path.pts.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.setLineDash(dash || []); ctx.lineJoin = "round"; ctx.stroke(); ctx.setLineDash([]);
  };
  const tw = Math.max(5, Math.min(15, sc * 0.022));
  line(tw + 6, "rgba(255,255,255,0.04)");
  line(tw + 2.5, R.wet ? "#5a6b7d" : "#e8e8e8", [5, 5]);
  line(tw, R.wet ? "#26323d" : "#2b2f36");
  line(1, "rgba(255,255,255,0.12)", [8, 10]);
  // start/finish line
  const a = P(PW.pointAt(path, 0)), b = P(PW.pointAt(path, 0.004));
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
  ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang);
  for (let i = -3; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? "#fff" : "#000"; ctx.fillRect(i * tw / 6, j * 3 - 3, tw / 6, 3); }
  ctx.restore();
  if (opts.static) return;
  // cars (back to front so leaders draw on top)
  const order = PW.raceOrder(R).slice().reverse();
  const leader = order[order.length - 1];
  order.forEach(car => {
    if (car.dnf) return;
    let frac = car.dist;
    let q = P(PW.pointAt(path, frac));
    const q2 = P(PW.pointAt(path, frac + 0.0025));
    let heading = Math.atan2(q2[1] - q[1], q2[0] - q[0]);
    if (car.pitTimer > 0) { const n = [Math.cos(ang) * (tw + 10), Math.sin(ang) * (tw + 10)]; q = [a[0] + n[0], a[1] + n[1]]; heading = ang - Math.PI / 2; }
    const r = car.mine ? 7 : 5;
    ctx.globalAlpha = car.finished || car.pitTimer > 0 ? 0.45 : 1;
    if (R.flash[car.id] && R.t - R.flash[car.id] < 3) { ctx.beginPath(); ctx.arc(q[0], q[1], r + 7, 0, 7); ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fill(); }
    drawCar(ctx, q[0], q[1], heading, car.mine ? tw * 1.25 + 7 : tw * 1.0 + 5, car.color, car.mine);
    if (car.mine || car === leader) {
      ctx.font = "700 11px 'Titillium Web', system-ui"; ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      ctx.fillText(car.code, q[0] + r + 3, q[1] - r);
    }
    ctx.globalAlpha = 1;
  });
  // safety car
  if (R.sc && leader && !leader.dnf) {
    const q = P(PW.pointAt(path, leader.dist + 0.012));
    ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.fillStyle = "#ffb000"; ctx.fill();
    ctx.font = "800 10px system-ui"; ctx.fillStyle = "#ffb000"; ctx.fillText("SC", q[0] + 8, q[1] + 4);
  }
};
})();
