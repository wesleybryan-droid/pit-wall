/* Pit Wall — Daily Grand Prix: one seeded race a day, the same start for everyone,
   kept apart from the career save, with a spoiler-free share card. */
"use strict";
(function () {
const KEY = "pitwall-daily";
const EPOCH = new Date(2026, 10, 1); // Daily #1 = 1 Nov 2026 (local time)
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
const store = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
const pad = n => String(n).padStart(2, "0");
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

PW.dailyInfo = function (date) {
  const d = date || new Date();
  const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = Math.round((mid - EPOCH) / 86400000) + 1;
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const r = PW.mulberry(seed * 31 + 7);
  const circuitIdx = Math.floor(r() * PW.CIRCUITS.length);
  return { n, seed, key: dayKey(mid), circuitIdx, circuit: PW.CIRCUITS[circuitIdx], result: load()[dayKey(mid)] || null };
};
PW.dailyStreak = function () {
  const all = load(); let streak = 0;
  const d = new Date();
  if (!all[dayKey(d)]) d.setDate(d.getDate() - 1); // today not raced yet: count up to yesterday
  while (all[dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
};

let career = null, realRandom = null, active = null;
PW.dailyActive = () => active;
PW.startDaily = function () {
  if (active) return;
  const info = PW.dailyInfo();
  career = PW.state();
  realRandom = Math.random;
  Math.random = PW.mulberry(info.seed); // same rolls for everyone, until the player's choices diverge
  PW.newCareer("Daily Racing", "#ffb000", { daily: true });
  const S = PW.state();
  S.round = info.circuitIdx;
  // everyone gets the same midfield car and staff for the day
  const r = PW.mulberry(info.seed * 13 + 1);
  PW.AREAS.forEach(a => S.teams.you.car[a.id] = Math.round(72 + r() * 6));
  Object.values(S.staff).forEach(st => { st.rating = 62 + Math.floor(r() * 12); });
  S.news = [];
  active = info;
  PW.ui.startWeekend({ daily: info });
};
PW.endDaily = function () {
  if (!active) return;
  if (realRandom) Math.random = realRandom;
  PW.setState(career); career = null; active = null; realRandom = null;
  PW.ui.reset();
};
PW.retryDaily = function () { PW.endDaily(); PW.startDaily(); };

/* ---------- results ---------- */
PW.dailyRecord = function (res, info) {
  const mine = res.classified.map((e, i) => ({ ...e, pos: i + 1 })).filter(e => e.mine);
  const finished = mine.filter(e => !e.dnf).sort((a, b) => a.pos - b.pos);
  const best = finished[0] || mine[0];
  const entry = {
    pos: best.dnf ? null : best.pos, grid: best.grid, code: best.code, dnf: best.dnf || null,
    stints: best.stints || [], wet: !!res.wet, circuit: info.circuit.name, n: info.n,
    team: mine.filter(e => !e.dnf && e.pos <= 10).length,
  };
  const all = load(), prev = all[info.key];
  const official = !prev;
  if (official) { entry.attempts = 1; all[info.key] = entry; }
  else { prev.attempts = (prev.attempts || 1) + 1; }
  store(all);
  return { entry, official, officialEntry: all[info.key] };
};
const TYRE_EMOJI = { S: "🔴", M: "🟡", H: "⚪", W: "🔵" };
PW.dailyShareText = function (e) {
  const moved = e.pos ? e.grid - e.pos : 0;
  const arrow = !e.pos ? "" : moved > 0 ? ` ⬆${moved}` : moved < 0 ? ` ⬇${-moved}` : " ➡";
  const res = e.pos ? `P${e.pos} from P${e.grid}${arrow}` : `DNF from P${e.grid} 💥`;
  const podium = e.pos === 1 ? " 🏆" : e.pos && e.pos <= 3 ? " 🍾" : "";
  const streak = PW.dailyStreak();
  return [
    `Pit Wall Daily #${e.n} 🏁`,
    `${e.circuit}${e.wet ? " 🌧" : ""}`,
    `${res}${podium}`,
    `Strategy ${e.stints.map(t => TYRE_EMOJI[t] || "⚫").join("")}`,
    streak > 1 ? `🔥 ${streak}-day streak` : null,
    location.origin + location.pathname,
  ].filter(Boolean).join("\n");
};
PW.msToTomorrow = function () {
  const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  return t - n;
};
})();
