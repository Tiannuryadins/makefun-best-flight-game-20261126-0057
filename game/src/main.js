// NUSANTARA SKY POST — main loop, screens, scoring, feats, autopilot (test
// driver) and the headless self-test. Canvas 2D, no libraries, no network.
import { ISLANDS, LEGS, UPGRADES, FEATS, RING_POINTS, SACK_PAY } from './data.js';
import { mulberry32, clamp, angDiff, deg2rad } from './random.js';
import { makePlane, stepPlane, landingScore, medalFor, maxFuel, baseStallSpeed } from './physics.js';
import { buildRings, buildClouds, stormCell, runwayCenter, terrainHeight, legPath } from './world.js';
import { createInput, pollStick, takePressed, createButtons } from './input.js';
import { render, W, H } from './render.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7);
const rng = mulberry32(seed);
const ff = Math.max(1, Math.min(8, Number(params.get('ff') || 1)));

const canvas = document.getElementById('game');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');

const state = {
  screen: 'title',
  legIndex: 0,
  plane: makePlane(0, {}),
  rings: buildRings(0, rng),
  clouds: buildClouds(rng),
  wind: { dir: 200, speed: 6 },
  storm: null,
  stormNear: false,
  score: 0, coins: 0,
  legTime: 0, time: 0,
  upgrades: {},
  feats: new Set(),
  featsThisLeg: [],
  medals: [null, null, null, null, null],
  lastLanding: null,
  crashReason: null,
  message: '', messageSub: '', messageT: 0, messageColor: '#ffffff',
  stallWarn: false, stormWarn: false,
  nextLabel: '',
  rollout: 0, crashT: 0, finalLocked: false,
  lowPassT: 0, maxSpeed: 0, wasInsideStorm: false, wasNearStorm: false,
  autopilot: false,
};
state.storm = stormCell(0);

const input = createInput(canvas);
const buttons = createButtons();

// --- helpers -----------------------------------------------------------------
function showMessage(text, sub, color, dur = 2.2) {
  state.message = text; state.messageSub = sub || ''; state.messageColor = color || '#ffffff';
  state.messageT = dur;
}
function awardFeat(id) {
  if (state.feats.has(id)) return;
  state.feats.add(id);
  const f = FEATS.find((x) => x.id === id);
  state.featsThisLeg.push(f ? f.name : id);
  showMessage(`★ FEAT — ${f ? f.name : id}`, f ? f.desc : '', '#ffd23e', 2.6);
}

function startLeg(i) {
  state.legIndex = i;
  const leg = LEGS[i];
  state.plane = makePlane(i, state.upgrades);
  state.rings = buildRings(i, rng);
  state.storm = stormCell(i);
  state.stormNear = false;
  state.legTime = 0;
  state.rollout = 0; state.crashT = 0;
  state.finalLocked = false;
  state.goAround = false;
  state.lowPassT = 0; state.maxSpeed = 0;
  state.wasInsideStorm = false; state.wasNearStorm = false;
  state.featsThisLeg = [];
  state.wind = { dir: leg.windDir, speed: leg.windSpeed };
  state.screen = 'flying';
  state.message = ''; state.messageT = 0;
  showMessage(`LEG ${i + 1} — ${ISLANDS[leg.from].name} → ${ISLANDS[leg.to].name}`,
    `${leg.rings} mail ring${leg.rings === 1 ? '' : 's'} · wind ${leg.windSpeed} m/s · cargo ${leg.cargo} sacks`, '#ffffff', 3);
}

function resetCampaign() {
  state.score = 0; state.coins = 0;
  state.upgrades = {}; state.feats = new Set();
  state.medals = [null, null, null, null, null];
  state.lastLanding = null;
  state.screen = 'title';
  state.plane = makePlane(0, {});
  state.rings = buildRings(0, rng);
  state.legIndex = 0;
}

