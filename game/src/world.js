// The living world: the player, traffic, pedestrians, the police and the mission chain, all stepped
// at a fixed rate so a game plays out the same way twice. Nothing here draws; render.js reads this
// state and paints it.
//
// The streets run on a grid, so traffic keeps to a lane and turns at junctions, while the player
// walks anywhere and drives a car that slides on bends. Crime raises a heat value, the heat sets a
// wanted level, and the wanted level decides how many police come and how hard they push.

import { CITY, WORLD, PLAYER, CAR, TRAFFIC, PED, POLICE, WEAPON, WANTED, STEP } from './config.js';
import {
  buildCity, roadCenter, isRoad, resolveWalls, clampToWorld, ROAD_HALF,
} from './city.js';
import { makeRng, clamp, normalize, turnToward, angleDelta } from './random.js';

export const PHASE_MENU = 'menu';
export const PHASE_PLAY = 'play';
export const PHASE_DEAD = 'dead';
export const PHASE_ARREST = 'arrest';

/** The mission chain: each step names a place to reach and what it pays. */
const MISSIONS = [
  { title: 'Meet the fixer', text: 'Drive to the garage and pick up the job.', pay: 150 },
  { title: 'Collect the package', text: 'Get to the drop before it goes cold.', pay: 250 },
  { title: 'Shake the tail', text: 'Lose the police, then reach the safehouse.', pay: 400 },
  { title: 'Run the last job', text: 'Take the car to the docks. This is the big one.', pay: 900 },
];

/** A car, civilian or otherwise: a body with a heading that slides on its own momentum. */
function makeCar(x, y, angle, color, kind = 'civilian') {
  return {
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    color,
    kind,
    width: CAR.width,
    length: CAR.length,
    health: kind === 'police' ? 150 : 100,
    driver: null,
    wrecked: false,
    // Traffic bookkeeping: which way it is travelling and how far to the next junction.
    laneAxis: null,
    dir: 1,
    laneOffset: 0,
    cruise: 0,
    siren: 0,
  };
}

/**
 * Builds a fresh world: the city, the player standing on a pavement, traffic and pedestrians
 * scattered on the streets, and the first mission set.
 */
export function createWorld(seed = CITY.seed) {
  const city = buildCity();
  const rng = makeRng(seed ^ 0x9e3779b9);

  const spawnX = roadCenter(5) + ROAD_HALF + 26;
  const spawnY = roadCenter(5) + 40;

  const world = {
    city,
    rng,
    time: 0,
    phase: PHASE_PLAY,
    player: {
      x: spawnX, y: spawnY,
      vx: 0, vy: 0,
      angle: Math.PI / 2,
      radius: PLAYER.radius,
      health: PLAYER.maxHealth,
      hitTimer: 0,
      money: PLAYER.startMoney,
      wantedHeat: 0,
      wanted: 0,
      crimeTimer: 0,
      kills: 0,
      weapon: 'pistol',
      cooldown: 0,
      inCar: null,
      aiming: 0,
    },
    keys: new Set(),
    mouse: { x: 0, y: 0, down: false },
    cars: [],
    peds: [],
    officers: [],
    bullets: [],
    particles: [],
    marks: [],
    pickups: [],
    policeTimer: 0,
    missionIndex: 0,
    missionTarget: { x: 0, y: 0 },
    message: { text: MISSIONS[0].title, sub: MISSIONS[0].text, timer: 6 },
    banner: null,
    camera: { x: spawnX, y: spawnY, shake: 0 },
    stats: { carsStolen: 0, pedsHurt: 0, officersDown: 0, moneyEarned: 0 },
  };

  // Traffic: one car per road cell, spread along the grid, each keeping to its lane and direction.
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const horizontal = rng.chance(0.5);
    const line = rng.int(1, CITY.grid - 1);
    const along = rng.range(0, WORLD.width);
    const dir = rng.chance(0.5) ? 1 : -1;
    const laneOffset = dir * (ROAD_HALF * 0.45);
    const color = rng.pick(['#c4564a', '#4a7cc4', '#c9a13c', '#68a25c', '#9a6bb5', '#c9ccd4', '#2f3540']);
    const car = horizontal
      ? makeCar(along, roadCenter(line) + laneOffset, dir > 0 ? 0 : Math.PI, color)
      : makeCar(roadCenter(line) + laneOffset, along, dir > 0 ? Math.PI / 2 : -Math.PI / 2, color);
    car.laneAxis = horizontal ? 'x' : 'y';
    car.dir = dir;
    car.laneOffset = laneOffset;
    car.cruise = TRAFFIC.speed + rng.range(-TRAFFIC.speedJitter, TRAFFIC.speedJitter);
    car.turnAt = along + rng.range(CITY.cell * 0.6, CITY.cell * 1.9);
    world.cars.push(car);
  }

  // Pedestrians: walkers on the pavements, who cross the road now and then and scatter when a car
  // comes close or a shot is fired.
  for (let i = 0; i < PED.count; i += 1) {
    const gx = rng.int(0, CITY.grid - 1);
    const gy = rng.int(0, CITY.grid - 1);
    const onVertical = rng.chance(0.5);
    const inset = ROAD_HALF + rng.range(8, CITY.sidewalk - 8);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = onVertical ? roadCenter(gx) + side * inset : rng.range(0, WORLD.width);
    const y = onVertical ? rng.range(0, WORLD.height) : roadCenter(gy) + side * inset;
    world.peds.push({
      x, y,
      angle: rng.range(0, Math.PI * 2),
      speed: PED.speed + rng.range(-PED.speedJitter, PED.speedJitter),
      skin: rng.pick(['#d9a05b', '#b3763f', '#c9b48c', '#8f6a4a']),
      shirt: rng.pick(['#c4564a', '#4a7cc4', '#c9a13c', '#68a25c', '#9a6bb5']),
      panic: 0,
      facing: rng.chance(0.5) ? 1 : -1,
      dead: false,
      bob: rng.range(0, 6.28),
    });
  }

  pickNextMission(world, true);
  return world;
}

