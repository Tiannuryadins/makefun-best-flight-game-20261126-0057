// Screenshot staging: ?shot=title|flight|landing|debrief (with &seed=N) puts the
// game into a dense, readable state and sets window.__shotReady when the frame
// is painted. These are real renders of the game's own code, not mock-ups.
import { LEGS } from './data.js';
import { makePlane } from './physics.js';
import { buildRings, legPath, runwayCenter } from './world.js';
import { clamp } from './random.js';

export function applyShot(state, shot, rng) {
  const set = (patch) => Object.assign(state, patch);
  if (shot === 'title') {
    // Parked on the home runway, golden-hour view down the strip, rings ahead.
    const p = makePlane(0, state.upgrades);
    p.heading = 0; p.pitch = 0; p.roll = 0;
    set({ screen: 'title', plane: p, legIndex: 0 });
    state.rings = buildRings(0, rng);
    return;
  }
  if (shot === 'flight') {
    // Mid-leg 2, 250 m up, next ring 500 m ahead and centred, storm cell off to
    // the right, full HUD lit.
    set({ screen: 'flying', legIndex: 1 });
    const { a, b } = legPath(1);
    const p = makePlane(1, state.upgrades);
    p.x = (a.x + b.x) / 2 - 120; p.z = (a.z + b.z) / 2 - 500;
    p.alt = 250; p.heading = 4; p.pitch = 3; p.roll = -6;
    p.speed = 52; p.throttle = 0.78; p.fuel = 74; p.airborne = true; p.grounded = false;
    p.gear = false; p.flaps = false; p.vspeed = 2.4;
    state.plane = p;
    state.rings = buildRings(1, rng);
    // Put the next ring dead ahead of the plane for a clean shot.
    const next = state.rings[0];
    next.x = p.x + 60; next.y = 255; next.z = p.z + 520;
    state.rings[1].x = p.x - 260; state.rings[1].y = 300; state.rings[1].z = p.z + 1300;
    state.rings[2].x = p.x + 300; state.rings[2].y = 210; state.rings[2].z = p.z + 2100;
    state.score = 1250; state.coins = 340; state.legTime = 83;
    state.message = 'RING 1/3 — MAIL DELIVERED +150'; state.messageSub = 'Next ring 520 m ahead';
    state.messageT = 2.5; state.messageColor = '#7dffa8';
    return;
  }
  if (shot === 'landing') {
    // Final approach to Merapi runway 36: gear down, flaps down, 60 m up, the
    // strip centred ahead, instruments lit.
    set({ screen: 'flying', legIndex: 2 });
    const c = runwayCenter(2);
    const p = makePlane(2, state.upgrades);
    p.x = c.x + 18; p.z = c.z - 900; p.alt = c.alt + 62;
    p.heading = 2; p.pitch = -2; p.roll = 1.5;
    p.speed = 38; p.throttle = 0.32; p.fuel = 41; p.airborne = true; p.grounded = false;
    p.gear = true; p.flaps = true; p.vspeed = -3.1;
    state.plane = p;
    state.rings = buildRings(2, rng);
    state.rings.forEach((r) => { r.got = true; });
    state.score = 2310; state.coins = 512; state.legTime = 148;
    state.message = 'FINAL — GEAR DOWN · FLAPS DOWN'; state.messageSub = 'Runway 36 · 900 m · sink −3.1 m/s';
    state.messageT = 2.5; state.messageColor = '#ffe9a8';
    return;
  }
  if (shot === 'debrief') {
    // Leg 2 finished with a GOLD landing: the debrief screen, medals + feats.
    set({ screen: 'debrief', legIndex: 1 });
    state.plane = makePlane(1, state.upgrades);
    state.rings = buildRings(1, rng);
    state.rings.forEach((r) => { r.got = true; });
    state.score = 2140; state.coins = 486; state.legTime = 154;
    state.medals = ['SILVER', 'GOLD', null, null, null];
    state.feats = new Set(['first-ring', 'ring-streak', 'gold-landing', 'all-rings', 'hopper', 'fuel-saver']);
    state.featsThisLeg = ['GREASED', 'FULL ROUTE'];
    state.lastLanding = { score: 372, vspeed: -1.8, across: 6, headErr: 4, timeBonus: 120, coinsEarned: 260 };
    return;
  }
  if (shot === 'win') {
    set({ screen: 'win', legIndex: 4 });
    state.score = 9840; state.coins = 1420;
    state.medals = ['SILVER', 'GOLD', 'GOLD', 'SILVER', 'GOLD'];
    state.feats = new Set(['first-ring', 'ring-streak', 'gold-landing', 'all-rings', 'hopper', 'volcano', 'fuel-saver', 'gentle', 'mail-master', 'campaign', 'tailwind', 'speed-demon']);
    return;
  }
}
export { clamp };
