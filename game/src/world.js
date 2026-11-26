// World: the archipelago heightmap, runways, mail rings, storm cells, clouds,
// and the chase-camera projection. All geometry is procedural and original.
import { ISLANDS, LEGS, RUNWAY } from './data.js';
import { clamp, lerp, smoothstep, deg2rad } from './random.js';

// --- terrain ---------------------------------------------------------------
function islandHeight(isl, dx, dz) {
  const d2 = dx * dx + dz * dz;
  const sigma = isl.radius / 2.1;
  let h = isl.peak * Math.exp(-d2 / (2 * sigma * sigma));
  if (isl.volcano) {
    // A sharp cone on top of the gaussian for the volcano.
    const d = Math.sqrt(d2);
    h = Math.max(h, isl.peak * Math.max(0, 1 - d / (isl.radius * 0.62)));
  }
  return h;
}

// Gentle rolling bumps so the land is not a perfect cone.
function bump(x, z) {
  return 9 * Math.sin(x * 0.004 + 1.7) * Math.cos(z * 0.0035 - 0.6)
    + 6 * Math.sin((x + z) * 0.009 + 4.2);
}

export function runwayCenter(i) {
  const isl = ISLANDS[i];
  // Runway sits on the island's south shore side, flat, heading north (0 deg).
  return { x: isl.x, z: isl.z - isl.radius * 0.28, alt: isl.runwayAlt };
}

// Local runway coords: u along the runway (north), v across (east).
function runwayLocal(i, x, z) {
  const c = runwayCenter(i);
  return { u: z - c.z, v: x - c.x, c };
}

export function terrainHeight(x, z) {
  let h = 0;
  for (const isl of ISLANDS) h += islandHeight(isl, x - isl.x, z - isl.z);
  if (h > 2) h += bump(x, z) * smoothstep(2, 60, h);
  // Flatten a pad around every runway AND a valley corridor running the full
  // north-south length of the island through the strip, so a plane can climb
  // out over its own island and descend onto the strip without hitting the
  // peak that sits dead ahead of the runway. The corridor reads as a valley
  // pass. (The island spans u in [-0.72R, +1.28R] around its runway centre:
  // the runway sits 0.28R south of the island's centre.)
  for (let i = 0; i < ISLANDS.length; i++) {
    const { u, v, c } = runwayLocal(i, x, z);
    const R = ISLANDS[i].radius;
    const southEnd = -R * 0.72, northEnd = R * 1.28;
    let du = 0;
    if (u < southEnd) du = smoothstep(southEnd - 300, southEnd, u);
    else if (u <= northEnd) du = 1;
    else du = 1 - smoothstep(northEnd, northEnd + 300, u);
    const dv = 1 - smoothstep(200, 380, Math.abs(v)); // valley floor flat to 200 m out, blending to 380 m
    const f = Math.min(du, dv);
    if (f > 0) h = lerp(h, c.alt, f);
  }
  return h;
}

export function onRunway(i, x, z) {
  const { u, v } = runwayLocal(i, x, z);
  return Math.abs(u) <= RUNWAY.len / 2 && Math.abs(v) <= RUNWAY.width / 2;
}
// The landing zone is wider than the asphalt: a bush strip's flat valley floor
// counts as a landing (with a heavy centreline penalty in the score), so a
// touchdown 150 m off the centreline is a bad landing, not a hillside crash.
export function inLandingZone(i, x, z) {
  const { u, v } = runwayLocal(i, x, z);
  return Math.abs(u) <= RUNWAY.len / 2 + 40 && Math.abs(v) <= 200;
}
export function runwayOffset(i, x, z) {
  const { u, v } = runwayLocal(i, x, z);
  return { along: u, across: v };
}

// --- legs, rings, storms ----------------------------------------------------
export function legPath(legIndex) {
  const leg = LEGS[legIndex];
  if (leg.from === leg.to) {
    // Homecoming lap: circle the home island and come back to its runway.
    const c = runwayCenter(leg.from);
    return { a: c, b: c, loop: true };
  }
  return { a: runwayCenter(leg.from), b: runwayCenter(leg.to), loop: false };
}