/** Places the mission marker on a road far enough from the player to be a drive, near enough to find. */
function pickNextMission(world, first = false) {
  const mission = MISSIONS[Math.min(world.missionIndex, MISSIONS.length - 1)];
  const p = world.player;
  let best = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const gx = world.rng.int(1, CITY.grid - 1);
    const gy = world.rng.int(1, CITY.grid - 1);
    const x = roadCenter(gx) + world.rng.range(-ROAD_HALF * 0.5, ROAD_HALF * 0.5);
    const y = roadCenter(gy) + world.rng.range(-ROAD_HALF * 0.5, ROAD_HALF * 0.5);
    const dist = Math.hypot(x - p.x, y - p.y);
    // Far enough to be worth driving to, and not so far it is off the map's edge.
    const score = -Math.abs(dist - 900);
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  world.missionTarget = best ?? { x: roadCenter(3), y: roadCenter(3) };
  if (!first) {
    world.message = { text: mission.title, sub: mission.text, timer: 6 };
    world.banner = { text: mission.title, sub: mission.text, timer: 5 };
  }
  return mission;
}

/** The save key: one slot, so the game remembers where the player got to. */
const SAVE_KEY = 'sunset-city-save-v1';

/** Writes the parts of the run worth keeping: money, missions, and where the player stands. */
export function saveGame(world) {
  const p = world.player;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: p.money,
      missionIndex: world.missionIndex,
      weapon: p.weapon,
      stats: world.stats,
      x: Math.round(p.x),
      y: Math.round(p.y),
      at: Date.now(),
    }));
    return true;
  } catch {
    // A browser with storage turned off simply has no save; the game still runs.
    return false;
  }
}

/** Reads the save back, or null when there is none or it cannot be read. */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Drops the save, for a fresh run. */
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
}

/** Puts a loaded save back into a freshly built world. */
export function applySave(world, save) {
  const p = world.player;
  p.money = save.money;
  p.weapon = save.weapon === 'shotgun' ? 'shotgun' : 'pistol';
  world.missionIndex = Math.min(save.missionIndex, MISSIONS.length);
  if (save.stats) world.stats = { ...world.stats, ...save.stats };
  if (typeof save.x === 'number' && typeof save.y === 'number') {
    const spot = clampToWorld(save.x, save.y, 24);
    p.x = spot.x;
    p.y = spot.y;
    world.camera.x = spot.x;
    world.camera.y = spot.y;
  }
  if (world.missionIndex >= MISSIONS.length) {
    world.missionTarget = null;
  } else {
    pickNextMission(world, true);
  }
  world.message = { text: 'Welcome back', sub: `You left the city with $${p.money}.`, timer: 5 };
}

