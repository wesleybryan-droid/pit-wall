/* Pit Wall — save backups (file + copy/paste code), persistent storage, Safari warning. */
"use strict";
(function () {
const KEY = "pitwall-save-v1", LAST = "pitwall-lastbackup";
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

/* ---------- ask the browser not to clear our storage ---------- */
let asked = false;
PW.protectStorage = async function () {
  if (asked || !navigator.storage || !navigator.storage.persist) return;
  asked = true;
  try { if (!(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (e) {}
};

/* ---------- encode / decode ---------- */
const b64 = bytes => { let s = ""; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s); };
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
PW.exportCode = async function () {
  const json = get(KEY); if (!json) return null;
  const bytes = new TextEncoder().encode(json);
  if (window.CompressionStream) { try { return "PW1:" + b64(await pipe(bytes, new CompressionStream("gzip"))); } catch (e) {} }
  return "PW0:" + b64(bytes);
};
async function decode(text) {
  text = (text || "").trim();
  if (text.startsWith("{")) return text;
  if (text.startsWith("PW1:")) return new TextDecoder().decode(await pipe(unb64(text.slice(4)), new DecompressionStream("gzip")));
  if (text.startsWith("PW0:")) return new TextDecoder().decode(unb64(text.slice(4)));
  throw new Error("That doesn't look like a Pit Wall save.");
}
PW.importSave = async function (text) {
  const json = await decode(text);
  const s = JSON.parse(json);
  if (!s || !s.teams || !s.teams.you || !Array.isArray(s.drivers) || !s.season) throw new Error("That save is missing career data.");
  set(KEY, json);
  PW.load(); PW.ui.reset();
  return s;
};

/* ---------- environment ---------- */
const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
const installed = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
PW.backupAge = () => { const t = +(get(LAST) || 0); return t ? (Date.now() - t) / 86400000 : null; };

/* ---------- backup dialog ---------- */
PW.openBackup = function () {
  const S = PW.state();
  const age = PW.backupAge();
  const m = document.createElement("div"); m.className = "modal"; m.style.zIndex = 90;
  m.innerHTML = `<div class="box" style="max-width:520px">
    <h2 style="margin-bottom:6px">Save & backup</h2>
    <p class="muted" style="margin-top:0">Your career saves automatically in this browser. Back it up to keep it safe or to move it to another device.</p>
    ${isSafari && !installed() ? `<div class="warnbox">Safari can delete saved games for websites you haven't visited in 7 days. Back up your career now and then, or use <b>Share → Add to Home Screen</b> to install Pit Wall as an app.</div>` : ""}
    ${S ? `<h3>Back up ${S.teams.you.name} (season ${S.season}, round ${Math.min(S.round + 1, 12)})</h3>
    <div class="row"><button class="btn primary" data-b="download">Download save file</button><button class="btn" data-b="copy">Copy save code</button></div>
    <p class="dim" style="font-size:12px">${age == null ? "Never backed up." : age < 1 ? "Last backup: today." : `Last backup: ${Math.floor(age)} day${age >= 2 ? "s" : ""} ago.`}</p>` : `<p>No career to back up yet.</p>`}
    <hr><h3>Restore a career</h3>
    <p class="muted" style="margin-top:0;font-size:13px">Load a save file, or paste a save code.${S ? " This replaces the career in this browser." : ""}</p>
    <div class="row"><button class="btn" data-b="file">Load save file</button><input type="file" accept=".json,.txt,application/json" hidden></div>
    <textarea placeholder="Paste a save code (starts with PW1:)" rows="3" class="codebox"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn" data-b="paste">Restore from code</button><button class="btn ghost" data-b="close" style="margin-left:auto">Close</button></div>
    <p class="bmsg" style="font-size:13px;min-height:18px;margin:8px 0 0"></p></div>`;
  const msg = (t, bad) => { const p = m.querySelector(".bmsg"); p.textContent = t; p.className = "bmsg " + (bad ? "bad" : "good"); };
  const restore = async text => {
    if (S && !confirm("Replace the career in this browser with this save?")) return;
    try { const s = await PW.importSave(text); m.remove(); PW.toast && PW.toast(`Loaded ${s.teams.you.name}, season ${s.season}`); }
    catch (e) { msg(e.message || "Couldn't read that save.", true); }
  };
  m.addEventListener("click", async e => {
    if (e.target === m) { m.remove(); return; }
    const b = e.target.closest("[data-b]"); if (!b) return;
    const a = b.dataset.b;
    if (a === "close") m.remove();
    if (a === "download") {
      const json = get(KEY); if (!json) return;
      const name = `pit-wall-${S.teams.you.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-s${S.season}r${S.round + 1}.json`;
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      set(LAST, String(Date.now())); msg(`Saved ${name}`);
    }
    if (a === "copy") {
      const code = await PW.exportCode();
      try { await navigator.clipboard.writeText(code); set(LAST, String(Date.now())); msg(`Save code copied (${Math.round(code.length / 1000)}k characters). Paste it somewhere safe, like a note or an email to yourself.`); }
      catch (err) { m.querySelector(".codebox").value = code; msg("Select the code in the box and copy it."); }
    }
    if (a === "file") m.querySelector("input[type=file]").click();
    if (a === "paste") restore(m.querySelector(".codebox").value);
  });
  m.querySelector("input[type=file]").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    restore(await f.text());
  });
  document.body.appendChild(m);
};
})();
