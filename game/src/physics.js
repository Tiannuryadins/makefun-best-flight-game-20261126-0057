// Flight model: arcade but honest — throttle, pitch, bank, lift vs stall, wind,
// flaps, gear, fuel, cargo weight. Pure functions over a plane object so the
// self-test can step them without a renderer.
import { LEGS, RUNWAY, SACK_PAY, LANDING_MAX } from './data.js';
import { clamp, lerp, angDiff, deg2rad } from './random.js';
import { terrainHeight, onRunway, inLandingZone, runwayOffset, legPath, stormCell } from './world.js';

export const G = 9.81;

export function baseStallSpeed(upg) {
  return 30 - 5 * (upg.flaps || 0) - 2 * (upg.airframe || 0);
}
export function maxSpeed(upg) {
  return 75 + 8 * (upg.engine || 0);
}
export function maxFuel(upg) {
  return 120 + 40 * (upg.tank || 0);
}
export function cargoCount(legIndex, upg) {
  const leg = LEGS[legIndex];
  return leg.cargo + (upg.rack || 0);
}

// Create a fresh plane sitting on the departure runway, ready to roll.
export function makePlane(legIndex, upg) {
  const { a } = legPath(legIndex);
  return {
    x: a.x, z: a.z - RUNWAY.len / 2 + 60, alt: a.alt,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0, vspeed: 0,
    fuel: maxFuel(upg), gear: true, flaps: false,
    airborne: false, grounded: true,
    cargo: cargoCount(legIndex, upg),
  };
}

