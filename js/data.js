/* Pit Wall — static data: teams, drivers, staff, circuits, research, sponsors.
   Everything here is fictional. */
"use strict";
const PW = window.PW = window.PW || {};

/* ---------- helpers ---------- */
PW.rand = (a, b) => a + Math.random() * (b - a);
PW.randi = (a, b) => Math.floor(PW.rand(a, b + 1));
PW.pick = arr => arr[Math.floor(Math.random() * arr.length)];
PW.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
PW.gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
PW.money = m => (m < 0 ? "−" : "") + "$" + Math.abs(m).toFixed(Math.abs(m) >= 10 ? 1 : 2).replace(/\.?0+$/, "") + "M";
PW.mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ---------- teams ---------- */
// tier sets starting car strength and how fast the team develops
PW.TEAMS = [
  { id: "apx", name: "Apex Velocity",      short: "APX", color: "#e8343f", tier: 1.00, dev: 1.15 },
  { id: "nst", name: "Northstar GP",       short: "NST", color: "#2f80ed", tier: 0.97, dev: 1.10 },
  { id: "kes", name: "Kestrel Motorsport", short: "KES", color: "#ff8a1f", tier: 0.94, dev: 1.05 },
  { id: "vol", name: "Volta Racing",       short: "VOL", color: "#00c9a7", tier: 0.89, dev: 0.95 },
  { id: "irb", name: "Ironbridge",         short: "IRB", color: "#a7b4c2", tier: 0.87, dev: 0.90 },
  { id: "sol", name: "Solaris",            short: "SOL", color: "#ffd23f", tier: 0.84, dev: 0.85 },
  { id: "vio", name: "Corsa Viola",        short: "VIO", color: "#a06cf0", tier: 0.82, dev: 0.80 },
  { id: "hal", name: "Halcyon",            short: "HAL", color: "#3fb950", tier: 0.80, dev: 0.75 },
  { id: "mer", name: "Meridian",           short: "MER", color: "#f05aa0", tier: 0.78, dev: 0.70 },
];
PW.PLAYER_COLORS = ["#21d4fd", "#ffffff", "#ff5e3a", "#c6ff00", "#ffb000", "#7c4dff"];

/* ---------- drivers ---------- */
// name, code, age, pace, racecraft, consistency, tyre, wet, team (or "" for free agent)
PW.DRIVERS = [
  ["Luca Marenzi", "MAR", 29, 93, 88, 86, 84, 87, "apx"], ["Theo Brandt", "BRT", 31, 87, 85, 88, 86, 80, "apx"],
  ["Kai Okafor", "OKA", 24, 91, 86, 82, 80, 85, "nst"], ["Elias Lund", "LUN", 34, 85, 90, 89, 87, 83, "nst"],
  ["Mateo Vidal", "VID", 26, 88, 87, 83, 85, 84, "kes"], ["Sam Whitlock", "WHI", 22, 84, 79, 77, 80, 82, "kes"],
  ["Yuki Arima", "ARI", 27, 85, 83, 85, 82, 80, "vol"], ["Noor Haddad", "HAD", 25, 83, 80, 82, 84, 78, "vol"],
  ["Felix Gauthier", "GAU", 33, 82, 86, 87, 85, 81, "irb"], ["Ruben Castillo", "CAS", 28, 81, 80, 80, 79, 77, "irb"],
  ["Anya Petrova", "PET", 23, 83, 78, 76, 77, 84, "sol"], ["Jonas Weber", "WEB", 30, 79, 81, 83, 82, 75, "sol"],
  ["Diego Sandoval", "SAN", 21, 80, 75, 72, 74, 79, "vio"], ["Hugo Lefevre", "LEF", 35, 77, 84, 86, 83, 80, "vio"],
  ["Ravi Menon", "MEN", 26, 79, 78, 79, 80, 76, "hal"], ["Oscar Lindqvist", "LIN", 24, 78, 77, 75, 76, 78, "hal"],
  ["Tomas Novak", "NOV", 29, 77, 79, 80, 78, 74, "mer"], ["Leo Hartmann", "HAR", 20, 78, 72, 70, 73, 76, "mer"],
  ["Callum Reid", "REI", 27, 76, 75, 78, 77, 75, "you"], ["Marco Bellini", "BEL", 31, 75, 78, 80, 79, 77, "you"],
  ["Aiden Shaw", "SHA", 22, 74, 73, 72, 75, 77, "you-r"],
  ["Ines Moreau", "MOR", 19, 82, 72, 68, 71, 80, ""], ["Daniel Kowalski", "KOW", 36, 80, 85, 87, 84, 82, ""],
  ["Sofia Reyes", "REY", 25, 81, 79, 78, 80, 83, ""], ["Max Keller", "KEL", 28, 76, 77, 79, 74, 72, ""],
  ["Pavel Ivanov", "IVA", 24, 74, 73, 72, 76, 79, ""], ["Ethan Cole", "COL", 18, 79, 70, 65, 70, 76, ""],
  ["Rafael Duarte", "DUA", 30, 78, 80, 79, 77, 81, ""], ["Mika Salonen", "SAL", 23, 77, 76, 74, 78, 80, ""],
];
PW.ovr = d => Math.round((d.pace * 3 + d.racecraft + d.consistency + d.tyre + d.wet) / 7);
PW.driverSalary = d => +Math.max(0.4, Math.pow(Math.max(0, PW.ovr(d) - 68) / 24, 2.1) * 18 * (d.age <= 22 ? 0.75 : 1)).toFixed(2);

