// Everything the player sees: the city painted under a camera that follows them, the traffic and
// people drawn from above with their own shadows, and a HUD with a minimap, a wanted ladder, a
// health bar and the money. One pass, canvas 2D, no assets.

import { CITY, WORLD, COLORS, PLAYER, CAR } from './config.js';
import { roadCenter, ROAD_HALF } from './city.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_OVER = 'over';

/** The camera's view in world pixels for a canvas of the given size: a fixed 470px tall view, close
 *  enough that a person reads as a person rather than a dot. */
export function viewSize(width, height) {
  const worldHeight = 470;
  const scale = height / worldHeight;
  return { w: width / scale, h: worldHeight, scale };
}

/**
 * Draws one frame. `world` is the simulation state, `ctx` the canvas, and `size` the canvas size in
 * device pixels.
 */
export function drawWorld(ctx, world, size) {
  const view = viewSize(size.width, size.height);
  const scale = view.scale;
  const cam = world.camera;
  // Shake moves the whole view a few pixels, decaying in world.js.
  const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * 14 * cam.shake : 0;
  const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * 14 * cam.shake : 0;

  ctx.save();
  ctx.fillStyle = '#14171d';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.scale(scale, scale);
  ctx.translate(-(cam.x - view.w / 2) + shakeX, -(cam.y - view.h / 2) + shakeY);

  const left = cam.x - view.w / 2 - 120;
  const top = cam.y - view.h / 2 - 120;
  const right = cam.x + view.w / 2 + 120;
  const bottom = cam.y + view.h / 2 + 120;

  drawGround(ctx, world.city, left, top, right, bottom);
  drawMarks(ctx, world);
  drawProps(ctx, world.city, left, top, right, bottom);
  drawParked(ctx, world.city, left, top, right, bottom);
  drawBuildings(ctx, world.city, left, top, right, bottom);
  drawMissionMarker(ctx, world);
  drawPickups(ctx, world);
  drawCars(ctx, world);
  drawPeds(ctx, world);
  drawOfficers(ctx, world);
  drawPlayer(ctx, world);
  drawBullets(ctx, world);
  drawParticles(ctx, world);
  drawNight(ctx, world, left, top, right, bottom);

  ctx.restore();
  drawHud(ctx, world, size, view);
}

