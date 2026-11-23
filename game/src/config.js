// Every tuning number and colour in one place, so the city's rules can be read from here alone.
// The world is measured in pixels; one pixel is roughly four centimetres of street.

/** The city grid: roads and blocks repeat every CELL pixels, and the map is GRID cells square. */
export const CITY = {
  cell: 400,
  road: 96,
  grid: 11,
  seed: 20261123,
  sidewalk: 30,
};

export const WORLD = {
  width: CITY.cell * CITY.grid,
  height: CITY.cell * CITY.grid,
};

/** The simulation's fixed step in seconds: the world advances 60 times a second whatever the display does. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 11,
  walkSpeed: 205,
  runSpeed: 320,
  maxHealth: 100,
  /** Seconds of immunity after a hit, so a burst of bullets cannot stack on one frame. */
  hitCooldown: 0.6,
  startMoney: 120,
};

export const CAR = {
  length: 48,
  width: 25,
  maxSpeed: 455,
  reverseSpeed: 135,
  accel: 260,
  brake: 540,
  drag: 175,
  steerRate: 2.45,
  /** How fast a sideways slide bleeds off, so the car grips the road instead of drifting forever. */
  grip: 7.0,
  enterRange: 78,
  hitPedRadius: 20,
};

export const TRAFFIC = {
  count: 40,
  speed: 130,
  speedJitter: 50,
  lookAhead: 100,
  turnChance: 0.34,
};

export const PED = {
  count: 110,
  speed: 54,
  speedJitter: 30,
};

export const POLICE = {
  officerSpeed: 190,
  officerShootRange: 340,
  officerCooldown: 1.3,
  officerHealth: 62,
  cruiserSpeed: 330,
  maxOfficers: 10,
  spawnInterval: 1.6,
};

export const WEAPON = {
  pistol: { name: '9mm Pistol', damage: 26, cooldown: 0.18, spread: 0.045, range: 640, speed: 1500, pellets: 1 },
  shotgun: { name: 'Sawn-off', damage: 18, cooldown: 0.66, spread: 0.11, range: 400, speed: 1250, pellets: 7 },
};

/** The wanted ladder: heat buys stars, and stars bring police out. */
export const WANTED = {
  thresholds: [0, 1.0, 2.6, 4.8, 7.6, 11.0],
  coolPerSecond: 0.085,
  decayDelay: 7,
  crimeShot: 0.34,
  crimePed: 1.7,
  crimeOfficer: 2.4,
  crimeCarHit: 1.1,
};

export const COLORS = {
  asphalt: '#1a1d23',
  asphaltAlt: '#202430',
  line: '#cfbd6a',
  crosswalk: 'rgba(226,232,240,0.62)',
  sidewalk: '#4b525e',
  sidewalkEdge: '#2a2f37',
  grass: '#2e4732',
  grassAlt: '#35543a',
  water: '#1f3d55',
  roof: ['#5d6675', '#535c6a', '#6a6f7d', '#4b5563', '#616a78'],
  roofEdge: '#2b3038',
  wallShadow: 'rgba(6,9,15,0.55)',
  player: '#74d8ec',
  playerCoat: '#2f8fa3',
  ped: ['#d9a05b', '#b3763f', '#c9b48c', '#8f6a4a'],
  pedShirt: ['#c4564a', '#4a7cc4', '#c9a13c', '#68a25c', '#9a6bb5'],
  civilianCar: ['#c4564a', '#4a7cc4', '#c9a13c', '#68a25c', '#9a6bb5', '#c9ccd4', '#2f3540'],
  policeCar: '#283a86',
  policeLight: '#e8443a',
  policeLightAlt: '#3a7ae8',
  officer: '#2b3a6b',
  bullet: '#ffe08a',
  policeBullet: '#ff9f7a',
  mission: '#f2c14e',
  health: '#5fbf6b',
  healthLow: '#d0503c',
  hud: '#e8edf5',
  hudDim: '#8b93a3',
  hudPanel: 'rgba(10,14,22,0.72)',
};
