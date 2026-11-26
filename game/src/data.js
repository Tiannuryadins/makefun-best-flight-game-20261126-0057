// Static data: the 5-island archipelago, the 5 legs, 8 hangar upgrades, 15 pilot feats.
// All names, places and art are original — an Indonesian island-hopping airmail route.
export const GAME_NAME = 'NUSANTARA SKY POST';
export const GAME_TAGLINE = 'Bush-pilot airmail across 5 volcanic islands';

// Islands run north (+z). x is east, z is north, heights in metres.
export const ISLANDS = [
  { name: 'SANGIHE', x: 0, z: 0, peak: 260, radius: 1500, volcano: false, runwayAlt: 90 },
  { name: 'BUNAKEN', x: -600, z: 4200, peak: 300, radius: 1400, volcano: false, runwayAlt: 110 },
  { name: 'MERAPI', x: 350, z: 8400, peak: 420, radius: 1700, volcano: true, runwayAlt: 160 },
  { name: 'FLORES', x: -350, z: 12600, peak: 380, radius: 1550, volcano: false, runwayAlt: 130 },
  { name: 'TIMOR', x: 250, z: 16800, peak: 320, radius: 1600, volcano: false, runwayAlt: 100 },
];

export const RUNWAY = { len: 620, width: 46 };

// One leg per island hop. rings: mail rings to fly through. wind: base wind for the leg.
// storm: a thunderhead cell to avoid (null = clear skies). cargo: mail sacks carried.
export const LEGS = [
  { from: 0, to: 1, rings: 2, windDir: 200, windSpeed: 6, gust: 3, storm: null, cargo: 2, par: 150 },
  { from: 1, to: 2, rings: 3, windDir: 350, windSpeed: 9, gust: 5, storm: { dx: 500, dz: 0.45, r: 420 }, cargo: 3, par: 170 },
  { from: 2, to: 3, rings: 3, windDir: 20, windSpeed: 7, gust: 4, storm: { dx: -550, dz: 0.55, r: 460 }, cargo: 3, par: 180 },
  { from: 3, to: 4, rings: 3, windDir: 10, windSpeed: 9, gust: 5, storm: { dx: 480, dz: 0.4, r: 400 }, cargo: 4, par: 190 },
  { from: 4, to: 4, rings: 1, windDir: 180, windSpeed: 8, gust: 4, storm: null, cargo: 0, par: 120 },
];
// Leg 5 is the homecoming: a victory lap around Timor — one golden ring over the home runway,
// then land where you started the campaign. (from==to is handled specially in world.js.)

// 8 hangar upgrades, bought with coins between legs. cost grows per level (max 2 levels each).
export const UPGRADES = [
  { id: 'tank', name: 'BIG TANK', desc: '+40 fuel per level — fly further, throttle harder', cost: [120, 220], max: 2 },
  { id: 'engine', name: 'TURBO ENGINE', desc: '+8 m/s top speed per level — beat the clock', cost: [150, 280], max: 2 },
  { id: 'flaps', name: 'SLOTTED FLAPS', desc: 'Stall speed −5 m/s per level — land slower, safer', cost: [130, 240], max: 2 },
  { id: 'airframe', name: 'LIGHT AIRFRAME', desc: '+25% climb rate per level — clear the volcano', cost: [140, 260], max: 2 },
  { id: 'prop', name: 'BIG PROP', desc: '+40% acceleration per level — get airborne fast', cost: [110, 200], max: 2 },
  { id: 'radar', name: 'WEATHER RADAR', desc: 'Storm cells drawn on the map + earlier warnings', cost: [100, 180], max: 2 },
  { id: 'rack', name: 'CARGO RACK', desc: '+1 mail sack per level — each sack pays 60 coins', cost: [90, 170], max: 2 },
  { id: 'gear', name: 'SHOCK GEAR', desc: 'Hard landings to −9 m/s survive per level', cost: [120, 210], max: 2 },
];

// 15 pilot feats, each with a one-line check (evaluated in main.js).
export const FEATS = [
  { id: 'first-ring', name: 'FIRST RING', desc: 'Fly through your first mail ring' },
  { id: 'ring-streak', name: 'RING STREAK', desc: 'Take 3 rings in one leg without missing' },
  { id: 'gold-landing', name: 'GREASED', desc: 'Land a GOLD-medal touchdown' },
  { id: 'all-rings', name: 'FULL ROUTE', desc: 'Take every ring on a leg' },
  { id: 'low-pass', name: 'WAVE TOPS', desc: 'Hold under 30 m over the sea for 5 s' },
  { id: 'storm-dodger', name: 'STORM DODGER', desc: 'Pass within 250 m of a storm cell and stay out' },
  { id: 'no-flaps', name: 'CLEAN WING', desc: 'Land with flaps up' },
  { id: 'fuel-saver', name: 'FUEL SAVER', desc: 'Land with more than half a tank left' },
  { id: 'hopper', name: 'ISLAND HOPPER', desc: 'Complete Leg 1' },
  { id: 'volcano', name: 'VOLCANO PASS', desc: 'Take the ring beside Mount Merapi' },
  { id: 'tailwind', name: 'TAILWIND RIDER', desc: 'Finish a leg with a tailwind over 10 m/s' },
  { id: 'gentle', name: 'FEATHER TOUCH', desc: 'Touch down softer than −2 m/s' },
  { id: 'mail-master', name: 'MAIL MASTER', desc: 'Deliver every sack on a 4-sack leg' },
  { id: 'speed-demon', name: 'SPEED DEMON', desc: 'Fly faster than 70 m/s' },
  { id: 'campaign', name: 'SKY POST LEGEND', desc: 'Finish all 5 legs' },
];

export const RING_POINTS = 150;
export const SACK_PAY = 60;
export const LANDING_MAX = 400;
