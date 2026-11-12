/* Pit Wall — race weekend engine: qualifying, strategy presets, race simulation, track drawing. */
"use strict";
(function () {
const { rand, clamp, gauss, pick } = PW;

/* ---------- shared helpers ---------- */
const BOOST_SPEED = 1.0075;  // about 0.65s a lap faster while boosting
const BOOST_DRAIN = 42;      // % of battery used per lap of boosting
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
PW.createRace = function (grid, plans, wetStart, qualiMode, setup, wx, bonus) {
  bonus = bonus || {};
  const S = PW.state(), c = PW.circuit();
  const R = {
    c, path: PW.trackPath(c.shape), laps: c.laps, wet: !!wetStart, everWet: !!wetStart,
    t: 0, sc: null, scCount: 0, leaderLap: 0, finished: false, leaderDone: false,
    radio: [], events: [], flash: {}, speed: 1, paused: false, damageCost: 0, fastest: null,
    wx: (wx || PW.weatherPlan(c, wetStart)).map(e => ({ ...e })), forecast: null, banner: null, lapPos: [], decision: null, autoPause: true, noPause: false,
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
      moraleDelta: 0, pos: i + 1, startPos: i + 1, ers: 100, boost: false,
      wearMul: team.player ? (bonus.wearMul || 1) : 1, failMul: team.player ? (bonus.failMul || 1) : 1, perfBonus: team.player ? (bonus.perf || 0) : 0,
    };
  });
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
  t += 0.045 * Math.max(0, R.laps - Math.max(0, car.lapIdx));
  if (car.mode === "push") t -= 0.38; else if (car.mode === "save") t += 0.45;
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
  return w * PW.SETUPS[car.setup || "bal"].wear * (car.wearMul || 1);
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

function banner(R, text, kind) {
  R.banner = { text, kind: kind || "", at: (typeof performance !== "undefined" ? performance.now() : 0) };
}
PW.banner = banner;

/* ---------- decision moments: pause so the player can make the call ---------- */
function decide(R, kind, title, text, suggest) {
  if (!R.autoPause || R.noPause || !R.started || R.decision || R.leaderDone) return;
  const mine = R.cars.filter(c => c.mine && !c.dnf && !c.finished);
  if (!mine.length) return;
  R.decision = { kind, title, text, suggest: suggest || {}, at: R.t };
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
      if (changed && car.lapIdx >= 4) banner(R, `Fastest lap: ${car.name} ${lt.toFixed(2)}s`, "purple");
    }
  }
  car.age++; car.wear += wearPerLap(R, car);
  const isLeader = R.cars.filter(x => !x.dnf).every(x => x === car || x.dist <= car.dist);
  if (isLeader && car.lapIdx > R.leaderLap && !R.leaderDone) leaderLap(R, car);

  // finish
  if (car.lapIdx >= R.laps || R.leaderDone) {
    if (!R.leaderDone) { R.leaderDone = true; radio(R, `Chequered flag! ${car.name} wins.`, "flag"); banner(R, `🏁 ${car.name} wins at ${R.c.name}!`, "flag"); }
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
  const fail = (100 - car.rel) * 0.00007 * (car.mode === "push" ? 1.6 : 1) * car.strain * (car.failMul || 1);
  const crash = 0.0004 + (100 - car.d.consistency) * 0.00002 + (R.wet ? (car.tyre === "W" ? 0.0015 : 0.012) : 0) + (car.mode === "push" ? 0.0015 : 0) + (car.wear > 1.1 ? 0.02 : 0);
  if (Math.random() < fail) {
    car.dnf = pick(["Engine", "Gearbox", "Hydraulics", "Power unit", "Brakes", "Electrics"]);
    radio(R, car.mine ? `${car.code}: we have a problem. ${car.dnf} failure. Stop the car.` : `${car.name} (${car.teamObj.short}) is out: ${car.dnf.toLowerCase()} failure.`, car.mine ? "bad" : "", car);
    if (car.mine || car.pos <= 8) banner(R, `Retirement: ${car.name} (${car.dnf.toLowerCase()})`, "bad");
    if (Math.random() < 0.25) startSC(R, "Stopped car on track");
    return;
  }
  if (Math.random() < crash) {
    car.dnf = "Crash";
    if (car.mine) R.damageCost += rand(1, 2.5);
    radio(R, car.mine ? `${car.code} is in the wall! Are you OK? ... Driver is OK, just shaken.` : `Crash! ${car.name} (${car.teamObj.short}) is out.`, car.mine ? "bad" : "", car);
    banner(R, `Crash! ${car.name} is out`, "bad");
    if (Math.random() < 0.65) startSC(R, "Crash");
    return;
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
  } else tyre = aiPitChoice(R, car);
  if (tyre && R.laps - car.lapIdx >= 1) {
    const p = pitLoss(car);
    car.pitTimer = p.loss; car.tyre = tyre; car.wear = 0; car.age = 0; car.stops++; car.wearWarned = false;
    if (!car.used.includes(tyre)) car.used.push(tyre);
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
  if (car.mine && !car.wearWarned && car.wear > 0.72 && R.laps - car.lapIdx > 3 && !car.pitReq && car.pitTimer <= 0 && !(car.plan[0] && car.plan[0].lap - car.lapIdx <= 1)) {
    car.wearWarned = true;
    decide(R, "tyres", `${car.name}'s tires are fading`, `${Math.round((1 - car.wear) * 100)}% grip left on ${PW.TYRES[car.tyre].name}s with ${R.laps - car.lapIdx} laps to go${car.plan[0] ? `. The plan says box on lap ${car.plan[0].lap}` : ""}. Lap times fall off a cliff when the tires run out. Box now, or save them?`, { [car.id]: R.wet ? "W" : dryFor(R, car) });
  }
  car.lapTime = lapTimeFor(R, car);
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
    if (R.sc.left <= 0) { R.sc = null; radio(R, "Safety car is in this lap. Racing resumes!", "flag"); banner(R, "Green flag. Racing resumes!", "green"); }
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
      if (e.wet) { R.everWet = true; radio(R, "Rain! It's raining now. Track is getting wet.", "rain"); banner(R, "🌧 Rain is falling", "rain"); decide(R, "rain", "It's raining!", "The track is wet. Cars on slick tires are losing seconds a lap and are much more likely to crash.", sug); }
      else { radio(R, "Rain has stopped. Track is drying fast.", "rain"); banner(R, "☀ Track drying", "rain"); decide(R, "dry", "Track is drying", "Wet tires overheat and lose time on a dry track. Time to go back to slicks.", sug); }
    }
  });
  if (car.lapIdx === R.laps - 1) { radio(R, "Final lap!", "flag"); banner(R, "Final lap!", "flag"); }
  R.lapPos.push(Object.fromEntries(PW.raceOrder(R).map((x, i) => [x.id, x.dnf ? null : i + 1])));
}
function startSC(R, why) {
  if (R.sc || R.leaderLap >= R.laps - 2) return;
  R.sc = { left: 3, why }; R.scCount++;
  radio(R, `SAFETY CAR. ${why}. Cheap pit stop window!`, "sc");
  banner(R, `Safety car: ${why.toLowerCase()}`, "sc");
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
  // following, overtaking, safety-car bunching
  const order = live.slice().sort((a, b) => b.dist - a.dist);
  for (let i = 1; i < order.length; i++) {
    const car = order[i], ahead = order[i - 1];
    if (car.pitTimer > 0 || ahead.pitTimer > 0) continue;
    const gapS = (ahead.dist - car.dist) * car.lapTime;
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
    const effCar = car.lapTime / (car.boost ? BOOST_SPEED : 1), effAhead = ahead.lapTime / (ahead.boost ? BOOST_SPEED : 1);
    if (gapS < 0.55 && effCar < effAhead) {
      const delta = effAhead - effCar;
      const pLap = R.c.pass * clamp(0.06 + delta * 0.45, 0, 0.9) * clamp(0.85 + (car.d.racecraft - ahead.d.racecraft) / 60, 0.4, 1.4) * PW.SETUPS[car.setup].pass / PW.SETUPS[ahead.setup].defend * (car.boost ? 1.5 : 1) / (ahead.boost ? 1.35 : 1);
      if (Math.random() < pLap / car.lapTime * dt * 2.2) {
        car.dist = ahead.dist + 0.0012; ahead.dist -= 0.0006;
        R.flash[car.id] = R.t;
        if (car.mine || ahead.mine) R.events.push({ t: R.t, text: `${car.code} passes ${ahead.code}` });
        const forPos = ahead.pos;
        if (forPos <= 3 || car.mine || ahead.mine) banner(R, `${car.name} passes ${ahead.name}${forPos <= 10 ? ` for P${forPos}` : ""}`, car.mine ? "good" : ahead.mine ? "bad" : "");
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
    classified: order.map(c => ({ id: c.id, code: c.code, name: c.name, team: c.team, color: c.color, dnf: c.dnf, mine: c.mine, grid: c.startPos, stops: c.stops, penalty: c.penalty, moraleDelta: c.moraleDelta, best: c.best, gap: PW.gapText(R, c, order[0]) })),
    fastest: R.fastest, damageCost: +R.damageCost.toFixed(2), sc: R.scCount, wet: R.everWet,
    lapChart: { laps: R.lapPos, cars: R.cars.map(c => ({ id: c.id, code: c.code, color: c.color, mine: c.mine })) },
  };
};

/* ---------- player controls ---------- */
PW.boxCar = (R, car, tyre) => { car.pitReq = tyre; radio(R, `${car.code}: box, box. ${PW.TYRES[tyre].name}s ready.`, "", car); };
PW.cancelBox = (R, car) => { car.pitReq = null; radio(R, `${car.code}: stay out, stay out.`, "", car); };
PW.setMode = (R, car, m) => { car.mode = m; car.lapTime = lapTimeFor(R, car); };
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