/** The car nearest a point, within range, that the player could get into. */
export function carNear(world, x, y, range = CAR.enterRange) {
  let best = null;
  let bestDist = range;
  for (const car of world.cars) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

/** Adds heat for a crime, which in time brings the police out. */
export function addHeat(world, amount) {
  const p = world.player;
  p.wantedHeat = Math.min(WANTED.thresholds[WANTED.thresholds.length - 1] + 1.5, p.wantedHeat + amount);
  p.crimeTimer = WANTED.decayDelay;
  const stars = wantedStars(p.wantedHeat);
  if (stars > p.wanted) {
    p.wanted = stars;
    world.banner = { text: `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`, sub: stars >= 4 ? 'Every unit in the city is rolling.' : 'The police are looking for you.', timer: 3.5 };
  }
}

/** How many stars a heat value buys. */
export function wantedStars(heat) {
  let stars = 0;
  for (let i = 1; i < WANTED.thresholds.length; i += 1) {
    if (heat >= WANTED.thresholds[i]) stars = i;
  }
  return stars;
}

/** Fires a weapon from the player toward an angle, adding bullets and their spread. */
function fireWeapon(world, angle) {
  const p = world.player;
  const spec = WEAPON[p.weapon];
  if (p.cooldown > 0) return;
  p.cooldown = spec.cooldown;
  const origin = carMuzzle(world, p, angle);
  for (let i = 0; i < spec.pellets; i += 1) {
    const a = angle + (world.rng.next() - 0.5) * spec.spread * 2;
    world.bullets.push({
      x: origin.x, y: origin.y,
      vx: Math.cos(a) * spec.speed,
      vy: Math.sin(a) * spec.speed,
      life: spec.range / spec.speed,
      damage: spec.damage,
      from: 'player',
    });
  }
  world.particles.push({ kind: 'flash', x: origin.x, y: origin.y, life: 0.06, maxLife: 0.06, angle });
  world.camera.shake = Math.min(1, world.camera.shake + 0.28);
  if (p.wanted < 5) addHeat(world, WANTED.crimeShot * 0.35);
}

/** Where a shot leaves the player, from inside a car or from the shoulder. */
function carMuzzle(world, p, angle) {
  if (p.inCar) {
    const car = p.inCar;
    return { x: car.x + Math.cos(angle) * 26, y: car.y + Math.sin(angle) * 26 };
  }
  return { x: p.x + Math.cos(angle) * 16, y: p.y + Math.sin(angle) * 16 };
}

/** Steps the whole world by dt seconds. */
export function updateWorld(world, dt) {
  if (world.phase !== PHASE_PLAY) {
    updateParticles(world, dt);
    world.camera.shake *= 0.9;
    return;
  }
  world.time += dt;
  const p = world.player;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.hitTimer = Math.max(0, p.hitTimer - dt);

  updatePlayer(world, dt);
  updateTraffic(world, dt);
  updatePeds(world, dt);
  updatePolice(world, dt);
  updateBullets(world, dt);
  updateParticles(world, dt);
  updateWanted(world, dt);
  updateMission(world, dt);
  updateCamera(world, dt);

  if (world.message.timer > 0) {
    world.message.timer -= dt;
    if (world.message.timer <= 0) world.message = null;
  }
  if (world.banner && world.banner.timer > 0) {
    world.banner.timer -= dt;
    if (world.banner.timer <= 0) world.banner = null;
  }
}

/** Moves the player: on foot with WASD, or the car they are in, and fires with the mouse. */
function updatePlayer(world, dt) {
  const p = world.player;
  const keys = world.keys;
  let ax = 0;
  let ay = 0;
  if (keys.has('w') || keys.has('arrowup')) ay -= 1;
  if (keys.has('s') || keys.has('arrowdown')) ay += 1;
  if (keys.has('a') || keys.has('arrowleft')) ax -= 1;
  if (keys.has('d') || keys.has('arrowright')) ax += 1;
  const moving = ax !== 0 || ay !== 0;

  // Where the mouse is in the world decides the facing and the aim.
  const aimX = world.mouse.x - (world.camera.x - world.viewW / 2);
  const aimY = world.mouse.y - (world.camera.y - world.viewH / 2);
  p.aiming = Math.atan2(aimY, aimX);

  if (p.inCar) {
    const car = p.inCar;
    driveCar(world, car, ax, ay, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (world.mouse.down) fireWeapon(world, p.aiming);
    if (keys.has('f')) {
      exitCar(world);
      keys.delete('f');
    }
    return;
  }

  const speed = keys.has('shift') ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const target = moving ? normalize(ax, ay) : { x: 0, y: 0 };
  p.vx += (target.x * speed - p.vx) * Math.min(1, dt * 14);
  p.vy += (target.y * speed - p.vy) * Math.min(1, dt * 14);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.angle = Math.atan2(aimY, aimX);

  p.x += (Math.cos(p.angle) * 0 - 0) * dt;
  const fixed = resolveWalls(world.city, p.x, p.y, p.radius);
  p.x = fixed.x;
  p.y = fixed.y;
  const bounded = clampToWorld(p.x, p.y, 24);
  p.x = bounded.x;
  p.y = bounded.y;

  if (world.mouse.down) fireWeapon(world, p.aiming);

  // F gets into the nearest car.
  if (keys.has('f')) {
    const car = carNear(world, p.x, p.y);
    if (car) enterCar(world, car);
    keys.delete('f');
  }

  // Run over: a car at speed that touches the player hurts them.
  for (const car of world.cars) {
    if (car.wrecked || car.speed < 90) continue;
    if (Math.hypot(car.x - p.x, car.y - p.y) < CAR.hitPedRadius + p.radius) {
      damagePlayer(world, 22 + Math.random() * 8);
    }
  }
}

/** Drives the car the player is in: W and S for throttle and brake, A and D to steer. */
function driveCar(world, car, ax, ay, dt) {
  const throttle = -ay;
  const steer = ax;
  // Throttle and brake first, along the car's own heading.
  if (throttle > 0) {
    car.speed += CAR.accel * dt;
  } else if (throttle < 0) {
    if (car.speed > 6) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.7 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.drag * dt);
  }
  car.speed = clamp(car.speed, -CAR.reverseSpeed, CAR.maxSpeed);

  // Steering scales with speed, so a stopped car cannot turn on the spot.
  const steerAuthority = clamp(Math.abs(car.speed) / 160, 0, 1);
  if (Math.abs(car.speed) > 3) {
    car.angle += steer * CAR.steerRate * dt * steerAuthority * Math.sign(car.speed);
  }

  // The body slides: its velocity is pulled toward its heading, which is the grip.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const wantX = fx * car.speed;
  const wantY = fy * car.speed;
  car.vx += (wantX - car.vx) * Math.min(1, dt * CAR.grip);
  car.vy += (wantY - car.vy) * Math.min(1, dt * CAR.grip);
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  collideCar(world, car);

  // Tyre marks: while the car is fast and turning hard, both rear wheels leave a dark smear that
  // stays on the road, which is what tells the eye the car was moving.
  if (Math.abs(car.speed) > 210 && Math.abs(steer) > 0 && world.marks.length < 900) {
    const rx = Math.cos(car.angle + Math.PI / 2) * CAR.width * 0.42;
    const ry = Math.sin(car.angle + Math.PI / 2) * CAR.width * 0.42;
    const bx = car.x - Math.cos(car.angle) * CAR.length * 0.34;
    const by = car.y - Math.sin(car.angle) * CAR.length * 0.34;
    world.marks.push({ x: bx + rx, y: by + ry, life: 4.5 });
    world.marks.push({ x: bx - rx, y: by - ry, life: 4.5 });
  }
  // A puff of dust behind a hard-driven car.
  if (Math.abs(car.speed) > 240 && world.rng.chance(dt * 12)) {
    const bx = car.x - Math.cos(car.angle) * CAR.length * 0.5;
    const by = car.y - Math.sin(car.angle) * CAR.length * 0.5;
    world.particles.push({ kind: 'dust', x: bx, y: by, life: 0.5, maxLife: 0.5, r: 7 });
  }

  // Sirens and lights for a police cruiser the player stole.
  if (car.kind === 'police') car.siren = world.time;
}

/** Keeps a car out of buildings and off the map edge, losing speed on a hit. */
function collideCar(world, car) {
  const r = CAR.width * 0.6;
  const fixed = resolveWalls(world.city, car.x, car.y, r);
  if (fixed.hit) {
    car.speed *= 0.35;
    car.vx *= -0.2;
    car.vy *= -0.2;
    if (Math.abs(car.speed) > 200) {
      world.camera.shake = Math.min(1, world.camera.shake + 0.4);
      world.particles.push({ kind: 'smoke', x: car.x, y: car.y, life: 0.5, maxLife: 0.5, r: 12 });
    }
  }
  car.x = fixed.x;
  car.y = fixed.y;
  const bounded = clampToWorld(car.x, car.y, 30);
  car.x = bounded.x;
  car.y = bounded.y;

  // Cars push each other apart, which keeps traffic from overlapping at a junction.
  for (const other of world.cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const dist = Math.hypot(dx, dy);
    const minDist = (car.width + other.width) * 0.75;
    if (dist > 1e-3 && dist < minDist) {
      const push = (minDist - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;
      car.x -= nx * push;
      car.y -= ny * push;
      other.x += nx * push;
      other.y += ny * push;
      if (car === world.player.inCar && Math.abs(car.speed) > 200) {
        addHeat(world, WANTED.crimeCarHit * 0.2);
      }
    }
  }
}

/** The player gets into a car. */
export function enterCar(world, car) {
  const p = world.player;
  p.inCar = car;
  car.driver = 'player';
  car.speed = Math.hypot(car.vx, car.vy);
  if (car.kind === 'civilian') {
    world.stats.carsStolen += 1;
    addHeat(world, 0.55);
    world.message = { text: 'Car taken', sub: 'W to drive, A and D to steer, F to get out.', timer: 4 };
  } else {
    addHeat(world, 1.1);
    world.message = { text: 'Police cruiser taken', sub: 'Every unit in the city is now after you.', timer: 4 };
  }
}

/** The player gets out, leaving the car rolling. */
export function exitCar(world) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = null;
  p.inCar = null;
  const side = car.angle + Math.PI / 2;
  const spot = clampToWorld(car.x + Math.cos(side) * 34, car.y + Math.sin(side) * 34, 24);
  p.x = spot.x;
  p.y = spot.y;
  p.vx = 0;
  p.vy = 0;
}

/** Traffic: each car cruises its lane, slows for the car ahead, and turns at junctions. */
function updateTraffic(world, dt) {
  const p = world.player;
  for (const car of world.cars) {
    if (car === p.inCar || car.wrecked) continue;

    // A wrecked or driverless stolen car just rolls to a stop.
    if (car.driver === null && car.speed !== 0 && car.kind !== 'civilian') {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.drag * dt);
    }

    // A car with no lane (a cruiser placed for a scene, or one the player abandoned) keeps its own
    // heading and just rolls forward: the lane logic below only applies to traffic.
    if (!car.laneAxis) {
      if (car.speed !== 0) {
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        collideCar(world, car);
      }
      continue;
    }

    if (car.laneAxis === 'x') {
      car.x += car.dir * car.speed * dt;
      car.y += (roadCenter(Math.floor(car.y / CITY.cell)) + car.laneOffset - car.y) * Math.min(1, dt * 3);
      car.angle = turnToward(car.angle, car.dir > 0 ? 0 : Math.PI, dt * 4);
    } else {
      car.y += car.dir * car.speed * dt;
      car.x += (roadCenter(Math.floor(car.x / CITY.cell)) + car.laneOffset - car.x) * Math.min(1, dt * 3);
      car.angle = turnToward(car.angle, car.dir > 0 ? Math.PI / 2 : -Math.PI / 2, dt * 4);
    }

    // Slow down for whatever is in front of us in the lane.
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    let blocked = false;
    for (const other of world.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * fx + dy * fy;
      const side = Math.abs(-dx * fy + dy * fx);
      if (ahead > 0 && ahead < TRAFFIC.lookAhead && side < 30) { blocked = true; break; }
    }
    if (p.inCar === null && Math.hypot(p.x - car.x, p.y - car.y) < 90) blocked = true;
    const want = blocked ? 0 : car.cruise;
    car.speed += clamp(want - car.speed, -CAR.brake * dt, CAR.accel * 0.6 * dt);

    // Wrap around the map so the streets never empty out.
    if (car.x < -80) car.x = WORLD.width + 80;
    if (car.x > WORLD.width + 80) car.x = -80;
    if (car.y < -80) car.y = WORLD.height + 80;
    if (car.y > WORLD.height + 80) car.y = -80;

    // Turn at a junction now and then, keeping to the road.
    if (car.laneAxis === 'x' && Math.abs(car.x - Math.round(car.x / CITY.cell) * CITY.cell - CITY.cell / 2) < 6) {
      if (world.rng.chance(dt * 0.6)) {
        car.laneAxis = 'y';
        car.dir = world.rng.chance(0.5) ? 1 : -1;
        car.laneOffset = car.dir * (ROAD_HALF * 0.45);
        car.x = roadCenter(Math.round(car.x / CITY.cell)) + car.laneOffset;
      }
    } else if (car.laneAxis === 'y' && Math.abs(car.y - Math.round(car.y / CITY.cell) * CITY.cell - CITY.cell / 2) < 6) {
      if (world.rng.chance(dt * 0.6)) {
        car.laneAxis = 'x';
        car.dir = world.rng.chance(0.5) ? 1 : -1;
        car.laneOffset = car.dir * (ROAD_HALF * 0.45);
        car.y = roadCenter(Math.round(car.y / CITY.cell)) + car.laneOffset;
      }
    }
  }
}

