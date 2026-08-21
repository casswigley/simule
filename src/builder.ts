import type { Biome, BuilderResult, EntityKind, TimeOfDay, Weather, WorldModel } from "./types";
import { biomePalette, cloneWorld, createEntity } from "./worlds";

const biomeWords: Biome[] = ["alpine", "desert", "forest", "oceanic", "orbital", "volcanic", "neon"];
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
  "stoneCircle"
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

  if (lower.includes("cinematic") || lower.includes("ray tracing") || lower.includes("lens flare") || lower.includes("bloom")) {
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

  const handlesWater = lower.includes("water") || lower.includes("ocean") || lower.includes("lake") || lower.includes("river");
  if (handlesWater) {
    world.waterLevel = clamp(world.waterLevel + 1.8, -10, 5);
    operations.push("Raised water level");
  }

  if (lower.includes("clear entities") || lower.includes("empty world") || lower.includes("remove structures")) {
    world.entities = [];
    operations.push("Cleared all constructed entities");
  }

  if (shouldRegenerate) {
    world.terrainSeed = (world.terrainSeed * 9301 + 49297) % 233280;
    world.entities = seedEntities(world);
    operations.push("Regenerated world topology");
  }

  if (handlesWater && !world.entities.some((entity) => entity.kind === "water")) {
    world.entities.push(createEntity("water", "Reflecting Basin", 0, 0, world.accentColor));
    operations.push("Added reflective water feature");
  }

  for (const kind of entityWords) {
    if (shouldRegenerate || (kind === "water" && handlesWater)) {
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
  return input.includes(kind) || input.includes(`${kind}s`);
}

function getRequestedCount(input: string, kind: EntityKind) {
  const aliases = kind === "stoneCircle"
    ? ["stone circles", "stone circle", "stone-circles", "stone-circle", "circles", "circle"]
    : kind === "tendril"
      ? ["tendrils", "tendril", "tendrals", "tendral", "vines", "vine", "tentacles", "tentacle"]
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
