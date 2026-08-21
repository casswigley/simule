import { describe, expect, it } from "vitest";
import { generateFractalBlocks, generateTetraLattice, terrainHeightAt } from "./fractalBlocks";
import { cloneWorld, worldPresets } from "../worlds";

describe("generateFractalBlocks", () => {
  it("starts presets with smaller macro blocks for denser worlds", () => {
    expect(worldPresets.every((world) => world.maximumBlockSize <= 6)).toBe(true);
    expect(worldPresets.every((world) => world.minimumBlockSize <= 0.75)).toBe(true);
  });

  it("uses multiple block sizes for adaptive self-similar terrain", () => {
    const world = cloneWorld(worldPresets[0]);
    const blocks = generateFractalBlocks(world);
    const sizes = new Set(blocks.map((block) => block.size));

    expect(blocks.length).toBeGreaterThan(16);
    expect(sizes.size).toBeGreaterThan(1);
  });

  it("adds detail when fractal depth increases", () => {
    const lowDetail = cloneWorld(worldPresets[1]);
    lowDetail.fractalDepth = 2;
    lowDetail.minimumBlockSize = 6;

    const highDetail = cloneWorld(worldPresets[1]);
    highDetail.fractalDepth = 5;
    highDetail.minimumBlockSize = 1.5;

    expect(generateFractalBlocks(highDetail).length).toBeGreaterThan(generateFractalBlocks(lowDetail).length);
  });

  it("generates interlocked tetrahedral cells for tetra lattice worlds", () => {
    const world = cloneWorld(worldPresets.find((preset) => preset.id === "tetrahedral-horizon") ?? worldPresets[0]);
    world.matterMode = "tetra-lattice";
    const cells = generateTetraLattice(world);
    const sizes = new Set(cells.map((cell) => cell.size));
    const orientations = new Set(cells.map((cell) => cell.orientation));

    expect(cells.length).toBeGreaterThan(100);
    expect(sizes.size).toBeGreaterThan(1);
    expect(orientations).toEqual(new Set([1, -1]));
  });

  it("keeps domain-warped terrain finite and locally continuous", () => {
    const world = cloneWorld(worldPresets[2]);
    const center = terrainHeightAt(4, -7, world);
    const nearby = terrainHeightAt(4.75, -6.25, world);

    expect(Number.isFinite(center)).toBe(true);
    expect(Math.abs(center - nearby)).toBeLessThan(world.terrainHeight * 0.45);
  });
});