PW.FIRST = ["Alex", "Bruno", "Chen", "Dario", "Emil", "Finn", "Gabriel", "Hana", "Ivo", "Jun", "Kofi", "Lena", "Marek", "Nico", "Olli", "Priya", "Quinn", "Rosa", "Sven", "Tariq", "Uma", "Viktor", "Wren", "Ximena", "Yara", "Zane"];
PW.LAST = ["Achterberg", "Bianchi", "Carvalho", "Dubois", "Eriksen", "Ferreira", "Gallo", "Hoshino", "Iqbal", "Jansen", "Kurz", "Laine", "Moretti", "Nakamura", "Ortega", "Pires", "Quist", "Rossi", "Silva", "Takeda", "Ulrich", "Varga", "Wolff", "Yilmaz", "Zielinski"];
PW.newName = () => PW.pick(PW.FIRST) + " " + PW.pick(PW.LAST);
PW.FEMALE_FIRST = ["Hana", "Lena", "Priya", "Rosa", "Uma", "Ximena", "Yara"];
// AI-generated portraits (Gemini) for the starting roster, plus spare faces for rookies
PW.PORTRAITS = ["MAR", "BRT", "OKA", "LUN", "VID", "WHI", "ARI", "HAD", "GAU", "CAS", "PET", "WEB", "SAN", "LEF", "MEN", "LIN", "NOV", "HAR", "REI", "BEL", "SHA", "MOR", "KOW", "REY", "KEL", "IVA", "COL", "DUA", "SAL"];
PW.ROOKIE_FACES = { m: ["rookie-m1", "rookie-m2"], f: ["rookie-f1"] };
PW.portrait = d => d.face ? `img/drivers/${d.face}.webp` : PW.PORTRAITS.includes(d.id) ? `img/drivers/${d.id}.webp` : null;
// AI-generated car renders (ChatGPT): one per rival team, one per player color
PW.carImg = team => team.player ? `img/cars/you-${team.color.replace("#", "")}.webp` : `img/cars/${team.id}.webp`;

/* ---------- staff ---------- */
PW.ROLES = [
  { id: "td",   name: "Technical Director", perk: "Faster research. Rated 80+ unlocks a third research slot. Runs chassis and tire projects." },
  { id: "aero", name: "Head of Aero",       perk: "Bigger and safer aero gains." },
  { id: "eng",  name: "Head of Engines",    perk: "Bigger and safer engine and reliability gains." },
  { id: "re",   name: "Race Engineer",      perk: "Sharper strategy calls and radio advice. Small boost to driver pace." },
  { id: "pit",  name: "Pit Crew Chief",     perk: "Faster pit stops, fewer fumbles." },
  { id: "com",  name: "Commercial Director",perk: "Richer sponsor offers. Rated 80+ unlocks a third sponsor slot." },
];
PW.staffSalary = r => +Math.max(0.3, Math.pow(Math.max(0, r - 40), 2) / 650).toFixed(2);