/** Pedestrians: walkers on the pavements who panic near danger. */
function updatePeds(world, dt) {
  const p = world.player;
  for (const ped of world.peds) {
    if (ped.dead) continue;
    ped.bob += dt * (ped.panic > 0 ? 12 : 6);
    if (ped.panic > 0) {
      ped.panic -= dt;
      ped.x += Math.cos(ped.angle) * ped.speed * 2.1 * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * 2.1 * dt;
    } else {
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      // Drift back toward the grid: a wander that stays on the streets.
      if (world.rng.chance(dt * 0.15)) ped.angle += (world.rng.next() - 0.5) * 1.4;
    }

    // A car at speed, a nearby gunshot, or the player sprinting in frightens them.
    for (const car of world.cars) {
      if (car.wrecked || car.speed < 150) continue;
      if (Math.hypot(car.x - ped.x, car.y - ped.y) < 120) {
        ped.panic = 1.6;
        ped.angle = Math.atan2(ped.y - car.y, ped.x - car.x);
      }
    }
    if (Math.hypot(p.x - ped.x, p.y - ped.y) < 70 && p.wanted > 0) {
      ped.panic = 1.2;
      ped.angle = Math.atan2(ped.y - p.y, ped.x - p.x);
    }

    const fixed = resolveWalls(world.city, ped.x, ped.y, 9);
    ped.x = clamp(fixed.x, 20, WORLD.width - 20);
    ped.y = clamp(fixed.y, 20, WORLD.height - 20);

    // Hit by the player's car.
    if (p.inCar && p.inCar.speed > 140 && Math.hypot(p.inCar.x - ped.x, p.inCar.y - ped.y) < CAR.hitPedRadius + 9) {
      ped.dead = true;
      world.stats.pedsHurt += 1;
      addHeat(world, WANTED.crimePed);
      world.particles.push({ kind: 'blood', x: ped.x, y: ped.y, life: 0.6, maxLife: 0.6, r: 10 });
      world.camera.shake = Math.min(1, world.camera.shake + 0.3);
    }
  }
}

