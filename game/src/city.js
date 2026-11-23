// The city plan: an orthogonal grid of roads with blocks of buildings between them, plus the
// queries the rest of the game needs (which surface is at a point, which building blocks a move,
// where the free parking spots are). Everything here is generated from one seed, so the same seed
// always yields the same city, and nothing is stored besides the plan itself.

import { CITY, WORLD, COLORS } from './config.js';
import { makeRng, clamp } from './random.js';

/** The centre line of the road at grid index i, on either axis. */
export function roadCenter(i) {
  return i * CITY.cell + CITY.cell / 2;
}

/** The half width of a road's asphalt, from its centre line. */
export const ROAD_HALF = CITY.road / 2;

/** The half width of a road including both sidewalks. */
const CORRIDOR_HALF = ROAD_HALF + CITY.sidewalk;

/**
 * Builds the city plan: the road grid, the buildings inside each block, and the mission markers.
 * A block is the square between four roads; each one splits into a few lots, and a lot gets a
 * building with a depth, a roof tone and a shadow. Some blocks are parks or parking lots instead.
 */
export function buildCity() {
  const rng = makeRng(CITY.seed);
  const blocks = [];
  const buildings = [];
  const parks = [];
  const lots = [];

  for (let gx = 0; gx < CITY.grid - 1; gx += 1) {
    for (let gy = 0; gy < CITY.grid - 1; gy += 1) {
      // The buildable square of this block, inside the four sidewalks.
      const x0 = roadCenter(gx) + CORRIDOR_HALF;
      const y0 = roadCenter(gy) + CORRIDOR_HALF;
      const x1 = roadCenter(gx + 1) - CORRIDOR_HALF;
      const y1 = roadCenter(gy + 1) - CORRIDOR_HALF;
      const block = { gx, gy, x0, y0, x1, y1, kind: 'built' };
      blocks.push(block);

      // Parks and parking lots break up the wall of buildings and give the city open ground.
      const roll = rng.next();
      if (roll < 0.11) {
        block.kind = 'park';
        parks.push(block);
        continue;
      }
      if (roll < 0.17) {
        block.kind = 'lot';
        lots.push(block);
        continue;
      }

      // One to four buildings per block, in a row or a 2x2 arrangement, with a gap between them.
      const wide = x1 - x0;
      const tall = y1 - y0;
      const columns = wide > 230 ? 2 : 1;
      const rows = tall > 230 ? 2 : 1;
      const gap = rng.range(10, 20);
      const cellW = (wide - gap * (columns - 1)) / columns;
      const cellH = (tall - gap * (rows - 1)) / rows;

      for (let cx = 0; cx < columns; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          // Not every cell is filled: a corner left empty reads as a courtyard.
          if (columns * rows > 1 && rng.chance(0.16)) continue;
          const bx = x0 + cx * (cellW + gap) + rng.range(2, 6);
          const by = y0 + cy * (cellH + gap) + rng.range(2, 6);
          const bw = cellW - rng.range(4, 10);
          const bh = cellH - rng.range(4, 10);
          if (bw < 46 || bh < 46) continue;
          buildings.push({
            x: bx,
            y: by,
            w: bw,
            h: bh,
            tone: rng.pick(COLORS.roof),
            // A raised lip and a rooftop box make the roofs read as solid volumes from above.
            lip: rng.range(5, 12),
            box: rng.chance(0.55)
              ? { x: bx + bw * rng.range(0.15, 0.5), y: by + bh * rng.range(0.15, 0.5), w: bw * rng.range(0.18, 0.34), h: bh * rng.range(0.18, 0.34) }
              : null,
            windows: rng.chance(0.7),
          });
        }
      }
    }
  }

  // Street furniture along the pavements: lamps at every corner, trees and bins between them. None
  // of it blocks the player (they walk past it), but it gives the streets scale and clutter.
  const props = [];
  for (let i = 0; i < CITY.grid; i += 1) {
    for (let j = 0; j < CITY.grid; j += 1) {
      const cx = roadCenter(i);
      const cy = roadCenter(j);
      // A lamp at each of the four corners of a junction.
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          props.push({
            kind: 'lamp',
            x: cx + sx * (CORRIDOR_HALF - 8),
            y: cy + sy * (CORRIDOR_HALF - 8),
            phase: rng.range(0, 6.28),
          });
        }
      }
      // Trees and bins down the middle of a few long pavements.
      for (const sx of [-1, 1]) {
        if (!rng.chance(0.4)) continue;
        const along = rng.range(-CITY.cell * 0.3, CITY.cell * 0.3);
        // Keep clear of the junction, so nothing is planted on a crossing.
        if (Math.abs(along) < CORRIDOR_HALF + 12) continue;
        props.push({
          kind: rng.chance(0.65) ? 'tree' : 'bin',
          x: cx + sx * (ROAD_HALF + CITY.sidewalk * 0.5),
          y: cy + along,
          r: rng.range(9, 15),
        });
      }
    }
  }

  // Parked cars in the parking lots and along some kerbs, which is what makes a street read as
  // lived-in rather than painted on.
  const parked = [];
  for (const lot of lots) {
    const cols = Math.floor((lot.x1 - lot.x0 - 20) / 62);
    for (let c = 0; c < cols; c += 1) {
      for (const side of [0, 1]) {
        if (!rng.chance(0.5)) continue;
        parked.push({
          x: lot.x0 + 26 + c * 62,
          y: side === 0 ? lot.y0 + 40 : lot.y1 - 40,
          angle: Math.PI / 2,
          color: rng.pick(COLORS.roof.concat(['#c4564a', '#4a7cc4', '#c9a13c'])),
        });
      }
    }
  }
  for (let i = 0; i < CITY.grid; i += 1) {
    for (let j = 0; j < CITY.grid; j += 1) {
      if (!rng.chance(0.34)) continue;
      const horizontal = rng.chance(0.5);
      const along = rng.range(0.18, 0.82) * CITY.cell;
      const side = rng.chance(0.5) ? 1 : -1;
      const offset = side * (ROAD_HALF - 15);
      parked.push({
        x: horizontal ? roadCenter(i) + along : roadCenter(i) + offset,
        y: horizontal ? roadCenter(j) + offset : roadCenter(j) + along,
        angle: horizontal ? 0 : Math.PI / 2,
        color: rng.pick(['#c4564a', '#4a7cc4', '#c9a13c', '#68a25c', '#9a6bb5', '#c9ccd4']),
      });
    }
  }

  return { blocks, buildings, parks, lots, props, parked };
}

