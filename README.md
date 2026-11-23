# Sunset City — an open-world crime game for make.fun

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/bongekanjing/gta6-01-mellow-condor-47/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/bongekanjing/gta6-01-mellow-condor-47/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for [make.fun's Make GTA 6 bounty](https://make.fun/bounty/gta6-01): a city you roam on foot
and by car, with live traffic, pedestrians on the pavements, a wanted level that brings the police
out, and a four-job mission chain to run. Everything is drawn procedurally on a canvas — no assets,
no network, no library — and handed in with a dossier the judge reads.

## What is in it

- **A city, from one seed.** An 11 x 11 grid of roads with sidewalks, crossings and lane paint;
  blocks of buildings with roofs, vents and cast shadows; parks, parking lots, and parked cars and
  street lamps along the kerbs. `game/src/city.js` builds it and answers the questions the rest of
  the game asks — is this asphalt, what does this wall stop, where is a road spawn.
- **A player on foot and in a car.** WASD walks, SHIFT runs, mouse aims and fires, F takes or leaves
  the nearest car. In a car, W and S throttle and brake and A and D steer, with the body sliding on
  its own momentum and tyres leaving marks when you corner hard (`game/src/world.js`).
- **A living street.** Forty cars keep to their lanes, slow for the car in front and turn at
  junctions; a hundred and ten pedestrians walk the pavements and run when a car comes at them or a
  shot is fired.
- **A wanted level and the police.** Crimes add heat, heat buys up to five stars, stars send officers
  who close to shooting range and fire back. A cruiser can be stolen; getting caught in a corner is
  BUSTED and losing all your health is WASTED.
- **A mission chain.** Four jobs, each a drive across the city to a marker, paying $150 to $900, with
  the payout, the bank balance and the next objective on the HUD.
- **A HUD that reads at a glance.** Money and the wanted ladder, a health bar, a minimap of the real
  street grid with the player, the mission and every cruiser on it, and a speedometer while driving.
- **A start screen and a save.** ENTER starts a run, N begins a new one, ESC pauses and P saves;
  the run is written to local storage so a reload picks up where it left off.

## Run it

```
node main.ts              # writes the entry to $MAKEFUN_OUTPUT_DIR (default /output)
node serve.ts             # serves game/ at http://localhost:8080 to play it
```

## The screenshots

`?shot=menu|title|drive|chase|mission` on the served page plays the real rules forward for a fixed
number of steps and stops on a frame, which is how `screenshots/` was captured; the same seed always
gives the same frame.

## Licence

MIT — see `LICENSE`.