/** The police: officers that chase the player on foot or by cruiser, and shoot when in range. */
function updatePolice(world, dt) {
  const p = world.player;
  const target = Math.min(POLICE.maxOfficers, p.wanted * 2);
  world.policeTimer -= dt;

  if (world.officers.length < target && world.policeTimer <= 0) {
    world.policeTimer = POLICE.spawnInterval;
    // Spawn at the edge of the screen, on a road, so they arrive rather than appear.
    const angle = world.rng.range(0, Math.PI * 2);
    const dist = 900;
    let sx = p.x + Math.cos(angle) * dist;
    let sy = p.y + Math.sin(angle) * dist;
    // Snap to the nearest road so they come down a street.
    sx = roadCenter(Math.round(sx / CITY.cell)) + world.rng.range(-ROAD_HALF * 0.5, ROAD_HALF * 0.5);
    sy = roadCenter(Math.round(sy / CITY.cell)) + world.rng.range(-ROAD_HALF * 0.5, ROAD_HALF * 0.5);
    sx = clamp(sx, 60, WORLD.width - 60);
    sy = clamp(sy, 60, WORLD.height - 60);
    world.officers.push({
      x: sx, y: sy, angle: 0,
      health: POLICE.officerHealth,
      cooldown: world.rng.range(0.4, 1.3),
      dead: false,
      bob: 0,
    });
  }

  for (const officer of world.officers) {
    if (officer.dead) continue;
    officer.bob += dt * 9;
    const dx = p.x - officer.x;
    const dy = p.y - officer.y;
    const dist = Math.hypot(dx, dy);
    officer.angle = Math.atan2(dy, dx);
    officer.cooldown = Math.max(0, officer.cooldown - dt);

    // Close in to shooting range, then hold it.
    const want = POLICE.officerShootRange * 0.72;
    if (dist > want) {
      const step = POLICE.officerSpeed * dt;
      officer.x += (dx / dist) * step;
      officer.y += (dy / dist) * step;
    } else if (dist < want * 0.5) {
      const step = POLICE.officerSpeed * 0.6 * dt;
      officer.x -= (dx / dist) * step;
      officer.y -= (dy / dist) * step;
    }
    const fixed = resolveWalls(world.city, officer.x, officer.y, 10);
    officer.x = fixed.x;
    officer.y = fixed.y;

    if (dist < POLICE.officerShootRange && officer.cooldown <= 0) {
      officer.cooldown = POLICE.officerCooldown + world.rng.range(-0.2, 0.4);
      const a = Math.atan2(dy, dx) + (world.rng.next() - 0.5) * 0.16;
      world.bullets.push({
        x: officer.x, y: officer.y,
        vx: Math.cos(a) * 1150,
        vy: Math.sin(a) * 1150,
        life: 0.42,
        damage: 7,
        from: 'police',
      });
      world.particles.push({ kind: 'flash', x: officer.x, y: officer.y, life: 0.06, maxLife: 0.06, angle: a });
    }
  }

  // Arrest: an officer standing over an unmoving, cornered player takes them in.
  if (p.wanted >= 1 && !p.inCar) {
    for (const officer of world.officers) {
      if (officer.dead) continue;
      if (Math.hypot(officer.x - p.x, officer.y - p.y) < 26 && p.health < 40) {
        world.phase = PHASE_ARREST;
        world.banner = { text: 'BUSTED', sub: 'The police took you in. Press R to run again.', timer: 8 };
      }
    }
  }
}