export function buildRings(legIndex, rng) {
  const leg = LEGS[legIndex];
  const { a, b, loop } = legPath(legIndex);
  const rings = [];
  if (loop) {
    // ONE golden ring, high and far north-east: the plane climbs straight
    // ahead inside the flat valley corridor and only turns east once it is
    // above the island's flank. A ring 700 m east and only 900 m out sends
    // the plane across the slope at 180 m — it dies 11 s after takeoff.
    rings.push({ x: a.x + 500, y: a.alt + 280, z: a.z + 1600, r: 90, golden: true, got: false });
    return rings;
  }
  for (let k = 0; k < leg.rings; k++) {
    const t = (k + 1) / (leg.rings + 1);
    const first = k === 0;
    const last = k === leg.rings - 1;
    // The FIRST ring sits exactly on the departure runway's axis, 1200 m out,
    // at climb-out height: the plane climbs straight ahead inside the flat
    // valley corridor. The LAST ring sits exactly on the destination axis,
    // 2500 m south of its runway, at cruise altitude: a LONG, HIGH final
    // approach. A last ring only 1200 m out at runway+150 forces the plane to
    // descend onto the strip from 300 m while still converging on the axis —
    // 300 m off-axis at 300 m altitude is inside the volcano's flank, and the
    // plane dies on the slope. From 2500 m out at cruise altitude the plane
    // has a gentle 6-degree glide and time to settle on the centreline.
    let x, y, z;
    const cruiseAlt = Math.max(ISLANDS[leg.from].peak, ISLANDS[leg.to].peak) * 0.65 + 100;
    if (first) { x = a.x; y = a.alt + 180; z = a.z + 1200; }
    else if (last) { x = b.x; y = cruiseAlt; z = b.z - 1200; }
    else {
      // Middle rings sit ON the direct line between the first and last ring
      // positions — no lateral offset. A sideways offset makes the plane
      // arrive at the last ring flying diagonally across the route, and it
      // spends the whole final approach turning back onto the axis instead
      // of descending. The route is a mail run, not a slalom: the challenge
      // is altitude, wind and storms, not weaving.
      const fx = a.x, fz = a.z + 1200, lx = b.x, lz = b.z - 1200;
      x = lerp(fx, lx, t);
      z = lerp(fz, lz, t);
      const ground = terrainHeight(x, z);
      // High enough to clear the volcano on the way: the route between the
      // first and last rings crosses the departure island's flank, and a ring
      // at sea-level cruise altitude sends the plane into the slope mid-turn.
      y = Math.max(ground + 90, 170 + rng() * 130, cruiseAlt);
    }
    // Keep middle rings out of the storm cell: a ring inside the thunderhead
    // is a trap — the turbulence spins the plane around and it never recovers.
    const sc = stormCell(legIndex);
    if (sc && !first && !last) {
      const d = Math.hypot(x - sc.x, z - sc.z);
      const min = sc.r + 200;
      if (d < min) {
        const push = min - d;
        x += ((x - sc.x) / (d || 1)) * push;
        z += ((z - sc.z) / (d || 1)) * push;
      }
    }
    rings.push({ x, y, z, r: 80, golden: last, got: false });
  }
  return rings;
}

export function stormCell(legIndex) {
  const leg = LEGS[legIndex];
  if (!leg.storm) return null;
  const { a, b } = legPath(legIndex);
  return {
    x: lerp(a.x, b.x, leg.storm.dz) + leg.storm.dx,
    z: lerp(a.z, b.z, leg.storm.dz),
    y: 260,
    r: leg.storm.r,
  };
}

// --- clouds ------------------------------------------------------------------
export function buildClouds(rng) {
  const clouds = [];
  for (let i = 0; i < 46; i++) {
    clouds.push({
      x: (rng() - 0.5) * 7000,
      z: -1200 + rng() * 19600,
      y: 380 + rng() * 260,
      s: 140 + rng() * 260,
    });
  }
  return clouds;
}

// --- camera + projection -------------------------------------------------------
// Chase camera: behind and above the plane, looking along its heading.
// World: x east, y up, z north. Heading 0 = north, 90 = east.
export function cameraFor(plane) {
  const h = deg2rad(plane.heading);
  const back = 58;
  const up = 13;
  return {
    x: plane.x - Math.sin(h) * back,
    y: plane.alt + up,
    z: plane.z - Math.cos(h) * back,
    heading: plane.heading,
    pitch: plane.pitch * 0.35,
  };
}

// Project a world point to screen space. Returns null when behind the camera.
export function project(cam, p, W, H, f) {
  const h = deg2rad(cam.heading);
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const dz = p.z - cam.z;
  // Rotate into camera frame: forward = +z', right = +x'.
  const fwd = dx * Math.sin(h) + dz * Math.cos(h);
  const right = dx * Math.cos(h) - dz * Math.sin(h);
  // Small camera pitch (look slightly down when climbing).
  const cp = deg2rad(cam.pitch);
  const up = dy * Math.cos(cp) - fwd * Math.sin(cp);
  const fwd2 = dy * Math.sin(cp) + fwd * Math.cos(cp);
  if (fwd2 < 8) return null;
  const s = f / fwd2;
  return { x: W / 2 + right * s, y: H * 0.52 - up * s, d: fwd2, s };
}

// Terrain colour by height (sea level 0). Volcano rock + snow cap included.
export function terrainColor(h, isl) {
  if (h <= 0.5) return '#1d6fb4'; // deep sea
  if (h <= 4) return '#2f96cf'; // shallow
  if (h <= 9) return '#e6cf8e'; // sand
  if (h <= 90) return '#4da34e'; // lowland green
  if (h <= 220) return '#2f7d38'; // forest
  if (h <= 420) return '#6e5a44'; // rock
  return '#eef4fb'; // snow cap
}
export { clamp };
