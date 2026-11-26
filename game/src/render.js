// Renderer: pseudo-3D chase view (projected terrain grid, runway, rings, storm,
// clouds, vector plane sprite) + full HUD + all screens. Canvas 2D only, no assets.
import { ISLANDS, LEGS, RUNWAY, UPGRADES, SACK_PAY } from './data.js';
import { medalFor } from './physics.js';
import { clamp, lerp, deg2rad, angDiff } from './random.js';
import {
  terrainHeight, terrainColor, cameraFor, project, runwayCenter, onRunway,
  legPath, stormCell,
} from './world.js';

const W = 1280;
const H = 720;
const FOCAL = 620;

function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function fmtTime(s) {
  const m = Math.floor(s / 60); const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}
function headingName(deg) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
function medalColor(m) { return m === 'GOLD' ? '#ffd23e' : m === 'SILVER' ? '#d7dee8' : '#e09a5a'; }

function panel(ctx, x, y, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(6,18,30,${alpha})`;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(120,200,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
}
function text(ctx, s, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

// --- 3D scene ----------------------------------------------------------------
function drawSky(ctx, cam, time) {
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  g.addColorStop(0, '#3f8fd2');
  g.addColorStop(0.55, '#8ec8ee');
  g.addColorStop(1, '#ffe3a3');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.62 + 2);
  // Sun, upper right.
  const sx = W * 0.78, sy = H * 0.13;
  const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
  sg.addColorStop(0, 'rgba(255,246,200,0.95)');
  sg.addColorStop(0.25, 'rgba(255,220,130,0.55)');
  sg.addColorStop(1, 'rgba(255,220,130,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx - 95, sy - 95, 190, 190);
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI * 2); ctx.fill();
}

function drawTerrain(ctx, state) {
  const { plane } = state;
  const cam = cameraFor(plane);
  const horizon = project(cam, { x: cam.x, y: cam.y, z: cam.z + 20000 }, W, H, FOCAL);
  const hy = horizon ? horizon.y : H * 0.52;
  // Sea below the horizon.
  const sea = ctx.createLinearGradient(0, hy, 0, H);
  sea.addColorStop(0, '#2f96cf'); sea.addColorStop(1, '#14598f');
  ctx.fillStyle = sea; ctx.fillRect(0, hy, W, H - hy);
  // Sun glitter on the water.
  ctx.fillStyle = 'rgba(255,240,180,0.10)';
  for (let i = 0; i < 14; i++) {
    const gx = ((i * 173 + 60) % W);
    const gy = hy + 18 + ((i * 47) % Math.max(20, H - hy - 30));
    ctx.fillRect(gx, gy, 60 + (i % 3) * 30, 2);
  }
  // Terrain grid, far rows first.
  const step = 260;
  const x0 = Math.floor((cam.x - 2800) / step) * step;
  const zFar = cam.z + 6600;
  const zNear = cam.z - 400;
  for (let z = zFar; z > zNear; z -= step) {
    for (let x = x0; x < cam.x + 2800; x += step) {
      const h00 = terrainHeight(x, z);
      const h10 = terrainHeight(x + step, z);
      const h01 = terrainHeight(x, z - step);
      const h11 = terrainHeight(x + step, z - step);
      if (Math.max(h00, h10, h01, h11) <= 0.5) continue; // open sea, already painted
      const p00 = project(cam, { x, y: h00, z }, W, H, FOCAL);
      const p10 = project(cam, { x: x + step, y: h10, z }, W, H, FOCAL);
      const p01 = project(cam, { x, y: h01, z: z - step }, W, H, FOCAL);
      const p11 = project(cam, { x: x + step, y: h11, z: z - step }, W, H, FOCAL);
      if (!p00 || !p10 || !p01 || !p11) continue;
      const avg = (h00 + h10 + h01 + h11) / 4;
      ctx.fillStyle = terrainColor(avg);
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y); ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y); ctx.lineTo(p01.x, p01.y);
      ctx.closePath(); ctx.fill();
      // Subtle grid shading on land for depth.
      if (avg > 9) {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fill();
      }
    }
  }
  return cam;
}

function drawRunway(ctx, state, cam) {
  const to = LEGS[state.legIndex].to;
  const c = runwayCenter(to);
  const segLen = 60;
  for (let u = -RUNWAY.len / 2; u < RUNWAY.len / 2; u += segLen) {
    const z0 = c.z + u, z1 = c.z + Math.min(u + segLen, RUNWAY.len / 2);
    const a = project(cam, { x: c.x - RUNWAY.width / 2, y: c.alt, z: z0 }, W, H, FOCAL);
    const b = project(cam, { x: c.x + RUNWAY.width / 2, y: c.alt, z: z0 }, W, H, FOCAL);
    const cc = project(cam, { x: c.x + RUNWAY.width / 2, y: c.alt, z: z1 }, W, H, FOCAL);
    const d = project(cam, { x: c.x - RUNWAY.width / 2, y: c.alt, z: z1 }, W, H, FOCAL);
    if (!a || !b || !cc || !d) continue;
    ctx.fillStyle = '#3a3f46';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(cc.x, cc.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
    // Centreline dash.
    const w2 = RUNWAY.width / 2;
    const m1 = project(cam, { x: c.x - 2, y: c.alt + 0.4, z: z0 + segLen * 0.2 }, W, H, FOCAL);
    const m2 = project(cam, { x: c.x + 2, y: c.alt + 0.4, z: z0 + segLen * 0.2 }, W, H, FOCAL);
    const m3 = project(cam, { x: c.x + 2, y: c.alt + 0.4, z: z0 + segLen * 0.55 }, W, H, FOCAL);
    const m4 = project(cam, { x: c.x - 2, y: c.alt + 0.4, z: z0 + segLen * 0.55 }, W, H, FOCAL);
    if (m1 && m2 && m3 && m4) {
      ctx.fillStyle = '#f4f6f8';
      ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.lineTo(m3.x, m3.y); ctx.lineTo(m4.x, m4.y); ctx.closePath(); ctx.fill();
    }
  }
  // Runway label "36" at the near threshold.
  const lab = project(cam, { x: c.x, y: c.alt + 1, z: c.z - RUNWAY.len / 2 + 40 }, W, H, FOCAL);
  if (lab && lab.d < 4000) {
    text(ctx, '36', lab.x, lab.y, Math.max(12, 9000 / lab.d), '#ffffff', 'center');
  }
}

function drawRing(ctx, state, cam, ring, isNext, time) {
  const pts = [];
  for (let a = 0; a <= 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    pts.push(project(cam, {
      x: ring.x + Math.cos(t) * ring.r,
      y: ring.y + Math.sin(t) * ring.r,
      z: ring.z,
    }, W, H, FOCAL));
  }
  if (pts.some((p) => !p)) return;
  const pulse = isNext ? 1 + 0.18 * Math.sin(time * 5) : 1;
  const col = ring.golden ? '#ffd23e' : '#ff9d1e';
  ctx.save();
  ctx.globalAlpha = ring.got ? 0.25 : 0.95;
  ctx.lineWidth = 7 * pulse;
  ctx.strokeStyle = col;
  ctx.shadowColor = col; ctx.shadowBlur = 18;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff7e0';
  ctx.stroke();
  ctx.restore();
  if (isNext && !ring.got) {
    const top = project(cam, { x: ring.x, y: ring.y + ring.r + 26, z: ring.z }, W, H, FOCAL);
    if (top) text(ctx, ring.golden ? '★ FINAL RING' : 'MAIL RING', top.x, top.y, 13, '#ffe9a8', 'center');
  }
}

function drawClouds(ctx, state, cam) {
  const sorted = [...state.clouds].sort((a, b) => {
    const da = Math.hypot(a.x - cam.x, a.z - cam.z);
    const db = Math.hypot(b.x - cam.x, b.z - cam.z);
    return db - da;
  });
  for (const c of sorted) {
    const p = project(cam, c, W, H, FOCAL);
    if (!p || p.d < 100 || p.d > 9000) continue;
    const s = c.s * p.s * 0.9;
    if (s < 4) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s, s * 0.36, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s * 0.5, p.y + s * 0.08, s * 0.6, s * 0.28, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s * 0.5, p.y + s * 0.06, s * 0.65, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStorm(ctx, state, cam, time) {
  const storm = stormCell(state.legIndex);
  if (!storm) return;
  const p = project(cam, storm, W, H, FOCAL);
  if (!p || p.d < 80) return;
  const s = storm.r * p.s;
  if (s < 6) return;
  const flash = Math.sin(time * 2.1) > 0.96;
  ctx.fillStyle = flash ? 'rgba(120,140,190,0.92)' : 'rgba(52,58,74,0.92)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, s, s * 0.42, 0, 0, Math.PI * 2);
  ctx.ellipse(p.x - s * 0.55, p.y + s * 0.1, s * 0.6, s * 0.32, 0, 0, Math.PI * 2);
  ctx.ellipse(p.x + s * 0.55, p.y + s * 0.08, s * 0.65, s * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,34,48,0.9)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + s * 0.28, s * 0.8, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  if (p.d < 5200) text(ctx, '⛈ STORM CELL — KEEP CLEAR', p.x, p.y - s * 0.55, 14, '#ffd23e', 'center');
}

// --- plane sprite (chase view, screen space) ---------------------------------
function drawPlane(ctx, state) {
  const { plane } = state;
  const cx = W / 2;
  const cy = H * 0.60 - plane.pitch * 1.6;
  const bank = -deg2rad(plane.roll);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank * 0.9);
  const S = 1; // scale
  // Wings (dihedral, red tips, lit nav lights).
  ctx.fillStyle = '#f2f4f6';
  ctx.beginPath();
  ctx.moveTo(-14, 6); ctx.lineTo(-118, 26); ctx.lineTo(-122, 14); ctx.lineTo(-16, -6);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 6); ctx.lineTo(118, 26); ctx.lineTo(122, 14); ctx.lineTo(16, -6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d23b2e';
  ctx.fillRect(-124, 13, 14, 13);
  ctx.fillRect(110, 13, 14, 13);
  // Nav lights.
  ctx.fillStyle = '#37e08a'; ctx.beginPath(); ctx.arc(-124, 20, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(124, 20, 4, 0, Math.PI * 2); ctx.fill();
  // Fuselage (rounded, white with red cheatline).
  ctx.fillStyle = '#eef2f5';
  ctx.beginPath();
  ctx.moveTo(-13, -58); ctx.quadraticCurveTo(0, -68, 13, -58);
  ctx.lineTo(15, 34); ctx.quadraticCurveTo(0, 46, -15, 34);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d23b2e'; ctx.fillRect(-13, -18, 26, 7);
  ctx.fillStyle = '#1c3a5e'; ctx.fillRect(-9, -30, 18, 9); // cabin windows
  // Tail fin + stabiliser.
  ctx.fillStyle = '#d23b2e';
  ctx.beginPath(); ctx.moveTo(-10, -58); ctx.lineTo(0, -92); ctx.lineTo(10, -58); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(-6, -62); ctx.lineTo(0, -82); ctx.lineTo(6, -62); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2f4f6';
  ctx.beginPath(); ctx.moveTo(-52, -44); ctx.lineTo(52, -44); ctx.lineTo(46, -34); ctx.lineTo(-46, -34); ctx.closePath(); ctx.fill();
  // Tail light.
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -92, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Shadow on the ground below the plane.
  const ground = terrainHeight(plane.x, plane.z);
  if (plane.alt - ground < 400 && plane.alt - ground > 2) {
    const cam = cameraFor(plane);
    const sp = project(cam, { x: plane.x, y: ground + 1, z: plane.z }, W, H, FOCAL);
    if (sp) {
      const r = clamp(4200 / sp.d, 4, 60);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y, r * 1.6, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// --- HUD ----------------------------------------------------------------------
function drawHUD(ctx, state) {
  const { plane, legIndex } = state;
  const leg = LEGS[legIndex];
  const to = ISLANDS[leg.to];
  const from = ISLANDS[leg.from];
  const knots = plane.speed * 1.944;
  const ringsGot = state.rings.filter((r) => r.got).length;

  // Top bar.
  ctx.fillStyle = 'rgba(6,18,30,0.78)';
  ctx.fillRect(0, 0, W, 46);
  ctx.fillStyle = '#7cc8ff'; ctx.fillRect(0, 46, W, 2);
  text(ctx, `LEG ${legIndex + 1}/5 · ${from.name} → ${to.name}`, 18, 24, 17, '#ffffff');
  text(ctx, `RING ${ringsGot}/${state.rings.length}`, 330, 24, 15, ringsGot === state.rings.length ? '#7dffa8' : '#ffe9a8');
  // Heading tape.
  const tapeW = 420, tapeX = W / 2 - tapeW / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(tapeX, 6, tapeW, 34); ctx.clip();
  for (let d = -60; d <= 60; d += 5) {
    const hd = Math.round((plane.heading + d) / 5) * 5;
    const x = tapeX + tapeW / 2 + d * 3.4;
    const norm = ((hd % 360) + 360) % 360;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, norm % 30 === 0 ? 12 : 22); ctx.lineTo(x, 32); ctx.stroke();
    if (norm % 30 === 0) text(ctx, norm % 90 === 0 ? headingName(norm) : String(norm).padStart(3, '0'), x, 15, 11, '#ffffff', 'center');
  }
  ctx.restore();
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath(); ctx.moveTo(W / 2 - 6, 4); ctx.lineTo(W / 2 + 6, 4); ctx.lineTo(W / 2, 12); ctx.closePath(); ctx.fill();
  text(ctx, `SCORE ${fmt(state.score)}`, W - 330, 24, 16, '#ffffff');
  text(ctx, `◉ ${fmt(state.coins)}`, W - 170, 24, 16, '#ffd23e');
  text(ctx, fmtTime(state.legTime), W - 70, 24, 15, '#bfe6ff', 'right');

  // Left cluster: artificial horizon + ALT/SPD/VSI.
  panel(ctx, 16, 66, 216, 250);
  const hx = 124, hy = 136, hr = 62;
  ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.clip();
  ctx.translate(hx, hy); ctx.rotate(deg2rad(plane.roll));
  ctx.translate(0, clamp(plane.pitch, -20, 20) * 1.6);
  ctx.fillStyle = '#7cc0ee'; ctx.fillRect(-hr - 4, -hr - 60, hr * 2 + 8, hr + 60);
  ctx.fillStyle = '#8a6a42'; ctx.fillRect(-hr - 4, 0, hr * 2 + 8, hr + 60);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
  for (const p of [-15, -10, -5, 0, 5, 10, 15]) {
    ctx.beginPath(); ctx.moveTo(-26, -p * 1.6); ctx.lineTo(26, -p * 1.6); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hx - 26, hy); ctx.lineTo(hx - 8, hy); ctx.moveTo(hx + 8, hy); ctx.lineTo(hx + 26, hy); ctx.stroke();
  ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fillStyle = '#ffd23e'; ctx.fill();
  text(ctx, 'ATTITUDE', hx, hy + hr + 12, 10, '#7fb8dd', 'center');
  text(ctx, 'ALT', 30, 232, 11, '#7fb8dd');
  text(ctx, `${fmt(plane.alt)} m`, 30, 254, 21, '#ffffff');
  text(ctx, `${fmt(plane.alt * 3.281)} ft`, 150, 254, 12, '#bfe6ff');
  text(ctx, 'SPD', 30, 282, 11, '#7fb8dd');
  text(ctx, `${fmt(knots)} kt`, 30, 302, 21, '#ffffff');
  const vs = plane.vspeed;
  text(ctx, `V/S ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, 150, 302, 12, vs < -4 ? '#ff7a6e' : '#bfe6ff');
  if (plane.speed < 34 && plane.airborne) {
    text(ctx, '⚠ STALL', 124, 66 + 250 - 12, 13, '#ff5a4d', 'center');
  }

  // Right cluster: fuel, throttle, gear/flaps, wind, cargo.
  panel(ctx, W - 232, 66, 216, 250);
  text(ctx, 'FUEL', W - 216, 84, 11, '#7fb8dd');
  const fuelFrac = plane.fuel / (100 + 40 * (state.upgrades.tank || 0));
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(W - 216, 94, 184, 16);
  ctx.fillStyle = fuelFrac > 0.3 ? '#37c978' : fuelFrac > 0.15 ? '#ffb020' : '#ff5a4d';
  ctx.fillRect(W - 216, 94, 184 * clamp(fuelFrac, 0, 1), 16);
  text(ctx, `${Math.round(fuelFrac * 100)}%`, W - 32, 102, 12, '#ffffff', 'right');
  text(ctx, 'THROTTLE', W - 216, 128, 11, '#7fb8dd');
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(W - 216, 138, 184, 16);
  ctx.fillStyle = '#4db2ff'; ctx.fillRect(W - 216, 138, 184 * plane.throttle, 16);
  text(ctx, `${Math.round(plane.throttle * 100)}%`, W - 32, 146, 12, '#ffffff', 'right');
  const gearCol = plane.gear ? '#37c978' : '#ff5a4d';
  // Gear and flaps on separate lines: side-by-side at 13 px, "FLAPS ● DOWN"
  // ran past the panel's right edge and was clipped (seen in shot 3).
  text(ctx, `GEAR ${plane.gear ? '● DOWN' : '○ UP'}`, W - 216, 178, 13, gearCol);
  text(ctx, `FLAPS ${plane.flaps ? '● DOWN' : '○ UP'}`, W - 216, 200, 13, plane.flaps ? '#37c978' : '#bfe6ff');
  const wind = state.wind;
  text(ctx, `WIND ${Math.round(wind.speed)} m/s ${headingName(wind.dir)}`, W - 216, 224, 13, '#ffffff');
  ctx.save();
  ctx.translate(W - 40, 224);
  ctx.rotate(deg2rad(wind.dir + 180));
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  text(ctx, `✉ MAIL ${plane.cargo} sack${plane.cargo === 1 ? '' : 's'} · ${SACK_PAY}c each`, W - 216, 248, 12, '#ffe9a8');
  text(ctx, `NEXT: ${state.nextLabel}`, W - 216, 272, 12, '#bfe6ff');
  if (state.stormWarn) text(ctx, '⛈ STORM AHEAD — STEER CLEAR', W - 216, 296, 12, '#ffb020');

  // Bottom centre: ring progress + next-ring distance.
  const next = state.rings.find((r) => !r.got);
  panel(ctx, W / 2 - 190, H - 62, 380, 46, 0.6);
  state.rings.forEach((r, i) => {
    const x = W / 2 - 150 + i * 30;
    ctx.fillStyle = r.got ? '#ffd23e' : 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(x, H - 39, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    text(ctx, String(i + 1), x, H - 38, 11, r.got ? '#1a2a3a' : '#ffffff', 'center');
  });
  if (next) {
    const d = Math.hypot(next.x - plane.x, next.z - plane.z);
    text(ctx, `NEXT RING ${fmt(d)} m`, W / 2 + 40, H - 39, 14, '#ffffff');
  } else {
    text(ctx, 'ALL RINGS — LAND ON THE RUNWAY', W / 2 + 40, H - 39, 14, '#7dffa8');
  }

  // Mini map, bottom right.
  panel(ctx, W - 232, H - 168, 216, 92, 0.6);
  text(ctx, 'ROUTE MAP', W - 216, H - 156, 10, '#7fb8dd');
  ISLANDS.forEach((isl, i) => {
    const mx = W - 216 + 24 + i * 40;
    const my = H - 118;
    ctx.fillStyle = i === leg.to ? '#ffd23e' : i === leg.from ? '#7dffa8' : '#4db2ff';
    ctx.beginPath(); ctx.arc(mx, my, i === leg.to ? 7 : 5, 0, Math.PI * 2); ctx.fill();
    text(ctx, isl.name.slice(0, 4), mx, my + 16, 8, '#bfe6ff', 'center');
    if (i < ISLANDS.length - 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(mx + 6, my); ctx.lineTo(mx + 34, my); ctx.stroke();
    }
  });
  const prog = clamp((plane.z - ISLANDS[leg.from].z) / Math.max(1, ISLANDS[leg.to].z - ISLANDS[leg.from].z), 0, 1);
  const px = W - 216 + 24 + leg.from * 40 + prog * 40;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(px, H - 118, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
  if (state.storm && (state.upgrades.radar || state.stormNear)) {
    text(ctx, '⛈ storm on route', W - 216, H - 92, 10, '#ffb020');
  }

  // Centre message banner.
  if (state.message && state.messageT > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(state.messageT, 0, 1);
    text(ctx, state.message, W / 2, H * 0.30, 34, state.messageColor || '#ffffff', 'center');
    if (state.messageSub) text(ctx, state.messageSub, W / 2, H * 0.30 + 34, 16, '#ffe9a8', 'center');
    ctx.restore();
  }
  if (state.stallWarn) {
    const blink = Math.sin(state.time * 12) > 0;
    if (blink) text(ctx, '⚠ STALL — NOSE DOWN, FULL THROTTLE ⚠', W / 2, 84, 22, '#ff5a4d', 'center');
  }
}

// --- screens ------------------------------------------------------------------
function button(ctx, buttons, id, x, y, w, h, label, opts = {}) {
  const hover = false;
  ctx.fillStyle = opts.primary ? '#ffb020' : 'rgba(10,30,48,0.85)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = opts.primary ? '#ffe9a8' : 'rgba(120,200,255,0.5)';
  ctx.lineWidth = 2; ctx.stroke();
  text(ctx, label, x + w / 2, y + h / 2 + 1, opts.size || 17, opts.primary ? '#1a2a3a' : '#ffffff', 'center');
  buttons.add(id, x, y, w, h);
  return hover;
}

function drawTitle(ctx, state, buttons) {
  const { plane } = state;
  // Scenic: plane parked on the home runway at golden hour.
  drawSky(ctx, cameraFor(plane), state.time);
  drawTerrain(ctx, state);
  drawRunway(ctx, state, cameraFor(plane));
  drawClouds(ctx, state, cameraFor(plane));
  drawPlane(ctx, state);
  ctx.fillStyle = 'rgba(4,14,24,0.45)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(4,14,24,0.55)'; ctx.fillRect(0, 0, W, 150);
  text(ctx, 'NUSANTARA SKY POST', W / 2, 62, 54, '#ffffff', 'center');
  text(ctx, 'Bush-pilot airmail across 5 volcanic islands — fly the rings, mind the wind, grease the landing', W / 2, 104, 17, '#ffe9a8', 'center');
  text(ctx, '5 LEGS  ·  12 MAIL RINGS  ·  8 HANGAR UPGRADES  ·  15 PILOT FEATS  ·  3 STORM CELLS', W / 2, 132, 14, '#bfe6ff', 'center');
  panel(ctx, W / 2 - 330, 190, 660, 190, 0.78);
  text(ctx, 'HOW A LEG WORKS', W / 2, 214, 15, '#7cc8ff', 'center');
  const lines = [
    '↑ ↓ pitch  ·  ← → bank & turn  ·  W / S throttle  ·  F flaps  ·  G gear  ·  P pause',
    'Take off, thread every glowing mail ring (+150 pts each), then land on the',
    'next island runway — gear DOWN, slow, on the centreline. Rings pay, landings',
    'are scored GOLD / SILVER / BRONZE, cargo sacks pay 60 coins each.',
    'Wind gusts push you off course and storm cells throw the plane around —',
    'watch the wind arrow, keep fuel in the tank, and never stall below 30 m/s.',
  ];
  lines.forEach((l, i) => text(ctx, l, W / 2, 244 + i * 22, 14, '#ffffff', 'center', 'normal'));
  button(ctx, buttons, 'start', W / 2 - 150, 410, 300, 56, '✈  FLY LEG 1  (Enter)', { primary: true, size: 20 });
  button(ctx, buttons, 'howto', W / 2 - 150, 480, 300, 44, 'HOW TO FLY  (H)', { size: 15 });
  text(ctx, 'Best score wins the route — campaign medals and feats on the debrief screen.', W / 2, 560, 13, '#bfe6ff', 'center', 'normal');
  text(ctx, 'An original game: hand-drawn art, procedural islands, no assets from any other game.', W / 2, 584, 12, '#7fb8dd', 'center', 'normal');
}

function drawHowTo(ctx, state, buttons) {
  ctx.fillStyle = '#0a1a2a'; ctx.fillRect(0, 0, W, H);
  text(ctx, 'HOW TO FLY', W / 2, 56, 40, '#ffffff', 'center');
  const rows = [
    ['TAKE OFF', 'Hold W to full throttle, pull ↑ at 30 m/s, gear up with G once climbing.'],
    ['STEER', '← → bank to turn. The nose follows the bank — gentle banks, or you bleed speed.'],
    ['RINGS', 'Fly through the glowing ring: centre it, keep speed up. +150 pts, +time bonus.'],
    ['WIND', 'Gusts push the plane sideways. The wind arrow (top right) shows where it blows.'],
    ['STORMS', 'Dark thunderheads throw the plane around and shove it down. Fly around them.'],
    ['LANDING', 'Line up on runway 36, flaps F, gear G, throttle low, sink under −6 m/s.'],
    ['FUEL', 'Throttle burns fuel. Land with the tank dry and you glide — or ditch in the sea.'],
    ['CARGO', 'Every mail sack delivered pays 60 coins. Heavier cargo climbs slower.'],
    ['UPGRADES', 'Spend coins between legs: bigger tank, turbo engine, flaps, radar, cargo rack.'],
    ['MEDALS', 'Landings score up to 400: gentle sink, centreline, aligned, slow = GOLD.'],
  ];
  rows.forEach((r, i) => {
    const y = 110 + i * 48;
    text(ctx, r[0], 150, y, 16, '#ffd23e');
    text(ctx, r[1], 330, y, 15, '#ffffff', 'left', 'normal');
  });
  button(ctx, buttons, 'back-title', W / 2 - 130, 610, 260, 48, 'BACK  (Esc)', { primary: true });
}

function drawBriefing(ctx, state, buttons) {
  const leg = LEGS[state.legIndex];
  const from = ISLANDS[leg.from], to = ISLANDS[leg.to];
  ctx.fillStyle = '#0a1a2a'; ctx.fillRect(0, 0, W, H);
  text(ctx, `LEG ${state.legIndex + 1} / 5 — ${from.name} → ${to.name}`, W / 2, 52, 34, '#ffffff', 'center');
  const dist = Math.round(Math.hypot(to.x - from.x, to.z - from.z) / 100) / 10;
  text(ctx, `${dist} km  ·  ${leg.rings} mail ring${leg.rings === 1 ? '' : 's'}  ·  wind ${leg.windSpeed} m/s ${headingName(leg.windDir)}  ·  cargo ${leg.cargo} sacks  ·  par ${leg.par}s`,
    W / 2, 88, 15, '#bfe6ff', 'center', 'normal');
  if (leg.storm) text(ctx, '⛈ STORM CELL ON ROUTE — give it a wide berth', W / 2, 112, 15, '#ffb020', 'center');
  text(ctx, `COINS ${fmt(state.coins)} — spend them in the hangar, then take off`, W / 2, 140, 16, '#ffd23e', 'center');
  text(ctx, 'HANGAR UPGRADES (click to buy — level shown as ●)', 60, 176, 14, '#7cc8ff');
  UPGRADES.forEach((u, i) => {
    const x = 60 + (i % 4) * 300, y = 196 + Math.floor(i / 4) * 118;
    const lvl = state.upgrades[u.id] || 0;
    const maxed = lvl >= u.max;
    const cost = maxed ? null : u.cost[lvl];
    const afford = cost !== null && state.coins >= cost;
    panel(ctx, x, y, 284, 102, maxed ? 0.45 : 0.8);
    text(ctx, u.name, x + 14, y + 20, 15, maxed ? '#7dffa8' : '#ffffff');
    text(ctx, '●'.repeat(lvl) + '○'.repeat(u.max - lvl), x + 268, y + 20, 13, '#ffd23e', 'right');
    text(ctx, u.desc, x + 14, y + 48, 11, '#bfe6ff', 'left', 'normal');
    if (maxed) text(ctx, 'MAXED', x + 14, y + 80, 13, '#7dffa8');
    else {
      const label = `BUY ${cost}c`;
      ctx.fillStyle = afford ? '#ffb020' : 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.roundRect(x + 14, y + 66, 96, 26, 6); ctx.fill();
      text(ctx, label, x + 62, y + 79, 12, afford ? '#1a2a3a' : '#9fb8cc', 'center');
      buttons.add(`buy:${u.id}`, x + 14, y + 66, 96, 26);
    }
  });
  button(ctx, buttons, 'takeoff', W / 2 - 170, 452, 340, 58, `✈  TAKE OFF — ${to.name}  (Enter)`, { primary: true, size: 19 });
  text(ctx, 'W/S throttle · ↑ ↓ pitch · ← → bank · F flaps · G gear · P pause', W / 2, 540, 13, '#7fb8dd', 'center', 'normal');
  if (state.legIndex > 0) {
    text(ctx, `Medals so far: ${state.medals.map((m) => m || '—').join('  ')}`, W / 2, 568, 13, '#ffe9a8', 'center', 'normal');
  }
}

function drawDebrief(ctx, state, buttons) {
  const d = state.lastLanding;
  const leg = LEGS[state.legIndex];
  const to = ISLANDS[leg.to];
  ctx.fillStyle = 'rgba(4,14,24,0.92)'; ctx.fillRect(0, 0, W, H);
  text(ctx, `LEG ${state.legIndex + 1} COMPLETE — ${to.name}`, W / 2, 58, 34, '#ffffff', 'center');
  const medal = d ? medalFor(d.score) : 'BRONZE';
  text(ctx, `${medal} LANDING`, W / 2, 118, 44, medalColor(medal), 'center');
  if (d) {
    const rows = [
      ['Landing score', `${d.score} / 400`],
      ['Sink rate', `${d.vspeed.toFixed(1)} m/s`],
      ['Centreline', `${Math.abs(d.across).toFixed(0)} m off`],
      ['Alignment', `${d.headErr.toFixed(0)}° off runway 36`],
      ['Rings', `${state.rings.filter((r) => r.got).length}/${state.rings.length}  (+${state.rings.filter((r) => r.got).length * 150} pts)`],
      ['Mail delivered', `${state.plane.cargo} sacks  (+${state.plane.cargo * 60} coins)`],
      ['Time bonus', `+${d.timeBonus} pts  (${fmtTime(state.legTime)} vs par ${leg.par}s)`],
      ['Coins earned', `+${d.coinsEarned}`],
    ];
    rows.forEach((r, i) => {
      const y = 168 + i * 30;
      text(ctx, r[0], W / 2 - 190, y, 15, '#bfe6ff', 'left', 'normal');
      text(ctx, r[1], W / 2 + 190, y, 15, '#ffffff', 'right');
    });
  }
  const newFeats = state.featsThisLeg || [];
  if (newFeats.length) {
    text(ctx, `★ FEATS UNLOCKED: ${newFeats.join(' · ')}`, W / 2, 424, 15, '#ffd23e', 'center');
  }
  text(ctx, `Campaign score ${fmt(state.score)}  ·  Coins ${fmt(state.coins)}  ·  Medals ${state.medals.filter(Boolean).join(' ')}`, W / 2, 456, 15, '#ffffff', 'center', 'normal');
  if (state.legIndex < 4) {
    button(ctx, buttons, 'next-leg', W / 2 - 170, 500, 340, 56, `NEXT LEG — ${ISLANDS[LEGS[state.legIndex + 1].to].name}  (Enter)`, { primary: true, size: 18 });
  } else {
    button(ctx, buttons, 'finish', W / 2 - 170, 500, 340, 56, 'FINISH THE CAMPAIGN  (Enter)', { primary: true, size: 18 });
  }
  button(ctx, buttons, 'replay-leg', W / 2 - 170, 572, 340, 40, 'REPLAY THIS LEG  (R)', { size: 14 });
}

function drawGameOver(ctx, state, buttons) {
  const reasons = {
    terrain: 'You flew into the island. The mail is scattered across the hillside.',
    ditch: 'You ditched in the sea. The mail sacks are floating. The plane is not.',
    'gear-up': 'You landed with the gear UP. The belly is not a landing skid.',
    fuel: 'Out of fuel over open water. The sea does not forgive a dead engine.',
  };
  ctx.fillStyle = 'rgba(20,6,8,0.94)'; ctx.fillRect(0, 0, W, H);
  text(ctx, '✖ CRASHED', W / 2, 120, 52, '#ff5a4d', 'center');
  text(ctx, reasons[state.crashReason] || 'The flight ended badly.', W / 2, 180, 17, '#ffffff', 'center', 'normal');
  text(ctx, `Leg ${state.legIndex + 1} · Score ${fmt(state.score)} · Rings ${state.rings.filter((r) => r.got).length}/${state.rings.length}`, W / 2, 220, 15, '#bfe6ff', 'center', 'normal');
  text(ctx, 'The post must go through — but the pilot must come home too.', W / 2, 252, 14, '#ffe9a8', 'center', 'normal');
  button(ctx, buttons, 'retry-leg', W / 2 - 160, 320, 320, 56, '↻  RETRY THIS LEG  (R)', { primary: true, size: 19 });
  button(ctx, buttons, 'back-title', W / 2 - 160, 392, 320, 44, 'BACK TO TITLE', { size: 15 });
}

function drawWin(ctx, state, buttons) {
  ctx.fillStyle = '#0a1a2a'; ctx.fillRect(0, 0, W, H);
  text(ctx, '★ SKY POST LEGEND ★', W / 2, 84, 46, '#ffd23e', 'center');
  text(ctx, 'All 5 legs flown. Every sack delivered. The islands have their mail.', W / 2, 132, 17, '#ffffff', 'center', 'normal');
  text(ctx, `FINAL SCORE ${fmt(state.score)}  ·  COINS ${fmt(state.coins)}  ·  FEATS ${state.feats.size}/15`, W / 2, 176, 18, '#ffe9a8', 'center');
  ISLANDS.forEach((isl, i) => {
    const x = W / 2 - 320 + i * 160;
    text(ctx, isl.name, x, 240, 15, '#bfe6ff', 'center');
    text(ctx, state.medals[i] ? `★ ${state.medals[i]}` : '—', x, 272, 20, state.medals[i] ? medalColor(state.medals[i]) : '#7fb8dd', 'center');
  });
  const featNames = [...state.feats].slice(0, 15);
  text(ctx, `Feats: ${featNames.join(' · ') || 'none yet'}`, W / 2, 330, 13, '#ffffff', 'center', 'normal');
  button(ctx, buttons, 'again', W / 2 - 160, 420, 320, 56, '↻  FLY THE CAMPAIGN AGAIN', { primary: true, size: 18 });
  button(ctx, buttons, 'back-title', W / 2 - 160, 492, 320, 44, 'BACK TO TITLE', { size: 15 });
}

// --- frame ---------------------------------------------------------------------
export function render(ctx, state, buttons) {
  buttons.clear();
  const screen = state.screen;
  if (screen === 'title' || screen === 'howto' || screen === 'paused') {
    if (screen === 'title') drawTitle(ctx, state, buttons);
    else if (screen === 'howto') drawHowTo(ctx, state, buttons);
    else {
      drawSceneInto(ctx, state);
      drawHUD(ctx, state);
      ctx.fillStyle = 'rgba(4,14,24,0.6)'; ctx.fillRect(0, 0, W, H);
      text(ctx, '❚❚ PAUSED', W / 2, H / 2 - 20, 44, '#ffffff', 'center');
      text(ctx, 'P to resume · R to restart the leg', W / 2, H / 2 + 30, 16, '#bfe6ff', 'center', 'normal');
    }
    return;
  }
  if (screen === 'briefing') { drawBriefing(ctx, state, buttons); return; }
  if (screen === 'debrief') { drawDebrief(ctx, state, buttons); return; }
  if (screen === 'gameover') { drawGameOver(ctx, state, buttons); return; }
  if (screen === 'win') { drawWin(ctx, state, buttons); return; }
  // flying
  drawSceneInto(ctx, state);
  drawHUD(ctx, state);
}

function drawSceneInto(ctx, state) {
  drawSky(ctx, cameraFor(state.plane), state.time);
  const cam = drawTerrain(ctx, state);
  drawRunway(ctx, state, cam);
  drawClouds(ctx, state, cam);
  drawStorm(ctx, state, cam, state.time);
  const nextIdx = state.rings.findIndex((r) => !r.got && state.plane.z < r.z + 150);
  state.rings.forEach((r, i) => drawRing(ctx, state, cam, r, i === nextIdx, state.time));
  drawPlane(ctx, state);
}

export { W, H, fmt, fmtTime };