/* ---------- research ---------- */
PW.AREAS = [
  { id: "aero",  name: "Aero",        head: "aero", desc: "Downforce. Wins on twisty circuits." },
  { id: "engine",name: "Engine",      head: "eng",  desc: "Power. Wins on fast circuits." },
  { id: "chassis",name:"Chassis",     head: "td",   desc: "Mechanical grip. Wins on street and bumpy circuits." },
  { id: "rel",   name: "Reliability", head: "eng",  desc: "Fewer breakdowns, safer to push." },
  { id: "tyre",  name: "Tire Wear",   head: "td",   desc: "Tires last longer, so one-stop strategies work." },
];
// [tier] -> {safe, bold}; cost $M, races, gain, risk
PW.PROJECTS = [
  { safe: { cost: 4,  races: 2, gain: 4 }, bold: { cost: 6,  races: 3, gain: 8,  risk: .25 } },
  { safe: { cost: 7,  races: 3, gain: 6 }, bold: { cost: 10, races: 4, gain: 11, risk: .30 } },
  { safe: { cost: 11, races: 4, gain: 7 }, bold: { cost: 15, races: 5, gain: 14, risk: .35 } },
];
PW.REFINE = { cost: 8, races: 3, gain: 3 };
PW.PROJECT_NAMES = {
  aero:   [["Floor edge tidy-up", "Radical sidepod concept"], ["New front wing family", "Twin-element beam wing"], ["Underfloor redesign", "Full aero philosophy change"]],
  engine: [["Combustion map update", "High-compression heads"], ["Turbo efficiency package", "Split-turbo layout"], ["Energy recovery upgrade", "All-new power unit"]],
  chassis:[["Suspension geometry tweak", "Pull-rod front suspension"], ["Lighter monocoque", "Active-style ride control"], ["Stiffer gearbox casing", "Carbon gearbox and rear end"]],
  rel:    [["Better cooling ducts", "Lifed-part reduction"], ["Gearbox durability run", "New hydraulic system"], ["Quality control program", "Full dyno endurance program"]],
  tyre:   [["Brake temperature control", "Rim heat-transfer concept"], ["Softer rear suspension", "Tire-friendly kinematics"], ["Thermal model overhaul", "Rear-end stability package"]],
};
PW.DEV_CAP = 70; // $M research spend allowed per season

/* ---------- sponsors ---------- */
PW.SPONSOR_NAMES = ["Quantix Cloud", "Halo Energy Drink", "Brightwater Bank", "Torq Tools", "Lumen Watches", "Northwind Air", "Cobalt Telecom", "Vireo Coffee", "Stratus Insurance", "Peak Outdoor", "Nimbus Gaming", "Atlas Freight", "Ember Fuels", "Orbit Payments", "Kinetic Sportswear", "Solace Hotels"];

