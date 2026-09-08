import type { Biome, EntityKind, TimeOfDay, Weather, WorldEntity, WorldModel } from "./types";

const paletteByBiome: Record<
  Biome,
  { sky: string; ground: string; accent: string; weather: Weather; time: TimeOfDay }
> = {
  alpine: { sky: "#8bb8c9", ground: "#536f60", accent: "#d6e3df", weather: "snow", time: "dawn" },
  desert: { sky: "#d59b6b", ground: "#a36f46", accent: "#d6b06f", weather: "clear", time: "dusk" },
  forest: { sky: "#7fa58b", ground: "#365a40", accent: "#d1bc67", weather: "mist", time: "day" },
  oceanic: { sky: "#79b4dc", ground: "#3d7178", accent: "#b9d8c8", weather: "clear", time: "day" },
  orbital: { sky: "#101626", ground: "#596270", accent: "#86d7e3", weather: "aurora", time: "night" },
  volcanic: { sky: "#321d1a", ground: "#4c352e", accent: "#d96f45", weather: "ember", time: "night" },
  neon: { sky: "#151126", ground: "#293241", accent: "#d855ef", weather: "aurora", time: "night" },
  urban: { sky: "#8fa4b0", ground: "#343839", accent: "#d0d6cf", weather: "mist", time: "dusk" }
};

const kindDefaults: Record<EntityKind, { height: number; radius: number; glow: number }> = {
  tower: { height: 13, radius: 2.2, glow: 0.15 },
  habitat: { height: 5, radius: 4, glow: 0.08 },
  tree: { height: 7, radius: 1.4, glow: 0 },
  monolith: { height: 17, radius: 1.8, glow: 0.18 },
  portal: { height: 8, radius: 3, glow: 0.7 },
  beacon: { height: 11, radius: 1.1, glow: 0.65 },
  ridge: { height: 8, radius: 5, glow: 0 },
  platform: { height: 2, radius: 5, glow: 0.1 },
  water: { height: 0.5, radius: 10, glow: 0.12 },
  crystal: { height: 6, radius: 1.2, glow: 0.55 },
  tendril: { height: 8, radius: 3.8, glow: 0.2 },
  castle: { height: 10, radius: 7, glow: 0.12 },
  cathedral: { height: 14, radius: 7, glow: 0.28 },
  mosque: { height: 10, radius: 7, glow: 0.18 },
  tent: { height: 6, radius: 6, glow: 0.08 },
  stoneCircle: { height: 4, radius: 8, glow: 0.22 },
  zombie: { height: 2.05, radius: 0.42, glow: 0 },
  npc: { height: 1.82, radius: 0.34, glow: 0 }
};

