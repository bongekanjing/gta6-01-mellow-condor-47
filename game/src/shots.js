// The screenshot scenes behind ?shot=... Each one builds a world, plays the real rules forward for a
// fixed number of steps under a scripted pilot, and then says the frame is ready. Because the rules
// run for real, the frame is what the game actually looks like, and the same seed always gives the
// same picture: nothing here draws a frame by hand.

import { STEP } from './config.js';
import { createWorld, addHeat, enterCar, PHASE_DEAD } from './world.js';
import { viewSize } from './render.js';

/** Steps the world, with the keys the scene wants held down. */
function advance(world, steps, keys = [], mouse = null) {
  world.keys = new Set(keys);
  if (mouse) world.mouse = { ...mouse };
  for (let i = 0; i < steps; i += 1) {
    world.viewW = viewSize(world.viewWidth, world.viewHeight).w;
    world.viewH = viewSize(world.viewWidth, world.viewHeight).h;
    // The update function is injected once by main.js; shots run the same one.
    world.step(STEP);
  }
}

/** Puts the camera straight on the player, so a scripted scene does not have to wait for a glide. */
function snapCamera(world) {
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
}

/**
 * Builds the world for a named scene and runs it forward. `name` is one of:
 *   title   — the opening shot: the city from above, traffic, the mission ahead
 *   drive   — the player in a stolen car, police behind, wanted stars lit
 *   chase   — a shootout in the street, officers closing in
 *   mission — the player at the mission marker, the city spread out around them
 */
export function buildScene(name, seed, viewWidth, viewHeight, makeWorld) {
  const world = makeWorld ? makeWorld() : createWorld(seed);
  world.viewWidth = viewWidth;
  world.viewHeight = viewHeight;
  // main.js passes a factory whose world carries the real stepper.
  if (!world.step) throw new Error('shots.js: the world factory must install world.step first');

  if (name === 'title') {
    // A short walk so the player is off their spawn point and traffic has moved into frame.
    advance(world, 220, ['d']);
    advance(world, 90, []);
    snapCamera(world);
    world.message = { text: 'Sunset City', sub: 'Click to take the streets', timer: 999 };
    return world;
  }

  if (name === 'drive') {
    // Find the nearest road car, take it, and drive hard for a while.
    advance(world, 40, []);
    const car = world.cars
      .filter((c) => c.kind === 'civilian' && !c.wrecked)
      .sort((a, b) => Math.hypot(a.x - world.player.x, a.y - world.player.y) - Math.hypot(b.x - world.player.x, b.y - world.player.y))[0];
    if (car) {
      world.player.x = car.x;
      world.player.y = car.y;
      enterCar(world, car);
      // The player's car is a deliberate colour, so the fleeing car is the one the eye finds first.
      car.color = '#e05a3c';
      // Steer onto a road heading and put the foot down.
      car.angle = car.laneAxis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      advance(world, 150, ['w']);
      addHeat(world, 5.6);
      world.player.wanted = 3;
      snapCamera(world);

      // The pursuit is placed last, so nothing has a chance to move it out of frame: two cruisers
      // closing from behind and one waiting across the road ahead. Each sits clear of the others so
      // the frame reads as a chase rather than a traffic jam.
      const back = car.angle + Math.PI;
      const side = car.angle - Math.PI / 2;
      const spots = [
        { d: 92, s: 40, face: 0 },
        { d: 168, s: -34, face: 0 },
        { d: -128, s: 44, face: Math.PI },
      ];
      for (const spot of spots) {
        world.cars.push({
          x: car.x + Math.cos(back) * spot.d + Math.cos(side) * spot.s,
          y: car.y + Math.sin(back) * spot.d + Math.sin(side) * spot.s,
          angle: car.angle + spot.face,
          vx: 0, vy: 0, speed: 0,
          color: '', kind: 'police', width: 25, length: 48,
          health: 150, driver: null, wrecked: false,
          laneAxis: null, dir: 1, laneOffset: 0, cruise: 0, siren: 0,
        });
      }
      world.banner = null;
      world.message = { text: 'Shake the tail', sub: 'Lose the police, then reach the safehouse.', timer: 999 };
    }
    return world;
  }

  if (name === 'chase') {
    // On foot in the street with a rifle out and officers closing from two sides.
    advance(world, 150, ['s', 'd']);
    addHeat(world, 7.9);
    world.player.wanted = 4;
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      world.officers.push({
        x: world.player.x + Math.cos(a) * (150 + i * 26),
        y: world.player.y + Math.sin(a) * (150 + i * 26),
        angle: a + Math.PI, health: 62, cooldown: 0.5 + i * 0.1, dead: false, bob: i,
      });
    }
    // A wrecked civilian car and some smoke make the street read as a scene.
    world.particles.push({ kind: 'smoke', x: world.player.x + 120, y: world.player.y - 70, life: 1.6, maxLife: 2.4, r: 22 });
    advance(world, 24, ['d'], { x: world.viewWidth * 0.68, y: world.viewHeight * 0.42, down: true });
    snapCamera(world);
    world.banner = null;
    world.message = { text: 'Shootout on 9th', sub: 'Four stars and the whole precinct on you.', timer: 999 };
    return world;
  }

  if (name === 'mission') {
    advance(world, 120, ['w']);
    const t = world.missionTarget;
    world.player.x = t.x - 34;
    world.player.y = t.y + 30;
    world.player.angle = -0.4;
    advance(world, 60, []);
    snapCamera(world);
    world.message = { text: 'Collect the package', sub: 'Get to the drop before it goes cold.', timer: 999 };
    return world;
  }

  // An unknown scene: the plain city.
  advance(world, 120, []);
  snapCamera(world);
  return world;
}
