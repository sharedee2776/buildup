/* End-to-end test for BuildUp Phase 1 (buildup-ftue.html) via jsdom.
   Drives real user flows: onboarding, calibration, Home, mission player,
   all 3 missions, completion/unlock/XP/badges, journey/badges views,
   grown-up sheet, persistence/reload, calibration-skip, back-nav, resume,
   animated journey, wrong-answer retry, reflect free-text, replay (no double XP). */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const SCRIPT = HTML.match(/<script>([\s\S]*)<\/script>/)[1];
// pull the pure-data mission defs out of the app source so the test can solve sorts
const defsSlice = SCRIPT.slice(SCRIPT.indexOf("var M1 = {"), SCRIPT.indexOf("var MISSIONS ="));
const defs = new Function(defsSlice + "\n return {M1:M1,M2:M2,M3:M3};")();

let PASS = 0, FAIL = 0;
const fails = [];
function ok(cond, msg){ if(cond){ PASS++; } else { FAIL++; fails.push(msg); console.log("  ✗ " + msg); } }
const delay = ms => new Promise(r => setTimeout(r, ms));
const rx = s => new RegExp(s.slice(0, 22).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

function makeStore(){
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length(){ return m.size; },
    _dump: () => Object.fromEntries(m)
  };
}

function boot(store, REDUCE){
  return new JSDOM(HTML, {
    runScripts: "dangerously",
    url: "https://buildup.test/",
    pretendToBeVisual: true,
    beforeParse(w){
      Object.defineProperty(w, "localStorage", { value: store, configurable: true });
      w.scrollTo = () => {};
      w.matchMedia = q => ({
        matches: /reduce/.test(q) ? !!REDUCE : false,
        media: q, onchange: null,
        addListener(){}, removeListener(){},
        addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; }
      });
      w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
      w.cancelAnimationFrame = id => clearTimeout(id);
    }
  });
}

// text of the app's render target only (NOT document.body, which also contains <script> source)
const ftext = doc => doc.getElementById("frame").textContent;

// Advance exactly one beat in the mission player. Returns "done" | "ok".
async function stepForward(dom, mdef, reflectMode){
  const doc = dom.window.document;
  const q = s => doc.querySelector(s);
  const qa = s => [...doc.querySelectorAll(s)];
  if(q(".done")) return "done";
  const head = q(".beat h2") ? q(".beat h2").textContent.trim() : "";

  if(q("#jSend")){
    q("#jSend").click();
    await delay(10);
    if(!q("#jNext") || q("#jNext").hidden) await delay(3300);
    if(!q("#jNext") || q("#jNext").hidden) throw new Error("journey: Next never appeared");
    q("#jNext").click();
  } else if(/One last thing/.test(head)){
    const o = qa(".opt");
    if(reflectMode === "fuzzy"){
      o[o.length - 1].click(); await delay(5);
      const note = q("#rnote");
      ok(!!note, "reflect: 'still fuzzy' reveals a free-text box");
      if(note) note.value = "the URL part confused me a bit";
    } else {
      o[0].click();
    }
    await delay(5);
    q("#beatNext").click();
  } else if(q(".tok")){
    const beat = mdef.beats.find(b => b.type === "sort" && b.h === head);
    if(!beat) throw new Error("sort beat def not found for heading: " + head);
    let g = 0;
    while(qa(".pool .tok").length && g++ < 30){
      const tok = qa(".pool .tok")[0];
      const item = beat.items.find(it => it[0] === tok.textContent);
      if(!item) throw new Error("sort token has no matching item: " + tok.textContent);
      tok.click();
      q('.bin[data-bin="' + item[1] + '"]').click();
    }
    if(!q("#beatNext")) throw new Error("sort not accepted as solved: " + head);
    q("#beatNext").click();
  } else if(q(".opt")){
    const opts = qa(".opt");
    const correct = opts.find(o => o.dataset.c === "1");
    (correct || opts[0]).click();
    await delay(5);
    if(!q("#beatNext")) throw new Error("opt beat gave no Next: " + head);
    q("#beatNext").click();
  } else if(q("#beatNext")){
    q("#beatNext").click();
  } else {
    throw new Error("stuck on beat: " + head);
  }
  await delay(5);
  return q(".done") ? "done" : "ok";
}