/* ---------- circuits ---------- */
// aero/power/mech weights sum ~1. wear: tire wear factor. rain: chance of rain. pass: overtaking ease. base: lap seconds.
PW.CIRCUITS = [
  { name: "Sakhir",          country: "Bahrain",       shape: "bh-2002", laps: 24, base: 92,  aero: .35, power: .35, mech: .30, wear: 1.2,  rain: .02, pass: 1.2,  tag: "Season opener under the lights. Hard on rear tires" },
  { name: "Spielberg",       country: "Austria",       shape: "at-1969", laps: 26, base: 66,  aero: .25, power: .50, mech: .25, wear: .9,   rain: .30, pass: 1.3,  tag: "Short, fast and rain-prone, with big braking zones" },
  { name: "Monaco",          country: "Monaco",        shape: "mc-1929", laps: 26, base: 74,  aero: .30, power: .10, mech: .60, wear: .75,  rain: .10, pass: .35,  tag: "Street circuit. Qualifying is everything" },
  { name: "Barcelona",       country: "Spain",         shape: "es-1991", laps: 24, base: 78,  aero: .50, power: .25, mech: .25, wear: 1.3,  rain: .05, pass: .8,   tag: "Aero test track that eats tires. Two stops likely" },
  { name: "Silverstone",     country: "Great Britain", shape: "gb-1948", laps: 22, base: 88,  aero: .55, power: .25, mech: .20, wear: 1.15, rain: .40, pass: 1.05, tag: "Fast sweepers and unpredictable weather" },
  { name: "Monza",           country: "Italy",         shape: "it-1922", laps: 22, base: 82,  aero: .15, power: .65, mech: .20, wear: .85,  rain: .15, pass: 1.4,  tag: "Temple of speed. Engine power wins here" },
  { name: "Suzuka",          country: "Japan",         shape: "jp-1962", laps: 22, base: 92,  aero: .50, power: .25, mech: .25, wear: 1.1,  rain: .35, pass: .8,   tag: "The figure-eight. A true driver's track" },
  { name: "Mexico City",     country: "Mexico",        shape: "mx-1962", laps: 24, base: 79,  aero: .35, power: .45, mech: .20, wear: .95,  rain: .15, pass: 1.1,  tag: "Thin air at altitude and a very long straight" },
  { name: "Austin",          country: "United States", shape: "us-2012", laps: 22, base: 97,  aero: .35, power: .30, mech: .35, wear: 1.15, rain: .20, pass: 1.25, tag: "Bumpy, abrasive, lots of overtaking" },
  { name: "Singapore",       country: "Singapore",     shape: "sg-2008", laps: 22, base: 95,  aero: .35, power: .15, mech: .50, wear: 1.05, rain: .25, pass: .55,  tag: "Night street race. Hot, bumpy, safety cars likely" },
  { name: "Spa",             country: "Belgium",       shape: "be-1925", laps: 18, base: 106, aero: .40, power: .40, mech: .20, wear: 1.05, rain: .45, pass: 1.2,  tag: "Long, fast classic where it can rain on one end only" },
  { name: "Abu Dhabi",       country: "UAE",           shape: "ae-2009", laps: 24, base: 86,  aero: .35, power: .35, mech: .30, wear: 1.0,  rain: .02, pass: 1.0,  tag: "Twilight season finale" },
];
PW.POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
PW.PRIZE = [62, 55, 49, 44, 39, 35, 31, 27, 23, 19]; // $M by constructors' position

/* ---------- tires ---------- */
PW.TYRES = {
  S: { name: "Soft",   color: "#ff3b3b", pace: -0.75, life: 11 },
  M: { name: "Medium", color: "#ffd23f", pace: 0,     life: 18 },
  H: { name: "Hard",   color: "#f2f2f2", pace: 0.55,  life: 28 },
  W: { name: "Wet",    color: "#2f9bff", pace: 0,     life: 30 },
};

/* ---------- track shapes ---------- */
// Build a smooth closed circuit from a seed: jittered points around a stretched
// circle, a few pushed inward to make hairpins, then Catmull-Rom smoothing.
PW.trackPath = function (seed) {
  if (typeof seed === "string" && PW.TRACK_SHAPES && PW.TRACK_SHAPES[seed]) return PW.shapePath(PW.TRACK_SHAPES[seed]);
  const r = PW.mulberry(seed * 9973 + 1);
  const n = 9 + Math.floor(r() * 5);
  const sx = 1 + r() * 0.7, sy = 0.65 + r() * 0.25;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - .5) * 0.35;
    let rad = 0.55 + r() * 0.45;
    if (r() < 0.28) rad *= 0.45 + r() * 0.2; // hairpin/infield
    pts.push([Math.cos(a) * rad * sx, Math.sin(a) * rad * sy]);
  }
  const out = [];
  const N = pts.length, steps = 24;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  // normalise to 0..1 box, keep aspect
  const xs = out.map(p => p[0]), ys = out.map(p => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const sc = 1 / Math.max(maxx - minx, maxy - miny);
  const pts2 = out.map(p => [(p[0] - minx) * sc, (p[1] - miny) * sc]);
  // cumulative length for position lookup
  const cum = [0];
  for (let i = 1; i <= pts2.length; i++) { const a = pts2[i - 1], b = pts2[i % pts2.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return { pts: pts2, cum, len: cum[cum.length - 1], w: (maxx - minx) * sc, h: (maxy - miny) * sc };
};
PW.shapePath = function (raw) {
  const pts = raw.map(p => [p[0], p[1]]);
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { pts, cum, len: cum[cum.length - 1], w: Math.max(...xs), h: Math.max(...ys) };
};
PW.pointAt = function (path, frac) {
  frac = ((frac % 1) + 1) % 1;
  const d = frac * path.len, cum = path.cum;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const a = path.pts[lo % path.pts.length], b = path.pts[(lo + 1) % path.pts.length];
  const t = (d - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};