// One physics step. `input` = {pitch:-1..1, roll:-1..1, throttle:-1..1(delta), flaps, gear toggles applied by caller}.
// Returns events: {ring, crash, landed, warning} strings for the caller to act on.
export function stepPlane(p, input, dt, ctx) {
  const { legIndex, upg, wind, storm, rings, time } = ctx;
  const ev = {};
  const stall = baseStallSpeed(upg) + (p.flaps ? -4 : 0) + p.cargo * 0.9;

  // Throttle.
  p.throttle = clamp(p.throttle + input.throttle * dt * 0.9, 0, 1);
  const targetSpeed = p.throttle * maxSpeed(upg);
  const accel = (4.5 + 2.2 * (upg.prop || 0)) * (p.grounded ? 1.6 : 1);
  // Climbing bleeds speed; descending gains it (a modest penalty: a hard climb
  // costs a few m/s, it must not stall the plane out of its own takeoff).
  const climbBleed = p.airborne ? Math.max(0, p.pitch) * 0.35 : 0;
  p.speed += clamp(targetSpeed - p.speed - climbBleed * 1.5, -accel * dt * 2.4, accel * dt);
  if (p.fuel <= 0) { p.throttle = 0; p.speed = Math.max(0, p.speed - 6 * dt); }

  // Pitch / roll follow the stick with inertia.
  const pitchTarget = input.pitch * 16;
  p.pitch += clamp(pitchTarget - p.pitch, -38 * dt, 38 * dt);
  const rollTarget = input.roll * 34;
  p.roll += clamp(rollTarget - p.roll, -70 * dt, 70 * dt);

  // Turn: bank turns the nose.
  const turnRate = (G * Math.tan(deg2rad(p.roll))) / Math.max(18, p.speed); // rad/s
  p.heading = (p.heading + (turnRate * 180) / Math.PI * dt + 360) % 360;

  // Lift: climb rate from pitch while above stall; below stall the wing quits.
  const liftFactor = clamp((p.speed - stall * 0.55) / (stall * 0.6), 0, 1);
  const climbBase = Math.sin(deg2rad(p.pitch)) * p.speed * (1 + 0.25 * (upg.airframe || 0));
  let vspeed = climbBase * liftFactor;
  if (p.speed < stall && p.airborne) {
    vspeed -= (stall - p.speed) * 0.4; // sinking, nose drops
    ev.stall = true;
    if (p.speed < stall * 0.7) p.pitch += -6 * dt; // stall break
  }
  // Flaps add drag and a touch of lift at low speed (a small bonus: they must
  // not fight a landing descent).
  if (p.flaps) { vspeed += 0.4 * liftFactor; p.speed = Math.max(0, p.speed - 1.5 * dt); }
  // Storm turbulence: kicks + downdraft inside a cell. Strong enough to matter
  // (you go around the cell, not through it), gentle enough to recover from.
  if (storm) {
    const d = Math.hypot(p.x - storm.x, p.z - storm.z);
    if (d < storm.r && p.alt > 60 && p.alt < 560) {
      ev.storm = true;
      vspeed -= 5;
      p.roll += Math.sin(time * 7.3) * 12 * dt;
      p.pitch += Math.cos(time * 5.1) * 6 * dt;
    }
    if (d < storm.r + 260 && d >= storm.r) ev.stormNear = true;
  }
  p.vspeed = vspeed;
  p.alt += vspeed * dt;

  // Move: forward + wind (wind barely moves a plane sitting on its wheels).
  const h = deg2rad(p.heading);
  const windK = p.grounded ? 0.15 : 1;
  const wx = Math.sin(deg2rad(wind.dir)) * wind.speed * windK;
  const wz = Math.cos(deg2rad(wind.dir)) * wind.speed * windK;
  p.x += (Math.sin(h) * p.speed + wx) * dt;
  p.z += (Math.cos(h) * p.speed + wz) * dt;

  // Fuel burn scales with throttle.
  p.fuel = Math.max(0, p.fuel - p.throttle * 0.45 * dt);

  // Takeoff / ground state. Liftoff needs flying speed (above the stall), not
  // just rotation speed — lifting off slow means sinking straight back down.
  const ground = terrainHeight(p.x, p.z);
  if (p.grounded) {
    p.alt = ground;
    if (p.speed > stall * 1.05 && p.pitch > 4) { p.grounded = false; p.airborne = true; ev.takeoff = true; }
  }

  // Ring crossings: flying within the ring's radius (3D) takes it. A strict
  // z-plane crossing check is too brittle — a plane turning onto the ring
  // crosses its plane 100 m off laterally and the ring never counts, even
  // though the pilot flew right through the glow.
  if (rings) {
    for (const ring of rings) {
      if (ring.got) continue;
      const d = Math.hypot(p.x - ring.x, p.alt - ring.y, p.z - ring.z);
      if (d < ring.r) {
        ring.got = true;
        ev.ring = ring;
      }
    }
  }

  // Ground contact. Two cases: hard penetration (half a metre inside terrain or
  // water — always a crash; a smaller dip is left to the touchdown check so a
  // landing on the blended valley shoulder is judged, not auto-crashed) and a
  // gentle touchdown (a landing check; a plane climbing away just after takeoff
  // must not trip it, so vspeed must be ~level or sinking).
  if (p.airborne && p.alt < ground - 0.5) {
    ev.crash = ground <= 1 ? 'ditch' : 'terrain';
    p.alt = ground;
  } else if (p.airborne && p.alt <= ground + 1.5 && p.vspeed <= 0.5) {
    const to = LEGS[legIndex].to;
    const from = LEGS[legIndex].from;
    const onTo = inLandingZone(to, p.x, p.z);
    const onFrom = !onTo && from !== to && inLandingZone(from, p.x, p.z);
    const rwy = onTo ? to : from;
    const off = (onTo || onFrom) ? runwayOffset(rwy, p.x, p.z) : { along: 0, across: 999 };
    const headErr = Math.abs(angDiff(p.heading, 0));
    const hardLimit = -6 - 3 * (upg.gear || 0);
    const soft = p.vspeed > -2.5;
    if ((onTo || onFrom) && p.gear && p.vspeed > hardLimit && p.speed < 58 && headErr < 30) {
      if (onTo) {
        ev.landed = { vspeed: p.vspeed, across: off.across, headErr, soft, speed: p.speed };
      }
      // Touching down back on the departure runway is a touch-and-go, not the
      // end of the leg: roll on and take off again.
      p.grounded = true; p.airborne = false; p.alt = ground;
    } else if ((onTo || onFrom) && !p.gear && p.vspeed > hardLimit && p.speed < 50) {
      ev.crash = 'gear-up';
      p.alt = ground;
    } else if (ground <= 1) {
      ev.crash = 'ditch';
      p.alt = ground;
    } else {
      ev.crash = 'terrain';
      p.alt = ground;
    }
  }
  // Flying into the volcano / terrain while airborne is caught above; also hard ceiling.
  if (p.alt > 1200) { p.alt = 1200; p.vspeed = Math.min(0, p.vspeed); }
  return ev;
}

// Landing quality 0..400 from the touchdown numbers.
export function landingScore(t) {
  let s = LANDING_MAX;
  s -= Math.max(0, -t.vspeed) * 32; // sink rate
  s -= Math.abs(t.across) * 4; // centreline
  s -= t.headErr * 3; // alignment
  s -= Math.max(0, t.speed - 42) * 4; // too fast
  if (!t.soft) s -= 20;
  return Math.max(0, Math.round(s));
}
export function medalFor(score) {
  return score >= 340 ? 'GOLD' : score >= 250 ? 'SILVER' : 'BRONZE';
}
export { SACK_PAY };