// --- autopilot (test driver only) ---------------------------------------------
function autopilotInput() {
  const p = state.plane;
  const leg = LEGS[state.legIndex];
  const c = runwayCenter(leg.to);
  // Pattern altitude is the cruise altitude for this leg (the last ring's
  // height, 2500 m out). Safe altitude clears the destination island's peak.
  const patternAlt = Math.max(ISLANDS[leg.from].peak, ISLANDS[leg.to].peak) * 0.65 + 100;
  const safeAlt = Math.max(c.alt + 130, ISLANDS[leg.to].peak + 60);
  // A ring the plane has flown 150 m past is missed, not chased: circling
  // back for it at low altitude over rising terrain is how legs are lost.
  // Mark it missed permanently — otherwise the ring reactivates the moment
  // the plane drops south of it again and the autopilot loops on it forever.
  for (const r of state.rings) if (!r.got && !r.missed && state.plane.z > r.z + 150) r.missed = true;
  const next = state.rings.find((r) => !r.got && !r.missed);
  let tx, tz, tAlt, phase;
  if (next) { tx = next.x; tz = next.z; tAlt = next.y; phase = 'ring'; }
  else {
    // No rings left: fly the final approach. The plane takes the last ring
    // flying diagonally across the route (it comes up the diagonal from the
    // previous ring), so it is NEVER heading due north at the ring — any
    // lock that demands a northerly heading, or an align point sitting
    // exactly where the ring is, just makes it fly past the point and orbit
    // it in a big circle forever. So: if the plane is anywhere near the
    // axis (<300 m) it is on the final and the roll authority turns it
    // north during the descent; only a plane far off-axis uses the
    // intercept to come back, and only a plane past the runway goes around.
    // This is stateless (position alone decides), because the sticky lock /
    // go-around flags kept tangling and looping the pattern.
    if (p.z > c.z + 300) {
      tx = c.x; tz = c.z - 2500; tAlt = safeAlt; phase = 'align';
    } else if (Math.abs(p.x - c.x) > 300) {
      tx = c.x; tz = p.z + 1200; tAlt = patternAlt; phase = 'align';
    } else if (p.z > c.z - 100) {
      tx = c.x; tz = p.z + 300; tAlt = c.alt; phase = 'final';
    } else {
      tx = c.x; tz = c.z - 100; tAlt = c.alt + 10; phase = 'final';
    }
  }
  const dx = tx - p.x, dz = tz - p.z;
  const dist = Math.hypot(dx, dz);
  const desired = (Math.atan2(dx, dz) * 180) / Math.PI;
  const err = angDiff(desired, p.heading);
  let roll = clamp(err / 22, -1, 1);
  if (phase === 'final' && dist < 800) roll = clamp(err / 18, -1, 1); // tight tracking on short final
  if (phase === 'final' && dist < 400) roll = clamp(roll, -0.7, 0.7); // still enough authority to correct a wide offset over the threshold
  // Pitch: climb toward target altitude, descend on final (tighter tracking
  // on the glide path so the plane is down before it runs out of runway).
  let targetAlt = tAlt;
  // Glide path runs to runway level at the touchdown zone (a +10 m floor
  // makes the plane level off ten metres up and float past the strip). Past
  // the threshold the target is runway level itself: descend onto the strip.
  if (phase === 'final' && p.z <= c.z - 100) targetAlt = c.alt - 2 + clamp(dist * 0.07, 0, 220);
  // Do NOT descend on the glide path while still wide of the axis: the path
  // assumes the flat valley corridor, and 250 m off-axis the volcano's flank
  // is higher than the path. Hold pattern altitude until the plane is within
  // 150 m of the centreline, then descend.
  if (phase === 'final' && Math.abs(p.x - c.x) > 200) targetAlt = Math.max(targetAlt, patternAlt);
  // Terrain floor: never fly below 60 m above the local terrain while wide
  // of the centreline. A plane that descends on the glide path while
  // drifting sideways is already inside the volcano's flank before any
  // go-around can climb it out. Inside the corridor (within 150 m) the
  // terrain is the runway itself, so the floor does not block the landing.
  // Terrain floor with look-ahead: the plane flies north at ~40 m/s and the
  // volcano flank rises faster than the plane can climb (10 m/s), so a
  // floor based only on the terrain directly below lets the plane descend
  // over low ground and then fly straight into a flank that is suddenly
  // above it. Look 400 m ahead along the heading and stay above that
  // terrain too, so the plane climbs BEFORE it reaches the high ground.
  const laX = p.x + Math.sin((p.heading * Math.PI) / 180) * 400;
  const laZ = p.z + Math.cos((p.heading * Math.PI) / 180) * 400;
  const floorNow = terrainHeight(p.x, p.z) + 60;
  const floorAhead = terrainHeight(laX, laZ) + 60;
  // Only off-axis: on the axis the corridor is flat (the runway itself),
  // so a look-ahead there would hold the plane above the runway forever
  // and it would never land.
  if (Math.abs(p.x - c.x) > 150) targetAlt = Math.max(targetAlt, floorNow, floorAhead);
  let pitch = clamp((targetAlt - p.alt) / (phase === 'final' ? 30 : 55), -1, 1);
  if (!p.airborne) pitch = 0.7; // rotate at speed
  // Throttle: cruise 0.8, firm on final (0.5 keeps ~37 m/s, safely over the
  // flaps-down stall — never slower, or the plane mushes in stalled), full on
  // the takeoff roll. Rings are flown at 0.7 so the plane is slow enough to
  // actually thread an 80 m ring instead of blowing past it at 60 m/s.
  let thr = 0.8;
  if (!p.airborne) thr = 1;
  if (phase === 'ring') thr = 0.6;
  // Pattern speed must stay well above stall (30 m/s, 26 with flaps): 0.45
  // throttle is 27 m/s, and the plane mushes down in a slow circle.
  if (phase === 'align') thr = 0.65;
  if (phase === 'final' && dist < 1600) thr = 0.5;
  if (phase === 'final' && dist < 250) thr = 0.45;
  // Flaps + gear on final.
  if ((phase === 'final' || phase === 'align') && dist < 2500 && !p.flaps) state.plane.flaps = true;
  if (phase === 'final' && dist < 1800 && !p.gear) state.plane.gear = true;
  if (phase === 'ring' && p.gear) state.plane.gear = false;
  // Throttle as a delta: steer toward the target throttle.
  const dThr = clamp((thr - p.throttle) * 2.2, -1, 1);
  return { pitch, roll, throttle: dThr };
}