export const worldPresets: WorldModel[] = [
  createWorld({
    id: "dead-manhattan",
    name: "Dead Manhattan",
    biome: "urban",
    seed: 908,
    terrainScale: 0.04,
    terrainHeight: 1,
    waterLevel: -10,
    density: 0.92,
    landscapeStyle: "zombie-city",
    matterMode: "smooth",
    fractalDepth: 5,
    minimumBlockSize: 0.75,
    maximumBlockSize: 6,
    refractionLevel: 0.24,
    timeOfDay: "dusk",
    weather: "mist",
    skyColor: "#8fa4b0",
    groundColor: "#343839",
    accentColor: "#d0d6cf",
    entities: [
      ["zombie", "Broadway Walker", -7, -18],
      ["zombie", "Subway Dead", 7, -24],
      ["zombie", "Crosswalk Dead", -18, -2],
      ["zombie", "Taxi Lane Walker", 16, -8],
      ["zombie", "Glass Tower Dead", 22, 14],
      ["zombie", "Alley Walker", -23, 17],
      ["zombie", "Median Walker", 4, 18],
      ["zombie", "North Block Dead", -9, 28],
      ["zombie", "Corner Dead", 25, -28],
      ["zombie", "Park Edge Walker", -27, -26],
      ["zombie", "Underpass Dead", 0, -34],
      ["zombie", "Newsstand Walker", 30, 4],
      ["zombie", "Avenue Dead", -34, 6],
      ["zombie", "Bus Stop Walker", 34, -17],
      ["zombie", "Financial District Dead", -16, 38],
      ["zombie", "Rooftop Shadow", 38, 31],
      ["zombie", "Tunnel Mouth Dead", -38, -14],
      ["zombie", "Broadway North Walker", 12, 40],
      ["npc", "Lost Commuter", -4, 10],
      ["npc", "Office Survivor", 9, 8],
      ["npc", "Courier", -13, 21],
      ["npc", "Medic", 18, 25],
      ["npc", "Transit Worker", -24, -9],
      ["npc", "Security Guard", 28, -32]
    ]
  }),
  createWorld({
    id: "dolomite-floodlands",
    name: "Dolomite Floodlands",
    biome: "alpine",
    seed: 512,
    terrainScale: 0.078,
    terrainHeight: 20,
    waterLevel: 3.6,
    density: 0.88,
    landscapeStyle: "dolomite-spires",
    matterMode: "smooth",
    fractalDepth: 8,
    minimumBlockSize: 0.75,
    maximumBlockSize: 4,
    refractionLevel: 0.86,
    timeOfDay: "dusk",
    weather: "mist",
    skyColor: "#7aa7c1",
    groundColor: "#6f746c",
    accentColor: "#ffd18f",
    entities: [
      ["water", "Flooded Mirror Basin", 0, 0],
      ["stoneCircle", "Submerged Shore Markers", 28, 30]
    ]
  }),
  createWorld({
    id: "tetrahedral-horizon",
    name: "Tetrahedral Horizon",
    biome: "oceanic",
    seed: 63,
    terrainScale: 0.075,
    terrainHeight: 6,
    waterLevel: 0.4,
    density: 0.72,
    matterMode: "tetra-lattice",
    entities: [
      ["portal", "Triangle Gate", -10, -12],
      ["tower", "Prism Spire", 13, -9],
      ["crystal", "Facet Bloom", 17, 14],
      ["platform", "Tessellated Dock", -4, 13],
      ["beacon", "Vertex Beacon", -18, 16],
      ["stoneCircle", "Triangular Stone Ring", 5, -20]
    ]
  }),
  createWorld({
    id: "frost-tetrahedral-cairns",
    name: "Frost Tetrahedral Cairns",
    biome: "alpine",
    seed: 129,
    terrainScale: 0.092,
    terrainHeight: 12,
    waterLevel: -3.6,
    density: 0.58,
    matterMode: "tetra-lattice",
    entities: [
      ["cathedral", "Facet Abbey", -8, -17],
      ["tower", "Snow Prism", 14, -10],
      ["tree", "Triangular Pine", 17, 8],
      ["ridge", "Shard Ridge", -18, 6],
      ["beacon", "Ice Vertex", -20, 18],
      ["stoneCircle", "Tetra Cairn Ring", 4, 19]
    ]
  }),
  createWorld({
    id: "metaball-nebula-basin",
    name: "Metaball Nebula Basin",
    biome: "orbital",
    seed: 214,
    terrainScale: 0.07,
    terrainHeight: 7,
    waterLevel: -1.2,
    density: 0.66,
    matterMode: "metaballs",
    entities: [
      ["portal", "Liquid Gate", -11, -13],
      ["habitat", "Merged Habitat", 9, -11],
      ["crystal", "Field Bloom", 17, 13],
      ["tower", "Iso Spire", -18, 9],
      ["water", "Mirror Pool", 1, 14],
      ["stoneCircle", "Orbital Field Ring", 0, -22]
    ]
  }),
  createWorld({
    id: "swaying-tendril-grove",
    name: "Swaying Tendril Grove",
    biome: "forest",
    seed: 173,
    terrainScale: 0.085,
    terrainHeight: 8,
    waterLevel: 0.2,
    density: 0.76,
    matterMode: "metaballs",
    entities: [
      ["tendril", "Near Tendril Bloom", -5, 10],
      ["tendril", "Left Reactive Tendrils", -15, 2],
      ["tendril", "Right Reactive Tendrils", 12, -6],
      ["tree", "Anchor Tree", 17, 9],
      ["water", "Still Pool", 2, 17],
      ["stoneCircle", "Root Circle", -4, -18],
      ["portal", "Canopy Gate", 13, -17]
    ]
  }),
  createWorld({
    id: "neon-archipelago",
    name: "Neon Archipelago",
    biome: "neon",
    seed: 41,
    terrainScale: 0.11,
    terrainHeight: 7,
    waterLevel: 1.2,
    density: 0.62,
    entities: [
      ["portal", "Harbor Gate", -9, -14],
      ["tower", "Signal Spire", 12, -8],
      ["platform", "Dock Platform", 0, 9],
      ["beacon", "North Beacon", -18, 17],
      ["crystal", "Tide Crystal", 17, 16],
      ["cathedral", "Lumen Cathedral", -16, 8]
    ]
  }),
  createWorld({
    id: "alpine-citadel",
    name: "Alpine Citadel",
    biome: "alpine",
    seed: 12,
    terrainScale: 0.08,
    terrainHeight: 13,
    waterLevel: -4,
    density: 0.5,
    entities: [
      ["tower", "Citadel Keep", 0, -20],
      ["ridge", "Western Ridge", -18, 6],
      ["tree", "Pine Stand", 11, 9],
      ["beacon", "Summit Beacon", 22, -9],
      ["habitat", "Base Camp", -8, 18],
      ["castle", "Snowkeep Castle", -2, -18]
    ]
  }),
  createWorld({
    id: "mars-observatory",
    name: "Mars Observatory",
    biome: "desert",
    seed: 77,
    terrainScale: 0.065,
    terrainHeight: 6,
    waterLevel: -10,
    density: 0.34,
    entities: [
      ["habitat", "Crew Habitat", -7, -8],
      ["tower", "Array Mast", 12, -14],
      ["monolith", "Survey Marker", 19, 10],
      ["platform", "Landing Pad", -17, 16],
      ["beacon", "Dust Beacon", 1, 21],
      ["tent", "Survey Tent", -14, -3]
    ]
  }),
  createWorld({
    id: "ember-caldera",
    name: "Ember Caldera",
    biome: "volcanic",
    seed: 98,
    terrainScale: 0.1,
    terrainHeight: 10,
    waterLevel: -7,
    density: 0.42,
    entities: [
      ["monolith", "Basalt Needle", -5, -15],
      ["crystal", "Magma Crystal", 14, 6],
      ["ridge", "Caldera Wall", -19, 8],
      ["portal", "Foundry Gate", 17, -17],
      ["beacon", "Ash Beacon", -13, 19],
      ["stoneCircle", "Basalt Stone Circle", 3, 17]
    ]
  })
];