/** Moves every bullet, resolves hits against people and cars, and retires the spent ones. */
function updateBullets(world, dt) {
  const p = world.player;
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let spent = b.life <= 0;

    if (!spent) {
      const fixed = resolveWalls(world.city, b.x, b.y, 2);
      if (fixed.hit) spent = true;
    }

    if (!spent && b.from === 'player') {
      // Against pedestrians.
      for (const ped of world.peds) {
        if (ped.dead) continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 11) {
          ped.dead = true;
          world.stats.pedsHurt += 1;
          addHeat(world, WANTED.crimePed);
          world.particles.push({ kind: 'blood', x: b.x, y: b.y, life: 0.5, maxLife: 0.5, r: 8 });
          spent = true;
          break;
        }
      }
    }
    if (!spent && b.from === 'player') {
      for (const officer of world.officers) {
        if (officer.dead) continue;
        if (Math.hypot(officer.x - b.x, officer.y - b.y) < 12) {
          officer.health -= b.damage;
          world.particles.push({ kind: 'blood', x: b.x, y: b.y, life: 0.4, maxLife: 0.4, r: 6 });
          if (officer.health <= 0) {
            officer.dead = true;
            world.stats.officersDown += 1;
            addHeat(world, WANTED.crimeOfficer);
          }
          spent = true;
          break;
        }
      }
    }
    if (!spent && b.from === 'police') {
      const tgt = p.inCar ? p.inCar : p;
      if (Math.hypot(tgt.x - b.x, tgt.y - b.y) < (p.inCar ? 20 : 12)) {
        damagePlayer(world, b.damage);
        spent = true;
      }
    }
    if (!spent) {
      // Against cars: a burst of hits wrecks one.
      for (const car of world.cars) {
        if (car.wrecked) continue;
        if (Math.hypot(car.x - b.x, car.y - b.y) < 20) {
          car.health -= b.damage * 0.5;
          if (car.health <= 0) wreckCar(world, car);
          world.particles.push({ kind: 'spark', x: b.x, y: b.y, life: 0.2, maxLife: 0.2, r: 5 });
          spent = true;
          break;
        }
      }
    }
    if (spent) world.bullets.splice(i, 1);
  }
}

