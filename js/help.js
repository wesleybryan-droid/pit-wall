/* Pit Wall — first-time walkthrough (coach marks) and the How to Play guide. */
"use strict";
(function () {
const KEY = "pitwall-tutorial";
const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
const set = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };
const teamName = () => (PW.state() ? PW.state().teams.you.name : "your team");

/* ---------- walkthrough steps ---------- */
// screen: which screen the step belongs to. sel: element to spotlight.
// next: optional {label, go} to move to another screen. race: pause the race while showing.
const STEPS = [
  { screen: "hq", sel: ".hero", title: "Welcome to the pit wall", text: () => `You run <b>${esc(teamName())}</b>, the slowest team on the grid. This card is your next race. Each circuit rewards something different: check what it <b>favors</b>, the <b>tire wear</b>, the <b>rain chance</b> and how hard <b>overtaking</b> is.` },
  { screen: "hq", sel: ".cmp", title: "Where you stand", text: "This chart compares every car at this circuit. You start at the bottom. Upgrades close the gap, and each rating point is worth about 0.07 seconds a lap." },
  { screen: "hq", sel: "#status", title: "Money and the board", text: "Sponsors and TV money come in every race, and salaries and running costs go out. If cash falls below −$10M, the bank closes the team. The <b>board</b> also sets a target position each season. Hit it for a bonus. Miss it badly and they'll fire you." },
  { screen: "hq", sel: '.tab[data-v="factory"]', title: "Upgrade the car", text: "The Factory is where races are really won. Let's look.", next: { label: "Open the Factory ›", go: () => PW.ui.setTab("factory") } },
  { screen: "factory", sel: ".areas", title: "Research projects", text: "Each area has three tiers of upgrades. <b>Safe</b> projects always deliver. <b>Bold</b> ones give roughly double the gain but can fail in testing and waste the money. Match your upgrades to the circuits ahead: Aero for twisty tracks, Engine for fast ones." },
  { screen: "factory", sel: ".slots", title: "Slots and the budget cap", text: "You can run two projects at once (three with a Technical Director rated 80+). Projects finish after the number of races shown. A season-wide development cap limits total spending. <b>Tip:</b> start a project before your first race.", next: { label: "Open the Team ›", go: () => PW.ui.setTab("team") } },
  { screen: "team", sel: ".g3", title: "Your drivers", text: "<b>Pace</b> is raw speed, <b>Craft</b> is overtaking and defending, <b>Consistency</b> avoids mistakes, <b>Tires</b> makes them last, and <b>Wet</b> is rain skill. Morale goes up with good results and down when they lose to their teammate or you use team orders. You can sign better drivers from the market below." },
  { screen: "team", sel: "#staff", title: "Key staff", text: "Every staff member changes the game. A better Race Engineer gives smarter strategy calls, a better Pit Crew Chief gives faster stops, and so on. Hire upgrades when you can afford them.", next: { label: "Open Sponsors ›", go: () => PW.ui.setTab("sponsors") } },
  { screen: "sponsors", sel: ".page", title: "Sponsors", text: "Sponsors pay every race, plus a bonus for hitting their goal. You have two slots (three with a Commercial Director rated 80+). New offers arrive every three races, and better results bring bigger deals.", next: { label: "Back to HQ ›", go: () => PW.ui.setTab("hq") } },
  { screen: "hq", sel: '[data-a="weekend"]', title: "Race weekend", text: "When you're ready, start the race weekend. The walkthrough will pick up there.", done: "Got it" },
  { screen: "practice", sel: ".choice", title: "Friday practice", text: "Every weekend starts with practice. You have time for <b>two programs</b>: setup work, tire long runs, qualifying sims or reliability checks. Each gives a different edge, so pick what this circuit needs." },
  { screen: "quali", sel: ".choice", title: "Car setup", text: "First pick the setup. <b>Low downforce</b> suits fast tracks like Monza. <b>High downforce</b> suits twisty ones like Monaco and is kinder to tires. Your engineer marks their pick, but if your engine is strong, low downforce can still pay off." },
  { screen: "quali", sel: ".qmode", title: "Qualifying", text: "Pick an engine mode, then run qualifying. <b>Max attack</b> is a little faster but strains the engine for the race. Check the <b>weather radar</b> below: if rain is likely, plan for it." },
  { screen: "strategy", sel: ".gridlist", title: "The starting grid", text: "Here's where everyone starts, with the gap to pole position. Your cars are outlined." },
  { screen: "strategy", sel: ".card.team .choice", title: "Choose a strategy", text: "Soft tires are fast but wear out quickly. Mediums are balanced. Hards last longest. Wets are only for rain. Your engineer marks their pick. In a dry race you <b>must use two different compounds</b> or get a 20-second penalty. Pick a plan for each car, then hit <b>Lights out</b>." },
  { screen: "race", sel: ".mapwrap", race: true, title: "The race is on", text: "Each car is drawn in its team color. Yours glow white and show their names. 1× is about 6 seconds a lap. Speed up with the buttons at the top, or pause with the space bar. With <b>Auto-pause</b> on, the race stops by itself whenever there's a call to make." },
  { screen: "race", sel: ".tower", race: true, title: "Timing tower", text: "Positions, the gap to the leader and each car's current tire. PIT means a car is stopping, and OUT means it has retired." },
  { screen: "race", sel: ".carctl", race: true, title: "Your controls", text: "The <b>tire bar</b> shows grip left. <b>Push</b> is faster but wears tires and the engine, and <b>Save tires</b> makes them last. Tap a tire under <b>Box for</b> to pit at the end of the lap. <b>⚡ Boost</b> uses the battery for extra speed to attack or defend. It recharges as you drive, faster in Save mode." },
  { screen: "race", sel: ".tele", race: true, title: "Live telemetry", text: "This is your pit-wall feed. <b>Tires</b> work best at 95-105°C. <b>Brakes</b> and the <b>engine</b> overheat when you push or sit in another car's dirty air, and too hot means failures. <b>Fuel</b> shows laps spare (or short). Below that are the gaps ahead and behind and how fast they're changing, plus where you'd rejoin if you boxed now. When something needs a call, the race pauses for you." },
  { screen: "race", sel: ".radio", race: true, title: "Listen to the radio", text: "Your engineer calls out worn tires, rain and safety cars. A <b>safety car</b> bunches the field, which makes it the cheapest time to pit. When rain arrives, box for wets fast.", next: { label: "Start racing ›", go: () => { const R = PW.ui.R; if (R) R.paused = !!R.decision; } } },
  { screen: "results", sel: ".podium", title: "After the race", text: "Points, prize money, finished research and driver morale all update here. That's the whole loop: upgrade, hire, race, repeat. Get from the back of the grid to the championship. Good luck!", done: "Let's go" },
];
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------- coach mark UI ---------- */
const ring = document.createElement("div"); ring.className = "coach-ring";
const card = document.createElement("div"); card.className = "coach-card";
document.body.append(ring, card);
let showing = -1, hiddenUntilScreen = null, lastScrolled = -1;

function idx() { const v = get(); return v === null || v === "done" ? -1 : +v; }
PW.tutorialStart = on => { set(on ? "0" : "done"); hiddenUntilScreen = null; };
PW.tutorialReplay = () => { set("0"); hiddenUntilScreen = null; PW.ui.setTab("hq"); };

function hide() { ring.style.display = "none"; card.style.display = "none"; showing = -1; }
function finish() { set("done"); hide(); }
function advance() {
  const i = idx(), st = STEPS[i];
  set(String(i + 1 >= STEPS.length ? "done" : i + 1));
  hide();
  if (st && st.next && st.next.go) st.next.go();
  else if (st && st.done) hiddenUntilScreen = st.screen; // wait for the player to act
  check();
}
function check() {
  const i = idx();
  if (i < 0 || i >= STEPS.length) { if (i >= STEPS.length) set("done"); return hide(); }
  let st = STEPS[i];
  if (PW.screen !== st.screen) {
    // the player moved on by themselves: follow them if it's the next screen in the tour
    let k = i + 1; while (k < STEPS.length && STEPS[k].screen === st.screen) k++;
    if (k < STEPS.length && STEPS[k].screen === PW.screen) { set(String(k)); return check(); }
    hide(); return;
  }
  if (hiddenUntilScreen === st.screen && st.screen === "hq" && i > 0 && STEPS[i - 1].done) return;
  hiddenUntilScreen = null;
  const R = PW.ui.R;
  if (st.race && (!R || !R.started)) { hide(); return; }
  const el = document.querySelector(st.sel);
  if (!el) { hide(); return; }
  if (st.race && R && showing !== i) R.paused = true;
  if (showing !== i) {
    showing = i;
    const text = typeof st.text === "function" ? st.text() : st.text;
    card.innerHTML = `<div class="coach-step">Walkthrough ${i + 1} of ${STEPS.length}</div><h4>${st.title}</h4><p>${text}</p>
      <div class="coach-btns"><button class="btn sm ghost" data-c="skip">Skip walkthrough</button><button class="btn sm primary" data-c="next">${st.next ? st.next.label : st.done || "Next ›"}</button></div>`;
    if (lastScrolled !== i) { lastScrolled = i; el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
  place(el);
}
function place(el) {
  const r = el.getBoundingClientRect(), pad = 6, vw = window.innerWidth, vh = window.innerHeight;
  ring.style.display = "block";
  ring.style.left = (r.left - pad) + "px"; ring.style.top = (r.top - pad) + "px";
  ring.style.width = (r.width + pad * 2) + "px"; ring.style.height = (r.height + pad * 2) + "px";
  card.style.display = "block";
  const cw = Math.min(340, vw - 32); card.style.width = cw + "px";
  const ch = card.offsetHeight;
  let top = r.bottom + 14;
  if (top + ch > vh - 12) top = r.top - ch - 14;
  if (top < 12) top = Math.max(12, Math.min(vh - ch - 12, r.top + 12));
  let left = r.left + r.width / 2 - cw / 2;
  left = Math.max(16, Math.min(vw - cw - 16, left));
  card.style.top = top + "px"; card.style.left = left + "px";
}
card.addEventListener("click", e => {
  const b = e.target.closest("[data-c]"); if (!b) return;
  if (b.dataset.c === "skip") { const R = PW.ui.R; if (R) R.paused = !!R.decision; finish(); }
  else advance();
});
PW.afterRender = () => { showing = -1; check(); };
setInterval(() => { if (idx() >= 0) check(); }, 300);
window.addEventListener("resize", () => { showing = -1; check(); });

/* ---------- How to play guide ---------- */
const GUIDE = `
<h2>How to play Pit Wall</h2>
<p class="muted">You're the team principal of the slowest team on the grid. You never drive. You decide where the money goes, who drives, and what happens on race day. Turn the team into champions.</p>
<h3>Between races</h3>
<ul>
<li><b>HQ:</b> your next circuit, how your car compares there, your money and the paddock news. Press <b>Go to race weekend</b> when you're ready.</li>
<li><b>Factory:</b> start research projects to improve Aero, Engine, Chassis, Reliability and Tire Wear. Safe projects always work. Bold projects gain more but can fail. Rivals upgrade every race, so keep your slots busy.</li>
<li><b>Team:</b> sign drivers and hire better staff. The Race Engineer, Pit Crew Chief and Technical Director make the biggest difference early on.</li>
<li><b>Sponsors:</b> fill your slots. Each deal pays per race plus a bonus for hitting its goal.</li>
<li><b>Standings:</b> both championships and the calendar.</li>
<li><b>Paddock events:</b> between races you'll face decisions, like an unhappy driver, a rival poaching your staff, or a chance to buy factory overtime. Every choice has a trade-off.</li>
</ul>
<h3>Race weekend</h3>
<ol>
<li><b>Friday practice:</b> pick two programs: setup work, tire long runs, qualifying sims or reliability checks.</li>
<li><b>Setup and qualifying:</b> pick low, balanced or high downforce for the circuit, then Standard or Max attack engine mode (faster, but higher breakdown risk in the race). The weather radar shows the chance of rain.</li>
<li><b>Strategy:</b> choose a tire plan for each driver. In a dry race you must use two different compounds.</li>
<li><b>The race:</b> watch it live and make the calls.</li>
</ol>
<table class="gtable"><tbody>
<tr><td><span class="tyre" style="--c:#ff3b3b">S</span></td><td><b>Soft</b>: fastest, wears out quickest</td></tr>
<tr><td><span class="tyre" style="--c:#ffd23f">M</span></td><td><b>Medium</b>: the all-rounder</td></tr>
<tr><td><span class="tyre" style="--c:#f2f2f2">H</span></td><td><b>Hard</b>: slowest, lasts longest</td></tr>
<tr><td><span class="tyre" style="--c:#2f9bff">W</span></td><td><b>Wet</b>: the only tire that works in rain</td></tr>
</tbody></table>
<h3>Race controls</h3>
<ul>
<li><b>Box for (tire):</b> the car pits at the end of the lap and fits that tire. Tap it again to cancel.</li>
<li><b>Save tires / Balanced / Push:</b> pushing is faster but wears tires and raises breakdown risk.</li>
<li><b>⚡ Boost:</b> spends battery for about 0.6s a lap of extra speed and a much better chance to overtake or defend. A full battery lasts about 2½ laps of boosting and recharges as you drive (fastest in Save mode). Rivals use theirs too.</li>
<li><b>Team orders:</b> when your cars run nose to tail, you can swap them. The demoted driver won't like it.</li>
<li><b>Speed:</b> 1× (about 6 seconds a lap) to 8×, pause (space bar), or ⏭ to skip to the finish.</li>
<li><b>Auto-pause:</b> on by default. The race freezes for safety cars, rain on the radar, rain arriving or clearing, and fading tires. Tap a tire to box (green ring = engineer's suggestion), then <b>Keep racing</b>.</li>
</ul>
<h3>Telemetry (your pit-wall feed)</h3>
<ul>
<li><b>Tires °C:</b> the window is 95-105°C. Too hot (pushing, following closely) means grip loss and fast wear. Too cold (after a safety car, on hards) means slow laps. Use Save or Push to steer the temperature.</li>
<li><b>Brakes °C:</b> heavy-braking tracks (Monaco, Singapore, Mexico, Monza) and sitting close behind another car heat them. Above about 950°C they can fail.</li>
<li><b>Engine °C:</b> dirty air, Push and boost heat it. Above 120°C it loses power, and above 125°C it can fail.</li>
<li><b>Fuel:</b> laps spare or short at the current rate. Pushing and boosting burn more, and Save uses about 10% less. Choose a Light, Standard or Heavy fuel load before the race.</li>
<li><b>Gaps:</b> the gaps ahead and behind with their trend per lap (▼ closing, ▲ opening), and where you'd rejoin if you boxed now.</li>
<li>The race pauses for overheating, low fuel, cold tires, a rival trying to undercut you, and undercut chances of your own.</li>
</ul>
<h3>Things that change races</h3>
<ul>
<li><b>Safety car:</b> the field bunches up. The cheapest moment to pit.</li>
<li><b>Rain:</b> the radar warns you a few laps before it arrives. Slick tires are dangerous and slow in the wet, so time the switch to wets, then go back to slicks when it dries.</li>
<li><b>Worn tires:</b> lap times fall off a cliff once the tire bar empties.</li>
<li><b>Breakdowns and crashes:</b> low Reliability, pushing and Max attack make them more likely.</li>
</ul>
<h3>Money and seasons</h3>
<ul>
<li>Keep an eye on <b>Net per race</b> on HQ. Below −$10M cash, the team goes into administration.</li>
<li>The <b>board</b> sets a target finishing position each season. Hit it for an $8M bonus and more confidence. Miss it and confidence drops. At zero, you're fired.</li>
<li>The <b>trophy cabinet</b> (under Standings) tracks 14 achievements, from first points to the championship.</li>
<li>Each season has 12 rounds, a mid-season rule change, and prize money by championship position.</li>
<li>Between seasons, new rules pull every car toward the middle, drivers age, and contracts end.</li>
</ul>
<h3>Tips</h3>
<ul>
<li>Fill both research slots before the first race.</li>
<li>Upgrade for the circuits coming up. Check the calendar under Standings.</li>
<li>From the back of the grid, an off-sequence strategy or a well-timed safety-car stop can steal points.</li>
</ul>
<p class="dim" style="font-size:12px">Unofficial fan game. Not affiliated with Formula 1 or any team, driver or circuit. Teams and drivers are fictional. Track outlines from the open f1-circuits dataset (MIT License).</p>`;

PW.openGuide = function () {
  const R = PW.ui.R; const wasPaused = R && R.paused; if (R) R.paused = true;
  const m = document.createElement("div"); m.className = "modal"; m.style.zIndex = 90;
  m.innerHTML = `<div class="box guide">${GUIDE}<div class="row" style="margin-top:16px"><button class="btn primary" data-g="close">Close</button><button class="btn" data-g="tour">Replay walkthrough</button></div></div>`;
  m.addEventListener("click", e => {
    const b = e.target.closest("[data-g]");
    if (!b && e.target !== m) return;
    m.remove(); if (R && !wasPaused) R.paused = false;
    if (b && b.dataset.g === "tour") { if (PW.ui.R) { set("0"); } else PW.tutorialReplay(); }
  });
  document.body.appendChild(m);
};
PW.openMenu = function () {
  const m = document.createElement("div"); m.className = "modal"; m.style.zIndex = 90;
  m.innerHTML = `<div class="box" style="max-width:380px"><h2 style="margin-bottom:14px">Menu</h2><div class="grid">
    <button class="btn" data-m="guide">How to play</button>
    <button class="btn" data-m="tour">Replay the walkthrough</button>
    <button class="btn" data-m="new">New career</button>
    <button class="btn ghost" data-m="close">Close</button></div></div>`;
  m.addEventListener("click", e => {
    const b = e.target.closest("[data-m]");
    if (!b && e.target !== m) return;
    m.remove();
    const a = b && b.dataset.m;
    if (a === "guide") PW.openGuide();
    if (a === "tour") PW.tutorialReplay();
    if (a === "new" && confirm("Start a new career? Your current save will be erased.")) { PW.wipe(); PW.ui.reset(); }
  });
  document.body.appendChild(m);
};
check();
})();
