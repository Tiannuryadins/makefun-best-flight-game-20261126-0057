# Nusantara Sky Post — 5 volcanic islands, 12 mail rings, crosswind landings, gust winds, 3 storm cells, 8 hangar upgrades, 15 pilot feats

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Tiannuryadins/makefun-best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Tiannuryadins/makefun-best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

An original flight game for the [Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057) bounty on make.fun.

## The game

You are the bush pilot of the **Nusantara Sky Post**, flying the mail across 5 volcanic islands — Sangihe, Bunaken, Merapi, Flores, Timor — in a 5-leg campaign. Take off from one island runway, thread the glowing mail rings strung across the strait, then land on the next island's runway: gear down, slow, on the centreline, for a GOLD / SILVER / BRONZE landing score. Finish all 5 legs to become a Sky Post Legend.

## The systems (all visible in the screenshots)

- **Real flight model** — throttle, pitch, bank, lift vs stall (below ~30 m/s the wing quits and the nose drops), flaps that slow you for landing, retractable gear. The HUD shows a lit artificial horizon, altitude (m + ft), airspeed (kt), vertical speed, heading tape and throttle.
- **12 mail rings** — 2–3 glowing rings per leg, each +150 pts and +25 coins. Fly through the centre or miss the route; the next ring's distance is always on the HUD.
- **Landing scoring (up to 400)** — sink rate, centreline offset, runway alignment and speed decide GOLD (340+), SILVER (250+) or BRONZE. Land gear-up, too fast, or off the strip and you crash.
- **Fuel + cargo weight** — throttle burns fuel; every mail sack you carry pays 60 coins but climbs slower and stalls faster. Land dry and you glide — or ditch in the sea.
- **Weather that fights back** — gusting wind (arrow + speed on the HUD) pushes you off course, and 3 storm cells throw the plane around with downdrafts. The Weather Radar upgrade draws them on the route map.
- **8 hangar upgrades** — bigger tank, turbo engine, slotted flaps, light airframe, big prop, weather radar, cargo rack, shock gear. Bought with coins between legs, 2 levels each.
- **15 pilot feats** — First Ring, Ring Streak, Greased (gold landing), Full Route, Wave Tops (5 s under 30 m over the sea), Storm Dodger, Clean Wing (no-flaps landing), Fuel Saver, Volcano Pass, Tailwind Rider, Feather Touch, Mail Master, Speed Demon, Sky Post Legend.
- **5-leg campaign with progression** — each leg is longer, windier and stormier than the last; medals and feats carry across the campaign, and the debrief screen breaks down every landing.

## Controls

**↑ / ↓** pitch · **← / →** bank & turn · **W / S** throttle up / down · **F** flaps · **G** gear · **P** pause · **Enter** start / continue · **R** retry a leg · **H** how to fly. Mouse clicks the buttons (Fly, Take Off, upgrades, Next Leg).

## Play

Static files only — no network, no libraries, no audio. Serve `game/` (e.g. `node serve.ts`) and open `http://localhost:8080`, or open `game/index.html` directly in a desktop browser.
