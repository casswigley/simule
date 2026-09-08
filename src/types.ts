export type Biome = "alpine" | "desert" | "forest" | "oceanic" | "orbital" | "volcanic" | "neon" | "urban";

export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

export type Weather = "clear" | "mist" | "storm" | "snow" | "ember" | "aurora";

export type EntityKind =
  | "tower"
  | "habitat"
  | "tree"
  | "monolith"
  | "portal"
  | "beacon"
  | "ridge"
  | "platform"
  | "water"
  | "crystal"
  | "tendril"
  | "castle"
  | "cathedral"
  | "mosque"
  | "tent"
  | "stoneCircle"
  | "zombie"
  | "npc";

export interface WorldEntity {
  id: string;
  kind: EntityKind;
  label: string;
  x: number;
  z: number;
  height: number;
  radius: number;
  color: string;
  glow: number;
}

export interface WorldModel {
  id: string;
  name: string;
  biome: Biome;
  landscapeStyle: "default" | "dolomite-spires" | "zombie-city";
  matterMode: "fractal-blocks" | "tetra-lattice" | "metaballs" | "smooth";
  fractalDepth: number;
  minimumBlockSize: number;
  maximumBlockSize: number;
  renderQuality: "balanced" | "cinematic";
  refractionLevel: number;
  timeOfDay: TimeOfDay;
  weather: Weather;
  terrainSeed: number;
  terrainScale: number;
  terrainHeight: number;
  waterLevel: number;
  density: number;
  skyColor: string;
  groundColor: string;
  accentColor: string;
  entities: WorldEntity[];
  history: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "builder";
  content: string;
}

export interface BuilderResult {
  world: WorldModel;
  message: string;
  operations: string[];
}