// --- events --------------------------------------------------------------------
function onRing(ring) {
  state.score += RING_POINTS;
  state.coins += 25;
  const got = state.rings.filter((r) => r.got).length;
  showMessage(`RING ${got}/${state.rings.length} — MAIL DELIVERED +${RING_POINTS}`,
    got === state.rings.length ? 'All rings — land on runway 36' : `Next ring ahead`, '#7dffa8');
  awardFeat('first-ring');
  if (got === 3) awardFeat('ring-streak');
  if (state.legIndex === 2) awardFeat('volcano');
  if (got === state.rings.length) awardFeat('all-rings');
}

function onLanded(t) {
  const leg = LEGS[state.legIndex];
  const score = landingScore(t);
  const timeBonus = Math.max(0, Math.round((leg.par - state.legTime) * 4));
  const ringCoins = state.rings.filter((r) => r.got).length * 25;
  const cargoPay = state.plane.cargo * SACK_PAY;
  const coinsEarned = ringCoins + Math.round(score / 4) + Math.round(timeBonus / 2) + cargoPay;
  state.score += score + timeBonus;
  state.coins += coinsEarned;
  const medal = medalFor(score);
  state.medals[state.legIndex] = medal;
  state.lastLanding = { score, vspeed: t.vspeed, across: t.across, headErr: t.headErr, timeBonus, coinsEarned };
  if (medal === 'GOLD') awardFeat('gold-landing');
  if (t.vspeed > -2) awardFeat('gentle');
  if (!state.plane.flaps) awardFeat('no-flaps');
  if (state.plane.fuel > maxFuel(state.upgrades) / 2) awardFeat('fuel-saver');
  if (state.legIndex === 0) awardFeat('hopper');
  if (state.legIndex === 3 && LEGS[3].windSpeed >= 10 && Math.cos(deg2rad(LEGS[3].windDir)) > 0.5) awardFeat('tailwind');
  if (state.legIndex === 3 && state.plane.cargo >= 4) awardFeat('mail-master');
  if (state.wasNearStorm && !state.wasInsideStorm) awardFeat('storm-dodger');
  state.rollout = 1.4;
  showMessage(`${medal} LANDING! +${score}`, `Runway 36 · ${ISLANDS[leg.to].name}`, medal === 'GOLD' ? '#ffd23e' : '#ffffff', 1.4);
}

