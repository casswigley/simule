import type { WorldModel } from "../types";

export interface FractalBlock {
  id: string;
  x: number;
  z: number;
  size: number;
  top: number;
  base: number;
  depth: number;
  variance: number;
  material: "surface" | "stone" | "snow" | "sand" | "lava" | "metal";
}

export interface TetraCell {
  id: string;
  x: number;
  z: number;
  size: number;
  top: number;
  depth: number;
  variance: number;
  orientation: 1 | -1;
  material: FractalBlock["material"];
}

const WORLD_SIZE = 96;
const MAX_BLOCKS = 6800;
const MAX_TETRA_CELLS = 7600;

export function generateFractalBlocks(world: WorldModel): FractalBlock[] {
  const blocks: FractalBlock[] = [];
  const rootSize = world.maximumBlockSize;

  for (let z = -WORLD_SIZE / 2; z < WORLD_SIZE / 2; z += rootSize) {
    for (let x = -WORLD_SIZE / 2; x < WORLD_SIZE / 2; x += rootSize) {
      appendCell(blocks, world, x + rootSize / 2, z + rootSize / 2, rootSize, 0);
    }
  }

  return blocks.slice(0, MAX_BLOCKS);
}

export function generateTetraLattice(world: WorldModel): TetraCell[] {
  const cells: TetraCell[] = [];
  const rootSize = world.maximumBlockSize;
  const triangleHeight = rootSize * Math.sqrt(3) * 0.5;

  for (let z = -WORLD_SIZE / 2 - triangleHeight; z <= WORLD_SIZE / 2 + triangleHeight; z += triangleHeight) {
    for (let x = -WORLD_SIZE / 2 - rootSize; x <= WORLD_SIZE / 2 + rootSize; x += rootSize) {
      appendTetraCell(cells, world, x + rootSize * 0.5, z + triangleHeight / 3, rootSize, 0, 1);
      appendTetraCell(cells, world, x + rootSize, z + (triangleHeight * 2) / 3, rootSize, 0, -1);
    }
  }

  return cells.slice(0, MAX_TETRA_CELLS);
}

export function terrainHeightAt(x: number, z: number, world: WorldModel) {
  const scale = Math.max(world.terrainScale, 0.006);
  const iteration = iterationMix(world);
  const warpX = fractalNoise(x, z, world.terrainSeed + 17.3, 3, scale * 0.48) * 18;
  const warpZ = fractalNoise(x, z, world.terrainSeed + 41.9, 3, scale * 0.48) * 18;
  const warpedX = x + warpX;
  const warpedZ = z + warpZ;
  const broad = fractalNoise(warpedX, warpedZ, world.terrainSeed, 5, scale * 0.72);
  const ridges = ridgedNoise(x - warpZ * 0.48, z + warpX * 0.48, world.terrainSeed + 91.7, 4, scale * 1.32);
  const detailOctaves = Math.min(6, Math.max(3, world.fractalDepth - 1));
  const detail = fractalNoise(x + warpX * 0.24, z + warpZ * 0.24, world.terrainSeed + 205.1, detailOctaves, scale * 2.65);
  const shoreWarp =
    fractalNoise(x, z, world.terrainSeed + 301.4, detailOctaves, scale * 1.9) * 4.6 * iteration +
    ridgedNoise(x, z, world.terrainSeed + 337.2, 3, scale * 3.4) * 1.8 * iteration;
  const shoreRadius = 45 + shoreWarp;
  const islandFalloff = smoothstep(shoreRadius - 10, shoreRadius + 11, Math.hypot(x, z)) * (world.terrainHeight * 0.62 + 1.8);

  return (broad * 0.72 + (ridges - 0.44) * (0.54 + iteration * 0.18) + detail * (0.16 + iteration * 0.18)) * world.terrainHeight - islandFalloff;
}

function appendCell(blocks: FractalBlock[], world: WorldModel, x: number, z: number, size: number, depth: number) {
  if (blocks.length >= MAX_BLOCKS) {
    return;
  }

  const sample = sampleCell(world, x, z, size);
  const nearEntity = world.entities.some((entity) => Math.hypot(entity.x - x, entity.z - z) < size * 0.65 + entity.radius * 1.8);
  const varianceThreshold = size * (0.5 + depth * 0.24) * (1.25 - world.density * 0.2);
  const shouldSubdivide =
    depth < world.fractalDepth &&
    size > world.minimumBlockSize &&
    (sample.variance > varianceThreshold || (nearEntity && size > world.minimumBlockSize * 1.6));

  if (shouldSubdivide) {
    const childSize = size / 2;
    appendCell(blocks, world, x - childSize / 2, z - childSize / 2, childSize, depth + 1);
    appendCell(blocks, world, x + childSize / 2, z - childSize / 2, childSize, depth + 1);
    appendCell(blocks, world, x - childSize / 2, z + childSize / 2, childSize, depth + 1);
    appendCell(blocks, world, x + childSize / 2, z + childSize / 2, childSize, depth + 1);
    return;
  }

  const top = Math.max(sample.average, world.waterLevel - 0.8);
  blocks.push({
    id: `${depth}:${Math.round(x * 100)}:${Math.round(z * 100)}:${Math.round(size * 100)}`,
    x,
    z,
    size,
    top,
    base: -14,
    depth,
    variance: sample.variance,
    material: materialFor(world, top, sample.variance)
  });
}