/** A car taken too much damage: it burns, stops and blocks the road. */
function wreckCar(world, car) {
  car.wrecked = true;
  car.health = 0;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  world.particles.push({ kind: 'smoke', x: car.x, y: car.y, life: 2.4, maxLife: 2.4, r: 22 });
  if (world.player.inCar === car) {
    exitCar(world);
    damagePlayer(world, 30);
  }
}

/** Hurt the player, respecting the brief immunity after a hit. */
export function damagePlayer(world, amount) {
  const p = world.player;
  if (p.hitTimer > 0) return;
  p.hitTimer = PLAYER.hitCooldown;
  if (p.inCar) {
    p.inCar.health -= amount * 0.6;
    if (p.inCar.health <= 0) return wreckCar(world, p.inCar);
    world.camera.shake = Math.min(1, world.camera.shake + 0.3);
    return;
  }
  p.health -= amount;
  world.camera.shake = Math.min(1, world.camera.shake + 0.45);
  world.particles.push({ kind: 'blood', x: p.x, y: p.y, life: 0.4, maxLife: 0.4, r: 8 });
  if (p.health <= 0) {
    p.health = 0;
    world.phase = PHASE_DEAD;
    world.banner = { text: 'WASTED', sub: 'Press R to try the city again.', timer: 999 };
  }
}