function onCrash(reason) {
  state.crashReason = reason;
  state.crashT = 1.2;
  showMessage('✖ CRASHED', reason === 'ditch' ? 'Ditched in the sea' : reason === 'gear-up' ? 'Landed gear-up' : 'Flew into the island', '#ff5a4d', 1.2);
}

// --- update ----------------------------------------------------------------------
function update(dt) {
  state.time += dt;
  if (state.messageT > 0) state.messageT -= dt;
  const p = state.plane;

  if (state.screen === 'flying') {
    state.legTime += dt;
    // Gusting wind.
    const leg = LEGS[state.legIndex];
    const gust = leg.gust * (Math.sin(state.time * 0.7) * 0.6 + Math.sin(state.time * 1.9) * 0.4);
    state.wind = { dir: leg.windDir, speed: Math.max(0, leg.windSpeed + gust) };
    pollStick(input);
    if (takePressed(input, 'KeyF')) { p.flaps = !p.flaps; showMessage(p.flaps ? 'FLAPS DOWN' : 'FLAPS UP', '', '#bfe6ff', 1); }
    if (takePressed(input, 'KeyG')) { p.gear = !p.gear; showMessage(p.gear ? 'GEAR DOWN' : 'GEAR UP', p.gear ? '' : 'Do not land like this', p.gear ? '#7dffa8' : '#ffb020', 1.2); }
    if (takePressed(input, 'KeyP')) { state.screen = 'paused'; return; }

    let inp;
    if (state.rollout > 0) inp = { pitch: 0, roll: 0, throttle: -1 };
    else if (state.autopilot) inp = autopilotInput();
    else inp = { pitch: input.pitch, roll: input.roll, throttle: input.throttle };

    const ctxPhys = {
      legIndex: state.legIndex, upg: state.upgrades, wind: state.wind,
      storm: state.storm, rings: state.rings, time: state.time,
    };
    const ev = stepPlane(p, inp, dt, ctxPhys);
    if (ev.ring) onRing(ev.ring);
    if (ev.stall) state.stallWarn = true; else state.stallWarn = false;
    if (ev.storm) state.wasInsideStorm = true;
    if (ev.stormNear) state.wasNearStorm = true;
    state.stormWarn = !!state.storm && Math.hypot(p.x - state.storm.x, p.z - state.storm.z) < 2600;
    if (ev.takeoff) showMessage('AIRBORNE!', 'Gear up with G when climbing', '#7dffa8', 1.6);
    if (ev.landed && state.rollout <= 0) onLanded(ev.landed);
    if (ev.crash && state.crashT <= 0) onCrash(ev.crash);

    // Feat trackers.
    state.maxSpeed = Math.max(state.maxSpeed, p.speed);
    if (state.maxSpeed > 70) awardFeat('speed-demon');
    const ground = terrainHeight(p.x, p.z);
    if (p.airborne && ground <= 1 && p.alt < 30) {
      state.lowPassT += dt;
      if (state.lowPassT > 5) awardFeat('low-pass');
    } else state.lowPassT = Math.max(0, state.lowPassT - dt);
    if (p.fuel <= 0 && p.airborne && p.speed < 12 && state.crashT <= 0) onCrash('fuel');

    // Next-ring label for the HUD.
    const next = state.rings.find((r) => !r.got && p.z < r.z + 150);
    if (next) {
      const d = Math.hypot(next.x - p.x, next.z - p.z);
      state.nextLabel = `RING ${state.rings.indexOf(next) + 1} · ${Math.round(d)} m`;
    } else state.nextLabel = `RUNWAY 36 · ${ISLANDS[LEGS[state.legIndex].to].name}`;

    if (state.rollout > 0) {
      state.rollout -= dt;
      if (state.rollout <= 0) {
        state.screen = 'debrief';
        if (state.legIndex === 4) awardFeat('campaign');
      }
    }
    if (state.crashT > 0) {
      state.crashT -= dt;
      if (state.crashT <= 0) state.screen = 'gameover';
    }
  }
}

