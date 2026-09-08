import type { Biome, BuilderResult, EntityKind, TimeOfDay, Weather, WorldModel } from "./types";
import { biomePalette, cloneWorld, createEntity } from "./worlds";

const biomeWords: Biome[] = ["alpine", "desert", "forest", "oceanic", "orbital", "volcanic", "neon", "urban"];
const timeWords: TimeOfDay[] = ["dawn", "day", "dusk", "night"];
const weatherWords: Weather[] = ["clear", "mist", "storm", "snow", "ember", "aurora"];
const entityWords: EntityKind[] = [
  "tower",
  "habitat",
  "tree",
  "monolith",
  "portal",
  "beacon",
  "ridge",
  "platform",
  "water",
  "crystal",
  "tendril",
  "castle",
  "cathedral",
  "mosque",
  "tent",
  "stoneCircle",
  "zombie",
  "npc"
];

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  dozen: 12
};

export function runBuilderCommand(input: string, current: WorldModel): BuilderResult {
  const command = input.trim();
  const lower = command.toLowerCase();
  const world = cloneWorld(current);
  const operations: string[] = [];
  const shouldRegenerate = lower.includes("new world") || lower.includes("rebuild") || lower.includes("regenerate");
  let configuredZombieCity = false;

  if (!command) {
    return {
      world,
      operations,
      message: "Give me a world-building command and I will reconstruct the active scene."
    };
  }

  const newBiome = biomeWords.find((biome) => lower.includes(biome));
  if (newBiome) {
    const palette = biomePalette(newBiome);
    world.biome = newBiome;
    world.skyColor = palette.sky;
    world.groundColor = palette.ground;
    world.accentColor = palette.accent;
    world.weather = lower.includes("weather") ? world.weather : palette.weather;
    world.timeOfDay = lower.includes("time") ? world.timeOfDay : palette.time;
    operations.push(`Retuned biome to ${newBiome}`);
  }

  const newTime = timeWords.find((time) => lower.includes(time));
  if (newTime) {
    world.timeOfDay = newTime;
    operations.push(`Set time of day to ${newTime}`);
  }

  const newWeather = weatherWords.find((weather) => lower.includes(weather));
  if (newWeather) {
    world.weather = newWeather;
    operations.push(`Set weather to ${newWeather}`);
  }

  if (lower.includes("mountain") || lower.includes("rugged") || lower.includes("raise terrain")) {
    world.terrainHeight = clamp(world.terrainHeight + 3, 2, 18);
    world.terrainScale = clamp(world.terrainScale + 0.012, 0.04, 0.18);
    operations.push("Raised and sharpened terrain");
  }

  if (
    lower.includes("zombie") ||
    lower.includes("new york") ||
    lower.includes("manhattan") ||
    lower.includes("modern city") ||
    lower.includes("city") ||
    lower.includes("gun") ||
    lower.includes("shoot")
  ) {
    world.name = "Dead Manhattan";
    world.biome = "urban";
    world.landscapeStyle = "zombie-city";
    world.matterMode = "smooth";
    world.terrainHeight = 1;
    world.terrainScale = 0.04;
    world.waterLevel = -10;
    world.density = 0.92;
    world.fractalDepth = 5;
    world.refractionLevel = 0.24;
    world.renderQuality = "cinematic";
    world.timeOfDay = "dusk";
    world.weather = "mist";
    world.skyColor = "#8fa4b0";
    world.groundColor = "#343839";
    world.accentColor = "#d0d6cf";
    world.entities = [...seedZombieCityEntities(world), ...seedCityNpcEntities(world)];
    configuredZombieCity = true;
    operations.push("Rebuilt as a modern city with robotic centaurs and NPC walkers");
  }

  if (
    lower.includes("dolomite") ||
    lower.includes("limestone") ||
    lower.includes("stalagmite") ||
    lower.includes("stalactite") ||
    lower.includes("spire landscape") ||
    lower.includes("needle mountain")
  ) {
    const palette = biomePalette("alpine");
    world.biome = "alpine";
    world.landscapeStyle = "dolomite-spires";
    world.matterMode = "smooth";
    world.terrainHeight = Math.max(world.terrainHeight, 20);
    world.terrainScale = 0.078;
    world.density = clamp(world.density + 0.24, 0.1, 1);
    world.fractalDepth = 8;
    world.minimumBlockSize = 0.75;
    world.maximumBlockSize = 4;
    world.waterLevel = Math.max(world.waterLevel, 3.4);
    world.refractionLevel = Math.max(world.refractionLevel, 0.82);
    world.renderQuality = "cinematic";
    world.timeOfDay = "dusk";
    world.weather = "mist";
    world.skyColor = "#7aa7c1";
    world.groundColor = palette.ground;
    world.accentColor = "#ffd18f";
    operations.push("Built flooded Dolomite spire geography");
  }

  if (lower.includes("flat") || lower.includes("smooth")) {
    world.terrainHeight = clamp(world.terrainHeight - 3, 1, 18);
    world.terrainScale = clamp(world.terrainScale - 0.012, 0.035, 0.18);
    operations.push("Smoothed terrain profile");
  }

  if (lower.includes("dense") || lower.includes("crowded") || lower.includes("more detail")) {
    world.density = clamp(world.density + 0.18, 0.1, 1);
    world.fractalDepth = clamp(world.fractalDepth + 1, 2, 8);
    world.minimumBlockSize = clamp(world.minimumBlockSize * 0.72, 0.75, 6);
    world.maximumBlockSize = clamp(world.maximumBlockSize * 0.82, 3, 14);
    operations.push("Increased procedural density");
  }

  if (lower.includes("sparse") || lower.includes("quiet") || lower.includes("minimal")) {
    world.density = clamp(world.density - 0.18, 0.1, 1);
    world.fractalDepth = clamp(world.fractalDepth - 1, 2, 8);
    world.minimumBlockSize = clamp(world.minimumBlockSize * 1.28, 0.75, 6);
    world.maximumBlockSize = clamp(world.maximumBlockSize * 1.18, 3, 14);
    operations.push("Reduced procedural density");
  }

  if (lower.includes("fractal") || lower.includes("self similar") || lower.includes("self-similar") || lower.includes("blocks")) {
    world.matterMode = "fractal-blocks";
    world.fractalDepth = clamp(world.fractalDepth + 1, 2, 8);
    world.minimumBlockSize = clamp(world.minimumBlockSize * 0.82, 0.75, 6);
    world.maximumBlockSize = clamp(world.maximumBlockSize * 0.9, 3, 14);
    operations.push("Enabled adaptive fractal blocks");
  }

  if (
    lower.includes("tetra") ||
    lower.includes("tetrahedron") ||
    lower.includes("triangular lattice") ||
    lower.includes("triangle lattice") ||
    lower.includes("interlocked triangle")
  ) {
    world.matterMode = "tetra-lattice";
    world.fractalDepth = clamp(world.fractalDepth + 1, 3, 8);
    world.minimumBlockSize = clamp(world.minimumBlockSize * 0.82, 0.75, 4);
    world.maximumBlockSize = clamp(world.maximumBlockSize * 0.86, 3, 12);
    operations.push("Enabled tetrahedral triangle lattice");
  }

  if (lower.includes("metaball") || lower.includes("metaballs") || lower.includes("blob") || lower.includes("isosurface")) {
    world.matterMode = "metaballs";
    world.fractalDepth = clamp(world.fractalDepth + 1, 3, 8);
    world.minimumBlockSize = clamp(world.minimumBlockSize * 0.76, 0.75, 4);
    world.maximumBlockSize = clamp(world.maximumBlockSize * 0.86, 3, 12);
    operations.push("Enabled blended metaball isosurface matter");
  }

  if (lower.includes("cinematic") || lower.includes("ray tracing") || lower.includes("lens flare") || lower.includes("bloom") || lower.includes("glistening")) {
    world.renderQuality = "cinematic";
    operations.push("Enabled cinematic light transport");
  }

  if (lower.includes("balanced render") || lower.includes("performance mode")) {
    world.renderQuality = "balanced";
    operations.push("Switched to balanced rendering");
  }

  if (lower.includes("refraction") || lower.includes("refractive") || lower.includes("glassier") || lower.includes("clearer water") || lower.includes("mist") || lower.includes("atmosphere") || lower.includes("haze")) {
    if (lower.includes("less") || lower.includes("lower") || lower.includes("reduce") || lower.includes("subtle")) {
      world.refractionLevel = clamp(world.refractionLevel - 0.18, 0, 1);
      operations.push("Reduced atmosphere blend");
    } else if (lower.includes("no refraction") || lower.includes("disable refraction") || lower.includes("no mist") || lower.includes("clear mist")) {
      world.refractionLevel = 0;
      operations.push("Cleared atmosphere blend");
    } else {
      world.refractionLevel = clamp(world.refractionLevel + 0.18, 0, 1);
      operations.push("Increased atmosphere blend");
    }
  }

  if (lower.includes("smooth terrain") || lower.includes("smooth world")) {
    world.matterMode = "smooth";
    operations.push("Switched to smooth terrain preview");
  }

  if (lower.includes("sunset")) {
    world.timeOfDay = "dusk";
    operations.push("Set time of day to dusk");
  }

  const handlesWater = lower.includes("water") || lower.includes("ocean") || lower.includes("lake") || lower.includes("river") || lower.includes("flood") || lower.includes("flooded");
  if (handlesWater) {
    const lift = lower.includes("flood") || lower.includes("flooded") ? 2.6 : 1.8;
    world.waterLevel = clamp(world.waterLevel + lift, -10, 6);
    operations.push("Raised water level");
  }

  if (handlesWater && (lower.includes("lower") || lower.includes("drain") || lower.includes("less water"))) {
    world.waterLevel = clamp(world.waterLevel - 3.2, -10, 6);
    operations.push("Lowered water level");
  }

  if (lower.includes("clear entities") || lower.includes("empty world") || lower.includes("remove structures")) {
    world.entities = [];
    operations.push("Cleared all constructed entities");
  }

  if (shouldRegenerate && !configuredZombieCity) {
    world.terrainSeed = (world.terrainSeed * 9301 + 49297) % 233280;
    world.entities = seedEntities(world);
    operations.push("Regenerated world topology");
  }

  if (handlesWater && !configuredZombieCity && !world.entities.some((entity) => entity.kind === "water")) {
    world.entities.push(createEntity("water", "Reflecting Basin", 0, 0, world.accentColor));
    operations.push("Added reflective water feature");
  }

  for (const kind of entityWords) {
    if (configuredZombieCity || shouldRegenerate || (kind === "water" && handlesWater)) {
      continue;
    }
    if (mentionsKind(lower, kind)) {
      const count = getRequestedCount(lower, kind);
      for (let index = 0; index < count; index += 1) {
        const angle = ((world.entities.length + index) * 2.399 + world.terrainSeed) % (Math.PI * 2);
        const distance = 10 + ((world.entities.length + index * 7) % 18);
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        const label = titleCase(`${world.biome} ${kind}`);
        world.entities.push(createEntity(kind, label, x, z, world.accentColor));
      }
      operations.push(`Added ${count} ${kind}${count === 1 ? "" : "s"}`);
    }
  }

  if (operations.length === 0) {
    operations.push("Interpreted command as exploratory brief");
    world.history.unshift(`Builder note: ${command}`);
  } else {
    world.history.unshift(...operations);
  }

  world.history = world.history.slice(0, 8);

  return {
    world,
    operations,
    message: summarize(operations, world)
  };
}

