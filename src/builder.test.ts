import { describe, expect, it } from "vitest";
import { runBuilderCommand } from "./builder";
import { cloneWorld, worldPresets } from "./worlds";

const landmarkKinds = new Set(["castle", "cathedral", "mosque", "tent", "stoneCircle"]);

describe("runBuilderCommand", () => {
  it("retunes biome, weather, and time in one conversational command", () => {
    const world = cloneWorld(worldPresets[0]);
    const result = runBuilderCommand("make this a volcanic night world with ember weather", world);

    expect(result.world.biome).toBe("volcanic");
    expect(result.world.timeOfDay).toBe("night");
    expect(result.world.weather).toBe("ember");
    expect(result.operations).toContain("Retuned biome to volcanic");
  });

  it("adds requested entities without mutating the input world", () => {
    const world = cloneWorld(worldPresets[1]);
    const previousCount = world.entities.length;
    const result = runBuilderCommand("add three towers and a portal", world);

    expect(world.entities).toHaveLength(previousCount);
    expect(result.world.entities.filter((entity) => entity.kind === "tower")).toHaveLength(4);
    expect(result.world.entities.some((entity) => entity.kind === "portal")).toBe(true);
  });

  it("regenerates topology with seeded replacement entities", () => {
    const world = cloneWorld(worldPresets[2]);
    const result = runBuilderCommand("regenerate a new world with dense forest", world);

    expect(result.world.terrainSeed).not.toBe(world.terrainSeed);
    expect(result.world.entities.length).toBeGreaterThan(0);
    expect(result.world.density).toBeGreaterThan(world.density);
    expect(result.operations).not.toContain("Added 12 trees");
    expect(result.message).not.toContain("Added 12 trees");
  });

  it("handles water commands without duplicate water entities", () => {
    const world = cloneWorld(worldPresets[0]);
    const result = runBuilderCommand("raise mountains and add a river", world);

    expect(result.world.entities.filter((entity) => entity.kind === "water")).toHaveLength(1);
    expect(result.operations.filter((operation) => operation === "Added reflective water feature")).toHaveLength(1);
    expect(result.operations).not.toContain("Added 1 water");
  });

  it("keeps regenerate plus water commands consistent with the final entity set", () => {
    const world = cloneWorld(worldPresets[2]);
    const result = runBuilderCommand("regenerate a new world with a lake", world);

    expect(result.world.entities.filter((entity) => entity.kind === "water")).toHaveLength(1);
    expect(result.operations).toContain("Regenerated world topology");
    expect(result.operations).toContain("Added reflective water feature");
    expect(result.operations).not.toContain("Added 1 water");
  });

  it("can increase recursive fractal detail from chat ops", () => {
    const world = cloneWorld(worldPresets[0]);
    const result = runBuilderCommand("use self-similar fractal blocks with more detail", world);

    expect(result.world.matterMode).toBe("fractal-blocks");
    expect(result.world.fractalDepth).toBeGreaterThan(world.fractalDepth);
    expect(result.world.minimumBlockSize).toBeLessThanOrEqual(world.minimumBlockSize);
    expect(result.world.maximumBlockSize).toBeLessThan(world.maximumBlockSize);
    expect(result.operations).toContain("Enabled adaptive fractal blocks");
  });

  it("can enable cinematic lighting from chat ops", () => {
    const world = cloneWorld(worldPresets[0]);
    world.renderQuality = "balanced";
    const result = runBuilderCommand("turn on ray tracing bloom and lens flare", world);

    expect(result.world.renderQuality).toBe("cinematic");
    expect(result.operations).toContain("Enabled cinematic light transport");
  });

  it("can tune atmosphere strength from chat ops", () => {
    const world = cloneWorld(worldPresets[0]);
    world.refractionLevel = 0.5;

    const increased = runBuilderCommand("make the atmosphere more misty and refractive", world);
    const reduced = runBuilderCommand("reduce atmosphere", increased.world);
    const disabled = runBuilderCommand("clear mist", reduced.world);

    expect(increased.world.refractionLevel).toBeGreaterThan(world.refractionLevel);
    expect(reduced.world.refractionLevel).toBeLessThan(increased.world.refractionLevel);
    expect(disabled.world.refractionLevel).toBe(0);
  });

  it("can switch into tetrahedral lattice matter from chat ops", () => {
    const world = cloneWorld(worldPresets[0]);
    const result = runBuilderCommand("make this from interlocked triangles and tetrahedrons", world);

    expect(result.world.matterMode).toBe("tetra-lattice");
    expect(result.operations).toContain("Enabled tetrahedral triangle lattice");
  });

  it("can switch into metaball isosurface matter from chat ops", () => {
    const world = cloneWorld(worldPresets[1]);
    const result = runBuilderCommand("make this from metaballs and blobby isosurfaces", world);

    expect(result.world.matterMode).toBe("metaballs");
    expect(result.operations).toContain("Enabled blended metaball isosurface matter");
  });

  it("can add reactive tendril entities from chat ops", () => {
    const world = cloneWorld(worldPresets[1]);
    const result = runBuilderCommand("add three swaying tendrals near the path", world);

    expect(result.world.entities.filter((entity) => entity.kind === "tendril")).toHaveLength(3);
    expect(result.operations).toContain("Added 3 tendrils");
  });

  it("adds requested landmark structures from chat ops", () => {
    const world = cloneWorld(worldPresets[0]);
    const previousStoneCircles = world.entities.filter((entity) => entity.kind === "stoneCircle").length;
    const result = runBuilderCommand("add a castle and two stone circles", world);

    expect(result.world.entities.some((entity) => entity.kind === "castle")).toBe(true);
    expect(result.world.entities.filter((entity) => entity.kind === "stoneCircle")).toHaveLength(previousStoneCircles + 2);
  });

  it("ships every preset with a readable landmark structure", () => {
    expect(
      worldPresets.every((world) => world.entities.some((entity) => landmarkKinds.has(entity.kind)))
    ).toBe(true);
  });

  it("ships dedicated tetrahedral and metaball presets", () => {
    expect(worldPresets.filter((world) => world.matterMode === "tetra-lattice").length).toBeGreaterThanOrEqual(2);
    expect(worldPresets.some((world) => world.matterMode === "metaballs")).toBe(true);
  });

  it("ships a tendril showcase preset", () => {
    const showcase = worldPresets.find((world) => world.id === "swaying-tendril-grove");

    expect(showcase?.entities.filter((entity) => entity.kind === "tendril").length).toBeGreaterThanOrEqual(3);
  });
});