/** The streets: asphalt, the dashed centre lines, crossings at every junction, pavements. */
function drawGround(ctx, city, left, top, right, bottom) {
  ctx.fillStyle = COLORS.asphalt;
  ctx.fillRect(left, top, right - left, bottom - top);

  const gx0 = Math.floor(left / CITY.cell);
  const gx1 = Math.ceil(right / CITY.cell);
  const gy0 = Math.floor(top / CITY.cell);
  const gy1 = Math.ceil(bottom / CITY.cell);

  // Blocks that are parks or empty lots get their own ground.
  for (const block of city.blocks) {
    if (block.kind === 'park') {
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
      drawParkMarkings(ctx, block);
    } else if (block.kind === 'lot') {
      ctx.fillStyle = COLORS.asphaltAlt;
      ctx.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
      drawLotMarkings(ctx, block);
    }
  }

  // Pavements: a lighter band down each side of every road.
  ctx.fillStyle = COLORS.sidewalk;
  for (let i = gx0; i <= gx1; i += 1) {
    const cx = roadCenter(i);
    ctx.fillRect(cx - ROAD_HALF - CITY.sidewalk, top, CITY.sidewalk, bottom - top);
    ctx.fillRect(cx + ROAD_HALF, top, CITY.sidewalk, bottom - top);
  }
  for (let i = gy0; i <= gy1; i += 1) {
    const cy = roadCenter(i);
    ctx.fillRect(left, cy - ROAD_HALF - CITY.sidewalk, right - left, CITY.sidewalk);
    ctx.fillRect(left, cy + ROAD_HALF, right - left, CITY.sidewalk);
  }

  // A kerb line where the pavement meets the road.
  ctx.strokeStyle = COLORS.sidewalkEdge;
  ctx.lineWidth = 3;
  for (let i = gx0; i <= gx1; i += 1) {
    const cx = roadCenter(i);
    ctx.beginPath();
    ctx.moveTo(cx - ROAD_HALF, top); ctx.lineTo(cx - ROAD_HALF, bottom);
    ctx.moveTo(cx + ROAD_HALF, top); ctx.lineTo(cx + ROAD_HALF, bottom);
    ctx.stroke();
  }
  for (let i = gy0; i <= gy1; i += 1) {
    const cy = roadCenter(i);
    ctx.beginPath();
    ctx.moveTo(left, cy - ROAD_HALF); ctx.lineTo(right, cy - ROAD_HALF);
    ctx.moveTo(left, cy + ROAD_HALF); ctx.lineTo(right, cy + ROAD_HALF);
    ctx.stroke();
  }

  // The centre lines, dashed, stopping short of each junction.
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (let i = gx0; i <= gx1; i += 1) {
    const cx = roadCenter(i);
    ctx.beginPath();
    ctx.moveTo(cx, top); ctx.lineTo(cx, bottom);
    ctx.stroke();
  }
  for (let i = gy0; i <= gy1; i += 1) {
    const cy = roadCenter(i);
    ctx.beginPath();
    ctx.moveTo(left, cy); ctx.lineTo(right, cy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Crossings: the striped bands either side of every junction.
  ctx.fillStyle = COLORS.crosswalk;
  for (let i = gx0; i <= gx1; i += 1) {
    for (let j = gy0; j <= gy1; j += 1) {
      const cx = roadCenter(i);
      const cy = roadCenter(j);
      for (const sign of [-1, 1]) {
        for (let s = 0; s < 5; s += 1) {
          ctx.fillRect(cx - ROAD_HALF + 6 + s * 17, cy + sign * (ROAD_HALF + 6), 11, 20);
          ctx.fillRect(cx + sign * (ROAD_HALF + 6), cy - ROAD_HALF + 6 + s * 17, 20, 11);
        }
      }
    }
  }
}

/** A park reads as grass with a path across it and a few trees. */
function drawParkMarkings(ctx, block) {
  const w = block.x1 - block.x0;
  const h = block.y1 - block.y0;
  ctx.strokeStyle = 'rgba(210,200,170,0.35)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(block.x0, block.y0 + h / 2);
  ctx.lineTo(block.x1, block.y0 + h / 2);
  ctx.moveTo(block.x0 + w / 2, block.y0);
  ctx.lineTo(block.x0 + w / 2, block.y1);
  ctx.stroke();
  // Trees: a dark ring with a lighter crown.
  for (let i = 0; i < 5; i += 1) {
    const tx = block.x0 + w * (0.18 + ((i * 17) % 13) / 20);
    const ty = block.y0 + h * (0.16 + ((i * 29) % 11) / 18);
    ctx.fillStyle = 'rgba(6,9,15,0.35)';
    ctx.beginPath(); ctx.arc(tx + 4, ty + 5, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.grassAlt;
    ctx.beginPath(); ctx.arc(tx, ty, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(108,160,110,0.5)';
    ctx.beginPath(); ctx.arc(tx - 3, ty - 3, 6, 0, Math.PI * 2); ctx.fill();
  }
}

/** A car park: bays painted on the tarmac. */
function drawLotMarkings(ctx, block) {
  ctx.strokeStyle = 'rgba(226,232,240,0.22)';
  ctx.lineWidth = 3;
  const bayW = 62;
  const cols = Math.floor((block.x1 - block.x0) / bayW);
  for (let i = 0; i <= cols; i += 1) {
    const x = block.x0 + 14 + i * bayW;
    ctx.beginPath();
    ctx.moveTo(x, block.y0 + 16);
    ctx.lineTo(x, block.y1 - 16);
    ctx.stroke();
  }
}

/** Buildings, drawn as solid volumes: a drop shadow, walls, a roof, and a rooftop box. */
function drawBuildings(ctx, city, left, top, right, bottom) {
  for (const b of city.buildings) {
    if (b.x > right || b.y > bottom || b.x + b.w < left || b.y + b.h < top) continue;
    // The cast shadow, offset down-right, sells the height.
    ctx.fillStyle = COLORS.wallShadow;
    ctx.fillRect(b.x + 14, b.y + 16, b.w, b.h);
    // Walls: a darker band under the roof edge.
    ctx.fillStyle = COLORS.sidewalkEdge;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // The roof, inset by the lip.
    ctx.fillStyle = b.tone;
    ctx.fillRect(b.x + b.lip, b.y + b.lip, b.w - b.lip * 2, b.h - b.lip * 2);
    // A lighter highlight along the top-left edge of the roof.
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(b.x + b.lip, b.y + b.lip, b.w - b.lip * 2, 6);
    // Ventilation boxes and skylights.
    if (b.box) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.box.x + 4, b.box.y + 5, b.box.w, b.box.h);
      ctx.fillStyle = '#6b7484';
      ctx.fillRect(b.box.x, b.box.y, b.box.w, b.box.h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(b.box.x, b.box.y, b.box.w, 4);
    }
    // Window rows on the roof edge read as a lit office floor seen from above.
    if (b.windows) {
      ctx.fillStyle = 'rgba(247,214,140,0.14)';
      const step = 26;
      for (let x = b.x + b.lip + 8; x < b.x + b.w - b.lip - 12; x += step) {
        ctx.fillRect(x, b.y + b.lip + 6, 12, 5);
      }
    }
    // The outline keeps neighbouring roofs from bleeding together.
    ctx.strokeStyle = COLORS.roofEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + b.lip, b.y + b.lip, b.w - b.lip * 2, b.h - b.lip * 2);
  }
}

/** The mission marker: a pulsing yellow ring with a downward chevron. */
function drawMissionMarker(ctx, world) {
  if (!world.missionTarget) return;
  const t = world.missionTarget;
  const pulse = 0.55 + 0.45 * Math.sin(world.time * 3.4);
  ctx.save();
  ctx.globalAlpha = 0.22 + pulse * 0.3;
  ctx.fillStyle = COLORS.mission;
  ctx.beginPath(); ctx.arc(t.x, t.y, 46 + pulse * 10, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = COLORS.mission;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(t.x, t.y, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COLORS.mission;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y + 16);
  ctx.lineTo(t.x - 13, t.y - 9);
  ctx.lineTo(t.x + 13, t.y - 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPickups(ctx, world) {
  for (const pick of world.pickups) {
    ctx.save();
    ctx.translate(pick.x, pick.y);
    ctx.fillStyle = 'rgba(6,9,15,0.4)';
    ctx.beginPath(); ctx.arc(3, 4, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pick.kind === 'health' ? COLORS.health : COLORS.mission;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d1117';
    if (pick.kind === 'health') {
      ctx.fillRect(-6, -2, 12, 4);
      ctx.fillRect(-2, -6, 4, 12);
    } else {
      ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
  }
}

/** Cars: a shadow, a body with a roof, windows, and the tail lamps behind. */
function drawCars(ctx, world) {
  for (const car of world.cars) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const L = CAR.length;
    const W = CAR.width;

    ctx.fillStyle = 'rgba(6,9,15,0.5)';
    roundRect(ctx, -L / 2 + 5, -W / 2 + 6, L, W, 6);
    ctx.fill();

    // The body. A cruiser is a white car with a black bonnet and boot, the way a patrol car reads
    // from above, and it carries the light bar and a wash of red and blue on the road.
    const police = car.kind === 'police' && !car.wrecked;
    ctx.fillStyle = car.wrecked ? '#3a3a3a' : police ? '#e8ecf2' : car.color;
    roundRect(ctx, -L / 2, -W / 2, L, W, 6);
    ctx.fill();
    if (police) {
      ctx.fillStyle = '#14171f';
      roundRect(ctx, L * 0.16, -W / 2, L * 0.34, W, 4);
      ctx.fill();
      roundRect(ctx, -L / 2, -W / 2, L * 0.30, W, 4);
      ctx.fill();
      // A blue stripe down the flanks, and the door shield.
      ctx.fillStyle = COLORS.policeCar;
      ctx.fillRect(-L * 0.20, -W / 2, L * 0.40, 4);
      ctx.fillRect(-L * 0.20, W / 2 - 4, L * 0.40, 4);
    }

    // The roof and the windscreen: a lighter panel around the middle.
    ctx.fillStyle = 'rgba(12,16,24,0.72)';
    roundRect(ctx, -L * 0.18, -W / 2 + 4, L * 0.42, W - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,210,235,0.30)';
    roundRect(ctx, L * 0.10, -W / 2 + 5, L * 0.14, W - 10, 3);
    ctx.fill();

    // Tail lamps when moving backwards, headlights forward.
    ctx.fillStyle = '#e0574a';
    ctx.fillRect(-L / 2 + 1, -W / 2 + 3, 4, 6);
    ctx.fillRect(-L / 2 + 1, W / 2 - 9, 4, 6);
    ctx.fillStyle = 'rgba(255,236,180,0.85)';
    ctx.fillRect(L / 2 - 4, -W / 2 + 4, 3, 5);
    ctx.fillRect(L / 2 - 4, W / 2 - 9, 3, 5);

    // The light bar: two blocks that alternate, with a bloom that spills onto the tarmac.
    if (police) {
      const t = world.time * 9 + car.x * 0.02;
      const redOn = Math.sin(t) > 0;
      const glowA = ctx.createRadialGradient(0, 0, 2, 0, 0, 78);
      glowA.addColorStop(0, redOn ? 'rgba(232,68,58,0.34)' : 'rgba(58,122,232,0.34)');
      glowA.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowA;
      ctx.beginPath(); ctx.arc(0, 0, 78, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = redOn ? COLORS.policeLight : '#3b4152';
      roundRect(ctx, -5, -W / 2 + 1, 11, 7, 2);
      ctx.fill();
      ctx.fillStyle = redOn ? '#3b4152' : COLORS.policeLightAlt;
      roundRect(ctx, -5, W / 2 - 8, 11, 7, 2);
      ctx.fill();
    }

    // Damage: a scorched, tilted look for a wreck.
    if (car.wrecked) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, -L / 2, -W / 2, L, W, 6);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** People seen from above: a shadow, shoulders and a head. */
function drawPeds(ctx, world) {
  for (const ped of world.peds) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    const bob = Math.sin(ped.bob) * 1.6;
    ctx.fillStyle = 'rgba(6,9,15,0.45)';
    ctx.beginPath(); ctx.ellipse(3, 5, 13, 14, 0, 0, Math.PI * 2); ctx.fill();
    if (ped.dead) {
      ctx.fillStyle = 'rgba(120,30,26,0.55)';
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 12, ped.angle, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.shirt;
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, ped.angle, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.ellipse(0, bob, 10, 12.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.42)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(3, bob, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** Police officers: a navy uniform, a pale cap, and the pistol held out in front. */
function drawOfficers(ctx, world) {
  for (const officer of world.officers) {
    ctx.save();
    ctx.translate(officer.x, officer.y);
    if (officer.dead) {
      ctx.fillStyle = 'rgba(120,30,26,0.5)';
      ctx.beginPath(); ctx.ellipse(0, 0, 18, 13, officer.angle, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.officer;
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, officer.angle, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    const bob = Math.sin(officer.bob) * 1.8;
    ctx.fillStyle = 'rgba(6,9,15,0.5)';
    ctx.beginPath(); ctx.ellipse(4, 6, 15, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(officer.angle);
    // The pistol, out front and clear of the body.
    ctx.fillStyle = '#151922';
    ctx.fillRect(11, -3, 15, 6);
    // Shoulders, tapered, so the figure has a direction.
    ctx.fillStyle = COLORS.officer;
    ctx.beginPath();
    ctx.ellipse(0, bob, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // A pale vest stripe and the cap, which is what makes a cop read as a cop from above.
    ctx.fillStyle = 'rgba(226,232,240,0.75)';
    ctx.fillRect(-9, -3 + bob, 5, 6);
    ctx.fillStyle = '#e8edf5';
    ctx.beginPath(); ctx.arc(4, bob, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22305c';
    ctx.beginPath(); ctx.arc(5, bob, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** The player: a bright coat with a hard outline, a head, and the gun out in front. */
function drawPlayer(ctx, world) {
  const p = world.player;
  if (p.inCar) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.hitTimer > 0 && Math.floor(world.time * 20) % 2 === 0) ctx.globalAlpha = 0.55;

  // The aim cone on the ground, under the body, so the facing reads before the sprite does.
  if (world.mouse.down || p.wanted > 0) {
    ctx.save();
    ctx.globalAlpha = world.mouse.down ? 0.15 : 0.07;
    ctx.fillStyle = COLORS.bullet;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 320, p.aiming - 0.075, p.aiming + 0.075);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The drop shadow, then the body turned to face the aim.
  ctx.fillStyle = 'rgba(6,9,15,0.55)';
  ctx.beginPath(); ctx.ellipse(4, 6, 16, 17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.aiming);

  // The gun.
  ctx.fillStyle = '#101318';
  ctx.fillRect(9, -3, 20, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(9, -3, 20, 2);

  // The coat: a tapered ellipse with a bright rim outline, so the figure pops off the tarmac.
  ctx.fillStyle = COLORS.playerCoat;
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(198,244,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // The head, with a small highlight.
  ctx.fillStyle = COLORS.player;
  ctx.beginPath(); ctx.arc(4, 0, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(5.5, -2, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBullets(ctx, world) {
  for (const b of world.bullets) {
    const len = 16;
    const nx = b.vx / Math.hypot(b.vx, b.vy);
    const ny = b.vy / Math.hypot(b.vx, b.vy);
    ctx.strokeStyle = b.from === 'player' ? COLORS.bullet : COLORS.policeBullet;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - nx * len, b.y - ny * len);
    ctx.stroke();
  }
}

function drawParticles(ctx, world) {
  for (const part of world.particles) {
    const t = clamp(part.life / part.maxLife, 0, 1);
    if (part.kind === 'blood') {
      ctx.fillStyle = `rgba(150,32,28,${t * 0.8})`;
      ctx.beginPath(); ctx.arc(part.x, part.y, part.r * (1.5 - t * 0.5), 0, Math.PI * 2); ctx.fill();
    } else if (part.kind === 'smoke') {
      ctx.fillStyle = `rgba(120,126,138,${t * 0.45})`;
      ctx.beginPath(); ctx.arc(part.x, part.y, part.r * (2 - t), 0, Math.PI * 2); ctx.fill();
    } else if (part.kind === 'spark') {
      ctx.fillStyle = `rgba(255,214,140,${t})`;
      ctx.beginPath(); ctx.arc(part.x, part.y, part.r * t, 0, Math.PI * 2); ctx.fill();
    } else if (part.kind === 'flash') {
      ctx.fillStyle = `rgba(255,232,168,${t})`;
      ctx.beginPath(); ctx.arc(part.x, part.y, 9 * t, 0, Math.PI * 2); ctx.fill();
    } else if (part.kind === 'dust') {
      ctx.fillStyle = `rgba(178,172,158,${t * 0.30})`;
      ctx.beginPath(); ctx.arc(part.x, part.y, part.r * (2.6 - t * 1.6), 0, Math.PI * 2); ctx.fill();
    } else if (part.kind === 'cash') {
      ctx.fillStyle = `rgba(242,193,78,${t})`;
      ctx.beginPath(); ctx.arc(part.x, part.y, part.r * (2.4 - t * 1.4), 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** The sunset grade: a warm wash from one side, cooler shadow from the other, and a vignette. */
function drawNight(ctx, world, left, top, right, bottom) {
  const p = world.player;
  const w = right - left;
  const h = bottom - top;

  // A warm band on the horizon side of the view, cooling away from it.
  const sun = ctx.createLinearGradient(left, top, right, bottom);
  sun.addColorStop(0, 'rgba(255,150,70,0.16)');
  sun.addColorStop(0.45, 'rgba(255,180,110,0.05)');
  sun.addColorStop(1, 'rgba(30,44,90,0.20)');
  ctx.fillStyle = sun;
  ctx.fillRect(left, top, w, h);

  // The player's own light: brightness near them, dark at the edge of the view.
  const glow = ctx.createRadialGradient(p.x, p.y, 60, p.x, p.y, Math.max(w, h) * 0.62);
  glow.addColorStop(0, 'rgba(255,244,214,0.09)');
  glow.addColorStop(1, 'rgba(8,12,26,0.42)');
  ctx.fillStyle = glow;
  ctx.fillRect(left, top, w, h);

  // The car's headlights, as a wedge down the street.
  if (p.inCar) {
    const car = p.inCar;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const grad = ctx.createLinearGradient(0, 0, 340, 0);
    grad.addColorStop(0, 'rgba(255,240,196,0.20)');
    grad.addColorStop(1, 'rgba(255,240,196,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(20, -10);
    ctx.lineTo(340, -120);
    ctx.lineTo(340, 120);
    ctx.lineTo(20, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** The HUD: money, health, the wanted stars, the mission line, and the minimap in the corner. */
function drawHud(ctx, world, size, view) {
  const p = world.player;
  ctx.save();
  ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'top';

  // Money, top left, on a soft panel.
  ctx.fillStyle = COLORS.hudPanel;
  roundRect(ctx, 18, 18, 214, 46, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.mission;
  ctx.font = '700 24px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`$${p.money}`, 34, 28);
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('BANK', 150, 34);

  // Wanted stars beside the money.
  for (let i = 0; i < 5; i += 1) {
    const on = i < p.wanted;
    ctx.fillStyle = on ? '#f2c14e' : 'rgba(255,255,255,0.16)';
    star(ctx, 260 + i * 26, 41, 11, 5);
  }

  // Health, bottom left, as a bar with a label.
  const barW = 240;
  const healthFrac = clamp(p.health / PLAYER.maxHealth, 0, 1);
  ctx.fillStyle = COLORS.hudPanel;
  roundRect(ctx, 18, size.height - 74, barW + 34, 52, 10);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, 32, size.height - 52, barW, 16, 8);
  ctx.fill();
  ctx.fillStyle = healthFrac > 0.35 ? COLORS.health : COLORS.healthLow;
  roundRect(ctx, 32, size.height - 52, barW * healthFrac, 16, 8);
  ctx.fill();
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('HEALTH', 32, size.height - 72);
  ctx.fillStyle = COLORS.hud;
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`${Math.ceil(p.health)}`, 32 + barW + 10, size.height - 54);

  drawMinimap(ctx, world, size);

  // The speedometer, bottom right, in the car: a dial that reads the speed at a glance.
  if (p.inCar) {
    const cx = size.width - 104;
    const cy = size.height - 104;
    ctx.fillStyle = COLORS.hudPanel;
    ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx, cy, 50, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    const frac = clamp(Math.abs(p.inCar.speed) / 455, 0, 1);
    ctx.strokeStyle = frac > 0.82 ? '#e0574a' : COLORS.mission;
    ctx.beginPath(); ctx.arc(cx, cy, 50, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * frac)); ctx.stroke();
    ctx.fillStyle = COLORS.hud;
    ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(Math.abs(p.inCar.speed) / 4)}`, cx, cy - 14);
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('MPH', cx, cy + 22);
    ctx.textAlign = 'left';
  }

  // The mission line, centred at the top.
  if (world.missionTarget && world.missionIndex < 4) {
    const dist = Math.round(Math.hypot(p.x - world.missionTarget.x, p.y - world.missionTarget.y) / 10);
    const label = world.message ? world.message.text : 'Mission';
    ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = COLORS.hudPanel;
    roundRect(ctx, size.width / 2 - textW / 2 - 90, 20, textW + 180, 40, 10);
    ctx.fill();
    ctx.fillStyle = COLORS.mission;
    ctx.fillText(label, size.width / 2 - textW / 2, 30);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${dist} m`, size.width / 2 + textW / 2 - 46, 34);
  }

  // A banner for the big moments: a new mission, a wanted step, the end.
  if (world.banner) {
    const b = world.banner;
    const alpha = clamp(b.timer, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.font = '800 52px "Segoe UI", system-ui, sans-serif';
    const w = ctx.measureText(b.text).width;
    ctx.fillStyle = 'rgba(8,11,18,0.7)';
    roundRect(ctx, size.width / 2 - w / 2 - 40, size.height * 0.34, w + 80, 118, 16);
    ctx.fill();
    ctx.fillStyle = b.text === 'WASTED' || b.text === 'BUSTED' ? '#d0503c' : COLORS.mission;
    ctx.textAlign = 'center';
    ctx.fillText(b.text, size.width / 2, size.height * 0.34 + 22);
    ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = COLORS.hud;
    ctx.fillText(b.sub ?? '', size.width / 2, size.height * 0.34 + 84);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // The controls hint, bottom right, until the player drives once.
  if (world.stats.carsStolen === 0 && !p.inCar) {
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WASD walk   SHIFT run   F enter car   MOUSE aim & fire', size.width - 24, size.height - 30);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

/** The minimap: the roads as a bright grid, the player as a dot, the mission as a ring. */
function drawMinimap(ctx, world, size) {
  const sizePx = 176;
  const x = size.width - sizePx - 20;
  const y = 20;
  const scale = sizePx / WORLD.width;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,22,0.82)';
  roundRect(ctx, x, y, sizePx, sizePx, 12);
  ctx.fill();
  ctx.save();
  roundRect(ctx, x, y, sizePx, sizePx, 12);
  ctx.clip();

  // Roads: two lines per grid line, drawn as bright bands.
  ctx.strokeStyle = 'rgba(180,190,205,0.34)';
  ctx.lineWidth = Math.max(1, (CITY.road * scale));
  for (let i = 0; i < CITY.grid; i += 1) {
    const c = roadCenter(i) * scale;
    ctx.beginPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + c, y + sizePx); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + c); ctx.lineTo(x + sizePx, y + c); ctx.stroke();
  }

  // Block outlines, so the grid reads as a city.
  ctx.fillStyle = 'rgba(90,100,116,0.30)';
  for (const b of world.city.buildings) {
    ctx.fillRect(x + b.x * scale, y + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
  }

  if (world.missionTarget) {
    const t = world.missionTarget;
    ctx.strokeStyle = COLORS.mission;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x + t.x * scale, y + t.y * scale, 5, 0, Math.PI * 2); ctx.stroke();
  }

  // Officers on foot, then the cruisers after the player, both in police red so the radar shows
  // who is chasing you and from where.
  for (const officer of world.officers) {
    if (officer.dead) continue;
    ctx.fillStyle = '#e0574a';
    ctx.fillRect(x + officer.x * scale - 1.5, y + officer.y * scale - 1.5, 3.2, 3.2);
  }
  for (const car of world.cars) {
    if (car.kind !== 'police' || car.wrecked) continue;
    const bx = x + car.x * scale;
    const by = y + car.y * scale;
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(world.time * 6));
    ctx.fillStyle = `rgba(232,68,58,${pulse})`;
    ctx.beginPath(); ctx.arc(bx, by, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(232,68,58,${0.55 * pulse})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.stroke();
  }

  const p = world.player;
  ctx.fillStyle = COLORS.player;
  ctx.beginPath(); ctx.arc(x + p.x * scale, y + p.y * scale, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // A view box, so the minimap shows what the screen shows.
  const view = viewSize(size.width, size.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    x + (world.camera.x - view.w / 2) * scale,
    y + (world.camera.y - view.h / 2) * scale,
    view.w * scale,
    view.h * scale,
  );
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, sizePx, sizePx, 12);
  ctx.stroke();
  ctx.restore();
}

/** A five-pointed star, for the wanted ladder. */
function star(ctx, cx, cy, r, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** A rounded rectangle path, used everywhere in the HUD and car bodies. */
export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Tyre marks left on the road, fading out over a few seconds. */
function drawMarks(ctx, world) {
  for (const mark of world.marks) {
    const a = Math.min(1, mark.life / 4.5) * 0.34;
    ctx.fillStyle = `rgba(8,10,14,${a})`;
    ctx.beginPath(); ctx.arc(mark.x, mark.y, 3.2, 0, Math.PI * 2); ctx.fill();
  }
}

/** Street furniture: lamp posts with a warm pool of light, trees, and bins. */
function drawProps(ctx, city, left, top, right, bottom) {
  for (const prop of city.props) {
    if (prop.x < left || prop.x > right || prop.y < top || prop.y > bottom) continue;
    if (prop.kind === 'lamp') {
      // The pool of light on the tarmac, then the post and its head.
      const glow = ctx.createRadialGradient(prop.x, prop.y, 4, prop.x, prop.y, 92);
      glow.addColorStop(0, 'rgba(255,214,140,0.20)');
      glow.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 92, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(6,9,15,0.5)';
      ctx.beginPath(); ctx.arc(prop.x + 3, prop.y + 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d4450';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (prop.kind === 'tree') {
      ctx.fillStyle = 'rgba(6,9,15,0.42)';
      ctx.beginPath(); ctx.arc(prop.x + 5, prop.y + 6, prop.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b4230';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, prop.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(110,165,112,0.55)';
      ctx.beginPath(); ctx.arc(prop.x - prop.r * 0.28, prop.y - prop.r * 0.3, prop.r * 0.55, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(6,9,15,0.45)';
      ctx.fillRect(prop.x - 4, prop.y - 3, 12, 12);
      ctx.fillStyle = '#37414a';
      ctx.fillRect(prop.x - 6, prop.y - 5, 12, 11);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(prop.x - 6, prop.y - 5, 12, 3);
    }
  }
}

/** Parked cars: the same body as a driven one, dimmed, with no lights on. */
function drawParked(ctx, city, left, top, right, bottom) {
  for (const car of city.parked) {
    if (car.x < left || car.x > right || car.y < top || car.y > bottom) continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const L = CAR.length;
    const W = CAR.width;
    ctx.fillStyle = 'rgba(6,9,15,0.5)';
    roundRect(ctx, -L / 2 + 4, -W / 2 + 5, L, W, 6);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(ctx, -L / 2, -W / 2, L, W, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(8,11,18,0.62)';
    roundRect(ctx, -L * 0.16, -W / 2 + 4, L * 0.4, W - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,215,240,0.16)';
    roundRect(ctx, L * 0.12, -W / 2 + 5, L * 0.12, W - 10, 3);
    ctx.fill();
    ctx.restore();
  }
}

/** The start screen: the title, what the game is, and the key that begins. */
export function drawTitleScreen(ctx, world, size, hasSave) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,9,16,0.62)';
  ctx.fillRect(0, 0, size.width, size.height);

  const cx = size.width / 2;
  ctx.textAlign = 'center';

  // A warm horizon band behind the title, so the screen is not a flat black card.
  const band = ctx.createLinearGradient(0, size.height * 0.26, 0, size.height * 0.62);
  band.addColorStop(0, 'rgba(255,138,64,0)');
  band.addColorStop(0.5, 'rgba(255,138,64,0.16)');
  band.addColorStop(1, 'rgba(255,138,64,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, size.height * 0.26, size.width, size.height * 0.36);

  ctx.fillStyle = COLORS.mission;
  ctx.font = '800 84px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('SUNSET CITY', cx, size.height * 0.38);

  ctx.fillStyle = 'rgba(232,237,245,0.86)';
  ctx.font = '600 21px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('An open-world crime game. Take the streets, take the cars, take the heat.', cx, size.height * 0.38 + 46);

  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('WASD walk or drive      MOUSE aim and fire      F enter or leave a car      SHIFT run      ESC pause      P save', cx, size.height * 0.72);

  const pulse = 0.55 + 0.45 * Math.sin(world.time * 3.2);
  ctx.fillStyle = `rgba(242,193,78,${pulse})`;
  ctx.font = '700 24px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(hasSave ? 'Press ENTER to keep driving, or N for a new run' : 'Press ENTER to take the streets', cx, size.height * 0.82);

  ctx.textAlign = 'left';
  ctx.restore();
}

/** The pause card, over the frozen city. */
export function drawPauseScreen(ctx, world, size) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,9,16,0.68)';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.mission;
  ctx.font = '800 56px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('PAUSED', size.width / 2, size.height * 0.44);
  ctx.fillStyle = 'rgba(232,237,245,0.8)';
  ctx.font = '600 19px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('ESC to return      P to save the run', size.width / 2, size.height * 0.44 + 44);
  ctx.textAlign = 'left';
  ctx.restore();
}