function seedEntities(world: WorldModel) {
  const landmark: EntityKind = world.biome === "alpine" ? "castle" : world.biome === "desert" ? "tent" : world.biome === "volcanic" ? "stoneCircle" : "cathedral";
  const base: EntityKind[] = world.biome === "forest" ? ["tree", "tree", "beacon", landmark] : ["tower", "beacon", "portal", "crystal", landmark];
  return base.map((kind, index) => {
    const angle = index * 1.8 + world.terrainSeed * 0.01;
    const distance = 11 + index * 5;
    return createEntity(kind, titleCase(`${world.biome} ${kind}`), Math.cos(angle) * distance, Math.sin(angle) * distance, world.accentColor);
  });
}

function seedZombieCityEntities(world: WorldModel) {
  const placements: Array<[number, number]> = [
    [-7, -18],
    [7, -24],
    [-18, -2],
    [16, -8],
    [22, 14],
    [-23, 17],
    [4, 18],
    [-9, 28],
    [25, -28],
    [-27, -26],
    [0, -34],
    [30, 4],
    [-34, 6],
    [34, -17],
    [-16, 38],
    [38, 31],
    [-38, -14],
    [12, 40]
  ];
  return placements.map(([x, z], index) =>
    createEntity("zombie", titleCase(`robotic centaur ${index + 1}`), x, z, "#050607", `${world.id}-zombie-${index}`)
  );
}

