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
  neon: { sky: "#151126", ground: "#293241", accent: "#d855ef", weather: "aurora", time: "night" }
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
  stoneCircle: { height: 4, radius: 8, glow: 0.22 }
};

export const worldPresets: WorldModel[] = [
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
  matterMode?: WorldModel["matterMode"];
  entities: Array<[EntityKind, string, number, number]>;
}): WorldModel {
  const palette = paletteByBiome[config.biome];
  return {
    id: config.id,
    name: config.name,
    biome: config.biome,
    matterMode: config.matterMode ?? "fractal-blocks",
    fractalDepth: 5,
    minimumBlockSize: 0.75,
    maximumBlockSize: 6,
    renderQuality: "cinematic",
    refractionLevel: 0.34,
    timeOfDay: palette.time,
    weather: palette.weather,
    terrainSeed: config.seed,
    terrainScale: config.terrainScale,
    terrainHeight: config.terrainHeight,
    waterLevel: config.waterLevel,
    density: config.density,
    skyColor: palette.sky,
    groundColor: palette.ground,
    accentColor: palette.accent,
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
    neon: "#6b5e8f"
  };

  return colors[biome];
}