/** Heat cools when nothing happens for a while, and the wanted level follows it down. */
function updateWanted(world, dt) {
  const p = world.player;
  if (p.crimeTimer > 0) {
    p.crimeTimer -= dt;
    return;
  }
  if (p.wantedHeat > 0) {
    p.wantedHeat = Math.max(0, p.wantedHeat - WANTED.coolPerSecond * dt);
    const stars = wantedStars(p.wantedHeat);
    if (stars < p.wanted) {
      p.wanted = stars;
      if (stars === 0) {
        world.message = { text: 'Wanted level cleared', sub: 'The heat is off. For now.', timer: 4 };
        world.officers.length = 0;
      }
    }
  }
}

/** Reaching the mission marker pays out and sets the next job. */
function updateMission(world, dt) {
  const p = world.player;
  const target = world.missionTarget;
  if (Math.hypot(p.x - target.x, p.y - target.y) < 46) {
    const mission = MISSIONS[Math.min(world.missionIndex, MISSIONS.length - 1)];
    p.money += mission.pay;
    world.stats.moneyEarned += mission.pay;
    world.missionIndex += 1;
    if (world.missionIndex >= MISSIONS.length) {
      world.banner = { text: 'CITY RUN COMPLETE', sub: `You cleared every job with $${p.money}. Keep free-roaming.`, timer: 8 };
      world.missionTarget = null;
      world.missionIndex = MISSIONS.length;
    } else {
      pickNextMission(world);
    }
    world.particles.push({ kind: 'cash', x: target.x, y: target.y, life: 1.0, maxLife: 1.0, r: 20 });
  }
}

/** Keeps the camera on the player, leading slightly toward the aim, with a decaying shake. */
function updateCamera(world, dt) {
  const p = world.player;
  const leadX = p.inCar ? Math.cos(p.angle) * p.inCar.speed * 0.12 : 0;
  const leadY = p.inCar ? Math.sin(p.angle) * p.inCar.speed * 0.12 : 0;
  const targetX = p.x + leadX;
  const targetY = p.y + leadY;
  world.camera.x += (targetX - world.camera.x) * Math.min(1, dt * 5.5);
  world.camera.y += (targetY - world.camera.y) * Math.min(1, dt * 5.5);
  world.camera.shake = Math.max(0, world.camera.shake - dt * 2.2);
}

/** Ages particles and drops the finished ones. */
function updateParticles(world, dt) {
  for (let i = world.marks.length - 1; i >= 0; i -= 1) {
    world.marks[i].life -= dt;
    if (world.marks[i].life <= 0) world.marks.splice(i, 1);
  }
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const part = world.particles[i];
    part.life -= dt;
    if (part.life <= 0) world.particles.splice(i, 1);
  }
}