function seedCityNpcEntities(world: WorldModel) {
  const placements: Array<[number, number]> = [
    [-4, 10],
    [9, 8],
    [-13, 21],
    [18, 25],
    [-24, -9],
    [28, -32]
  ];
  return placements.map(([x, z], index) =>
    createEntity("npc", titleCase(`city npc ${index + 1}`), x, z, "#8b8274", `${world.id}-npc-${index}`)
  );
}

function mentionsKind(input: string, kind: EntityKind) {
  if (kind === "tree") {
    return input.includes("tree") || input.includes("forest") || input.includes("grove");
  }
  if (kind === "water") {
    return input.includes("basin") || input.includes("lake") || input.includes("river");
  }
  if (kind === "stoneCircle") {
    return input.includes("stone circle") || input.includes("stone-circle") || input.includes("circle");
  }
  if (kind === "tendril") {
    return input.includes("tendril") || input.includes("tendral") || input.includes("vine") || input.includes("tentacle");
  }
  if (kind === "npc") {
    return input.includes("npc") || input.includes("npcs") || input.includes("non-player character") || input.includes("non player character");
  }
  return input.includes(kind) || input.includes(`${kind}s`);
}

function getRequestedCount(input: string, kind: EntityKind) {
  const aliases = kind === "stoneCircle"
    ? ["stone circles", "stone circle", "stone-circles", "stone-circle", "circles", "circle"]
    : kind === "tendril"
      ? ["tendrils", "tendril", "tendrals", "tendral", "vines", "vine", "tentacles", "tentacle"]
      : kind === "npc"
        ? ["npcs", "npc", "non-player characters", "non-player character", "non player characters", "non player character"]
      : [`${kind}s`, kind];
  const aliasPattern = aliases.map(escapeRegExp).join("|");
  const optionalDescriptors = "(?:[a-z-]+\\s+){0,3}";
  const digitMatch = input.match(new RegExp(`\\b(\\d+)\\s+${optionalDescriptors}(?:${aliasPattern})\\b`));
  if (digitMatch) {
    return clamp(Number(digitMatch[1]), 1, 24);
  }
  for (const [word, value] of Object.entries(numberWords)) {
    const wordMatch = input.match(new RegExp(`\\b${escapeRegExp(word)}\\s+${optionalDescriptors}(?:${aliasPattern})\\b`));
    if (wordMatch) {
      return value;
    }
  }
  if (kind === "tree" && (input.includes("forest") || input.includes("grove"))) {
    return 12;
  }
  return 1;
}

function summarize(operations: string[], world: WorldModel) {
  if (operations.length === 0) {
    return "I need a concrete world operation: add a portal, make it volcanic, raise mountains, set night, or regenerate.";
  }
  return `${operations.join(". ")}. Active reconstruction: ${world.name}, ${world.biome}, ${world.timeOfDay}, ${world.weather}.`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