function appendTetraCell(
  cells: TetraCell[],
  world: WorldModel,
  x: number,
  z: number,
  size: number,
  depth: number,
  orientation: 1 | -1
) {
  if (cells.length >= MAX_TETRA_CELLS || Math.hypot(x, z) > WORLD_SIZE * 0.74) {
    return;
  }

  const sample = sampleCell(world, x, z, size);
  const nearEntity = world.entities.some((entity) => Math.hypot(entity.x - x, entity.z - z) < size * 0.8 + entity.radius * 1.5);
  const varianceThreshold = size * (0.42 + depth * 0.18) * (1.2 - world.density * 0.22);
  const shouldSubdivide =
    depth < world.fractalDepth &&
    size > world.minimumBlockSize * 1.08 &&
    (sample.variance > varianceThreshold || nearEntity || seededTetra(x, z, world.terrainSeed, depth) > 0.78);

  if (shouldSubdivide) {
    const childSize = size / 2;
    const rowStep = childSize * Math.sqrt(3) * 0.5;
    appendTetraCell(cells, world, x, z - rowStep / 3, childSize, depth + 1, orientation);
    appendTetraCell(cells, world, x - childSize / 2, z + rowStep / 3, childSize, depth + 1, -orientation as 1 | -1);
    appendTetraCell(cells, world, x + childSize / 2, z + rowStep / 3, childSize, depth + 1, -orientation as 1 | -1);
    appendTetraCell(cells, world, x, z + rowStep / 3, childSize, depth + 1, orientation);
    return;
  }

  const top = Math.max(sample.average, world.waterLevel - 0.6);
  cells.push({
    id: `tetra:${depth}:${Math.round(x * 100)}:${Math.round(z * 100)}:${Math.round(size * 100)}:${orientation}`,
    x,
    z,
    size,
    top,
    depth,
    variance: sample.variance,
    orientation,
    material: materialFor(world, top, sample.variance)
  });
}

function sampleCell(world: WorldModel, x: number, z: number, size: number) {
  const half = size / 2;
  const values = [
    terrainHeightAt(x, z, world),
    terrainHeightAt(x - half, z - half, world),
    terrainHeightAt(x + half, z - half, world),
    terrainHeightAt(x - half, z + half, world),
    terrainHeightAt(x + half, z + half, world)
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    variance: max - min
  };
}

function materialFor(world: WorldModel, top: number, variance: number): FractalBlock["material"] {
  if (world.biome === "volcanic" && top < world.waterLevel + 1.5) return "lava";
  if (world.biome === "alpine" && top > world.terrainHeight * 0.45) return "snow";
  if (world.biome === "desert") return variance > 3 ? "stone" : "sand";
  if (world.biome === "orbital" || world.biome === "neon") return "metal";
  return variance > 3.2 ? "stone" : "surface";
}

function fractalNoise(x: number, z: number, seed: number, octaves: number, baseFrequency = 0.035) {
  let total = 0;
  let amplitude = 1;
  let frequency = baseFrequency;
  let normalizer = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, z * frequency, seed + octave * 23.17) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }

  return total / normalizer;
}

function ridgedNoise(x: number, z: number, seed: number, octaves: number, baseFrequency: number) {
  let total = 0;
  let amplitude = 1;
  let frequency = baseFrequency;
  let normalizer = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += (1 - Math.abs(valueNoise(x * frequency, z * frequency, seed + octave * 31.7))) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.52;
    frequency *= 2.08;
  }

  return total / normalizer;
}

function valueNoise(x: number, z: number, seed: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

function hash2(x: number, z: number, seed: number) {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function fade(value: number) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function iterationMix(world: WorldModel) {
  return Math.max(0, Math.min(1, (world.fractalDepth - 2) / 6));
}

function seededTetra(x: number, z: number, seed: number, depth: number) {
  const value = Math.sin(x * 19.37 + z * 23.91 + seed * 17.13 + depth * 11.7) * 43758.5453;
  return value - Math.floor(value);
}