/** True when the point lies on a road's asphalt, the drivable surface of the city. */
export function isRoad(x, y) {
  const gx = Math.floor(x / CITY.cell);
  const gy = Math.floor(y / CITY.cell);
  const dx = Math.abs(x - roadCenter(gx));
  const dy = Math.abs(y - roadCenter(gy));
  return dx <= ROAD_HALF || dy <= ROAD_HALF;
}

/** True when the point lies on a sidewalk: inside a road corridor but off its asphalt. */
export function isSidewalk(x, y) {
  const gx = Math.floor(x / CITY.cell);
  const gy = Math.floor(y / CITY.cell);
  const dx = Math.abs(x - roadCenter(gx));
  const dy = Math.abs(y - roadCenter(gy));
  const onCorridorX = dx <= ROAD_HALF + CITY.sidewalk;
  const onCorridorY = dy <= ROAD_HALF + CITY.sidewalk;
  if (!onCorridorX && !onCorridorY) return false;
  return !(dx <= ROAD_HALF || dy <= ROAD_HALF);
}

/** The building holding the point, or null when the point is in the open. */
export function buildingAt(city, x, y) {
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/**
 * Pushes a circle of radius r out of every building it overlaps, so nothing walks or drives into a
 * wall. Returns the corrected position; `hit` says whether a wall was touched at all.
 */
export function resolveWalls(city, x, y, r) {
  let hit = false;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const left = b.x - r;
    const right = b.x + b.w + r;
    const top = b.y - r;
    const bottom = b.y + b.h + r;
    if (x <= left || x >= right || y <= top || y >= bottom) continue;
    // Outside the box already; the shortest way out is the nearest face.
    const dl = x - left;
    const dr = right - x;
    const dt = y - top;
    const db = bottom - y;
    const least = Math.min(dl, dr, dt, db);
    if (least === dl) x = left;
    else if (least === dr) x = right;
    else if (least === dt) y = top;
    else y = bottom;
    hit = true;
  }
  return { x, y, hit };
}

/** Keeps a point inside the map, with a margin from the edge. */
export function clampToWorld(x, y, margin = 20) {
  return {
    x: clamp(x, margin, WORLD.width - margin),
    y: clamp(y, margin, WORLD.height - margin),
  };
}

/** A spot on a road near the middle of the map, good for spawning the player or a car. */
export function roadSpawn(gx, gy, along = 0) {
  return { x: roadCenter(gx) + along, y: roadCenter(gy) };
}
