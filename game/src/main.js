// The game's entry point and loop. It sizes the canvas to the window, wires the keyboard and mouse,
// runs the fixed-step simulation, draws a frame, and offers the screenshot scenes behind ?shot=,
// which play the real rules forward and then set window.__shotReady for the capture tool.

import { STEP } from './config.js';
import { createWorld, updateWorld, saveGame, loadGame, applySave, clearSave, PHASE_PLAY, PHASE_DEAD, PHASE_ARREST } from './world.js';
import { drawWorld, drawTitleScreen, drawPauseScreen, viewSize } from './render.js';
import { buildScene } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 20261123;

/** Resizes the canvas to a device-pixel backbuffer at the window's size. */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
window.addEventListener('resize', resize);
resize();

/** Builds a world and installs the stepper the shots module needs. */
function makeWorld() {
  const world = createWorld(seed);
  world.viewWidth = canvas.width;
  world.viewHeight = canvas.height;
  world.step = (dt) => updateWorld(world, dt);
  world.viewW = viewSize(canvas.width, canvas.height).w;
  world.viewH = viewSize(canvas.width, canvas.height).h;
  return world;
}

// ---- The screenshot scenes: build, play forward, draw one frame, then say it is ready.
if (shot) {
  const world = makeWorld();
  const scene = shot === 'menu' ? (() => {
    // The title card over a live city: the same frame the player sees on the start screen.
    const base = buildScene('title', seed, canvas.width, canvas.height, makeWorld);
    return base;
  })() : buildScene(shot, seed, canvas.width, canvas.height, makeWorld);
  world.viewW = viewSize(canvas.width, canvas.height).w;
  world.viewH = viewSize(canvas.width, canvas.height).h;
  scene.viewW = world.viewW;
  scene.viewH = world.viewH;
  drawWorld(ctx, scene, canvas);
  if (shot === 'menu') drawTitleScreen(ctx, scene, canvas, false);
  window.__shotWorld = scene;
  window.__shotReady = true;
} else {
  // ---- The live game.
  const world = makeWorld();
  const status = document.getElementById('status');
  let mode = 'title';
  let paused = false;
  const save = loadGame();

  const keyAlias = {
    ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd',
    W: 'w', A: 'a', S: 's', D: 'd', F: 'f', Shift: 'shift', R: 'r', P: 'p', N: 'n', Escape: 'escape',
  };

  window.addEventListener('keydown', (event) => {
    const key = keyAlias[event.key] ?? event.key.toLowerCase();
    if (mode === 'title') {
      if (event.key === 'Enter') {
        if (save) applySave(world, save);
        mode = 'play';
        announce();
      } else if (key === 'n') {
        clearSave();
        mode = 'play';
      }
      event.preventDefault();
      return;
    }
    if (key === 'escape') {
      paused = !paused;
      world.keys.clear();
      return;
    }
    if (key === 'p') {
      saveGame(world);
      world.message = { text: 'Saved', sub: 'The city will remember where you left off.', timer: 3 };
      return;
    }
    if (key === 'r' && (world.phase === PHASE_DEAD || world.phase === PHASE_ARREST)) {
      clearSave();
      location.reload();
      return;
    }
    world.keys.add(key);
    if (['w', 'a', 's', 'd', 'shift', 'f'].includes(key)) event.preventDefault();
    announce();
  });
  window.addEventListener('keyup', (event) => {
    const key = keyAlias[event.key] ?? event.key.toLowerCase();
    world.keys.delete(key);
  });
  window.addEventListener('blur', () => world.keys.clear());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    world.mouse.x = (event.clientX - rect.left) * dpr;
    world.mouse.y = (event.clientY - rect.top) * dpr;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (mode === 'title') { mode = 'play'; return; }
    if (event.button === 0) world.mouse.down = true;
    announce();
  });
  window.addEventListener('mouseup', () => { world.mouse.down = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  // Saving on the way out is what makes the run survive a reload.
  window.addEventListener('pagehide', () => { if (mode === 'play') saveGame(world); });

  let lastAnnounce = '';
  function announce() {
    const p = world.player;
    const text = `Money $${p.money}. Health ${Math.ceil(p.health)}. Wanted ${p.wanted} of 5. ${p.inCar ? 'In a car.' : 'On foot.'}`;
    if (text !== lastAnnounce) { status.textContent = text; lastAnnounce = text; }
  }

  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    const elapsed = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (mode === 'play' && !paused) {
      accumulator += elapsed;
      while (accumulator >= STEP) {
        updateWorld(world, STEP);
        accumulator -= STEP;
      }
      // The city keeps a slow clock while the title card is up, so its pulse animates.
    } else {
      world.time += elapsed;
    }
    drawWorld(ctx, world, canvas);
    if (mode === 'title') drawTitleScreen(ctx, world, canvas, Boolean(save));
    else if (paused) drawPauseScreen(ctx, world, canvas);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