// --- buttons / keys per screen ------------------------------------------------------
function handleClicks() {
  const c = input.mouse.clicked;
  if (!c) return;
  input.mouse.clicked = null;
  const id = buttons.hit(c.x, c.y);
  if (!id) return;
  if (id === 'start') state.screen = 'briefing';
  else if (id === 'howto') state.screen = 'howto';
  else if (id === 'back-title') { resetCampaign(); state.screen = 'title'; }
  else if (id === 'takeoff') startLeg(state.legIndex);
  else if (id === 'next-leg') state.screen = 'briefing', state.legIndex += 1;
  else if (id === 'finish') state.screen = 'win';
  else if (id === 'retry-leg' || id === 'replay-leg') state.screen = 'briefing';
  else if (id === 'again') { resetCampaign(); state.screen = 'briefing'; }
  else if (id.startsWith('buy:')) {
    const u = UPGRADES.find((x) => x.id === id.slice(4));
    if (!u) return;
    const lvl = state.upgrades[u.id] || 0;
    if (lvl >= u.max) return;
    const cost = u.cost[lvl];
    if (state.coins >= cost) {
      state.coins -= cost;
      state.upgrades[u.id] = lvl + 1;
      showMessage(`${u.name} — LEVEL ${lvl + 1}`, '', '#7dffa8', 1.5);
    }
  }
}

function handleKeys() {
  const s = state.screen;
  if (takePressed(input, 'Enter') || takePressed(input, 'NumpadEnter')) {
    if (s === 'title') state.screen = 'briefing';
    else if (s === 'briefing') startLeg(state.legIndex);
    else if (s === 'debrief') { if (state.legIndex < 4) { state.legIndex += 1; state.screen = 'briefing'; } else state.screen = 'win'; }
    else if (s === 'gameover') state.screen = 'briefing';
    else if (s === 'win') { resetCampaign(); state.screen = 'briefing'; }
  }
  if (takePressed(input, 'KeyH') && s === 'title') state.screen = 'howto';
  if (takePressed(input, 'Escape') && s === 'howto') state.screen = 'title';
  if (takePressed(input, 'KeyR')) {
    if (s === 'gameover' || s === 'debrief' || s === 'paused') state.screen = 'briefing';
  }
  if (takePressed(input, 'KeyP') && s === 'paused') state.screen = 'flying';
}