async function playMission(dom, mdef, reflectMode){
  let guard = 0;
  while(guard++ < 60){
    if(await stepForward(dom, mdef, reflectMode) === "done") return;
  }
  throw new Error("mission did not complete within 60 steps");
}

async function onboard(doc, dom, { age = "creator", name = "Tobi", skipName = false, calib = [1,0,0] } = {}){
  const q = s => doc.querySelector(s);
  q("[data-next]").click(); await delay(5);              // welcome -> age
  q('[data-age="' + age + '"]').click(); await delay(5);
  q("[data-next]").click(); await delay(5);              // age -> name
  if(skipName){ q("[data-skip]").click(); }
  else { const nm = q("#nm"); nm.value = name; nm.dispatchEvent(new dom.window.Event("input", { bubbles: true })); q("[data-next]").click(); }
  await delay(5);                                        // name -> calib
  calib.forEach((v, i) => q('[data-cal="' + i + '"][data-v="' + v + '"]').click());
  await delay(5);
  q("[data-next]").click(); await delay(10);             // calib -> home
}

(async () => {
  // ============ Scenario A: full path, no calibration skip ============
  console.log("Scenario A — full onboarding + all 3 missions");
  const storeA = makeStore();
  let domA = boot(storeA, true);
  await delay(30);
  let dA = domA.window.document; const a = s => dA.querySelector(s);

  ok(/Hi! I.?m Kobo/.test(ftext(dA)), "A: welcome screen shows");
  ok(!!a(".ob"), "A: onboarding container present");

  a("[data-next]").click(); await delay(5);
  ok(!!a("[data-age]"), "A: age step shows");
  ok(a("[data-next]").disabled, "A: Next disabled before an age is picked");
  a('[data-age="creator"]').click(); await delay(5);
  ok(!a("[data-next]").disabled, "A: Next enabled after age pick");
  a("[data-next]").click(); await delay(5);
  const nm = a("#nm"); nm.value = "Tobi"; nm.dispatchEvent(new domA.window.Event("input", { bubbles: true }));
  a("[data-next]").click(); await delay(5);
  ok(/Quick check/.test(ftext(dA)), "A: calibration step shows");
  ok(a("[data-next]").disabled, "A: Start disabled until all 3 calibration items answered");
  a('[data-cal="0"][data-v="1"]').click();
  a('[data-cal="1"][data-v="0"]').click();
  a('[data-cal="2"][data-v="0"]').click();
  await delay(5);
  ok(!a("[data-next]").disabled, "A: Start enabled after all answered");
  a("[data-next]").click(); await delay(10);

  ok(!!a(".home"), "A: Home renders after onboarding");
  ok(/Hi, Tobi/.test(ftext(dA)), "A: Home greets by name");
  ok(/1 day streak/.test(ftext(dA)), "A: streak = 1");
  ok(/Level 1 Explorer/.test(ftext(dA)), "A: level 1");
  ok(/0 \/ 100/.test(a(".xpwrap").textContent), "A: XP starts at 0");
  ok(/Meet Your Digital World/.test(a(".next").textContent), "A: next mission = M1");
  ok(!a("#showGrown"), "A: no 'show a grown-up' button before any mission done");
  ok(a(".nav").hidden === false, "A: bottom nav visible on Home");

  a("#startM").click(); await delay(10);
  ok(!!a(".mp"), "A: mission player opens");
  ok(a(".nav").hidden === true, "A: bottom nav hidden inside a mission");
  ok(/Mission 1 · Meet Your Digital World/.test(a(".beat h2").textContent), "A: M1 intro header numbered correctly");
  ok(!/skipped the warm-up/.test(ftext(dA)), "A: no skip note when calib = 1");
  ok(/1\/10/.test(a(".mptop").textContent), "A: M1 = 10 beats when not calibrated out");

  await playMission(domA, defs.M1, "first");
  ok(/Mission complete/.test(ftext(dA)), "A: M1 reaches complete screen");
  ok(/\+50 XP/.test(ftext(dA)), "A: +50 XP shown on complete");
  ok(/Badge earned: Digital Explorer/.test(ftext(dA)), "A: M1 badge named on complete");
  ok(rx(defs.M1.outro).test(ftext(dA)), "A: M1 forward-looking outro shown");

  a("#cHome").click(); await delay(10);
  ok(/50 \/ 100/.test(a(".xpwrap").textContent), "A: Home XP now 50");
  ok(/Become an Internet Detective/.test(a(".next").textContent), "A: next mission advanced to M2");
  ok(!!a("#showGrown"), "A: 'show a grown-up' button appears after first completion");

  [...dA.querySelectorAll(".nav button")].find(x => x.dataset.go === "journey").click(); await delay(10);
  const rows = [...dA.querySelectorAll(".mitem")];
  ok(rows.length === 4, "A: journey lists 4 World-1 missions");
  ok(/✓ Done/.test(rows[0].textContent), "A: journey — M1 Done");
  ok(/Ready/.test(rows[1].textContent), "A: journey — M2 Ready (unlocked)");
  ok(/Locked/.test(rows[2].textContent), "A: journey — M3 Locked");
  ok(/Locked/.test(rows[3].textContent), "A: journey — M4 Locked");

  [...dA.querySelectorAll(".nav button")].find(x => x.dataset.go === "badges").click(); await delay(10);
  const bcards = [...dA.querySelectorAll(".bcard")];
  ok(bcards[0].classList.contains("earned"), "A: badge — Digital Explorer earned");
  ok(!bcards[1].classList.contains("earned"), "A: badge — Internet Detective still locked");

  [...dA.querySelectorAll(".nav button")].find(x => x.dataset.go === "home").click(); await delay(10);
  a("#showGrown").click(); await delay(5);
  ok(!dA.querySelector("#overlay").hidden, "A: grown-up sheet opens");
  ok(/Tobi.?s week/.test(a("#shTitle").textContent), "A: sheet titled with child name");
  ok(/Meet Your Digital World/.test(a("#shBody").textContent), "A: sheet lists completed mission");
  ok(/Digital Explorer/.test(a("#shBody").textContent), "A: sheet lists earned badge");
  ok(rx(defs.M1.parentPrompt).test(a("#shBody").textContent), "A: sheet shows M1 parent prompt");
  a("#shClose").click(); await delay(5);
  ok(dA.querySelector("#overlay").hidden, "A: grown-up sheet closes");

  a("#startM").click(); await delay(10);
  ok(/Mission 2 · Become an Internet Detective/.test(a(".beat h2").textContent), "A: M2 intro header");
  await playMission(domA, defs.M2, "first");
  ok(/Badge earned: Internet Detective/.test(ftext(dA)), "A: M2 badge on complete");
  a("#cHome").click(); await delay(10);
  ok(/0 \/ 100/.test(a(".xpwrap").textContent) && /Level 2/.test(ftext(dA)), "A: XP wraps to 100 -> Level 2 after M2");
  ok(/Protect Your Secret/.test(a(".next").textContent), "A: next mission advanced to M3");

  a("#startM").click(); await delay(10);
  ok(/Mission 3 · Protect Your Secret/.test(a(".beat h2").textContent), "A: M3 intro header");
  ok(/1\/9/.test(a(".mptop").textContent), "A: M3 = 9 beats when not calibrated out");
  await playMission(domA, defs.M3, "first");
  ok(/Badge earned: Secret Keeper/.test(ftext(dA)), "A: M3 badge on complete");
  a("#cHome").click(); await delay(10);
  ok(/More on the way/.test(a(".next").textContent), "A: all built missions done -> 'More on the way' card");
  ok(/Replay Protect Your Secret/.test(a("#startM").textContent), "A: caught-up card offers replay of last mission");
  ok(/50 \/ 100/.test(a(".xpwrap").textContent) && /Level 2/.test(ftext(dA)), "A: XP = 150 (shows 50/100, Level 2)");

  a("#startM").click(); await delay(10);
  ok(/Mission 3/.test(a(".beat h2").textContent), "A: replay opens M3");
  await playMission(domA, defs.M3, "first");
  a("#cHome").click(); await delay(10);
  ok(/50 \/ 100/.test(a(".xpwrap").textContent), "A: replay did not re-award XP (still 150)");

  const dump = JSON.parse(storeA._dump()["buildup.v1"]);
  ok(dump.onboarded === true, "A: persisted onboarded flag");
  ok(dump.xp === 150, "A: persisted xp = 150");
  ok(dump.badges.length === 3, "A: persisted 3 badges");
  ok(dump.reflections.length === 4, "A: persisted 4 reflections (incl. replay)");

  let domA2 = boot(storeA, true); await delay(30);
  let dA2 = domA2.window.document;
  ok(!!dA2.querySelector(".home"), "A(reload): boots straight to Home");
  ok(/Hi, Tobi/.test(ftext(dA2)), "A(reload): name preserved");
  ok(/More on the way/.test(dA2.querySelector(".next").textContent), "A(reload): completion state preserved");
  ok(/50 \/ 100/.test(dA2.querySelector(".xpwrap").textContent), "A(reload): XP preserved");

  // ============ Scenario B: calibration skip + back-nav + resume ============
  console.log("Scenario B — calibration skip, back navigation, mid-mission resume");
  const storeB = makeStore();
  let domB = boot(storeB, true); await delay(30);
  let dB = domB.window.document; const b = s => dB.querySelector(s);
  await onboard(dB, domB, { age: "explorer", skipName: true, calib: [1,1,1] });
  ok(/Hi, Explorer/.test(ftext(dB)), "B: skipped name defaults to 'Explorer'");
  ok(JSON.parse(storeB._dump()["buildup.v1"]).profile.calib === 3, "B: calibration score = 3");

  b("#startM").click(); await delay(10);
  ok(/skipped the warm-up/.test(ftext(dB)), "B: calib >= 2 shows the 'skipped warm-up' note");
  ok(/1\/8/.test(b(".mptop").textContent), "B: M1 trimmed to 8 beats when calibrated");

  await stepForward(domB, defs.M1, "first");            // beat 1 -> 2
  await stepForward(domB, defs.M1, "first");            // beat 2 -> 3
  ok(/3\/8/.test(b(".mptop").textContent), "B: advanced to beat 3");
  b("#mpBack").click(); await delay(5);
  ok(/2\/8/.test(b(".mptop").textContent), "B: mpBack -> beat 2");
  b("#mpBack").click(); await delay(5);
  ok(/1\/8/.test(b(".mptop").textContent), "B: mpBack -> beat 1");
  b("#mpBack").click(); await delay(5);
  ok(!!b(".home"), "B: mpBack from first beat exits to Home");

  b("#startM").click(); await delay(10);
  await stepForward(domB, defs.M1, "first");            // -> beat 2
  await stepForward(domB, defs.M1, "first");            // -> beat 3
  const bdump1 = JSON.parse(storeB._dump()["buildup.v1"]);
  ok(bdump1.missions.m1.status === "in_progress" && bdump1.missions.m1.beat === 2, "B: mid-mission progress saved (beat index 2)");

  let domB2 = boot(storeB, true); await delay(30);
  let dB2 = domB2.window.document;
  ok(!!dB2.querySelector(".home"), "B(reload): returns to Home, not straight into the mission");
  ok(/Continue Mission/.test(dB2.querySelector("#startM").textContent), "B(reload): CTA reads 'Continue Mission'");
  dB2.querySelector("#startM").click(); await delay(10);
  ok(/3\/8/.test(dB2.querySelector(".mptop").textContent), "B(reload): resumes at beat 3 of 8");
  await playMission(domB2, defs.M1, "first");
  ok(/Mission complete/.test(ftext(dB2)), "B: mission finishes after resume");

  // ============ Scenario C: animated journey, wrong-answer retry, fuzzy reflect ============
  console.log("Scenario C — animated journey timeline, wrong-answer retry, 'still fuzzy' free text");
  const storeC = makeStore();
  let domC = boot(storeC, false); await delay(30);       // REDUCE = false -> real timeline
  let dC = domC.window.document; const c = s => dC.querySelector(s);
  await onboard(dC, domC, { age: "builder", skipName: true, calib: [0,0,0] });
  c("#startM").click(); await delay(10);
  c("#beatNext").click(); await delay(5);   // intro -> teach
  c("#beatNext").click(); await delay(5);   // teach -> predict
  c(".opt").click(); await delay(5);        // predict guess
  ok(!!c("#beatNext"), "C: predict shows Next after a guess");
  c("#beatNext").click(); await delay(5);   // -> journey
  ok(!!c("#jSend"), "C: reached journey beat");
  c("#jSend").click();
  ok(c("#jNext").hidden, "C: journey Next stays hidden while the trip animates");
  ok(c("#jSend").disabled, "C: send button disabled during animation");
  await delay(3400);
  ok(!c("#jNext").hidden, "C: journey Next revealed after the ~2.9s timeline");
  ok(/half a second/.test(c("#jcap").textContent), "C: final journey caption shown");
  ok(!c("#jSend").disabled && /again/i.test(c("#jSend").textContent), "C: send re-enabled as 'Do it again'");
  c("#jNext").click(); await delay(5);      // -> choose (which is the browser)

  const opts = [...dC.querySelectorAll(".opt")];
  const wrong = opts.find(o => o.dataset.c === "0");
  wrong.click(); await delay(5);
  ok(wrong.classList.contains("wrong") && wrong.disabled, "C: wrong option marks + disables itself");
  ok(!c("#beatNext"), "C: no Next until the correct answer is chosen");
  ok(/Try another/.test(c("#fb").textContent), "C: retry feedback shown after a miss");
  dC.querySelector('.opt[data-c="1"]').click(); await delay(5);
  ok(!!c("#beatNext"), "C: correct answer reveals Next");
  c("#beatNext").click(); await delay(5);

  await playMission(domC, defs.M1, "fuzzy");
  ok(/Mission complete/.test(ftext(dC)), "C: mission completes via the fuzzy-reflect path");
  const cdump = JSON.parse(storeC._dump()["buildup.v1"]);
  const lastR = cdump.reflections[cdump.reflections.length - 1];
  ok(lastR && /confused/.test(lastR.note || ""), "C: 'still fuzzy' free-text note is persisted");
  ok(!cdump.reflections.some(r => !r.choice), "C: every reflection has a choice recorded");

  // ============ Scenario D: onboarding grown-up info sheet ============
  console.log("Scenario D — grown-up info from onboarding (pre-completion form)");
  const storeD = makeStore();
  let domD = boot(storeD, true); await delay(30);
  let dD = domD.window.document;
  dD.querySelector("#obInfo").click(); await delay(5);
  ok(!dD.querySelector("#overlay").hidden, "D: grown-up info opens from onboarding");
  ok(/For grown-ups/.test(dD.querySelector("#shTitle").textContent), "D: shows the generic 'For grown-ups' panel");
  ok(/No AI in this version/.test(dD.querySelector("#shBody").textContent), "D: safety copy present (no-AI stance)");
  ok(/first name only/.test(dD.querySelector("#shBody").textContent), "D: data-minimisation copy present");
  dD.querySelector("#shClose").click(); await delay(5);
  ok(dD.querySelector("#overlay").hidden, "D: sheet closes");

  console.log("\n" + "=".repeat(50));
  console.log("PASS " + PASS + "   FAIL " + FAIL);
  if(FAIL){ console.log("\nFailures:"); fails.forEach(f => console.log("  - " + f)); process.exit(1); }
  else console.log("All end-to-end checks passed.");
})().catch(e => { console.error("\nTEST CRASHED:", e && e.stack || e); process.exit(2); });