export function cloneWorld(world: WorldModel): WorldModel {
  return {
    ...world,
    entities: world.entities.map((entity) => ({ ...entity })),
    history: [...world.history]
  };
}

export function createWorld(config: {
  id: string;
  name: string;
  biome: Biome;
  seed: number;
  terrainScale: number;
  terrainHeight: number;
  waterLevel: number;
  density: number;
  landscapeStyle?: WorldModel["landscapeStyle"];
  matterMode?: WorldModel["matterMode"];
  fractalDepth?: number;
  minimumBlockSize?: number;
  maximumBlockSize?: number;
  renderQuality?: WorldModel["renderQuality"];
  refractionLevel?: number;
  timeOfDay?: TimeOfDay;
  weather?: Weather;
  skyColor?: string;
  groundColor?: string;
  accentColor?: string;
  entities: Array<[EntityKind, string, number, number]>;
}): WorldModel {
  const palette = paletteByBiome[config.biome];
  return {
    id: config.id,
    name: config.name,
    biome: config.biome,
    landscapeStyle: config.landscapeStyle ?? "default",
    matterMode: config.matterMode ?? "fractal-blocks",
    fractalDepth: config.fractalDepth ?? 5,
    minimumBlockSize: config.minimumBlockSize ?? 0.75,
    maximumBlockSize: config.maximumBlockSize ?? 6,
    renderQuality: config.renderQuality ?? "cinematic",
    refractionLevel: config.refractionLevel ?? 0.34,
    timeOfDay: config.timeOfDay ?? palette.time,
    weather: config.weather ?? palette.weather,
    terrainSeed: config.seed,
    terrainScale: config.terrainScale,
    terrainHeight: config.terrainHeight,
    waterLevel: config.waterLevel,
    density: config.density,
    skyColor: config.skyColor ?? palette.sky,
    groundColor: config.groundColor ?? palette.ground,
    accentColor: config.accentColor ?? palette.accent,
    entities: config.entities.map(([kind, label, x, z], index) =>
      createEntity(kind, label, x, z, entityColorFor(config.biome, kind, palette.accent), `${config.id}-${index}`)
    ),
    history: [`Loaded preset ${config.name}`]
  };
}

export function createEntity(
  kind: EntityKind,
  label: string,
  x: number,
  z: number,
  color: string,
  id = `${kind}-${Math.round(x * 10)}-${Math.round(z * 10)}-${Date.now()}`
): WorldEntity {
  const defaults = kindDefaults[kind];
  return {
    id,
    kind,
    label,
    x,
    z,
    height: defaults.height,
    radius: defaults.radius,
    color,
    glow: defaults.glow
  };
}

export function biomePalette(biome: Biome) {
  return paletteByBiome[biome];
}

function entityColorFor(biome: Biome, kind: EntityKind, fallback: string) {
  const glowKinds = new Set<EntityKind>(["portal", "beacon", "crystal", "tendril"]);
  if (glowKinds.has(kind)) {
    return fallback;
  }

  const colors: Record<Biome, string> = {
    alpine: "#9ca8a2",
    desert: "#b89468",
    forest: "#647866",
    oceanic: "#718b83",
    orbital: "#728091",
    volcanic: "#6d5b50",
    neon: "#6b5e8f",
    urban: kind === "zombie" ? "#050607" : kind === "npc" ? "#8b8274" : "#63696b"
  };

  return colors[biome];
}