// --- self-test (?selftest=1): logic-only autopilot campaign --------------------------
function runSelfTest() {
  const results = { runs: [], unit: {} };
  // Unit checks.
  results.unit.runwayFlat = ISLANDS.every((isl, i) => {
    const c = runwayCenter(i);
    return Math.abs(terrainHeight(c.x, c.z) - c.alt) < 1.5;
  });
  results.unit.ringsAboveGround = LEGS.every((leg, i) => {
    const rings = buildRings(i, mulberry32(11));
    return rings.every((r) => r.y > terrainHeight(r.x, r.z) + 40);
  });
  results.unit.stallAboveZero = baseStallSpeed({}) > 0;
  // Autopilot campaign runs, logic only (no render).
  for (let run = 0; run < 8; run++) {
    const r2 = mulberry32(100 + run);
    const upg = run >= 4 ? { tank: 1, engine: 1 } : {};
    let legsDone = 0, ringsGot = 0, crash = null;
    for (let li = 0; li < 5; li++) {
      const p = makePlane(li, upg);
      const rings = buildRings(li, r2);
      const storm = stormCell(li);
      const leg = LEGS[li];
      const sim = { plane: p, rings, storm, legIndex: li, upgrades: upg, score: 0, coins: 0, time: 0, legTime: 0 };
      let steps = 0, landed = false;
      while (steps < 6000) {
        steps++;
        sim.time += 1 / 30; sim.legTime += 1 / 30;
        // Drive the shared autopilot by temporarily pointing state at the sim,
        // then restore the real fields (saved by value, not by reference).
        const saved = { plane: state.plane, rings: state.rings, storm: state.storm, legIndex: state.legIndex, upgrades: state.upgrades, time: state.time };
        Object.assign(state, { plane: p, rings, storm, legIndex: li, upgrades: upg, time: sim.time });
        const inp = autopilotInput();
        Object.assign(state, saved);
        const ev = stepPlane(p, inp, 1 / 30, { legIndex: li, upg, wind: { dir: leg.windDir, speed: leg.windSpeed }, storm, rings, time: sim.time });
        if (ev.ring) ringsGot++;
        if (ev.landed) { landed = true; break; }
        if (ev.crash) { crash = `${ev.crash}@leg${li + 1}`; break; }
        if (p.fuel <= 0 && p.airborne && p.speed < 12) { crash = `fuel@leg${li + 1}`; break; }
      }
      if (!landed) { if (!crash) crash = `timeout@leg${li + 1}`; break; }
      legsDone++;
    }
    results.runs.push({ run, legsDone, ringsGot, crash, won: legsDone === 5 });
  }
  results.wins = results.runs.filter((r) => r.won).length;
  return results;
}

// --- boot -------------------------------------------------------------------------
const shot = params.get('shot');
if (params.get('selftest') === '1') {
  window.__selftest = runSelfTest();
} else if (shot) {
  applyShot(state, shot, rng);
  state.clouds = buildClouds(mulberry32(seed + 3));
}

let last = performance.now();
let frames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  handleClicks();
  handleKeys();
  for (let i = 0; i < ff; i++) update(dt);
  render(ctx, state, buttons);
  frames++;
  if (frames === 3 && shot) window.__shotReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test hooks for the headless driver (not part of gameplay).
window.__sky = {
  screen: () => state.screen,
  state: () => ({
    screen: state.screen, leg: state.legIndex + 1,
    alt: Math.round(state.plane.alt), speed: Math.round(state.plane.speed * 1.944),
    heading: Math.round(state.plane.heading), fuel: Math.round(state.plane.fuel),
    rings: state.rings.filter((r) => r.got).length, ringsTotal: state.rings.length,
    score: state.score, coins: state.coins, medals: state.medals,
    feats: [...state.feats], crash: state.crashReason,
    over: ['gameover', 'win'].includes(state.screen),
    won: state.screen === 'win',
  }),
  canvasRect: () => {
    const r = canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  },
  autopilot: (on) => { state.autopilot = !!on; },
  start: () => { state.screen = 'briefing'; },
  takeoff: () => startLeg(state.legIndex),
  setScreen: (s) => { state.screen = s; },
};
