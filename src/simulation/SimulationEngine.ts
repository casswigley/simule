import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import { generateFractalBlocks, generateTetraLattice, terrainHeightAt, type FractalBlock, type TetraCell } from "./fractalBlocks";
import type { WorldEntity, WorldModel } from "../types";

const WORLD_SIZE = 96;
const TERRAIN_SEGMENTS = 80;
const EYE_HEIGHT = 2.4;
const GRAVITY = 28;
const KEY_TURN_SPEED = 1.85;
const KEY_LOOK_RETURN = 5.4;
const SLOPE_LOOK_STRENGTH = 0.52;
const SLOPE_LOOK_RETURN = 4.8;
const MAX_SLOPE_PITCH = 0.24;
const tempVector = new THREE.Vector3();

interface ActiveLattice {
  mesh: THREE.InstancedMesh;
  states: Uint8Array;
  scratch: Uint8Array;
  columns: number;
  accumulator: number;
  alive: THREE.Color;
  resting: THREE.Color;
}

interface EntityCollider {
  x: number;
  z: number;
  radius: number;
  baseY: number;
  height: number;
}

interface TendrilChain {
  root: THREE.Vector3;
  phase: number;
  length: number;
  sway: number;
  segments: THREE.Mesh[];
}

interface TendrilRig {
  group: THREE.Group;
  chains: TendrilChain[];
  reactionRadius: number;
  palette: {
    base: THREE.Color;
    glow: THREE.Color;
  };
}

interface WaterSurface {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  baseY: number;
  amplitude: number;
  speed: number;
  phase: number;
}

interface ReflectiveWaterSurface {
  mesh: Water;
  speed: number;
}

interface WaterGlint {
  sprite: THREE.Sprite;
  baseOpacity: number;
  phase: number;
  speed: number;
}

interface ZombieRig {
  id: string;
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  wound: THREE.Mesh;
  legs: THREE.Object3D[];
  torsoHits: number;
  alive: boolean;
  speed: number;
  phase: number;
}

interface NpcRig {
  group: THREE.Group;
  legs: THREE.Object3D[];
  routeCenter: THREE.Vector3;
  routeRadius: number;
  speed: number;
  phase: number;
}

interface BloodParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface TracerEffect {
  mesh: THREE.Line;
  life: number;
  maxLife: number;
}

declare global {
  interface Window {
    __SIMULE_DEBUG__?: {
      camera: { x: number; y: number; z: number };
      worldId?: string;
    };
  }
}

export class SimulationEngine {
  private readonly host: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(72, 1, 0.1, 500);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  private readonly composer = new EffectComposer(this.renderer);
  private readonly bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.7, 0.12);
  private readonly fxaaPass = new ShaderPass(FXAAShader);
  private readonly clock = new THREE.Clock();
  private readonly keys = new Set<string>();
  private readonly reconGroup = new THREE.Group();
  private readonly dynamicLights: THREE.PointLight[] = [];
  private readonly activeLattices: ActiveLattice[] = [];
  private readonly proximityDetails: THREE.Object3D[] = [];
  private readonly colliders: EntityCollider[] = [];
  private readonly tendrilRigs: TendrilRig[] = [];
  private readonly waterSurfaces: WaterSurface[] = [];
  private readonly reflectiveWaterSurfaces: ReflectiveWaterSurface[] = [];
  private readonly waterGlints: WaterGlint[] = [];
  private readonly zombieRigs: ZombieRig[] = [];
  private readonly npcRigs: NpcRig[] = [];
  private readonly bloodParticles: BloodParticle[] = [];
  private readonly tracerEffects: TracerEffect[] = [];
  private readonly impactMarks: THREE.Object3D[] = [];
  private readonly shotRaycaster = new THREE.Raycaster();
  private renderedBlocks: FractalBlock[] = [];
  private renderedTetraCells: TetraCell[] = [];
  private animationFrame = 0;
  private yaw = 0;
  private pitch = 0;
  private keyLookYaw = 0;
  private keyLookPitch = 0;
  private slopePitch = 0;
  private velocity = new THREE.Vector3();
  private kayakSpeed = 0;
  private kayakYawVelocity = 0;
  private kayakBobPhase = 0;
  private cityVelocity = new THREE.Vector3();
  private cityYawVelocity = 0;
  private kills = 0;
  private shots = 0;
  private activeWorld?: WorldModel;
  private grounded = false;

  constructor(host: HTMLElement) {
    this.host = host;
    this.camera.position.set(0, 5, 22);
    this.scene.add(this.camera);
    this.scene.add(this.reconGroup);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.fxaaPass);
    this.composer.addPass(new OutputPass());
  }

  mount() {
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D world viewport");
    this.renderer.domElement.addEventListener("click", this.requestPointerLock);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    document.addEventListener("fullscreenchange", this.resize);
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    this.resize();
    this.animate();
  }

  reconstruct(world: WorldModel) {
    this.activeWorld = world;
    this.clearReconstruction();
    this.publishTelemetry(world.id);
    this.scene.background = new THREE.Color(world.skyColor);
    this.configureAtmosphere(world);
    this.configureRenderQuality(world);
    this.renderer.domElement.dataset.landmarkCount = "0";

    const ambient = new THREE.HemisphereLight(world.skyColor, world.groundColor, this.ambientFor(world));
    this.reconGroup.add(ambient);

    const neutralAmbient = new THREE.AmbientLight(
      world.landscapeStyle === "zombie-city" ? "#f0efe2" : "#d8eee8",
      world.landscapeStyle === "dolomite-spires" ? 0.1 : world.landscapeStyle === "zombie-city" ? 0.42 : world.timeOfDay === "night" ? 0.36 : 0.22
    );
    this.reconGroup.add(neutralAmbient);

    const sun = new THREE.DirectionalLight(world.landscapeStyle === "dolomite-spires" ? "#ffd2a3" : "#fff6d2", this.sunFor(world));
    sun.position.set(
      world.landscapeStyle === "dolomite-spires" ? -46 : world.landscapeStyle === "zombie-city" ? -34 : -22,
      world.landscapeStyle === "dolomite-spires" ? 34 : world.landscapeStyle === "zombie-city" ? 46 : 38,
      world.landscapeStyle === "dolomite-spires" ? 58 : world.landscapeStyle === "zombie-city" ? 30 : 18
    );
    sun.castShadow = true;
    const shadowMapSize = world.landscapeStyle === "dolomite-spires" ? 4096 : world.landscapeStyle === "zombie-city" ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = world.landscapeStyle === "dolomite-spires" ? 190 : 130;
    sun.shadow.camera.left = world.landscapeStyle === "dolomite-spires" ? -82 : -58;
    sun.shadow.camera.right = world.landscapeStyle === "dolomite-spires" ? 82 : 58;
    sun.shadow.camera.top = world.landscapeStyle === "dolomite-spires" ? 82 : 58;
    sun.shadow.camera.bottom = world.landscapeStyle === "dolomite-spires" ? -82 : -58;
    sun.shadow.bias = world.landscapeStyle === "dolomite-spires" ? -0.00025 : -0.0007;
    if (world.landscapeStyle === "dolomite-spires") {
      sun.target.position.set(3, world.waterLevel, -10);
      this.reconGroup.add(sun.target);
    }
    this.reconGroup.add(sun);

    const fill = new THREE.DirectionalLight("#d7fff1", this.fillFor(world));
    fill.position.set(28, 18, -24);
    this.reconGroup.add(fill);

    this.reconGroup.add(this.createProceduralSky(world));
    if (world.landscapeStyle === "zombie-city") {
      this.reconGroup.add(this.createZombieCity(world));
      this.reconGroup.add(this.createCloudField(world));
      this.createCityViewModel();
      this.positionCityCamera();
      this.publishTelemetry(world.id);
      return;
    }

    this.reconGroup.add(this.createHorizonExpanse(world));
    this.reconGroup.add(this.createMatterTerrain(world));
    if (world.waterLevel > -6 || world.entities.some((entity) => entity.kind === "water")) {
      this.reconGroup.add(this.createWater(world));
    }

    this.reconGroup.add(this.createCloudField(world));
    this.reconGroup.add(this.createLensFlares(world));
    if (world.landscapeStyle !== "dolomite-spires") {
      this.addProceduralDetails(world);
      this.reconGroup.add(this.createRecursiveWorldMotifs(world));
    }
    world.entities.forEach((entity) => {
      if (world.landscapeStyle === "dolomite-spires" && entity.kind === "water") {
        return;
      }
      this.reconGroup.add(this.createEntity(entity, world));
    });
    if (world.landscapeStyle === "dolomite-spires") {
      this.positionScenicCamera(world);
      this.publishTelemetry(world.id);
    }
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.renderer.domElement.removeEventListener("click", this.requestPointerLock);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("fullscreenchange", this.resize);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.clearReconstruction();
    this.renderer.dispose();
    this.composer.dispose();
    this.renderer.domElement.remove();
  }

  private animate = () => {
    const delta = Math.min(this.clock.getDelta(), 0.033);
    this.updateMovement(delta);
    this.updateActiveLattices(delta);
    this.updateWater(delta);
    this.updateZombies(delta);
    this.updateNpcs(delta);
    this.updateBloodParticles(delta);
    this.updateTracerEffects(delta);
    this.updateProximityDetails();
    this.updateTendrils(delta);
    const elapsed = this.clock.elapsedTime;
    this.dynamicLights.forEach((light, index) => {
      light.intensity = light.userData.baseIntensity + Math.sin(elapsed * 2 + index) * 0.25;
    });
    this.composer.render();
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private updateMovement(delta: number) {
    if (this.activeWorld?.landscapeStyle === "dolomite-spires") {
      this.updateKayakMovement(delta, this.activeWorld);
      this.publishTelemetry();
      return;
    }
    if (this.activeWorld?.landscapeStyle === "zombie-city") {
      this.updateCityMovement(delta, this.activeWorld);
      this.publishTelemetry();
      return;
    }
    this.updateKeyboardLook(delta);
    const hasMovement = this.hasMovementInput();
    if (hasMovement) {
      this.commitKeyboardLookAsRest();
    }
    const { forward, right } = this.movementBasis();
    const input = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) input.add(forward.clone().multiplyScalar(-1));
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) input.add(forward);
    if (this.keys.has("KeyA")) input.add(right.clone().multiplyScalar(-1));
    if (this.keys.has("KeyD")) input.add(right);
    if (input.lengthSq() > 0) input.normalize();
    this.updateSlopeLook(delta, input);
    const speed = this.keys.has("ShiftLeft") ? 13 : 8.5;
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, input.x * speed, 0.16);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, input.z * speed, 0.16);
    this.velocity.y -= GRAVITY * delta;
    this.camera.position.addScaledVector(this.velocity, delta);
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -44, 44);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -44, 44);
    this.resolveObjectCollisions();
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -44, 44);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -44, 44);
    this.resolveGroundCollision();
    this.publishTelemetry();
  }

  private updateKayakMovement(delta: number, world: WorldModel) {
    const forwardInput = Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) - Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
    const turnInput = Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft")) - Number(this.keys.has("KeyD") || this.keys.has("ArrowRight"));
    const paddlePower = this.keys.has("ShiftLeft") ? 7.2 : 4.8;
    const reversePower = 2.1;
    const maxSpeed = this.keys.has("ShiftLeft") ? 12.5 : 8.2;
    const drag = forwardInput === 0 ? 0.92 : 0.42;
    const turnDrag = turnInput === 0 ? 1.6 : 0.62;

    if (forwardInput > 0) {
      this.kayakSpeed += paddlePower * delta;
    } else if (forwardInput < 0) {
      this.kayakSpeed -= reversePower * delta;
    }
    this.kayakSpeed = THREE.MathUtils.clamp(this.kayakSpeed, -2.4, maxSpeed);
    this.kayakSpeed = THREE.MathUtils.damp(this.kayakSpeed, 0, drag, delta);

    const turnAuthority = 0.34 + Math.min(Math.abs(this.kayakSpeed), maxSpeed) / maxSpeed * 0.72;
    this.kayakYawVelocity += turnInput * turnAuthority * delta;
    this.kayakYawVelocity = THREE.MathUtils.clamp(this.kayakYawVelocity, -0.95, 0.95);
    this.kayakYawVelocity = THREE.MathUtils.damp(this.kayakYawVelocity, 0, turnDrag, delta);
    this.yaw += this.kayakYawVelocity * delta;

    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.camera.position.addScaledVector(forward, -this.kayakSpeed * delta);
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -52, 52);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -64, 64);

    this.kayakBobPhase += delta * (0.7 + Math.abs(this.kayakSpeed) * 0.16);
    const bob = Math.sin(this.kayakBobPhase) * 0.09 + Math.sin(this.kayakBobPhase * 0.47 + 1.1) * 0.05;
    const roll = THREE.MathUtils.clamp(-this.kayakYawVelocity * 0.08 + Math.sin(this.kayakBobPhase * 0.9) * 0.012, -0.09, 0.09);
    const waterRideHeight = world.waterLevel + 1.35 + bob;
    const terrain = this.surfaceHeightAt(this.camera.position.x, this.camera.position.z, world);
    this.camera.position.y = Math.max(waterRideHeight, terrain + EYE_HEIGHT * 0.72);
    this.pitch = THREE.MathUtils.damp(this.pitch, -0.06 + Math.abs(this.kayakSpeed) * 0.006, 2.6, delta);
    this.camera.rotation.set(
      THREE.MathUtils.clamp(this.pitch + this.keyLookPitch + this.slopePitch, -0.72, 0.72),
      this.yaw + this.keyLookYaw,
      roll,
      "YXZ"
    );
    this.renderer.domElement.dataset.kayak = JSON.stringify({
      speed: Number(this.kayakSpeed.toFixed(2)),
      yawVelocity: Number(this.kayakYawVelocity.toFixed(3)),
      mode: "momentum-glide"
    });
    this.grounded = false;
  }

  private updateCityMovement(delta: number, world: WorldModel) {
    const forwardInput = Number(this.keys.has("ArrowUp") || this.keys.has("KeyW")) - Number(this.keys.has("ArrowDown") || this.keys.has("KeyS"));
    const turnInput = Number(this.keys.has("ArrowLeft") || this.keys.has("KeyA")) - Number(this.keys.has("ArrowRight") || this.keys.has("KeyD"));
    this.cityYawVelocity += turnInput * 7.4 * delta;
    this.cityYawVelocity = THREE.MathUtils.clamp(this.cityYawVelocity, -4.15, 4.15);
    this.cityYawVelocity = THREE.MathUtils.damp(this.cityYawVelocity, 0, turnInput === 0 ? 18 : 9, delta);
    this.yaw += this.cityYawVelocity * delta;

    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const targetSpeed = -forwardInput * (this.keys.has("ShiftLeft") ? 11.8 : 7.9);
    const targetVelocity = forward.multiplyScalar(targetSpeed);
    this.cityVelocity.x = THREE.MathUtils.damp(this.cityVelocity.x, targetVelocity.x, forwardInput === 0 ? 26 : 22, delta);
    this.cityVelocity.z = THREE.MathUtils.damp(this.cityVelocity.z, targetVelocity.z, forwardInput === 0 ? 26 : 22, delta);
    this.camera.position.addScaledVector(this.cityVelocity, delta);
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -48, 48);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -48, 48);
    this.resolveObjectCollisions();
    this.camera.position.y = 1.75 + Math.sin(this.clock.elapsedTime * 8.2) * Math.min(this.cityVelocity.length() * 0.015, 0.06);
    const cityPitch = THREE.MathUtils.clamp(this.pitch + this.keyLookPitch, -0.72, 0.72);
    this.camera.rotation.set(cityPitch, this.yaw, -this.cityYawVelocity * 0.015, "YXZ");
    this.renderer.domElement.dataset.cityMovement = JSON.stringify({
      speed: Number(this.cityVelocity.length().toFixed(2)),
      yawVelocity: Number(this.cityYawVelocity.toFixed(3)),
      mode: "fast-responsive-first-person-street"
    });
    this.renderer.domElement.dataset.look = JSON.stringify({
      yaw: Number(this.yaw.toFixed(3)),
      pitch: Number(cityPitch.toFixed(3)),
      movementYaw: Number(this.yaw.toFixed(3)),
      returnYaw: 0,
      returnPitch: Number(this.keyLookPitch.toFixed(3)),
      slopePitch: 0,
      keyTurn: Number(turnInput)
    });
    this.grounded = true;
  }

  private createZombieCity(world: WorldModel) {
    const group = new THREE.Group();
    const asphalt = new THREE.MeshStandardMaterial({
      color: "#232829",
      roughness: 0.92,
      metalness: 0.02,
      map: createCityAsphaltTexture(world),
      normalMap: createCityAsphaltNormalTexture(world),
      normalScale: new THREE.Vector2(0.24, 0.24)
    });
    const road = new THREE.MeshStandardMaterial({ color: "#151819", roughness: 0.88 });
    const sidewalk = new THREE.MeshStandardMaterial({ color: "#555a58", roughness: 0.86 });
    const line = new THREE.MeshBasicMaterial({ color: "#d9d0a5" });
    const crosswalk = new THREE.MeshBasicMaterial({ color: "#e4e0cf" });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(118, 118, 1, 1), asphalt);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);

    group.add(this.createCitySlab(0, 0.018, 0, 118, 13.6, road));
    group.add(this.createCitySlab(0, 0.019, 0, 13.6, 118, road));
    group.add(this.createCitySlab(-3.4, 0.03, 0, 2.2, 0.09, line));
    group.add(this.createCitySlab(3.4, 0.03, 0, 2.2, 0.09, line));
    group.add(this.createCitySlab(0, 0.031, -3.4, 0.09, 2.2, line));
    group.add(this.createCitySlab(0, 0.031, 3.4, 0.09, 2.2, line));

    for (let coord = -40; coord <= 40; coord += 16) {
      const streetWidth = Math.abs(coord) === 8 ? 5.2 : 7.4;
      group.add(this.createCitySlab(0, 0.012, coord, 116, streetWidth, road));
      group.add(this.createCitySlab(coord, 0.014, 0, streetWidth, 116, road));
      group.add(this.createCitySlab(-2.2, 0.02, coord, 1.8, 0.08, line));
      group.add(this.createCitySlab(2.2, 0.02, coord, 1.8, 0.08, line));
      group.add(this.createCitySlab(coord, 0.022, -2.2, 0.08, 1.8, line));
      group.add(this.createCitySlab(coord, 0.022, 2.2, 0.08, 1.8, line));
      for (let stripe = -3; stripe <= 3; stripe += 1) {
        group.add(this.createCitySlab(stripe * 0.86, 0.032, coord - 5.15, 0.46, 2.5, crosswalk));
        group.add(this.createCitySlab(coord - 5.15, 0.034, stripe * 0.86, 2.5, 0.46, crosswalk));
      }
    }

    const alleyMaterial = new THREE.MeshStandardMaterial({ color: "#0e1011", roughness: 0.95, metalness: 0.01 });
    [-32, -16, 16, 32].forEach((coord, index) => {
      const offset = index % 2 === 0 ? 3.7 : -3.7;
      group.add(this.createCitySlab(coord + offset, 0.017, 0, 2.65, 94, alleyMaterial));
      group.add(this.createCitySlab(0, 0.016, coord - offset, 94, 2.65, alleyMaterial));
    });

    for (let blockZ = -48; blockZ <= 48; blockZ += 16) {
      for (let blockX = -48; blockX <= 48; blockX += 16) {
        if (Math.abs(blockX) < 8 && Math.abs(blockZ) < 8) {
          continue;
        }
        const offsetX = blockX + THREE.MathUtils.lerp(-2.4, 2.4, seeded(blockX + blockZ + 800, world.terrainSeed));
        const offsetZ = blockZ + THREE.MathUtils.lerp(-2.4, 2.4, seeded(blockX - blockZ + 850, world.terrainSeed));
        const width = THREE.MathUtils.lerp(5.8, 9.4, seeded(blockX + 1100, world.terrainSeed));
        const depth = THREE.MathUtils.lerp(5.8, 9.4, seeded(blockZ + 1200, world.terrainSeed));
        const height = THREE.MathUtils.lerp(11, 42, seeded(blockX * 3 + blockZ * 5 + 1300, world.terrainSeed));
        group.add(this.createCityBlock(offsetX, offsetZ, width, depth, height, world));
        this.colliders.push({ x: offsetX, z: offsetZ, radius: Math.max(width, depth) * 0.64, baseY: 0, height });
        group.add(this.createCitySlab(offsetX, 0.025, offsetZ, width + 2.8, depth + 2.8, sidewalk));
      }
    }

    this.addAbandonedCars(group, world);
    this.addStreetFurniture(group, world);
    world.entities
      .filter((entity) => entity.kind === "zombie")
      .forEach((entity, index) => group.add(this.createZombieRig(entity, world, index)));
    world.entities
      .filter((entity) => entity.kind === "npc")
      .forEach((entity, index) => group.add(this.createNpcRig(entity, world, index)));

    this.renderer.domElement.dataset.cityRenderer = "empty-modern-grid";
    this.renderer.domElement.dataset.cityDetail = "wide-avenues-narrow-alleys-optimized-facades-roofs";
    this.renderer.domElement.dataset.enemyStyle = "jet-black-demonic-horned-robot-centaur";
    this.renderer.domElement.dataset.zombieCount = String(this.zombieRigs.length);
    this.renderer.domElement.dataset.npcCount = String(this.npcRigs.length);
    this.renderer.domElement.dataset.colliderCount = String(this.colliders.length);
    return group;
  }

  private createCitySlab(x: number, y: number, z: number, width: number, depth: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, depth), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    return mesh;
  }

  private createCityBlock(x: number, z: number, width: number, depth: number, height: number, world: WorldModel) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: seeded(x + z, world.terrainSeed) > 0.5 ? "#4f585b" : "#3f4649",
        map: createBuildingFacadeTexture(world, height),
        roughness: 0.42,
        metalness: 0.22,
        envMapIntensity: 0.55
      })
    );
    body.position.set(x, height / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const windowMaterial = new THREE.MeshStandardMaterial({
      color: "#b8c7bd",
      emissive: "#f0d29d",
      emissiveIntensity: 0.18,
      roughness: 0.24,
      metalness: 0.18,
      transparent: true,
      opacity: 0.88
    });
    const darkGlass = new THREE.MeshStandardMaterial({ color: "#1d272a", roughness: 0.18, metalness: 0.32, envMapIntensity: 0.9 });
    const rows = Math.max(3, Math.floor(height / 5.4));
    const columns = Math.max(2, Math.floor(width / 3.1));
    for (let row = 1; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (seeded(row * 17 + column * 31 + x + z, world.terrainSeed) < 0.52) {
          continue;
        }
        const wx = x - width * 0.38 + column * (width * 0.76 / Math.max(columns - 1, 1));
        const wy = row * (height / rows);
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.05, 0.035), windowMaterial);
        front.position.set(wx, wy, z - depth / 2 - 0.025);
        group.add(front);
        const back = front.clone();
        back.position.z = z + depth / 2 + 0.025;
        group.add(back);
      }
    }
    const sideColumns = Math.max(2, Math.floor(depth / 3.2));
    for (let row = 1; row < rows; row += 2) {
      for (let column = 0; column < sideColumns; column += 1) {
        if (seeded(row * 23 + column * 19 + x - z, world.terrainSeed) < 0.58) {
          continue;
        }
        const wz = z - depth * 0.38 + column * (depth * 0.76 / Math.max(sideColumns - 1, 1));
        const wy = row * (height / rows);
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.96, 0.64), column % 3 === 0 ? darkGlass : windowMaterial);
        left.position.set(x - width / 2 - 0.025, wy, wz);
        group.add(left);
        const right = left.clone();
        right.position.x = x + width / 2 + 0.025;
        group.add(right);
      }
    }

    const roofMaterial = new THREE.MeshStandardMaterial({ color: "#2a2f31", roughness: 0.82, metalness: 0.08 });
    const roof = new THREE.Group();
    roof.position.set(x, height + 0.15, z);
    roof.add(this.createBlock(roofMaterial, 0, 0.08, 0, width * 0.84, 0.16, depth * 0.84, 0, 0, false));
    roof.add(this.createBlock(roofMaterial, width * 0.22, 0.34, -depth * 0.2, 1.2, 0.52, 1.0, 0.2, 0, false));
    roof.add(this.createBlock(roofMaterial, -width * 0.22, 0.3, depth * 0.2, 1.4, 0.42, 0.9, -0.15, 0, false));
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.9, 18), new THREE.MeshStandardMaterial({ color: "#5b4d3b", roughness: 0.76 }));
    tank.position.set(-width * 0.18, 0.86, -depth * 0.24);
    tank.castShadow = true;
    roof.add(tank);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 8), new THREE.MeshBasicMaterial({ color: "#bfc7c5" }));
    antenna.position.set(width * 0.28, 1.4, depth * 0.16);
    roof.add(antenna);
    group.add(roof);

    if (height > 18) {
      const escapeMaterial = new THREE.MeshStandardMaterial({ color: "#151718", roughness: 0.48, metalness: 0.72 });
      for (let level = 2; level < rows - 1; level += 3) {
        const y = level * (height / rows) - 0.4;
        group.add(this.createCitySlab(x - width / 2 - 0.16, y, z, 0.08, Math.min(depth * 0.58, 3.2), escapeMaterial));
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, Math.min(depth * 0.56, 3.0)), escapeMaterial);
        rail.position.set(x - width / 2 - 0.22, y + 0.45, z);
        group.add(rail);
      }
    }
    return group;
  }

  private addAbandonedCars(group: THREE.Group, world: WorldModel) {
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#7b2f2c", roughness: 0.55, metalness: 0.18 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: "#171a1b", roughness: 0.5, metalness: 0.3 });
    for (let index = 0; index < 14; index += 1) {
      const onNorthSouth = index % 2 === 0;
      const roadCoord = -40 + (index % 6) * 16;
      const along = THREE.MathUtils.lerp(-42, 42, seeded(index + 2100, world.terrainSeed));
      const x = onNorthSouth ? roadCoord + THREE.MathUtils.lerp(-2, 2, seeded(index + 2200, world.terrainSeed)) : along;
      const z = onNorthSouth ? along : roadCoord + THREE.MathUtils.lerp(-2, 2, seeded(index + 2300, world.terrainSeed));
      const car = new THREE.Group();
      car.position.set(x, 0.24, z);
      car.rotation.y = onNorthSouth ? 0 : Math.PI / 2;
      car.add(this.createBlock(bodyMaterial, 0, 0.35, 0, 1.4, 0.48, 2.5, 0, 0, false));
      car.add(this.createBlock(darkMaterial, 0, 0.76, -0.12, 1.1, 0.38, 1.15, 0, 0, false));
      car.add(this.createBlock(darkMaterial, -0.56, 0.16, -0.78, 0.18, 0.18, 0.18, 0, 0, false));
      car.add(this.createBlock(darkMaterial, 0.56, 0.16, -0.78, 0.18, 0.18, 0.18, 0, 0, false));
      car.add(this.createBlock(darkMaterial, -0.56, 0.16, 0.78, 0.18, 0.18, 0.18, 0, 0, false));
      car.add(this.createBlock(darkMaterial, 0.56, 0.16, 0.78, 0.18, 0.18, 0.18, 0, 0, false));
      group.add(car);
      this.colliders.push({ x, z, radius: 1.4, baseY: 0, height: 1.3 });
    }
  }

  private addStreetFurniture(group: THREE.Group, world: WorldModel) {
    const poleMaterial = new THREE.MeshStandardMaterial({ color: "#202426", roughness: 0.52, metalness: 0.7 });
    const lampMaterial = new THREE.MeshBasicMaterial({ color: "#f1d396" });
    const signMaterial = new THREE.MeshStandardMaterial({ color: "#244e63", roughness: 0.44, metalness: 0.18 });
    let liveLampLights = 0;
    for (let index = 0; index < 20; index += 1) {
      const onNorthSouth = index % 2 === 0;
      const roadCoord = -40 + (index % 6) * 16;
      const along = -46 + Math.floor(index / 2) % 6 * 16 + seeded(index + 4100, world.terrainSeed) * 3;
      const x = onNorthSouth ? roadCoord + 5.6 : along;
      const z = onNorthSouth ? along : roadCoord + 5.6;
      const lamp = new THREE.Group();
      lamp.position.set(x, 0, z);
      lamp.add(this.createBlock(poleMaterial, 0, 1.55, 0, 0.08, 3.1, 0.08, 0, 0, false));
      lamp.add(this.createBlock(poleMaterial, onNorthSouth ? -0.42 : 0, 3.05, onNorthSouth ? 0 : -0.42, onNorthSouth ? 0.84 : 0.08, 0.08, onNorthSouth ? 0.08 : 0.84, 0, 0, false));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), lampMaterial);
      bulb.position.set(onNorthSouth ? -0.84 : 0, 2.95, onNorthSouth ? 0 : -0.84);
      lamp.add(bulb);
      if (index % 4 === 0 && liveLampLights < 5) {
        const light = new THREE.PointLight("#ffd89d", 0.5, 8);
        light.position.copy(bulb.position);
        light.userData.baseIntensity = light.intensity;
        lamp.add(light);
        this.dynamicLights.push(light);
        liveLampLights += 1;
      }
      group.add(lamp);
    }

    for (let index = 0; index < 10; index += 1) {
      const x = -36 + index * 8;
      const z = index % 2 === 0 ? -7.4 : 7.4;
      const sign = new THREE.Group();
      sign.position.set(x, 0, z);
      sign.add(this.createBlock(poleMaterial, 0, 0.95, 0, 0.05, 1.9, 0.05, 0, 0, false));
      sign.add(this.createBlock(signMaterial, 0, 1.86, 0, 1.0, 0.28, 0.04, 0, 0, false));
      group.add(sign);
    }
    this.renderer.domElement.dataset.liveLampLights = String(liveLampLights);
  }

  private createZombieRig(entity: WorldEntity, world: WorldModel, index: number) {
    const group = new THREE.Group();
    group.position.set(entity.x, 0, entity.z);
    group.rotation.y = seeded(index + 3100, world.terrainSeed) * Math.PI * 2;
    const armor = new THREE.MeshPhysicalMaterial({
      color: "#07080a",
      emissive: "#10141b",
      emissiveIntensity: 0.18,
      roughness: 0.22,
      metalness: 0.92,
      clearcoat: 0.72,
      clearcoatRoughness: 0.22
    });
    const joint = new THREE.MeshStandardMaterial({ color: "#15191f", emissive: "#07090d", emissiveIntensity: 0.08, roughness: 0.3, metalness: 0.88 });
    const optic = new THREE.MeshBasicMaterial({ color: "#ff2a22" });
    const coldEdge = new THREE.MeshBasicMaterial({ color: "#71d9ff", transparent: true, opacity: 0.72 });
    const hotImpact = new THREE.MeshStandardMaterial({ color: "#ff7030", emissive: "#ff4d18", emissiveIntensity: 0.8, roughness: 0.34 });
    const legs: THREE.Object3D[] = [];

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.54, 2.18), armor);
    chassis.position.y = 1.0;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    chassis.userData.zombieId = entity.id;
    chassis.userData.hitZone = "body";
    group.add(chassis);

    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.74, 10), joint);
    spine.position.set(0, 1.36, -0.58);
    spine.castShadow = true;
    group.add(spine);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.88, 8, 12), armor);
    torso.position.set(0, 1.92, -0.62);
    torso.castShadow = true;
    torso.userData.zombieId = entity.id;
    torso.userData.hitZone = "body";
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), armor);
    head.position.set(0, 2.46, -0.68);
    head.castShadow = true;
    head.userData.zombieId = entity.id;
    head.userData.hitZone = "head";
    group.add(head);

    group.add(this.createDemonicHorn(-1, joint));
    group.add(this.createDemonicHorn(1, joint));

    const eyeBar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.04), optic);
    eyeBar.position.set(0, 2.48, -0.95);
    group.add(eyeBar);

    [-0.1, 0.1].forEach((xSide) => {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24, 8), optic);
      fang.position.set(xSide, 2.24, -0.94);
      fang.rotation.x = Math.PI;
      group.add(fang);
    });

    [-0.42, 0.42].forEach((xSide) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.68, 5, 8), joint);
      arm.position.set(xSide, 1.75, -0.54);
      arm.rotation.z = xSide < 0 ? 0.62 : -0.62;
      arm.rotation.x = -0.42;
      arm.castShadow = true;
      group.add(arm);
      legs.push(arm);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), optic);
      claw.position.set(xSide * 1.1, 1.24, -0.74);
      claw.rotation.x = Math.PI / 2;
      claw.rotation.z = xSide < 0 ? -0.25 : 0.25;
      group.add(claw);
    });

    const legPositions: Array<[number, number]> = [
      [-0.48, -1.1],
      [0.48, -1.1],
      [-0.48, 0.64],
      [0.48, 0.64]
    ];
    legPositions.forEach(([xSide, zSide], legIndex) => {
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.78, 5, 8), joint);
      upper.position.set(xSide, 0.66, zSide);
      upper.rotation.z = xSide < 0 ? -0.14 : 0.14;
      upper.castShadow = true;
      group.add(upper);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.72, 5, 8), joint);
      lower.position.set(xSide, 0.25, zSide + (zSide < 0 ? -0.12 : 0.12));
      lower.castShadow = true;
      group.add(lower);
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.44), armor);
      hoof.position.set(xSide, 0.06, zSide + (zSide < 0 ? -0.28 : 0.28));
      hoof.castShadow = true;
      group.add(hoof);
      legs.push(upper, lower, hoof);
      if (legIndex % 2 === 0) {
        const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.78, 6), coldEdge);
        piston.position.set(xSide * 0.92, 0.46, zSide);
        piston.rotation.z = Math.PI / 2;
        group.add(piston);
      }
    });

    const chestLight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.035), optic);
    chestLight.position.set(0, 1.9, -0.91);
    group.add(chestLight);

    for (let spike = -2; spike <= 2; spike += 1) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 8), joint);
      spine.position.set(0, 1.34 + Math.abs(spike) * 0.04, spike * 0.38);
      spine.rotation.x = -Math.PI / 2;
      spine.castShadow = true;
      group.add(spine);
    }

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.72, 10), joint);
    tail.position.set(0, 1.04, 1.34);
    tail.rotation.x = Math.PI / 2 + 0.28;
    tail.castShadow = true;
    group.add(tail);

    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.035, 0.035), coldEdge);
    rim.position.set(0, 1.29, -1.05);
    group.add(rim);

    const wound = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hotImpact);
    wound.position.set(0.08, 1.74, -0.94);
    wound.visible = false;
    group.add(wound);

    this.zombieRigs.push({
      id: entity.id,
      group,
      body: chassis,
      head,
      wound,
      legs,
      torsoHits: 0,
      alive: true,
      speed: 0.58 + seeded(index + 3300, world.terrainSeed) * 0.52,
      phase: seeded(index + 3400, world.terrainSeed) * Math.PI * 2
    });
    return group;
  }

  private createDemonicHorn(side: -1 | 1, material: THREE.Material) {
    const horn = new THREE.Group();
    const segments = [
      { from: new THREE.Vector3(side * 0.18, 2.64, -0.72), to: new THREE.Vector3(side * 0.34, 2.9, -0.76), radius: 0.105 },
      { from: new THREE.Vector3(side * 0.34, 2.9, -0.76), to: new THREE.Vector3(side * 0.52, 3.05, -0.68), radius: 0.082 },
      { from: new THREE.Vector3(side * 0.52, 3.05, -0.68), to: new THREE.Vector3(side * 0.62, 3.02, -0.46), radius: 0.058 },
      { from: new THREE.Vector3(side * 0.62, 3.02, -0.46), to: new THREE.Vector3(side * 0.58, 2.86, -0.26), radius: 0.034 }
    ];

    segments.forEach((segment, index) => {
      const direction = segment.to.clone().sub(segment.from);
      const length = direction.length();
      const geometry = new THREE.ConeGeometry(segment.radius, length, 12);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(segment.from).lerp(segment.to, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      mesh.castShadow = true;
      horn.add(mesh);

      if (index === segments.length - 1) {
        const tip = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 10, 8),
          new THREE.MeshBasicMaterial({ color: "#ff2418" })
        );
        tip.position.copy(segment.to);
        horn.add(tip);
      }
    });

    return horn;
  }

  private createNpcRig(entity: WorldEntity, world: WorldModel, index: number) {
    const group = new THREE.Group();
    group.position.set(entity.x, 0, entity.z);
    const coat = new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? "#71695d" : "#314653", roughness: 0.84, metalness: 0.02 });
    const skin = new THREE.MeshStandardMaterial({ color: "#9a7762", roughness: 0.78 });
    const dark = new THREE.MeshStandardMaterial({ color: "#1c1c1b", roughness: 0.78 });
    const legs: THREE.Object3D[] = [];

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.72, 8, 12), coat);
    body.position.y = 1.08;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), skin);
    head.position.y = 1.65;
    head.castShadow = true;
    group.add(head);
    [-0.12, 0.12].forEach((xSide) => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.64, 5, 8), dark);
      leg.position.set(xSide, 0.42, 0);
      leg.castShadow = true;
      group.add(leg);
      legs.push(leg);
    });
    [-0.28, 0.28].forEach((xSide) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.55, 5, 8), coat);
      arm.position.set(xSide, 1.08, 0);
      arm.rotation.z = xSide < 0 ? 0.18 : -0.18;
      arm.castShadow = true;
      group.add(arm);
      legs.push(arm);
    });

    this.npcRigs.push({
      group,
      legs,
      routeCenter: new THREE.Vector3(entity.x, 0, entity.z),
      routeRadius: 4 + seeded(index + 6200, world.terrainSeed) * 5,
      speed: 0.34 + seeded(index + 6300, world.terrainSeed) * 0.3,
      phase: seeded(index + 6400, world.terrainSeed) * Math.PI * 2
    });
    return group;
  }

  private createCityViewModel() {
    const gun = new THREE.Group();
    gun.name = "city-viewmodel";
    gun.position.set(0.34, -0.34, -0.72);
    gun.rotation.set(-0.08, -0.08, 0.02);

    const metal = new THREE.MeshStandardMaterial({ color: "#141719", roughness: 0.46, metalness: 0.72 });
    const brightMetal = new THREE.MeshStandardMaterial({ color: "#303840", roughness: 0.3, metalness: 0.88 });
    const grip = new THREE.MeshStandardMaterial({ color: "#24211e", roughness: 0.84, metalness: 0.18 });
    const sightGlow = new THREE.MeshBasicMaterial({ color: "#7be0ff" });
    const muzzle = new THREE.MeshBasicMaterial({ color: "#ffc46d", transparent: true, opacity: 0.0 });

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.58, 16), brightMetal);
    barrel.position.set(0, 0.035, -0.25);
    barrel.rotation.x = Math.PI / 2;
    gun.add(barrel);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.42), metal);
    slide.position.set(0, 0.08, -0.04);
    gun.add(slide);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.36), brightMetal);
    frame.position.set(0, -0.005, 0.02);
    gun.add(frame);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.12), grip);
    handle.position.set(0.02, -0.12, 0.08);
    handle.rotation.x = -0.22;
    gun.add(handle);

    for (let index = 0; index < 5; index += 1) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.008), brightMetal);
      groove.position.set(0, 0.14, -0.17 + index * 0.028);
      gun.add(groove);
      const gripRidge = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.014, 0.01), metal);
      gripRidge.position.set(0.02, -0.1 - index * 0.035, 0.145);
      gripRidge.rotation.x = -0.22;
      gun.add(gripRidge);
    }

    const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 18, Math.PI * 1.35), brightMetal);
    triggerGuard.position.set(0, -0.09, -0.07);
    triggerGuard.rotation.set(Math.PI / 2, 0, -0.72);
    gun.add(triggerGuard);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.018), metal);
    trigger.position.set(0, -0.1, -0.045);
    trigger.rotation.x = -0.32;
    gun.add(trigger);

    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.09), brightMetal);
    magazine.position.set(0.025, -0.28, 0.12);
    magazine.rotation.x = -0.18;
    gun.add(magazine);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.018), sightGlow);
    frontSight.position.set(0, 0.17, -0.26);
    gun.add(frontSight);
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.018), sightGlow);
    rearSight.position.set(0, 0.165, 0.14);
    gun.add(rearSight);

    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.1), new THREE.MeshBasicMaterial({ color: "#0b0d0f" }));
    ejectionPort.position.set(-0.065, 0.1, -0.02);
    gun.add(ejectionPort);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.32), brightMetal);
    rail.position.set(0, -0.035, -0.05);
    gun.add(rail);
    const tacticalLight = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.18, 14), brightMetal);
    tacticalLight.position.set(0.1, -0.055, -0.16);
    tacticalLight.rotation.x = Math.PI / 2;
    gun.add(tacticalLight);

    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), muzzle);
    flash.name = "muzzle-flash";
    flash.position.set(0, 0.02, -0.54);
    flash.scale.set(1, 0.72, 1.8);
    gun.add(flash);

    const reticle = new THREE.Group();
    reticle.name = "city-reticle";
    reticle.position.set(0, 0, -2.8);
    const reticleMaterial = new THREE.MeshBasicMaterial({ color: "#f8f2db", transparent: true, opacity: 0.86, depthTest: false });
    const hotReticleMaterial = new THREE.MeshBasicMaterial({ color: "#ff4a2d", transparent: true, opacity: 0.0, depthTest: false });
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.004, 0.003), reticleMaterial);
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.09, 0.003), reticleMaterial);
    const topTick = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.04, 0.003), reticleMaterial);
    topTick.position.y = 0.13;
    const bottomTick = topTick.clone();
    bottomTick.position.y = -0.13;
    const leftTick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.003), reticleMaterial);
    leftTick.position.x = -0.13;
    const rightTick = leftTick.clone();
    rightTick.position.x = 0.13;
    const fireHorizontal = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.006, 0.003), hotReticleMaterial);
    fireHorizontal.name = "fire-crosshair-hot";
    const fireVertical = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.18, 0.003), hotReticleMaterial);
    fireVertical.name = "fire-crosshair-hot";
    reticle.add(horizontal, vertical, topTick, bottomTick, leftTick, rightTick, fireHorizontal, fireVertical);
    this.camera.add(reticle);
    this.camera.add(gun);

    this.renderer.domElement.dataset.weapon = "detailed-spacebar-pistol";
    this.renderer.domElement.dataset.reticle = "persistent-and-fire-expanded-crosshair";
  }

  private positionCityCamera() {
    this.camera.position.set(0, 1.75, 34);
    this.yaw = 0;
    this.pitch = 0;
    this.keyLookYaw = 0;
    this.keyLookPitch = 0;
    this.slopePitch = 0;
    this.velocity.set(0, 0, 0);
    this.cityVelocity.set(0, 0, 0);
    this.cityYawVelocity = 0;
    this.camera.rotation.set(0, 0, 0, "YXZ");
    this.renderer.domElement.dataset.cityCamera = "street-level-first-person";
    this.renderer.domElement.dataset.shots = "0";
    this.renderer.domElement.dataset.kills = "0";
    this.renderer.domElement.dataset.zombiesAlive = String(this.zombieRigs.length);
  }

  private fireWeapon() {
    this.shots += 1;
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(direction);
    this.shotRaycaster.set(origin, direction);
    this.shotRaycaster.far = 72;

    const targets = this.zombieRigs
      .filter((zombie) => zombie.alive)
      .flatMap((zombie) => {
        const parts: THREE.Mesh[] = [];
        zombie.group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.zombieId === zombie.id) {
            parts.push(child);
          }
        });
        return parts;
      });
    const hit = this.shotRaycaster.intersectObjects(targets, false)[0];
    const muzzle = this.muzzleWorldPosition();
    const endPoint = hit?.point ?? origin.clone().add(direction.clone().multiplyScalar(72));
    this.spawnBulletTracer(muzzle, endPoint);
    this.ejectCartridgeCase(muzzle);
    this.flashWeapon();
    this.flashCrosshair();

    if (!hit) {
      this.renderer.domElement.dataset.lastShot = "miss";
      this.renderer.domElement.dataset.shots = String(this.shots);
      return;
    }

    const hitMesh = hit.object as THREE.Mesh;
    const zombie = this.zombieRigs.find((rig) => rig.id === hitMesh.userData.zombieId);
    if (!zombie || !zombie.alive) {
      return;
    }

    const hitZone = hitMesh.userData.hitZone === "head" ? "head" : "body";
    this.spawnImpactMark(hit.point, direction);
    this.spawnImpactExplosion(hit.point, hitZone === "head" ? 26 : 12);
    if (hitZone === "head") {
      zombie.wound.visible = true;
      zombie.wound.position.copy(zombie.head.position).add(new THREE.Vector3(0.04, 0.0, -0.28));
      this.killZombie(zombie, "headshot");
    } else {
      zombie.torsoHits += 1;
      zombie.wound.visible = true;
      zombie.wound.position.set(0.1 - zombie.torsoHits * 0.08, 1.1 + zombie.torsoHits * 0.05, -0.96);
      if (zombie.torsoHits >= 3) {
        this.killZombie(zombie, "body");
      }
    }

    this.renderer.domElement.dataset.lastShot = `${hitZone}:${zombie.torsoHits}`;
    this.renderer.domElement.dataset.shots = String(this.shots);
    this.renderer.domElement.dataset.kills = String(this.kills);
    this.renderer.domElement.dataset.zombiesAlive = String(this.zombieRigs.filter((rig) => rig.alive).length);
  }

  private muzzleWorldPosition() {
    const viewModel = this.camera.children.find((child) => child.name === "city-viewmodel");
    const flash = viewModel?.children.find((child) => child.name === "muzzle-flash");
    const point = new THREE.Vector3(0.32, -0.32, -1.2);
    if (flash) {
      flash.getWorldPosition(point);
    } else {
      point.applyMatrix4(this.camera.matrixWorld);
    }
    return point;
  }

  private spawnBulletTracer(start: THREE.Vector3, end: THREE.Vector3) {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
      color: "#ffd06f",
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 8;
    this.reconGroup.add(line);
    this.tracerEffects.push({ mesh: line, life: 0.13, maxLife: 0.13 });
    this.renderer.domElement.dataset.tracer = "visible-ballistic-line";
    this.renderer.domElement.dataset.tracerCount = String(this.tracerEffects.length);
  }

  private spawnImpactMark(point: THREE.Vector3, direction: THREE.Vector3) {
    const geometry = new THREE.RingGeometry(0.12, 0.22, 20);
    const material = new THREE.MeshBasicMaterial({
      color: "#ff8a34",
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mark = new THREE.Mesh(geometry, material);
    mark.position.copy(point).addScaledVector(direction, -0.025);
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().multiplyScalar(-1).normalize());
    mark.renderOrder = 7;
    this.reconGroup.add(mark);
    this.impactMarks.push(mark);
    while (this.impactMarks.length > 24) {
      const old = this.impactMarks.shift();
      if (old) {
        this.reconGroup.remove(old);
        disposeObject(old);
      }
    }
    this.renderer.domElement.dataset.impactMarks = String(this.impactMarks.length);
  }

  private ejectCartridgeCase(muzzle: THREE.Vector3) {
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(tempVector);
    right.crossVectors(tempVector, this.camera.up).normalize().multiplyScalar(-1);
    const geometry = new THREE.CylinderGeometry(0.025, 0.025, 0.15, 10);
    const material = new THREE.MeshStandardMaterial({
      color: "#b98a37",
      emissive: "#5a3510",
      emissiveIntensity: 0.1,
      roughness: 0.34,
      metalness: 0.8
    });
    const casing = new THREE.Mesh(geometry, material);
    casing.position.copy(muzzle).add(right.clone().multiplyScalar(0.16));
    casing.rotation.z = Math.PI / 2;
    casing.castShadow = true;
    const velocity = right.multiplyScalar(1.9).add(new THREE.Vector3(0, 1.2, 0)).add(tempVector.clone().multiplyScalar(-0.35));
    this.reconGroup.add(casing);
    this.bloodParticles.push({ mesh: casing, velocity, life: 1.25, maxLife: 1.25 });
    this.renderer.domElement.dataset.cartridgeEjection = "brass-casing";
  }

  private flashWeapon() {
    const viewModel = this.camera.children.find((child) => child.name === "city-viewmodel");
    const flash = viewModel?.children.find((child) => child.name === "muzzle-flash") as THREE.Mesh | undefined;
    if (!flash || Array.isArray(flash.material) || !(flash.material instanceof THREE.MeshBasicMaterial)) {
      return;
    }
    const material = flash.material;
    material.opacity = 0.82;
    window.setTimeout(() => {
      material.opacity = 0;
    }, 70);
  }

  private flashCrosshair() {
    const reticle = this.camera.children.find((child) => child.name === "city-reticle");
    if (!reticle) {
      return;
    }
    reticle.scale.setScalar(1.32);
    reticle.children.forEach((child) => {
      if (child.name === "fire-crosshair-hot" && child instanceof THREE.Mesh && !Array.isArray(child.material) && child.material instanceof THREE.MeshBasicMaterial) {
        child.material.opacity = 1;
      }
    });
    window.setTimeout(() => {
      reticle.scale.setScalar(1);
      reticle.children.forEach((child) => {
        if (child.name === "fire-crosshair-hot" && child instanceof THREE.Mesh && !Array.isArray(child.material) && child.material instanceof THREE.MeshBasicMaterial) {
          child.material.opacity = 0;
        }
      });
    }, 90);
    this.renderer.domElement.dataset.fireCrosshair = "expanded-hot-crosshair";
  }

  private killZombie(zombie: ZombieRig, cause: "headshot" | "body") {
    zombie.alive = false;
    this.kills += 1;
    zombie.group.userData.dead = cause;
    zombie.group.rotation.x = Math.PI / 2;
    zombie.group.rotation.z = THREE.MathUtils.lerp(-0.45, 0.45, seeded(this.kills + 3800, this.activeWorld?.terrainSeed ?? 1));
    zombie.group.position.y = 0.12;
    const deadTint = new THREE.Color("#202320");
    [zombie.body, zombie.head].forEach((mesh) => {
      if (!Array.isArray(mesh.material) && mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.color.lerp(deadTint, 0.55);
        mesh.material.roughness = 0.96;
      }
    });
  }

  private spawnImpactExplosion(position: THREE.Vector3, count: number) {
    const geometry = new THREE.SphereGeometry(0.035, 8, 6);
    const material = new THREE.MeshStandardMaterial({
      color: "#ff8a2f",
      emissive: "#ff4c16",
      emissiveIntensity: 0.75,
      roughness: 0.24,
      metalness: 0.14
    });
    for (let index = 0; index < count; index += 1) {
      const mesh = new THREE.Mesh(geometry.clone(), material.clone());
      mesh.position.copy(position);
      mesh.castShadow = true;
      const spread = index / Math.max(count - 1, 1);
      const angle = seeded(index + this.shots * 97, this.activeWorld?.terrainSeed ?? 1) * Math.PI * 2;
      const lift = THREE.MathUtils.lerp(1.2, 4.4, seeded(index + this.shots * 113, this.activeWorld?.terrainSeed ?? 1));
      const lateral = THREE.MathUtils.lerp(0.4, 2.6, seeded(index + this.shots * 127, this.activeWorld?.terrainSeed ?? 1));
      const velocity = new THREE.Vector3(Math.cos(angle) * lateral * (0.45 + spread), lift, Math.sin(angle) * lateral * (0.45 + spread));
      this.reconGroup.add(mesh);
      this.bloodParticles.push({ mesh, velocity, life: 0.55 + seeded(index + 3900, this.activeWorld?.terrainSeed ?? 1) * 0.38, maxLife: 0.96 });
    }
    const burstLight = new THREE.PointLight("#ff8a34", 1.8, 6);
    burstLight.position.copy(position);
    burstLight.userData.baseIntensity = burstLight.intensity;
    this.reconGroup.add(burstLight);
    window.setTimeout(() => {
      this.reconGroup.remove(burstLight);
    }, 160);
    this.renderer.domElement.dataset.impactExplosion = "spark-burst";
    this.renderer.domElement.dataset.bloodParticles = String(this.bloodParticles.length);
  }

  private updateZombies(delta: number) {
    if (this.zombieRigs.length === 0 || this.activeWorld?.landscapeStyle !== "zombie-city") {
      return;
    }
    const elapsed = this.clock.elapsedTime;
    const player = this.camera.position;
    this.zombieRigs.forEach((zombie) => {
      if (!zombie.alive) {
        return;
      }
      const dx = player.x - zombie.group.position.x;
      const dz = player.z - zombie.group.position.z;
      const distance = Math.hypot(dx, dz) || 1;
      const desiredYaw = Math.atan2(dx, dz);
      zombie.group.rotation.y = THREE.MathUtils.damp(zombie.group.rotation.y, desiredYaw, 5.5, delta);

      if (distance > 2.2) {
        const crowdBrake = this.zombieRigs.some((other) =>
          other !== zombie &&
          other.alive &&
          Math.hypot(other.group.position.x - zombie.group.position.x, other.group.position.z - zombie.group.position.z) < 1.45
        ) ? 0.35 : 1;
        const stride = zombie.speed * (1 + Math.sin(elapsed * 1.6 + zombie.phase) * 0.18) * crowdBrake;
        zombie.group.position.x += (dx / distance) * stride * delta;
        zombie.group.position.z += (dz / distance) * stride * delta;
        zombie.group.position.x = THREE.MathUtils.clamp(zombie.group.position.x, -46, 46);
        zombie.group.position.z = THREE.MathUtils.clamp(zombie.group.position.z, -46, 46);
      }

      const sway = Math.sin(elapsed * 2.4 + zombie.phase) * 0.08;
      zombie.body.rotation.z = sway;
      zombie.head.rotation.z = -sway * 0.6;
      zombie.head.position.y = 2.34 + Math.abs(Math.sin(elapsed * 2.2 + zombie.phase)) * 0.035;
      zombie.legs.forEach((part, partIndex) => {
        const gait = Math.sin(elapsed * 4.2 + zombie.phase + partIndex * 1.57);
        part.rotation.x = gait * (partIndex < 2 ? 0.18 : 0.34);
        if (partIndex >= 2 && partIndex % 3 === 2) {
          part.position.y = 0.06 + Math.max(0, gait) * 0.035;
        }
      });
    });
    this.renderer.domElement.dataset.zombiesAlive = String(this.zombieRigs.filter((rig) => rig.alive).length);
    this.renderer.domElement.dataset.kills = String(this.kills);
    this.renderer.domElement.dataset.shots = String(this.shots);
  }

  private updateNpcs(delta: number) {
    if (this.npcRigs.length === 0 || this.activeWorld?.landscapeStyle !== "zombie-city") {
      return;
    }
    const elapsed = this.clock.elapsedTime;
    this.npcRigs.forEach((npc, index) => {
      const angle = elapsed * npc.speed * 0.18 + npc.phase;
      const target = new THREE.Vector3(
        npc.routeCenter.x + Math.cos(angle) * npc.routeRadius,
        0,
        npc.routeCenter.z + Math.sin(angle) * npc.routeRadius * 0.52
      );
      const dx = target.x - npc.group.position.x;
      const dz = target.z - npc.group.position.z;
      const distance = Math.hypot(dx, dz) || 1;
      npc.group.position.x += (dx / distance) * npc.speed * delta;
      npc.group.position.z += (dz / distance) * npc.speed * delta;
      npc.group.position.x = THREE.MathUtils.clamp(npc.group.position.x, -44, 44);
      npc.group.position.z = THREE.MathUtils.clamp(npc.group.position.z, -44, 44);
      npc.group.rotation.y = THREE.MathUtils.damp(npc.group.rotation.y, Math.atan2(dx, dz), 4, delta);
      npc.legs.forEach((part, partIndex) => {
        const gait = Math.sin(elapsed * 4.4 + npc.phase + partIndex * Math.PI);
        part.rotation.x = gait * 0.32;
      });
      npc.group.userData.routeIndex = index;
    });
    this.renderer.domElement.dataset.npcCount = String(this.npcRigs.length);
    this.renderer.domElement.dataset.npcMovement = "sidewalk-route-walkers";
  }

  private updateBloodParticles(delta: number) {
    if (this.bloodParticles.length === 0) {
      return;
    }
    for (let index = this.bloodParticles.length - 1; index >= 0; index -= 1) {
      const particle = this.bloodParticles[index];
      particle.life -= delta;
      particle.velocity.y -= 7.5 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      if (particle.mesh.position.y < 0.035) {
        particle.mesh.position.y = 0.035;
        particle.velocity.multiplyScalar(0.22);
      }
      const fade = THREE.MathUtils.clamp(particle.life / particle.maxLife, 0, 1);
      particle.mesh.scale.setScalar(THREE.MathUtils.lerp(0.35, 1.1, fade));
      if (!Array.isArray(particle.mesh.material) && particle.mesh.material instanceof THREE.MeshStandardMaterial) {
        particle.mesh.material.opacity = fade;
        particle.mesh.material.transparent = true;
      }
      if (particle.life <= 0) {
        this.reconGroup.remove(particle.mesh);
        disposeObject(particle.mesh);
        this.bloodParticles.splice(index, 1);
      }
    }
    this.renderer.domElement.dataset.bloodParticles = String(this.bloodParticles.length);
  }

  private updateTracerEffects(delta: number) {
    if (this.tracerEffects.length === 0) {
      return;
    }
    for (let index = this.tracerEffects.length - 1; index >= 0; index -= 1) {
      const tracer = this.tracerEffects[index];
      tracer.life -= delta;
      const fade = THREE.MathUtils.clamp(tracer.life / tracer.maxLife, 0, 1);
      const material = tracer.mesh.material;
      if (!Array.isArray(material) && material instanceof THREE.LineBasicMaterial) {
        material.opacity = fade;
      }
      if (tracer.life <= 0) {
        this.reconGroup.remove(tracer.mesh);
        disposeObject(tracer.mesh);
        this.tracerEffects.splice(index, 1);
      }
    }
    this.renderer.domElement.dataset.tracerCount = String(this.tracerEffects.length);
  }

  private createTerrain(world: WorldModel) {
    this.renderedBlocks = [];
    this.renderedTetraCells = [];
    const segments = world.landscapeStyle === "dolomite-spires" ? 256 : TERRAIN_SEGMENTS;
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const height = terrainHeightAt(x, z, world);
      position.setY(index, height);
      if (world.landscapeStyle === "dolomite-spires") {
        const dx = terrainHeightAt(x + 0.9, z, world) - terrainHeightAt(x - 0.9, z, world);
        const dz = terrainHeightAt(x, z + 0.9, world) - terrainHeightAt(x, z - 0.9, world);
        const terrainColor = dolomiteTerrainColor(height, Math.hypot(dx, dz), world);
        colors.push(terrainColor.r, terrainColor.g, terrainColor.b);
      }
    }
    if (colors.length > 0) {
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: materialPalette(world).surface,
      map: world.landscapeStyle === "dolomite-spires" ? createDolomiteTerrainTexture(world) : createRecursivePatternTexture(world, "terrain"),
      normalMap: world.landscapeStyle === "dolomite-spires" ? createDolomiteNormalTexture(world) : undefined,
      normalScale: world.landscapeStyle === "dolomite-spires" ? new THREE.Vector2(0.34, 0.34) : undefined,
      vertexColors: world.landscapeStyle === "dolomite-spires",
      emissive: materialPalette(world).surface,
      emissiveIntensity: world.landscapeStyle === "dolomite-spires" ? 0.025 : 0.12,
      roughness: world.landscapeStyle === "dolomite-spires" ? 0.88 : 0.86,
      metalness: world.biome === "orbital" || world.biome === "neon" ? 0.28 : 0.04,
      flatShading: false
    });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.castShadow = world.landscapeStyle === "dolomite-spires";
    terrain.receiveShadow = true;
    this.renderer.domElement.dataset.terrainRenderer = world.landscapeStyle === "dolomite-spires" ? "continuous-heightfield-256" : "standard-heightfield";
    if (world.landscapeStyle === "dolomite-spires") {
      this.renderer.domElement.dataset.mountainRenderer = "smooth-ridged-heightfield";
      this.renderer.domElement.dataset.sunShadows = "low-angle-directional";
      this.renderer.domElement.dataset.dolomiteSpireCount = "heightfield";
    }
    return terrain;
  }

  private createMatterTerrain(world: WorldModel) {
    if (world.matterMode === "tetra-lattice") {
      return this.createTetraLatticeTerrain(world);
    }
    if (world.matterMode === "fractal-blocks") {
      return this.createFractalTerrain(world);
    }
    if (world.matterMode === "metaballs") {
      return this.createMetaballTerrain(world);
    }
    return this.createTerrain(world);
  }

  private createFractalTerrain(world: WorldModel) {
    const blocks = generateFractalBlocks(world);
    this.renderedBlocks = blocks;
    this.renderedTetraCells = [];
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: createRecursivePatternTexture(world, "terrain"),
      vertexColors: true,
      emissive: materialPalette(world).surface,
      emissiveIntensity: 0.18,
      roughness: 0.78,
      metalness: world.biome === "orbital" || world.biome === "neon" ? 0.26 : 0.05
    });
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    blocks.forEach((block, index) => {
      const height = Math.max(0.6, block.top - block.base);
      const footprint = block.size * 1.012;
      matrix.compose(
        new THREE.Vector3(block.x, block.base + height / 2, block.z),
        new THREE.Quaternion(),
        new THREE.Vector3(footprint, height + 0.03, footprint)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(colorForBlock(block.material, world, block.depth, block.variance)));
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.blockCount = blocks.length;
    this.renderer.domElement.dataset.blockFootprintScale = "1.012";
    this.renderer.domElement.dataset.blockCount = String(blocks.length);
    this.renderer.domElement.dataset.blockSizes = JSON.stringify(blockSizeBuckets(blocks));
    return mesh;
  }

  private createTetraLatticeTerrain(world: WorldModel) {
    const cells = generateTetraLattice(world);
    this.renderedBlocks = [];
    this.renderedTetraCells = cells;
    const group = new THREE.Group();
    const geometry = createTriangularBrickGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: createRecursivePatternTexture(world, "tetra"),
      vertexColors: true,
      flatShading: true,
      emissive: materialPalette(world).secondary,
      emissiveIntensity: world.biome === "neon" || world.biome === "orbital" ? 0.12 : 0.04,
      roughness: 0.7,
      metalness: world.biome === "neon" || world.biome === "orbital" ? 0.34 : 0.06
    });
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    const wire = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: world.biome === "neon" || world.biome === "orbital" ? materialPalette(world).glow : materialPalette(world).snow,
        transparent: true,
        opacity: world.renderQuality === "cinematic" ? 0.22 : 0.13,
        wireframe: true,
        depthWrite: false
      }),
      cells.length
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const color = new THREE.Color();

    cells.forEach((cell, index) => {
      const base = -14;
      const vertical = Math.max(0.48, cell.top - base);
      const yaw = cell.orientation === 1 ? 0 : Math.PI;
      quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
      matrix.compose(
        new THREE.Vector3(cell.x, base, cell.z),
        quaternion,
        new THREE.Vector3(cell.size * 1.018, vertical + 0.04, cell.size * 1.018)
      );
      mesh.setMatrixAt(index, matrix);
      wire.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(colorForTetraCell(cell, world)));
    });

    mesh.instanceMatrix.needsUpdate = true;
    wire.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    group.add(wire);
    this.renderer.domElement.dataset.tetraCellCount = String(cells.length);
    this.renderer.domElement.dataset.tetraPacking = "triangular-prism-columns";
    this.renderer.domElement.dataset.tetraSizes = JSON.stringify(tetraSizeBuckets(cells));
    return group;
  }

  private createMetaballTerrain(world: WorldModel) {
    this.renderedBlocks = [];
    this.renderedTetraCells = [];
    const palette = materialPalette(world);
    const group = new THREE.Group();
    const baseTerrain = this.createTerrain(world);
    if (Array.isArray(baseTerrain.material)) {
      baseTerrain.material.forEach((material) => {
        material.transparent = true;
        material.opacity = 0.32;
      });
    } else {
      baseTerrain.material.transparent = true;
      baseTerrain.material.opacity = 0.32;
    }
    baseTerrain.renderOrder = -1;
    group.add(baseTerrain);

    const resolution = 26 + Math.min(world.fractalDepth, 8) * 3;
    const material = new THREE.MeshPhysicalMaterial({
      color: palette.surface,
      map: createRecursivePatternTexture(world, "object"),
      vertexColors: true,
      emissive: palette.secondary,
      emissiveIntensity: world.biome === "neon" || world.biome === "orbital" ? 0.1 : 0.04,
      roughness: 0.48,
      metalness: world.biome === "orbital" || world.biome === "neon" ? 0.24 : 0.04,
      clearcoat: 0.28,
      clearcoatRoughness: 0.46
    });
    const field = new MarchingCubes(resolution, material, true, true, 32000);
    field.isolation = 56;
    field.scale.set(WORLD_SIZE / 2, Math.max(11, world.terrainHeight * 1.15), WORLD_SIZE / 2);
    field.position.y = 0;
    field.reset();
    field.addPlaneY(0.8, 16);

    const color = new THREE.Color();
    const blobCount = Math.round(16 + world.density * 10 + iterationMix(world) * 14);
    for (let index = 0; index < blobCount; index += 1) {
      const angle = seeded(index + 3400, world.terrainSeed) * Math.PI * 2;
      const distance = seeded(index + 3500, world.terrainSeed) ** 0.76 * WORLD_SIZE * 0.42;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const height = terrainHeightAt(x, z, world);
      const nx = THREE.MathUtils.clamp((x / (WORLD_SIZE / 2) + 1) / 2, 0.08, 0.92);
      const ny = THREE.MathUtils.clamp((height / field.scale.y + 1) / 2, 0.18, 0.82);
      const nz = THREE.MathUtils.clamp((z / (WORLD_SIZE / 2) + 1) / 2, 0.08, 0.92);
      const strength = 0.16 + seeded(index + 3600, world.terrainSeed) * 0.32 + iterationMix(world) * 0.08;
      const tint = color.set(palette.surface).lerp(new THREE.Color(palette.secondary), seeded(index + 3700, world.terrainSeed) * 0.28);
      field.addBall(nx, ny, nz, strength, 12, tint);
    }
    field.update();
    field.castShadow = true;
    field.receiveShadow = true;
    group.add(field);

    this.renderer.domElement.dataset.metaballResolution = String(resolution);
    this.renderer.domElement.dataset.metaballCount = String(blobCount);
    this.renderer.domElement.dataset.blockCount = "";
    this.renderer.domElement.dataset.tetraCellCount = "";
    return group;
  }

  private createProceduralSky(world: WorldModel) {
    const group = new THREE.Group();
    const texture = createSkyTexture(world);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(430, 64, 32),
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false
      })
    );
    sky.renderOrder = -10;
    group.add(sky);

    skyPreset(world).bodies.forEach((body, index) => {
      const sprite = this.createCelestialSprite(body.color, body.size, body.opacity);
      sprite.position.set(body.x, body.y, body.z);
      sprite.renderOrder = -9 + index * 0.01;
      group.add(sprite);
    });

    this.renderer.domElement.dataset.skyRenderer = "procedural-celestial-dome";
    this.renderer.domElement.dataset.skyBodies = String(skyPreset(world).bodies.length);
    return group;
  }

  private createCelestialSprite(color: string, size: number, opacity: number) {
    const material = new THREE.SpriteMaterial({
      map: createGlowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(size, size, size);
    return sprite;
  }

  private createHorizonExpanse(world: WorldModel) {
    const geometry = new THREE.RingGeometry(46, 980, 192);
    geometry.rotateX(-Math.PI / 2);
    const refraction = THREE.MathUtils.clamp(world.refractionLevel, 0, 1);
    const material = new THREE.MeshPhysicalMaterial({
      color: horizonColorFor(world),
      emissive: horizonColorFor(world),
      emissiveIntensity: world.timeOfDay === "night" ? 0.18 : 0.06,
      transparent: true,
      opacity: world.biome === "volcanic" ? 0.42 : 0.34 + refraction * 0.18,
      roughness: world.biome === "desert" ? 0.62 : 0.12,
      metalness: world.biome === "orbital" || world.biome === "neon" ? 0.24 : 0.04,
      transmission: world.biome === "desert" ? 0 : refraction * 0.16,
      depthWrite: false
    });
    const horizon = new THREE.Mesh(geometry, material);
    horizon.position.y = horizonLevelFor(world);
    horizon.receiveShadow = false;
    horizon.renderOrder = -2;
    this.renderer.domElement.dataset.horizonRadius = "980";
    return horizon;
  }

  private createWater(world: WorldModel) {
    if (world.matterMode === "tetra-lattice") {
      return this.createTetraWaterSurface(world);
    }
    if (world.landscapeStyle === "dolomite-spires") {
      return this.createReflectiveWater(world);
    }

    const group = new THREE.Group();
    const refraction = THREE.MathUtils.clamp(world.refractionLevel, 0, 1);
    const waterRadius = 42;
    const baseGeometry: THREE.BufferGeometry = new THREE.CircleGeometry(waterRadius, 96);
    baseGeometry.rotateX(-Math.PI / 2);
    const baseMaterial = new THREE.MeshPhysicalMaterial({
      color: world.biome === "volcanic" ? "#f36b2f" : materialPalette(world).water,
      map: createRecursivePatternTexture(world, "water"),
      normalMap: createWaterNormalTexture(world),
      normalScale: new THREE.Vector2(0.32 + refraction * 0.42, 0.2 + refraction * 0.34),
      transparent: true,
      opacity: world.biome === "volcanic" ? 0.28 + refraction * 0.18 : 0.42 + refraction * 0.28,
      roughness: 0.04,
      metalness: 0.04,
      transmission: refraction * (world.renderQuality === "cinematic" ? 0.72 : 0.42),
      ior: 1.22 + refraction * 0.12,
      thickness: 0.85 + refraction * 3,
      clearcoat: 0.82,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.35 + refraction * 0.65,
      reflectivity: 0.55 + refraction * 0.32
    });
    const water = new THREE.Mesh(baseGeometry, baseMaterial);
    water.position.y = world.waterLevel;
    water.renderOrder = 2;
    group.add(water);
    this.waterSurfaces.push({
      mesh: water,
      baseY: world.waterLevel,
      amplitude: 0.12,
      speed: 0.58,
      phase: seeded(9700, world.terrainSeed) * Math.PI * 2
    });

    const blocks = fractalWaterBlocks(world, 0, 0, waterRadius - 4, recursionDepth(world, -1, 3, 6));
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhysicalMaterial({
      color: materialPalette(world).water,
      map: createRecursivePatternTexture(world, "water"),
      vertexColors: true,
      emissive: materialPalette(world).waterGlow,
      emissiveIntensity: world.biome === "volcanic" ? 0.32 : 0.06,
      transparent: true,
      opacity: world.biome === "volcanic" ? 0.26 + refraction * 0.16 : 0.2 + refraction * 0.18,
      roughness: 0.02,
      metalness: 0.12,
      transmission: 0.08 + refraction * 0.34,
      ior: 1.04 + refraction * 0.26,
      thickness: 0.22 + refraction * 1.4
    });
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
    const matrix = new THREE.Matrix4();
    blocks.forEach((block, index) => {
      matrix.compose(
        new THREE.Vector3(block.x, world.waterLevel + 0.08, block.z),
        new THREE.Quaternion(),
        new THREE.Vector3(block.size, 0.18, block.size)
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.registerActiveLattice(mesh, blocks.length, Math.max(8, Math.ceil(Math.sqrt(blocks.length))), world, "water");
    group.add(mesh);
    this.renderer.domElement.dataset.waterBlockCount = String(blocks.length);
    this.renderer.domElement.dataset.refractionLevel = refraction.toFixed(2);
    this.renderer.domElement.dataset.waterSurface = "fractal-lattice";
    return group;
  }

  private createReflectiveWater(world: WorldModel) {
    const group = new THREE.Group();
    const refraction = THREE.MathUtils.clamp(world.refractionLevel, 0, 1);
    const radius = 58;
    const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2, 1, 1);
    const water = new Water(geometry, {
      textureWidth: world.renderQuality === "cinematic" ? 1024 : 512,
      textureHeight: world.renderQuality === "cinematic" ? 1024 : 512,
      waterNormals: createWaterNormalTexture(world),
      sunDirection: new THREE.Vector3(-0.58, 0.42, 0.7).normalize(),
      sunColor: 0xffd2a3,
      waterColor: 0x1f6f93,
      distortionScale: 2.4 + refraction * 3.2,
      alpha: 0.76,
      fog: true
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = world.waterLevel;
    water.receiveShadow = true;
    water.renderOrder = 2;
    group.add(water);
    this.reflectiveWaterSurfaces.push({ mesh: water, speed: 0.62 });
    group.add(this.createWaterGlints(world, radius * 0.88));
    this.renderer.domElement.dataset.waterBlockCount = "0";
    this.renderer.domElement.dataset.refractionLevel = refraction.toFixed(2);
    this.renderer.domElement.dataset.waterSurface = "shader-planar-reflection";
    this.renderer.domElement.dataset.waterReflection = "render-target";
    this.renderer.domElement.dataset.causticLayer = "none";
    return group;
  }

  private createTetraWaterSurface(world: WorldModel) {
    const group = new THREE.Group();
    const refraction = THREE.MathUtils.clamp(world.refractionLevel, 0, 1);
    const blocks = fractalWaterBlocks(world, 0, 0, 42, recursionDepth(world, -1, 3, 6));
    const geometry = createTriangularBrickGeometry(true);
    const material = new THREE.MeshPhysicalMaterial({
      color: materialPalette(world).water,
      map: createRecursivePatternTexture(world, "water"),
      vertexColors: true,
      emissive: materialPalette(world).waterGlow,
      emissiveIntensity: world.biome === "volcanic" ? 0.34 : 0.08,
      transparent: true,
      opacity: world.biome === "volcanic" ? 0.3 + refraction * 0.15 : 0.22 + refraction * 0.22,
      roughness: 0.03,
      metalness: 0.1,
      transmission: 0.1 + refraction * 0.36,
      ior: 1.04 + refraction * 0.26,
      thickness: 0.22 + refraction * 1.2
    });
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length * 2);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();

    blocks.forEach((block, index) => {
      const scale = new THREE.Vector3(block.size * 1.06, 0.2, block.size * 1.06);
      quaternion.setFromEuler(new THREE.Euler(0, 0, 0));
      matrix.compose(new THREE.Vector3(block.x - block.size * 0.25, world.waterLevel + 0.1, block.z), quaternion, scale);
      mesh.setMatrixAt(index * 2, matrix);
      quaternion.setFromEuler(new THREE.Euler(0, Math.PI, 0));
      matrix.compose(new THREE.Vector3(block.x + block.size * 0.25, world.waterLevel + 0.1, block.z), quaternion, scale);
      mesh.setMatrixAt(index * 2 + 1, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    this.registerActiveLattice(mesh, blocks.length * 2, Math.max(8, Math.ceil(Math.sqrt(blocks.length * 2))), world, "water");
    mesh.renderOrder = 1;
    group.add(mesh);
    this.renderer.domElement.dataset.waterBlockCount = String(blocks.length * 2);
    this.renderer.domElement.dataset.refractionLevel = refraction.toFixed(2);
    this.renderer.domElement.dataset.waterPacking = "triangular";
    return group;
  }

  private createDolomiteSpireField(world: WorldModel) {
    const group = new THREE.Group();
    const palette = materialPalette(world);
    const limestone = new THREE.MeshStandardMaterial({
      color: palette.stone,
      map: createRecursivePatternTexture(world, "terrain"),
      emissive: palette.surface,
      emissiveIntensity: 0.04,
      roughness: 0.86,
      metalness: 0.02,
      flatShading: true
    });
    const snow = new THREE.MeshStandardMaterial({
      color: palette.snow,
      emissive: "#f4f7f1",
      emissiveIntensity: 0.08,
      roughness: 0.74
    });
    const needleGeometry = new THREE.ConeGeometry(1, 1, 7, 5);
    const capGeometry = new THREE.ConeGeometry(1, 1, 7, 2);
    const count = world.renderQuality === "cinematic" ? 44 : 28;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const needleMesh = new THREE.InstancedMesh(needleGeometry, limestone, count);
    const capMesh = new THREE.InstancedMesh(capGeometry, snow, Math.ceil(count * 0.45));
    let capIndex = 0;

    for (let index = 0; index < count; index += 1) {
      const band = index % 3;
      const angle = seeded(index + 4100, world.terrainSeed) * Math.PI * 2 + band * 0.38;
      const distance = THREE.MathUtils.lerp(14, 43, seeded(index + 4200, world.terrainSeed) ** 0.62);
      let x = Math.cos(angle) * distance + Math.sin(index * 1.7) * 5;
      let z = Math.sin(angle) * distance + Math.cos(index * 1.3) * 5;
      if (Math.hypot(x + 20, z - 20) < 16 || distanceToSegment2D(x, z, -22, 22, 8, -18) < 12) {
        const shiftedAngle = angle + Math.PI * 0.42;
        x = Math.cos(shiftedAngle) * Math.max(distance, 30);
        z = Math.sin(shiftedAngle) * Math.max(distance, 30);
      }
      const baseY = this.surfaceHeightAt(x, z, world);
      const height = THREE.MathUtils.lerp(6.5, 24, seeded(index + 4300, world.terrainSeed)) * (band === 0 ? 1.24 : 1);
      const radius = THREE.MathUtils.lerp(1.2, 4.4, seeded(index + 4400, world.terrainSeed));
      const tilt = new THREE.Euler(
        THREE.MathUtils.lerp(-0.1, 0.1, seeded(index + 4500, world.terrainSeed)),
        angle + seeded(index + 4600, world.terrainSeed) * 0.8,
        THREE.MathUtils.lerp(-0.12, 0.12, seeded(index + 4700, world.terrainSeed))
      );
      quaternion.setFromEuler(tilt);
      matrix.compose(
        new THREE.Vector3(x, baseY + height / 2 - radius * 0.2, z),
        quaternion,
        new THREE.Vector3(radius, height, radius * THREE.MathUtils.lerp(0.56, 1.04, seeded(index + 4800, world.terrainSeed)))
      );
      needleMesh.setMatrixAt(index, matrix);

      if (capIndex < capMesh.count && height > 13 && seeded(index + 4900, world.terrainSeed) > 0.36) {
        matrix.compose(
          new THREE.Vector3(x, baseY + height - radius * 0.05, z),
          quaternion,
          new THREE.Vector3(radius * 0.54, height * 0.16, radius * 0.45)
        );
        capMesh.setMatrixAt(capIndex, matrix);
        capIndex += 1;
      }
    }

    needleMesh.instanceMatrix.needsUpdate = true;
    capMesh.instanceMatrix.needsUpdate = true;
    needleMesh.castShadow = true;
    needleMesh.receiveShadow = true;
    capMesh.castShadow = true;
    group.add(needleMesh);
    group.add(capMesh);
    this.renderer.domElement.dataset.dolomiteSpireCount = String(count);
    return group;
  }

  private createWaterGlints(world: WorldModel, radius: number) {
    const group = new THREE.Group();
    const texture = createGlowTexture();
    const count = world.landscapeStyle === "dolomite-spires" ? 18 : world.renderQuality === "cinematic" ? 34 : 18;
    for (let index = 0; index < count; index += 1) {
      const angle = seeded(index + 6000, world.terrainSeed) * Math.PI * 2;
      const distance = radius * Math.sqrt(seeded(index + 6100, world.terrainSeed)) * 0.88;
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: world.timeOfDay === "dusk" ? "#ffd49a" : "#f4fbff",
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(Math.cos(angle) * distance, world.waterLevel + 0.28, Math.sin(angle) * distance);
      const size = 0.55 + seeded(index + 6200, world.terrainSeed) * (world.landscapeStyle === "dolomite-spires" ? 1.5 : 2.8);
      sprite.scale.set(size * 2.1, size * 0.3, size);
      sprite.renderOrder = 4;
      group.add(sprite);
      this.waterGlints.push({
        sprite,
        baseOpacity: world.landscapeStyle === "dolomite-spires" ? 0.06 + seeded(index + 6300, world.terrainSeed) * 0.16 : 0.1 + seeded(index + 6300, world.terrainSeed) * 0.28,
        phase: seeded(index + 6400, world.terrainSeed) * Math.PI * 2,
        speed: 1.8 + seeded(index + 6500, world.terrainSeed) * 2.4
      });
    }
    this.renderer.domElement.dataset.waterGlintCount = String(count);
    return group;
  }

  private createCloudField(world: WorldModel) {
    const atmosphere = atmosphereMix(world);
    const cloudCount = Math.round(4 + atmosphere * 5 + iterationMix(world) * 4);
    const puffs = [];

    for (let cloud = 0; cloud < cloudCount; cloud += 1) {
      const angle = seeded(cloud + 700, world.terrainSeed) * Math.PI * 2;
      const distance = 20 + seeded(cloud + 710, world.terrainSeed) * 54;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const y = 28 + seeded(cloud + 720, world.terrainSeed) * 18;
      puffs.push(...fractalCloudBlocks(world, x, y, z, 5 + seeded(cloud + 730, world.terrainSeed) * 6, recursionDepth(world, -2, 3, 6)));
    }

    const geometry = new THREE.SphereGeometry(1, 12, 8);
    const material = new THREE.MeshStandardMaterial({
      color: cloudColorFor(world),
      emissive: "#f6fbff",
      emissiveIntensity: 0.06 + atmosphere * 0.12,
      transparent: true,
      opacity: (world.weather === "clear" ? 0.1 : 0.16) + atmosphere * (world.weather === "clear" ? 0.13 : 0.18),
      roughness: 0.98,
      depthWrite: false
    });
    const mesh = new THREE.InstancedMesh(geometry, material, puffs.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();

    puffs.forEach((puff, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, puff.rotation, 0));
      matrix.compose(
        new THREE.Vector3(puff.x, puff.y, puff.z),
        quaternion,
        new THREE.Vector3(puff.size * 2.25, puff.size * 0.62, puff.size * 1.35)
      );
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = -1;
    this.renderer.domElement.dataset.cloudBlockCount = String(puffs.length);
    this.renderer.domElement.dataset.cloudOpacity = material.opacity.toFixed(2);
    return mesh;
  }

  private createLensFlares(world: WorldModel) {
    const group = new THREE.Group();
    const atmosphere = atmosphereMix(world);
    if (world.renderQuality !== "cinematic" || atmosphere < 0.04) {
      this.renderer.domElement.dataset.flareCount = "0";
      return group;
    }

    const texture = createGlowTexture();
    const positions = [
      { x: -24, y: 34, z: -32, size: 12, opacity: 0.5 },
      { x: -12, y: 20, z: -15, size: 3.6, opacity: 0.28 },
      { x: 4, y: 13, z: 2, size: 2.1, opacity: 0.22 },
      { x: 18, y: 8, z: 18, size: 1.4, opacity: 0.18 }
    ];

    positions.forEach((flare) => {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: materialPalette(world).glow,
        transparent: true,
        opacity: flare.opacity * (0.22 + atmosphere * 0.78),
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(flare.x, flare.y, flare.z);
      sprite.scale.set(flare.size, flare.size, flare.size);
      group.add(sprite);
    });

    this.renderer.domElement.dataset.flareCount = String(positions.length);
    return group;
  }

  private addProceduralDetails(world: WorldModel) {
    const count = Math.round(8 + world.density * 32 + iterationMix(world) * 18);
    const detailKinds = world.biome === "forest" ? ["tree", "tree", "crystal"] : world.biome === "alpine" ? ["tree", "ridge", "beacon"] : ["crystal", "platform", "monolith"];
    for (let index = 0; index < count; index += 1) {
      const angle = seeded(index, world.terrainSeed) * Math.PI * 2;
      const distance = 8 + seeded(index + 100, world.terrainSeed) * 38;
      const kind = detailKinds[index % detailKinds.length] as WorldEntity["kind"];
      const entity: WorldEntity = {
        id: `detail-${index}`,
        kind,
        label: "Procedural Detail",
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
        height: 1.8 + seeded(index + 40, world.terrainSeed) * 5,
        radius: 0.35 + seeded(index + 10, world.terrainSeed) * 1.2,
        color: index % 5 === 0 ? materialPalette(world).secondary : materialPalette(world).surface,
        glow: index % 7 === 0 ? 0.35 : 0
      };
      this.reconGroup.add(this.createEntity(entity, world, true));
    }
  }

  private createRecursiveWorldMotifs(world: WorldModel) {
    const group = new THREE.Group();
    const count = Math.round((world.renderQuality === "cinematic" ? 7 : 5) + iterationMix(world) * 5);
    const material = new THREE.MeshStandardMaterial({
      color: motifColorFor(world),
      map: createRecursivePatternTexture(world, world.matterMode === "tetra-lattice" ? "tetra" : "object"),
      emissive: materialPalette(world).secondary,
      emissiveIntensity: world.biome === "neon" || world.biome === "volcanic" ? 0.22 : 0.07,
      roughness: 0.7,
      metalness: world.biome === "neon" || world.biome === "orbital" ? 0.36 : 0.05
    });

    for (let index = 0; index < count; index += 1) {
      const angle = seeded(index + 860, world.terrainSeed) * Math.PI * 2;
      const distance = 13 + seeded(index + 870, world.terrainSeed) * 34;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const motif = new THREE.Group();
      motif.position.set(x, this.surfaceHeightAt(x, z, world) + 0.08, z);
      motif.rotation.y = angle + seeded(index + 880, world.terrainSeed) * Math.PI;

      if (world.biome === "alpine") {
        this.addRecursiveCairn(motif, material, 0, 0, 0, 2.8 + seeded(index, world.terrainSeed) * 1.8, recursionDepth(world, -2, 2, 5));
      } else if (world.biome === "desert") {
        this.addDuneRibs(motif, material, 4.2 + seeded(index, world.terrainSeed) * 2.8, recursionDepth(world, -2, 2, 5));
      } else if (world.biome === "volcanic") {
        this.addBranchingBasalt(motif, material, 0, 0, 0, 4.2 + seeded(index, world.terrainSeed) * 2.4, recursionDepth(world, -2, 2, 5));
      } else if (world.biome === "neon" || world.biome === "orbital") {
        this.addRecursiveLattice(motif, material, 0, 1.4, 0, 4.2 + seeded(index, world.terrainSeed) * 2.4, recursionDepth(world, -2, 2, 5));
      } else {
        this.addRecursiveReef(motif, material, 0, 0, 0, 3.4 + seeded(index, world.terrainSeed) * 2, recursionDepth(world, -2, 2, 5));
      }

      group.add(motif);
    }

    this.renderer.domElement.dataset.motifCount = String(count);
    return group;
  }

  private addRecursiveCairn(group: THREE.Group, material: THREE.Material, x: number, y: number, z: number, size: number, depth: number) {
    group.add(this.createBlock(material, x, y + size * 0.18, z, size, size * 0.36, size * 0.72, depth * 0.34));
    if (depth <= 0 || size < 0.5) {
      return;
    }
    this.addRecursiveCairn(group, material, x + size * 0.08, y + size * 0.38, z - size * 0.04, size * 0.62, depth - 1);
    this.addRecursiveCairn(group, material, x - size * 0.22, y + size * 0.26, z + size * 0.28, size * 0.38, depth - 1);
  }

  private addDuneRibs(group: THREE.Group, material: THREE.Material, size: number, depth: number) {
    const ribs = 5 + depth * 2;
    for (let index = 0; index < ribs; index += 1) {
      const t = index / Math.max(ribs - 1, 1);
      const x = (t - 0.5) * size * 2.4;
      const crest = Math.sin(t * Math.PI);
      group.add(this.createBlock(material, x, 0.12 + crest * 0.22, Math.sin(t * Math.PI * 2) * size * 0.16, size * 0.18, 0.22 + crest * 0.42, size * (0.95 - depth * 0.08), t * 0.5));
    }
    if (depth <= 0) {
      return;
    }
    const child = size * 0.56;
    const nested = new THREE.Group();
    nested.position.set(size * 0.24, 0.24, size * 0.32);
    nested.rotation.y = -0.62;
    group.add(nested);
    this.addDuneRibs(nested, material, child, depth - 1);
  }

  private addBranchingBasalt(group: THREE.Group, material: THREE.Material, x: number, y: number, z: number, size: number, depth: number) {
    group.add(this.createBlock(material, x, y + size * 0.35, z, size * 0.28, size * 0.7, size * 0.28, depth * 0.18));
    if (depth <= 0 || size < 0.55) {
      return;
    }
    [-0.8, 0.2, 0.95].forEach((rotation, index) => {
      const childSize = size * (0.46 + index * 0.06);
      const dx = Math.cos(rotation) * size * 0.42;
      const dz = Math.sin(rotation) * size * 0.42;
      this.addBranchingBasalt(group, material, x + dx, y + size * 0.42, z + dz, childSize, depth - 1);
    });
  }

  private addRecursiveLattice(group: THREE.Group, material: THREE.Material, x: number, y: number, z: number, size: number, depth: number) {
    group.add(this.createBlock(material, x, y, z, size, size * 0.12, size * 0.12, depth * Math.PI / 6));
    group.add(this.createBlock(material, x, y, z, size * 0.12, size * 0.12, size, depth * Math.PI / 6));
    group.add(this.createBlock(material, x, y + size * 0.24, z, size * 0.18, size * 0.48, size * 0.18, depth * Math.PI / 4));
    if (depth <= 0 || size < 0.7) {
      return;
    }
    const child = size * 0.52;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      this.addRecursiveLattice(group, material, x + sx * size * 0.34, y + size * 0.18, z + sz * size * 0.34, child, depth - 1);
    });
  }

  private addRecursiveReef(group: THREE.Group, material: THREE.Material, x: number, y: number, z: number, size: number, depth: number) {
    group.add(this.createBlock(material, x, y + size * 0.24, z, size * 0.32, size * 0.48, size * 0.32, depth * 0.42, depth * 0.16));
    if (depth <= 0 || size < 0.45) {
      return;
    }
    const children = 3;
    for (let index = 0; index < children; index += 1) {
      const angle = (index / children) * Math.PI * 2 + depth * 0.38;
      this.addRecursiveReef(group, material, x + Math.cos(angle) * size * 0.42, y + size * 0.32, z + Math.sin(angle) * size * 0.42, size * 0.52, depth - 1);
    }
  }

  private createEntity(entity: WorldEntity, world: WorldModel, procedural = false) {
    const group = new THREE.Group();
    const y = this.entityGroundHeight(entity, world, procedural);
    group.position.set(entity.x, y, entity.z);
    const objectColor = objectColorForEntity(entity, world, procedural);
    const glowColor = glowColorForEntity(entity, world);

    const material = new THREE.MeshStandardMaterial({
      color: objectColor,
      map: createRecursivePatternTexture(world, entity.kind === "crystal" || entity.kind === "portal" ? "spiral" : "object"),
      emissive: glowColor,
      emissiveIntensity: entity.glow > 0.4 ? entity.glow * 0.74 : (procedural ? 0.045 : 0.075),
      metalness: world.biome === "orbital" || world.biome === "neon" ? 0.45 : 0.12,
      roughness: entity.kind === "crystal" || entity.kind === "portal" ? 0.36 : 0.64
    });

    if (entity.kind === "tower" || entity.kind === "beacon" || entity.kind === "monolith") {
      if (!procedural) group.add(this.createGroundFooting(entity, world, material, y));
      group.add(this.createFractalSpire(entity, world, material));
    } else if (entity.kind === "portal") {
      group.add(this.createGroundFooting(entity, world, material, y));
      group.add(this.createBlockPortal(entity, world));
      this.addPointLight(entity, group, entity.height / 2, 1.8, glowColor);
    } else if (entity.kind === "tendril") {
      group.add(this.createGroundFooting(entity, world, material, y));
      group.add(this.createTendrilCluster(entity, world));
    } else if (entity.kind === "tree") {
      group.add(this.createFractalTree(entity, world, procedural));
    } else if (entity.kind === "castle" || entity.kind === "cathedral" || entity.kind === "mosque" || entity.kind === "tent" || entity.kind === "stoneCircle") {
      group.add(this.createGroundFooting(entity, world, material, y));
      group.add(this.createLandmarkStructure(entity, world));
    } else if (entity.kind === "habitat" || entity.kind === "platform") {
      if (!procedural) group.add(this.createGroundFooting(entity, world, material, y));
      group.add(this.createFractalHabitat(entity, world, material));
    } else if (entity.kind === "water") {
      if (world.matterMode === "tetra-lattice") {
        group.add(this.createTetraWaterFeature(entity, world));
        return group;
      }
      const geometry = entity.kind === "water"
        ? new THREE.CylinderGeometry(entity.radius, entity.radius, 0.3, 48)
        : new THREE.CylinderGeometry(entity.radius, entity.radius * 1.1, entity.height, 12);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = entity.height / 2;
      mesh.castShadow = true;
      group.add(mesh);
    } else if (entity.kind === "ridge") {
      group.add(this.createFractalRidge(entity, world, material));
    } else {
      group.add(this.createCrystalCluster(entity, world));
    }

    if (entity.glow > 0.45 && !procedural) {
      this.addPointLight(entity, group, entity.height, 1.2, glowColor);
    }

    if (!procedural && entity.kind !== "water") {
      this.registerEntityCollider(entity, y);
    }

    return group;
  }

  private createGroundFooting(entity: WorldEntity, world: WorldModel, material: THREE.Material, anchorY: number) {
    const group = new THREE.Group();
    const radius = Math.max(entity.radius, 1.2);
    const samples = this.supportSamples(radius);
    const heights = samples.map(([dx, dz]) => this.surfaceHeightAt(entity.x + dx, entity.z + dz, world));
    const lowest = Math.min(...heights);
    const drop = Math.max(0.26, anchorY - lowest + 0.48);
    const width = Math.max(radius * 1.55, 1.6);
    group.add(this.createBlock(material, 0, -drop / 2, 0, width, drop, width, entity.kind === "portal" ? Math.PI / 4 : 0, 0, false));
    return group;
  }

  private entityGroundHeight(entity: WorldEntity, world: WorldModel, procedural: boolean) {
    const center = this.surfaceHeightAt(entity.x, entity.z, world);
    if (procedural || entity.radius < 1 || entity.kind === "water") {
      return center;
    }

    const heights = this.supportSamples(Math.max(entity.radius, 1.2))
      .map(([dx, dz]) => this.surfaceHeightAt(entity.x + dx, entity.z + dz, world))
      .sort((a, b) => a - b);
    const lowSupport = heights[Math.max(0, Math.floor((heights.length - 1) * 0.28))];
    return Math.min(center, lowSupport + 0.14);
  }

  private supportSamples(radius: number): Array<[number, number]> {
    const axial = radius * 0.72;
    const diagonal = radius * 0.5;
    return [
      [0, 0],
      [axial, 0],
      [-axial, 0],
      [0, axial],
      [0, -axial],
      [diagonal, diagonal],
      [-diagonal, diagonal],
      [diagonal, -diagonal],
      [-diagonal, -diagonal]
    ];
  }

  private registerEntityCollider(entity: WorldEntity, baseY: number) {
    const radiusScale = entity.kind === "ridge" ? 0.55 : entity.kind === "tree" ? 0.7 : entity.kind === "stoneCircle" ? 1.05 : 0.86;
    this.colliders.push({
      x: entity.x,
      z: entity.z,
      radius: Math.max(0.72, entity.radius * radiusScale),
      baseY,
      height: Math.max(2.2, entity.height + EYE_HEIGHT * 0.45)
    });
    this.renderer.domElement.dataset.colliderCount = String(this.colliders.length);
  }

  private createTetraWaterFeature(entity: WorldEntity, world: WorldModel) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({
      color: materialPalette(world).water,
      map: createRecursivePatternTexture(world, "water"),
      vertexColors: true,
      emissive: materialPalette(world).waterGlow,
      emissiveIntensity: world.biome === "volcanic" ? 0.32 : 0.08,
      transparent: true,
      opacity: 0.26 + world.refractionLevel * 0.2,
      roughness: 0.03,
      transmission: 0.12 + world.refractionLevel * 0.35,
      ior: 1.05 + world.refractionLevel * 0.25,
      thickness: 0.18 + world.refractionLevel
    });
    const radius = entity.radius;
    const rows = 6 + Math.min(world.fractalDepth, 8);
    const brick = radius / rows;
    const triangleHeight = brick * Math.sqrt(3) * 0.5;
    for (let row = -rows; row <= rows; row += 1) {
      for (let column = -rows; column <= rows; column += 1) {
        const x = column * brick + (row % 2 === 0 ? 0 : brick / 2);
        const z = row * triangleHeight;
        if (Math.hypot(x, z) > radius) {
          continue;
        }
        group.add(this.createBlock(material, x, 0.08, z, brick * 1.04, 0.16, brick * 1.04, (row + column) % 2 === 0 ? 0 : Math.PI));
      }
    }
    return group;
  }

  private createFractalSpire(entity: WorldEntity, world: WorldModel, material: THREE.Material) {
    const group = new THREE.Group();
    const levels = entity.kind === "monolith" ? 7 : 6;
    const base = entity.radius * (entity.kind === "beacon" ? 1.4 : 1.9);
    const segmentHeight = entity.height / levels;

    for (let level = 0; level < levels; level += 1) {
      const taper = Math.pow(entity.kind === "monolith" ? 0.82 : 0.76, level);
      const width = Math.max(base * taper, 0.42);
      const y = segmentHeight * level + segmentHeight / 2;
      const offset = level % 2 === 0 ? 0 : width * 0.16;
      group.add(this.createBlock(material, offset, y, -offset * 0.6, width, segmentHeight * 1.05, width, level * 0.18));

      if (level > 0 && level < levels - 1) {
        const satellite = width * 0.38;
        const arm = width * 0.78;
        group.add(this.createBlock(material, arm, y + segmentHeight * 0.12, 0, satellite, satellite, satellite, level * 0.6));
        group.add(this.createBlock(material, 0, y - segmentHeight * 0.1, -arm, satellite, satellite, satellite, -level * 0.45));
      }
    }

    if (entity.kind === "beacon") {
      const glowColor = glowColorForEntity(entity, world);
      const glowMaterial = new THREE.MeshStandardMaterial({
        color: glowColor,
        map: createRecursivePatternTexture(world, "spiral"),
        emissive: glowColor,
        emissiveIntensity: world.biome === "neon" ? 1.2 : 0.9,
        roughness: 0.35
      });
      group.add(this.createBlock(glowMaterial, 0, entity.height + 0.55, 0, entity.radius * 0.72, entity.radius * 0.72, entity.radius * 0.72, Math.PI / 4, Math.PI / 4));
    }

    return group;
  }

  private createBlockPortal(entity: WorldEntity, world: WorldModel) {
    const group = new THREE.Group();
    const palette = materialPalette(world);
    const glowColor = glowColorForEntity(entity, world);
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: palette.portalFrame,
      map: createRecursivePatternTexture(world, "spiral"),
      emissive: glowColor,
      emissiveIntensity: world.biome === "neon" ? 0.72 : 0.5,
      metalness: 0.35,
      roughness: 0.38
    });
    const voidMaterial = new THREE.MeshBasicMaterial({ color: world.skyColor, transparent: true, opacity: 0.36 });
    const unit = Math.max(entity.radius * 0.34, 0.55);
    const halfWidth = entity.radius * 0.92;
    const height = entity.height;

    for (let level = 0; level < 3; level += 1) {
      const shrink = 1 - level * 0.18;
      const block = unit * (1 - level * 0.15);
      const x = halfWidth * shrink;
      const yOffset = level * unit * 0.52;
      for (let row = 0; row < 5 - level; row += 1) {
        const y = unit * 0.6 + yOffset + row * block * 1.08;
        group.add(this.createBlock(frameMaterial, -x, y, 0, block, block, block * 0.9));
        group.add(this.createBlock(frameMaterial, x, y, 0, block, block, block * 0.9));
      }
      for (let column = -1; column <= 1; column += 1) {
        group.add(this.createBlock(frameMaterial, column * x * 0.55, height * shrink + yOffset, 0, block, block, block * 0.9));
      }
    }

    group.add(this.createBlock(voidMaterial, 0, height * 0.52, 0.02, halfWidth * 1.18, height * 0.72, 0.08));
    return group;
  }

  private createFractalHabitat(entity: WorldEntity, world: WorldModel, material: THREE.Material) {
    const group = new THREE.Group();
    const module = entity.radius * 0.82;
    const levels = entity.kind === "platform" ? 2 : 3;
    group.add(this.createBlock(material, 0, entity.height * 0.28, 0, module * 1.7, entity.height * 0.56, module * 1.55));

    for (let level = 0; level < levels; level += 1) {
      const scale = Math.pow(0.62, level);
      const width = module * scale;
      const y = entity.height * 0.56 + level * width * 0.45;
      const span = module * (1.1 + level * 0.56);
      const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      rotations.forEach((rotation, index) => {
        const x = Math.cos(rotation) * span;
        const z = Math.sin(rotation) * span;
        group.add(this.createBlock(material, x, y, z, width * 1.24, width * 0.62, width, rotation));
        if (level === levels - 1 && index % 2 === 0) {
          group.add(this.createBlock(material, x * 1.32, y + width * 0.42, z * 1.32, width * 0.52, width * 0.52, width * 0.52, rotation + 0.4));
        }
      });
    }

    if (world.biome === "orbital" || world.biome === "neon") {
      const glowColor = materialPalette(world).glow;
      const lightMaterial = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 0.62 });
      group.add(this.createBlock(lightMaterial, 0, entity.height + 0.3, 0, module * 0.5, 0.16, module * 0.5));
    }

    return group;
  }

  private createFractalRidge(entity: WorldEntity, world: WorldModel, material: THREE.Material) {
    const group = new THREE.Group();
    const count = 9;
    const step = (entity.radius * 2) / count;
    for (let index = 0; index < count; index += 1) {
      const t = index / Math.max(count - 1, 1);
      const crest = Math.sin(t * Math.PI);
      const variance = seeded(index + Math.round(entity.x * 10), world.terrainSeed);
      const height = entity.height * (0.34 + crest * 0.7 + variance * 0.22);
      const x = (index - (count - 1) / 2) * step;
      group.add(this.createBlock(material, x, height / 2, 0, step * 1.08, height, step * (0.75 + variance * 0.4), 0.12 * index));
      if (index % 2 === 0) {
        group.add(this.createBlock(material, x + step * 0.22, height + step * 0.28, -step * 0.24, step * 0.5, step * 0.55, step * 0.5, -0.25 * index));
      }
    }
    return group;
  }

  private createCrystalCluster(entity: WorldEntity, world: WorldModel) {
    const group = new THREE.Group();
    const glowColor = glowColorForEntity(entity, world);
    const material = new THREE.MeshStandardMaterial({
      color: materialPalette(world).crystal,
      map: createRecursivePatternTexture(world, "spiral"),
      emissive: glowColor,
      emissiveIntensity: Math.max(entity.glow * 0.82, 0.36),
      metalness: 0.18,
      roughness: 0.18
    });
    const count = Math.round((world.renderQuality === "cinematic" ? 6 : 4) + iterationMix(world) * 4);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const distance = index === 0 ? 0 : entity.radius * (0.45 + seeded(index, world.terrainSeed) * 1.2);
      const height = entity.height * (index === 0 ? 1 : 0.35 + seeded(index + 3, world.terrainSeed) * 0.58);
      const width = entity.radius * (0.45 + seeded(index + 9, world.terrainSeed) * 0.35);
      group.add(this.createBlock(material, Math.cos(angle) * distance, height / 2, Math.sin(angle) * distance, width, height, width, angle, 0.18 + seeded(index + 11, world.terrainSeed) * 0.28));
    }
    return group;
  }

  private createLandmarkStructure(entity: WorldEntity, world: WorldModel) {
    const group = new THREE.Group();
    const palette = materialPalette(world);
    const stone = new THREE.MeshStandardMaterial({
      color: palette.architecture,
      map: createRecursivePatternTexture(world, world.matterMode === "tetra-lattice" ? "tetra" : "terrain"),
      emissive: palette.surface,
      emissiveIntensity: 0.08,
      roughness: 0.74,
      metalness: 0.05
    });
    const accent = new THREE.MeshStandardMaterial({
      color: accentColorForLandmark(entity, world),
      map: createRecursivePatternTexture(world, "object"),
      emissive: glowColorForEntity(entity, world),
      emissiveIntensity: world.biome === "neon" ? Math.max(entity.glow, 0.18) : Math.max(entity.glow * 0.42, 0.08),
      roughness: 0.58
    });

    if (entity.kind === "castle") {
      const r = entity.radius;
      group.add(this.createBlock(stone, 0, 2.2, 0, r * 1.3, 4.4, r * 1.05));
      [[-r, -r], [r, -r], [-r, r], [r, r]].forEach(([x, z], index) => {
        group.add(this.createBlock(stone, x, 3.1, z, r * 0.44, 6.2, r * 0.44));
        group.add(this.createBlock(accent, x, 6.55, z, r * 0.52, 0.55, r * 0.52, index * 0.4));
      });
      for (let side = 0; side < 4; side += 1) {
        const rotation = side * Math.PI / 2;
        for (let index = -2; index <= 2; index += 1) {
          const x = Math.cos(rotation) * r + Math.sin(rotation) * index * r * 0.34;
          const z = Math.sin(rotation) * r - Math.cos(rotation) * index * r * 0.34;
          group.add(this.createBlock(stone, x, 2.4, z, r * 0.3, 4.1, r * 0.28, rotation));
          if (index % 2 === 0) {
            group.add(this.createBlock(stone, x, 4.85, z, r * 0.26, 0.58, r * 0.32, rotation));
          }
        }
      }
    } else if (entity.kind === "cathedral") {
      const r = entity.radius;
      group.add(this.createBlock(stone, 0, 2.3, 0, r * 0.92, 4.6, r * 1.95));
      group.add(this.createBlock(stone, 0, 5.3, 0, r * 0.52, 2.2, r * 2.12));
      [-r * 0.58, r * 0.58].forEach((x) => {
        group.add(this.createBlock(stone, x, 4.4, -r * 0.95, r * 0.38, 8.8, r * 0.38));
        group.add(this.createBlock(accent, x, 9.05, -r * 0.95, r * 0.3, 0.75, r * 0.3, Math.PI / 4, Math.PI / 4));
      });
      for (let rib = -3; rib <= 3; rib += 1) {
        const z = rib * r * 0.27;
        const height = entity.height * (0.42 + (3 - Math.abs(rib)) * 0.055);
        group.add(this.createBlock(stone, -r * 0.62, height / 2, z, r * 0.14, height, r * 0.12));
        group.add(this.createBlock(stone, r * 0.62, height / 2, z, r * 0.14, height, r * 0.12));
        group.add(this.createBlock(accent, 0, height + r * 0.1, z, r * 0.92, r * 0.16, r * 0.12));
      }
    } else if (entity.kind === "mosque") {
      const r = entity.radius;
      group.add(this.createBlock(stone, 0, 2.1, 0, r * 1.45, 4.2, r * 1.45));
      for (let layer = 0; layer < 5; layer += 1) {
        const scale = 1 - layer * 0.15;
        group.add(this.createBlock(accent, 0, 4.45 + layer * r * 0.13, 0, r * scale, r * 0.22, r * scale, layer * Math.PI / 8));
      }
      [-1, 1].forEach((side) => {
        group.add(this.createBlock(stone, side * r * 1.06, 3.4, -r * 0.8, r * 0.25, 6.8, r * 0.25));
        group.add(this.createBlock(accent, side * r * 1.06, 7.05, -r * 0.8, r * 0.18, 0.55, r * 0.18, Math.PI / 4, Math.PI / 4));
      });
    } else if (entity.kind === "tent") {
      const r = entity.radius;
      for (let layer = 0; layer < 6; layer += 1) {
        const scale = 1 - layer * 0.13;
        const y = layer * 0.58 + 0.38;
        group.add(this.createBlock(accent, 0, y, 0, r * 1.7 * scale, 0.58, r * (1.05 + layer * 0.04), 0, layer % 2 === 0 ? 0.18 : -0.18));
      }
      group.add(this.createBlock(stone, 0, 2.15, -r * 0.64, r * 0.14, 4.3, r * 0.14));
      group.add(this.createBlock(stone, 0, 2.15, r * 0.64, r * 0.14, 4.3, r * 0.14));
    } else {
      const stones = 12;
      for (let index = 0; index < stones; index += 1) {
        const angle = (index / stones) * Math.PI * 2;
        const x = Math.cos(angle) * entity.radius;
        const z = Math.sin(angle) * entity.radius;
        const h = entity.height * (0.75 + seeded(index, world.terrainSeed) * 0.5);
        group.add(this.createBlock(stone, x, h / 2, z, entity.radius * 0.18, h, entity.radius * 0.26, -angle));
        if (index % 3 === 0) {
          group.add(this.createBlock(accent, Math.cos(angle + 0.13) * entity.radius, h + 0.32, Math.sin(angle + 0.13) * entity.radius, entity.radius * 0.55, 0.38, entity.radius * 0.22, -angle));
        }
      }
    }

    this.renderer.domElement.dataset.landmarkCount = String((Number(this.renderer.domElement.dataset.landmarkCount) || 0) + 1);
    return group;
  }

  private createFractalTree(entity: WorldEntity, world: WorldModel, procedural: boolean) {
    const group = new THREE.Group();
    const palette = materialPalette(world);
    const branchMaterial = new THREE.MeshStandardMaterial({
      color: palette.wood,
      map: createRecursivePatternTexture(world, "object"),
      roughness: 0.88
    });
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: palette.foliage,
      map: createRecursivePatternTexture(world, "terrain"),
      emissive: world.biome === "neon" ? palette.glow : palette.foliage,
      emissiveIntensity: world.biome === "neon" ? 0.24 : 0.025,
      roughness: 0.8
    });
    const depth = procedural ? recursionDepth(world, -3, 2, 4) : recursionDepth(world, -1, 3, 6);
    const tetraMode = world.matterMode === "tetra-lattice";
    const branchGeometry = tetraMode ? createTriangularBrickGeometry(true) : new THREE.BoxGeometry(1, 1, 1);
    const leafGeometry = tetraMode ? createTriangularBrickGeometry(true) : new THREE.BoxGeometry(1, 1, 1);
    const branches: THREE.Mesh[] = [];
    const leaves: THREE.Mesh[] = [];

    const addBranch = (start: THREE.Vector3, direction: THREE.Vector3, length: number, width: number, level: number) => {
      const end = start.clone().add(direction.clone().normalize().multiplyScalar(length));
      const center = start.clone().lerp(end, 0.5);
      const mesh = new THREE.Mesh(branchGeometry, branchMaterial);
      mesh.position.copy(center);
      mesh.scale.set(width, length, width);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      if (tetraMode) {
        mesh.rotateY(level * Math.PI / 5);
      }
      mesh.castShadow = true;
      branches.push(mesh);

      if (level >= depth) {
        const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
        const leafSize = width * 4.2;
        leaf.position.copy(end);
        leaf.scale.set(leafSize * 1.2, leafSize, leafSize * 1.2);
        if (tetraMode) {
          leaf.rotation.y = level * Math.PI / 4;
        }
        leaf.castShadow = true;
        leaves.push(leaf);
        return;
      }

      const spread = 0.42 + seeded(level + Math.round(entity.x * 3), world.terrainSeed) * 0.2;
      const childLength = length * 0.62;
      const childWidth = Math.max(width * 0.62, 0.08);
      const rotations = level > 1 && world.fractalDepth >= 7 ? [-0.95, -0.28, 0.34, 1.05] : [-0.8, 0.2, 0.95];
      rotations.forEach((rotation, index) => {
        const childDirection = direction
          .clone()
          .applyAxisAngle(new THREE.Vector3(0, 0, 1), spread * (index - 1))
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation + seeded(index + level * 11, world.terrainSeed));
        addBranch(end, childDirection, childLength, childWidth, level + 1);
      });
    };

    addBranch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), entity.height * 0.45, Math.max(entity.radius * 0.32, 0.18), 0);
    branches.forEach((mesh) => group.add(mesh));
    leaves.forEach((mesh) => group.add(mesh));
    return group;
  }

  private createTendrilCluster(entity: WorldEntity, world: WorldModel) {
    const group = new THREE.Group();
    const palette = materialPalette(world);
    const chainCount = 5 + Math.min(5, Math.max(0, world.fractalDepth - 3));
    const segmentCount = 8 + Math.min(8, world.fractalDepth * 2);
    const baseMaterial = new THREE.MeshPhysicalMaterial({
      color: palette.foliage,
      emissive: palette.glow,
      emissiveIntensity: 0.08,
      roughness: 0.36,
      metalness: world.biome === "orbital" || world.biome === "neon" ? 0.16 : 0.02,
      clearcoat: 0.34,
      clearcoatRoughness: 0.42
    });
    const tipMaterial = new THREE.MeshPhysicalMaterial({
      color: palette.crystal,
      emissive: palette.glow,
      emissiveIntensity: 0.24,
      roughness: 0.28,
      metalness: 0.08,
      clearcoat: 0.48,
      clearcoatRoughness: 0.3
    });
    const segmentGeometry = new THREE.SphereGeometry(1, 16, 10);
    const chains: TendrilChain[] = [];

    for (let chainIndex = 0; chainIndex < chainCount; chainIndex += 1) {
      const angle = (chainIndex / chainCount) * Math.PI * 2 + seeded(chainIndex + entity.x * 13, world.terrainSeed) * 0.5;
      const rootRadius = entity.radius * (0.18 + seeded(chainIndex + 120, world.terrainSeed) * 0.62);
      const root = new THREE.Vector3(Math.cos(angle) * rootRadius, 0.16, Math.sin(angle) * rootRadius);
      const length = entity.height * (0.64 + seeded(chainIndex + 140, world.terrainSeed) * 0.48);
      const sway = entity.radius * (0.14 + seeded(chainIndex + 160, world.terrainSeed) * 0.14);
      const phase = seeded(chainIndex + entity.z * 17, world.terrainSeed) * Math.PI * 2;
      const segments: THREE.Mesh[] = [];

      for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
        const t = segmentIndex / Math.max(segmentCount - 1, 1);
        const taper = THREE.MathUtils.lerp(entity.radius * 0.18, entity.radius * 0.045, t);
        const material = segmentIndex > segmentCount * 0.72 ? tipMaterial : baseMaterial;
        const segment = new THREE.Mesh(segmentGeometry, material);
        segment.position.set(root.x, t * length, root.z);
        segment.scale.set(taper * (1.1 - t * 0.2), Math.max(taper * 1.35, 0.08), taper);
        segment.castShadow = true;
        segment.receiveShadow = true;
        group.add(segment);
        segments.push(segment);
      }

      chains.push({ root, phase, length, sway, segments });
    }

    this.tendrilRigs.push({
      group,
      chains,
      reactionRadius: Math.max(7, entity.radius * 2.8),
      palette: {
        base: new THREE.Color(palette.foliage),
        glow: new THREE.Color(palette.glow)
      }
    });
    this.renderer.domElement.dataset.tendrilSegments = String(chainCount * segmentCount);
    this.renderer.domElement.dataset.tendrilReactive = "camera-proximity";
    return group;
  }

  private createBlock(
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotationY = 0,
    rotationZ = 0,
    revealDetails = true
  ) {
    const tetraMode = this.activeWorld?.matterMode === "tetra-lattice";
    const metaballMode = this.activeWorld?.matterMode === "metaballs";
    const geometry = metaballMode ? new THREE.SphereGeometry(0.62, 18, 12) : tetraMode ? createTriangularBrickGeometry(true) : new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(metaballMode ? sx * 0.82 : sx, metaballMode ? sy * 0.82 : sy, metaballMode ? sz * 0.82 : sz);
    mesh.rotation.y = rotationY + (tetraMode ? Math.PI / 6 : 0);
    mesh.rotation.z = rotationZ;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (tetraMode) {
      mesh.userData.latticeBrick = "tetra-object";
      this.renderer.domElement.dataset.objectBrickShape = "triangular-prism";
    }
    if (metaballMode) {
      mesh.userData.latticeBrick = "metaball-blob";
      this.renderer.domElement.dataset.objectBrickShape = "metaball-ellipsoid";
    }
    if (revealDetails) {
      this.addCloseRangeFacets(mesh, material, sx, sy, sz, tetraMode);
    }
    return mesh;
  }

  private addCloseRangeFacets(parent: THREE.Mesh, material: THREE.Material, sx: number, sy: number, sz: number, tetraMode: boolean) {
    if (tetraMode || this.proximityDetails.length > 180 || Math.max(sx, sy, sz) < 1.35) {
      return;
    }

    const detailCount = 1;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    for (let index = 0; index < detailCount; index += 1) {
      const detail = new THREE.Mesh(geometry, material);
      detail.position.set(
        sx * 0.18,
        sy * 0.5,
        -sz * 0.14
      );
      const scale = Math.max(0.05, Math.min(sx, sy, sz) * 0.055);
      detail.scale.set(scale, scale * 0.28, scale);
      detail.rotation.y = Math.PI / 4;
      detail.visible = false;
      detail.castShadow = true;
      detail.userData.revealDistance = 6.5 + Math.min(Math.max(sx, sy, sz), 8) * 0.52;
      parent.add(detail);
      this.proximityDetails.push(detail);
    }
  }

  private addPointLight(entity: WorldEntity, group: THREE.Group, y: number, multiplier: number, color = entity.color) {
    const light = new THREE.PointLight(color, 1.4 * multiplier, 24);
    light.position.y = y;
    light.userData.baseIntensity = light.intensity;
    group.add(light);
    this.dynamicLights.push(light);
  }

  private registerActiveLattice(mesh: THREE.InstancedMesh, count: number, columns: number, world: WorldModel, role: "water" | "plasma") {
    const states = new Uint8Array(count);
    const scratch = new Uint8Array(count);
    const palette = materialPalette(world);
    const resting = new THREE.Color(role === "water" ? palette.water : palette.surface);
    const alive = new THREE.Color(role === "water" ? palette.secondary : palette.glow);
    for (let index = 0; index < count; index += 1) {
      states[index] = seeded(index + 3000, world.terrainSeed) > 0.62 ? 1 : 0;
      mesh.setColorAt(index, states[index] ? alive : resting);
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    this.activeLattices.push({ mesh, states, scratch, columns, accumulator: 0, alive, resting });
    this.renderer.domElement.dataset.activeLatticeCount = String(this.activeLattices.length);
  }

  private updateActiveLattices(delta: number) {
    this.activeLattices.forEach((lattice) => {
      lattice.accumulator += delta;
      if (lattice.accumulator < 0.22) {
        return;
      }
      lattice.accumulator = 0;
      const rows = Math.ceil(lattice.states.length / lattice.columns);
      for (let index = 0; index < lattice.states.length; index += 1) {
        const x = index % lattice.columns;
        const y = Math.floor(index / lattice.columns);
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) {
              continue;
            }
            const nx = (x + dx + lattice.columns) % lattice.columns;
            const ny = (y + dy + rows) % rows;
            const neighborIndex = ny * lattice.columns + nx;
            if (neighborIndex < lattice.states.length) {
              neighbors += lattice.states[neighborIndex];
            }
          }
        }
        const alive = lattice.states[index] === 1;
        lattice.scratch[index] = alive ? (neighbors === 2 || neighbors === 3 ? 1 : 0) : (neighbors === 3 || neighbors === 5 ? 1 : 0);
      }
      lattice.states.set(lattice.scratch);
      const color = new THREE.Color();
      for (let index = 0; index < lattice.states.length; index += 1) {
        const phase = 0.18 + (index % lattice.columns) / Math.max(lattice.columns, 1) * 0.16;
        color.copy(lattice.states[index] ? lattice.alive : lattice.resting).lerp(lattice.alive, lattice.states[index] ? phase : 0);
        lattice.mesh.setColorAt(index, color);
      }
      if (lattice.mesh.instanceColor) {
        lattice.mesh.instanceColor.needsUpdate = true;
      }
    });
  }

  private updateWater(delta: number) {
    if (this.waterSurfaces.length === 0 && this.reflectiveWaterSurfaces.length === 0 && this.waterGlints.length === 0) {
      this.renderer.domElement.dataset.waterAnimated = "false";
      return;
    }

    const elapsed = this.clock.elapsedTime;
    this.reflectiveWaterSurfaces.forEach((surface) => {
      surface.mesh.material.uniforms.time.value += delta * surface.speed;
      surface.mesh.material.uniforms.eye.value.copy(this.camera.position);
    });
    this.waterSurfaces.forEach((surface) => {
      const map = surface.mesh.material.map;
      if (map) {
        map.offset.x = (map.offset.x + delta * 0.018 * surface.speed) % 1;
        map.offset.y = (map.offset.y + delta * 0.027 * surface.speed) % 1;
      }
      const normalMap = surface.mesh.material.normalMap;
      if (normalMap) {
        normalMap.offset.x = (normalMap.offset.x - delta * 0.035 * surface.speed) % 1;
        normalMap.offset.y = (normalMap.offset.y + delta * 0.024 * surface.speed) % 1;
      }

      const position = surface.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const z = position.getZ(index);
        const wave =
          Math.sin(x * 0.19 + elapsed * 1.25 * surface.speed + surface.phase) * 0.48 +
          Math.cos(z * 0.27 - elapsed * 0.94 * surface.speed + surface.phase * 0.7) * 0.32 +
          Math.sin((x + z) * 0.08 + elapsed * 0.7) * 0.2;
        position.setY(index, wave * surface.amplitude);
      }
      position.needsUpdate = true;
      surface.mesh.geometry.computeVertexNormals();
      surface.mesh.position.y = surface.baseY;
    });

    this.waterGlints.forEach((glint) => {
      const shimmer = Math.max(0, Math.sin(elapsed * glint.speed + glint.phase));
      const flicker = Math.max(0, Math.sin(elapsed * glint.speed * 2.7 + glint.phase * 0.4));
      const material = glint.sprite.material;
      material.opacity = glint.baseOpacity * (0.24 + shimmer * 0.58 + flicker * 0.28);
      glint.sprite.position.y += Math.sin(elapsed * glint.speed + glint.phase) * delta * 0.06;
      glint.sprite.rotation.z = Math.sin(elapsed * 0.8 + glint.phase) * 0.2;
    });
    this.renderer.domElement.dataset.waterAnimated = "true";
  }

  private updateTendrils(delta: number) {
    if (this.tendrilRigs.length === 0) {
      this.renderer.domElement.dataset.tendrilRigCount = "0";
      return;
    }

    const elapsed = this.clock.elapsedTime;
    const camera = this.camera.position;
    const color = new THREE.Color();
    this.tendrilRigs.forEach((rig) => {
      const rigWorld = tempVector;
      rig.group.getWorldPosition(rigWorld);
      rig.chains.forEach((chain) => {
        const rootWorldX = rigWorld.x + chain.root.x;
        const rootWorldZ = rigWorld.z + chain.root.z;
        const dx = rootWorldX - camera.x;
        const dz = rootWorldZ - camera.z;
        const distance = Math.hypot(dx, dz);
        const influence = THREE.MathUtils.smoothstep(rig.reactionRadius - distance, 0, rig.reactionRadius);
        const normalX = distance > 0.001 ? dx / distance : Math.sin(this.yaw);
        const normalZ = distance > 0.001 ? dz / distance : Math.cos(this.yaw);

        chain.segments.forEach((segment, index) => {
          const t = index / Math.max(chain.segments.length - 1, 1);
          const wave = Math.sin(elapsed * (0.9 + chain.sway) + chain.phase + t * 3.8);
          const cross = Math.cos(elapsed * (0.65 + chain.sway * 0.6) + chain.phase * 0.7 + t * 2.6);
          const bend = Math.pow(t, 1.35);
          const windX = wave * chain.sway * bend;
          const windZ = cross * chain.sway * 0.72 * bend;
          const reaction = influence * bend * chain.length * 0.24;
          segment.position.set(
            chain.root.x + windX + normalX * reaction,
            t * chain.length + Math.sin(t * Math.PI) * chain.length * 0.08,
            chain.root.z + windZ + normalZ * reaction
          );
          segment.rotation.set(wave * 0.16 * bend, chain.phase + t * 0.8, cross * 0.12 * bend);

          const material = segment.material;
          if (!Array.isArray(material) && material instanceof THREE.MeshStandardMaterial) {
            material.emissive.copy(color.copy(rig.palette.base).lerp(rig.palette.glow, 0.24 + influence * 0.54 + t * 0.18));
            material.emissiveIntensity = 0.04 + influence * 0.22 + t * 0.04;
          }
        });
      });
    });
    this.renderer.domElement.dataset.tendrilRigCount = String(this.tendrilRigs.length);
    this.renderer.domElement.dataset.tendrilReactive = "camera-proximity";
    this.renderer.domElement.dataset.tendrilPhase = elapsed.toFixed(2);
  }

  private updateProximityDetails() {
    this.proximityDetails.forEach((detail) => {
      const threshold = detail.userData.revealDistance ?? 22;
      detail.getWorldPosition(tempVector);
      detail.visible = tempVector.distanceTo(this.camera.position) < threshold;
    });
    this.renderer.domElement.dataset.proximityDetailCount = String(this.proximityDetails.length);
  }

  private clearReconstruction() {
    this.dynamicLights.length = 0;
    this.activeLattices.length = 0;
    this.proximityDetails.length = 0;
    this.colliders.length = 0;
    this.tendrilRigs.length = 0;
    this.waterSurfaces.length = 0;
    this.reflectiveWaterSurfaces.length = 0;
    this.waterGlints.length = 0;
    this.zombieRigs.length = 0;
    this.npcRigs.length = 0;
    this.bloodParticles.length = 0;
    this.tracerEffects.length = 0;
    this.impactMarks.length = 0;
    this.kayakSpeed = 0;
    this.kayakYawVelocity = 0;
    this.cityVelocity.set(0, 0, 0);
    this.cityYawVelocity = 0;
    this.kills = 0;
    this.shots = 0;
    this.slopePitch = 0;
    while (this.camera.children.length) {
      const child = this.camera.children.pop();
      if (child) disposeObject(child);
    }
    while (this.reconGroup.children.length) {
      const child = this.reconGroup.children.pop();
      if (child) disposeObject(child);
    }
  }

  private requestPointerLock = () => {
    const lockRequest = this.renderer.domElement.requestPointerLock();
    if (lockRequest instanceof Promise) {
      lockRequest.catch(() => undefined);
    }
  };

  private handlePointerLockChange = () => {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.addEventListener("mousemove", this.handleMouseMove);
    } else {
      document.removeEventListener("mousemove", this.handleMouseMove);
    }
  };

  private handleMouseMove = (event: MouseEvent) => {
    this.yaw -= event.movementX * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0022, -1.2, 1.2);
    this.applyCameraRotation();
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    const code = this.codeForEvent(event);
    if (isMovementKey(code) || code === "Space") {
      event.preventDefault();
    }
    this.keys.add(code);
    if (code === "Space" && this.activeWorld?.landscapeStyle === "zombie-city") {
      this.fireWeapon();
      return;
    }
    this.applyDiscreteMove(code);
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(this.codeForEvent(event));
  };

  private resize = () => {
    const rect = this.host.getBoundingClientRect();
    this.camera.aspect = rect.width / Math.max(rect.height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height, false);
    this.composer.setSize(rect.width, rect.height);
    this.fxaaPass.material.uniforms.resolution.value.set(1 / Math.max(rect.width, 1), 1 / Math.max(rect.height, 1));
  };

  private ambientFor(world: WorldModel) {
    if (world.landscapeStyle === "zombie-city") return 1.38;
    if (world.timeOfDay === "night") return 1.05;
    if (world.weather === "storm" || world.weather === "mist") return 1.08;
    return 1.18;
  }

  private sunFor(world: WorldModel) {
    if (world.landscapeStyle === "zombie-city") return 1.76;
    if (world.timeOfDay === "night") return 0.95;
    if (world.timeOfDay === "dusk" || world.timeOfDay === "dawn") return 1.22;
    return 1.5;
  }

  private fillFor(world: WorldModel) {
    if (world.landscapeStyle === "zombie-city") return 0.92;
    if (world.timeOfDay === "night") return 0.82;
    if (world.weather === "storm" || world.weather === "mist") return 0.58;
    return 0.48;
  }

  private configureAtmosphere(world: WorldModel) {
    const atmosphere = atmosphereMix(world);
    const weatherMist = world.weather === "mist" || world.weather === "storm" || world.weather === "snow" ? 0.12 : 0;
    const haze = THREE.MathUtils.clamp(world.landscapeStyle === "zombie-city" ? atmosphere * 0.42 + weatherMist * 0.45 : atmosphere + weatherMist, 0, 1);
    const near = THREE.MathUtils.lerp(138, 58, haze);
    const far = THREE.MathUtils.lerp(340, 190, haze);
    this.scene.fog = new THREE.Fog(world.skyColor, near, far);
    this.renderer.domElement.dataset.atmosphereLevel = atmosphere.toFixed(2);
    this.renderer.domElement.dataset.fogNear = near.toFixed(0);
    this.renderer.domElement.dataset.fogFar = far.toFixed(0);
  }

  private configureRenderQuality(world: WorldModel) {
    const cinematic = world.renderQuality === "cinematic";
    const atmosphere = atmosphereMix(world);
    this.renderer.setPixelRatio(world.landscapeStyle === "zombie-city" ? Math.min(window.devicePixelRatio, 1.35) : Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMappingExposure = world.landscapeStyle === "zombie-city" ? 1.46 : cinematic ? THREE.MathUtils.lerp(1.26, 1.56, atmosphere) : 1.24;
    this.bloomPass.strength = cinematic ? THREE.MathUtils.lerp(0.2, 0.58, atmosphere) : 0.16;
    this.bloomPass.radius = cinematic ? THREE.MathUtils.lerp(0.24, 0.68, atmosphere) : 0.26;
    this.bloomPass.threshold = cinematic ? THREE.MathUtils.lerp(0.34, 0.14, atmosphere) : 0.36;
    this.fxaaPass.enabled = true;
    this.renderer.domElement.dataset.renderQuality = world.renderQuality;
    this.renderer.domElement.dataset.bloomStrength = this.bloomPass.strength.toFixed(2);
    this.renderer.domElement.dataset.performanceMode = world.landscapeStyle === "zombie-city" ? "city-responsive-pixel-ratio" : "full-detail";
  }

  private codeForEvent(event: KeyboardEvent) {
    if (event.code) {
      return event.code;
    }
    const key = event.key.toLowerCase();
    const keyMap: Record<string, string> = {
      w: "KeyW",
      a: "KeyA",
      s: "KeyS",
      d: "KeyD",
      arrowleft: "ArrowLeft",
      arrowright: "ArrowRight",
      arrowup: "ArrowUp",
      arrowdown: "ArrowDown",
      " ": "Space",
      shift: "ShiftLeft"
    };
    return keyMap[key] ?? event.key;
  }

  private updateKeyboardLook(delta: number) {
    const yawInput = Number(this.keys.has("ArrowLeft")) - Number(this.keys.has("ArrowRight"));
    if (yawInput !== 0) {
      this.yaw += yawInput * KEY_TURN_SPEED * delta;
    }

    this.keyLookYaw = THREE.MathUtils.damp(this.keyLookYaw, 0, KEY_LOOK_RETURN, delta);
    this.keyLookPitch = THREE.MathUtils.damp(this.keyLookPitch, 0, KEY_LOOK_RETURN, delta);

    if (Math.abs(this.keyLookYaw) < 0.0005) {
      this.keyLookYaw = 0;
    }
    if (Math.abs(this.keyLookPitch) < 0.0005) {
      this.keyLookPitch = 0;
    }

    this.applyCameraRotation();
  }

  private updateSlopeLook(delta: number, input: THREE.Vector3) {
    let target = 0;
    if (this.activeWorld && input.lengthSq() > 0) {
      const distance = 2.2;
      const here = this.surfaceHeightAt(this.camera.position.x, this.camera.position.z, this.activeWorld);
      const ahead = this.surfaceHeightAt(
        this.camera.position.x + input.x * distance,
        this.camera.position.z + input.z * distance,
        this.activeWorld
      );
      target = THREE.MathUtils.clamp(Math.atan2(ahead - here, distance) * SLOPE_LOOK_STRENGTH, -MAX_SLOPE_PITCH, MAX_SLOPE_PITCH);
    }

    this.slopePitch = THREE.MathUtils.damp(this.slopePitch, target, SLOPE_LOOK_RETURN, delta);
    if (Math.abs(this.slopePitch) < 0.0005) {
      this.slopePitch = 0;
    }
    this.applyCameraRotation();
  }

  private applyCameraRotation() {
    const cameraPitch = THREE.MathUtils.clamp(this.pitch + this.keyLookPitch + this.slopePitch, -1.2, 1.2);
    const cameraYaw = this.yaw + this.keyLookYaw;
    this.camera.rotation.set(cameraPitch, cameraYaw, 0, "YXZ");
    this.renderer.domElement.dataset.look = JSON.stringify({
      yaw: Number(cameraYaw.toFixed(3)),
      pitch: Number(cameraPitch.toFixed(3)),
      movementYaw: Number(this.movementYaw().toFixed(3)),
      returnYaw: Number(this.keyLookYaw.toFixed(3)),
      returnPitch: Number(this.keyLookPitch.toFixed(3)),
      slopePitch: Number(this.slopePitch.toFixed(3)),
      keyTurn: Number((Number(this.keys.has("ArrowLeft")) - Number(this.keys.has("ArrowRight"))).toFixed(0))
    });
  }

  private commitKeyboardLookAsRest() {
    if (this.keyLookYaw === 0 && this.keyLookPitch === 0) {
      return;
    }

    this.yaw += this.keyLookYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.keyLookPitch, -1.2, 1.2);
    this.keyLookYaw = 0;
    this.keyLookPitch = 0;
    this.applyCameraRotation();
  }

  private applyDiscreteMove(code: string) {
    if (isMovementKey(code)) {
      this.commitKeyboardLookAsRest();
    }
    if (code === "Space" && this.grounded) {
      this.velocity.y = 10;
      this.grounded = false;
    }
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -44, 44);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -44, 44);
    this.resolveObjectCollisions();
    this.resolveGroundCollision();
    this.publishTelemetry();
  }

  private movementYaw() {
    return this.yaw + this.keyLookYaw;
  }

  private movementBasis() {
    const yaw = this.movementYaw();
    return {
      forward: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      right: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    };
  }

  private hasMovementInput() {
    return (
      this.keys.has("KeyW") ||
      this.keys.has("KeyS") ||
      this.keys.has("KeyA") ||
      this.keys.has("KeyD") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("ArrowDown")
    );
  }

  private resolveObjectCollisions() {
    if (!this.activeWorld) {
      return;
    }

    const footY = this.activeWorld.landscapeStyle === "zombie-city" ? 0.05 : this.camera.position.y - EYE_HEIGHT;
    for (const collider of this.colliders) {
      if (footY < collider.baseY - 0.65 || footY > collider.baseY + collider.height) {
        continue;
      }
      const minDistance = collider.radius + 0.58;
      const dx = this.camera.position.x - collider.x;
      const dz = this.camera.position.z - collider.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= minDistance * minDistance) {
        continue;
      }

      const distance = Math.sqrt(distanceSq) || 1;
      const normalX = distanceSq === 0 ? Math.sin(this.yaw) : dx / distance;
      const normalZ = distanceSq === 0 ? Math.cos(this.yaw) : dz / distance;
      this.camera.position.x = collider.x + normalX * minDistance;
      this.camera.position.z = collider.z + normalZ * minDistance;
      const collisionVelocity = this.activeWorld.landscapeStyle === "zombie-city" ? this.cityVelocity : this.velocity;
      const intoCollider = collisionVelocity.x * normalX + collisionVelocity.z * normalZ;
      if (intoCollider < 0) {
        collisionVelocity.x -= intoCollider * normalX;
        collisionVelocity.z -= intoCollider * normalZ;
      }
    }
  }

  private resolveGroundCollision() {
    if (!this.activeWorld) {
      return;
    }

    const terrain = this.surfaceHeightAt(this.camera.position.x, this.camera.position.z, this.activeWorld);
    const waterFloor = this.activeWorld.landscapeStyle === "dolomite-spires" ? this.activeWorld.waterLevel + 0.08 : Number.NEGATIVE_INFINITY;
    const ground = Math.max(terrain, waterFloor) + EYE_HEIGHT;
    if (this.camera.position.y <= ground) {
      this.camera.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
      return;
    }

    this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y, EYE_HEIGHT, 34);
    this.grounded = false;
  }

  private positionScenicCamera(world: WorldModel) {
    const x = -18;
    const z = 38;
    const height = this.surfaceHeightAt(x, z, world);
    const eyeY = Math.max(world.waterLevel + 1.35, height + EYE_HEIGHT * 0.72);
    const target = new THREE.Vector3(5, world.waterLevel + 1.2, -14);
    this.camera.position.set(x, eyeY, z);
    this.camera.lookAt(target);
    const rotation = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    this.yaw = rotation.y;
    this.pitch = THREE.MathUtils.clamp(rotation.x, -0.62, 0.38);
    this.keyLookPitch = 0;
    this.keyLookYaw = 0;
    this.slopePitch = 0;
    this.velocity.set(0, 0, 0);
    this.applyCameraRotation();
    this.renderer.domElement.dataset.scenicCamera = JSON.stringify({
      x,
      y: Number(eyeY.toFixed(1)),
      z,
      shorelineHeight: Number(height.toFixed(1))
    });
  }

  private surfaceHeightAt(x: number, z: number, world: WorldModel) {
    if (world.matterMode === "fractal-blocks") {
      const block = this.renderedBlocks.find((candidate) => {
        const half = candidate.size * 0.52;
        return Math.abs(candidate.x - x) <= half && Math.abs(candidate.z - z) <= half;
      });
      if (block) {
        return block.top;
      }
    }

    if (world.matterMode === "tetra-lattice") {
      let nearest: TetraCell | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const cell of this.renderedTetraCells) {
        const distance = Math.hypot(cell.x - x, cell.z - z);
        if (distance < nearestDistance && distance < cell.size * 0.74) {
          nearest = cell;
          nearestDistance = distance;
        }
      }
      if (nearest) {
        return nearest.top;
      }
    }

    return terrainHeightAt(x, z, world);
  }

  private publishTelemetry(worldId?: string) {
    const camera = {
      x: Number(this.camera.position.x.toFixed(3)),
      y: Number(this.camera.position.y.toFixed(3)),
      z: Number(this.camera.position.z.toFixed(3))
    };
    window.__SIMULE_DEBUG__ = {
      camera,
      worldId: worldId ?? window.__SIMULE_DEBUG__?.worldId
    };
    this.renderer.domElement.dataset.camera = JSON.stringify(camera);
    this.renderer.domElement.dataset.worldId = window.__SIMULE_DEBUG__.worldId ?? "";
    this.renderer.domElement.dataset.grounded = String(this.grounded);
    if (this.activeWorld) {
      this.renderer.domElement.dataset.surfaceHeight = this.surfaceHeightAt(this.camera.position.x, this.camera.position.z, this.activeWorld).toFixed(2);
    }
  }
}

function isMovementKey(code: string) {
  return (
    code === "KeyW" ||
    code === "KeyS" ||
    code === "KeyA" ||
    code === "KeyD" ||
    code === "ArrowLeft" ||
    code === "ArrowRight" ||
    code === "ArrowUp" ||
    code === "ArrowDown"
  );
}

function atmosphereMix(world: WorldModel) {
  const slider = THREE.MathUtils.clamp(world.refractionLevel, 0, 1);
  return world.renderQuality === "cinematic" ? slider * 0.72 : slider * 0.28;
}

function iterationMix(world: WorldModel) {
  return THREE.MathUtils.clamp((world.fractalDepth - 2) / 6, 0, 1);
}

function recursionDepth(world: WorldModel, offset: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, world.fractalDepth + offset));
}

function seeded(index: number, seed: number) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function distanceToSegment2D(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  const x = ax + dx * t;
  const z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}

function materialPalette(world: WorldModel) {
  const palettes: Record<string, {
    surface: string;
    stone: string;
    architecture: string;
    secondary: string;
    sand: string;
    snow: string;
    lava: string;
    metal: string;
    wood: string;
    foliage: string;
    crystal: string;
    portalFrame: string;
    glow: string;
    water: string;
    waterGlow: string;
    cloud: string;
    horizon: string;
  }> = {
    alpine: {
      surface: "#5f7868",
      stone: "#7b8580",
      architecture: "#9aa69f",
      secondary: "#c4d2ce",
      sand: "#bda574",
      snow: "#e1e9e6",
      lava: "#c46a45",
      metal: "#a6b7ba",
      wood: "#5f5043",
      foliage: "#6f8975",
      crystal: "#c8dde0",
      portalFrame: "#aebfbb",
      glow: "#dce9e6",
      water: "#5f97ac",
      waterGlow: "#294c58",
      cloud: "#eef5f4",
      horizon: "#91b3bd"
    },
    desert: {
      surface: "#a87950",
      stone: "#897562",
      architecture: "#b9976e",
      secondary: "#d0ae77",
      sand: "#c6965c",
      snow: "#eadfca",
      lava: "#d06c45",
      metal: "#8c8170",
      wood: "#6b4d38",
      foliage: "#87855d",
      crystal: "#9ebfac",
      portalFrame: "#b98c62",
      glow: "#d7b872",
      water: "#4f8a91",
      waterGlow: "#24474b",
      cloud: "#f0d7bd",
      horizon: "#ca9d68"
    },
    forest: {
      surface: "#3f6348",
      stone: "#59685d",
      architecture: "#687769",
      secondary: "#b7a960",
      sand: "#9d8755",
      snow: "#d5ddd5",
      lava: "#bc6544",
      metal: "#697b76",
      wood: "#5a402d",
      foliage: "#5d7f53",
      crystal: "#83b69f",
      portalFrame: "#7a7651",
      glow: "#d0bd66",
      water: "#3d7884",
      waterGlow: "#183a40",
      cloud: "#e9eee7",
      horizon: "#527965"
    },
    oceanic: {
      surface: "#4e7f7d",
      stone: "#687873",
      architecture: "#748b82",
      secondary: "#b7caa9",
      sand: "#b9a56e",
      snow: "#dce7e5",
      lava: "#cb6944",
      metal: "#78949a",
      wood: "#675342",
      foliage: "#668a70",
      crystal: "#88bfb7",
      portalFrame: "#82988a",
      glow: "#c8d2a6",
      water: "#3e83a8",
      waterGlow: "#173b4d",
      cloud: "#f1f5f2",
      horizon: "#4c92aa"
    },
    orbital: {
      surface: "#5d6572",
      stone: "#747d89",
      architecture: "#6f7886",
      secondary: "#87b7bf",
      sand: "#928872",
      snow: "#cbd7dd",
      lava: "#bf664a",
      metal: "#8491a2",
      wood: "#5b5360",
      foliage: "#648f86",
      crystal: "#95dde5",
      portalFrame: "#789aa5",
      glow: "#91e0ea",
      water: "#4b93a5",
      waterGlow: "#153d48",
      cloud: "#d8e3ef",
      horizon: "#252d41"
    },
    volcanic: {
      surface: "#584139",
      stone: "#625a54",
      architecture: "#6d5e53",
      secondary: "#b66e55",
      sand: "#8d684c",
      snow: "#beb8ac",
      lava: "#d26a43",
      metal: "#76665c",
      wood: "#4d352d",
      foliage: "#71614c",
      crystal: "#cf8062",
      portalFrame: "#74594d",
      glow: "#df7a4f",
      water: "#a04a34",
      waterGlow: "#572317",
      cloud: "#c7a08c",
      horizon: "#6b3b2f"
    },
    neon: {
      surface: "#2f3849",
      stone: "#4c5366",
      architecture: "#59627a",
      secondary: "#b26be7",
      sand: "#766a86",
      snow: "#c8d7ef",
      lava: "#e06c54",
      metal: "#69799a",
      wood: "#4d4260",
      foliage: "#5e78a0",
      crystal: "#c071f2",
      portalFrame: "#76579f",
      glow: "#de64f2",
      water: "#3d7ba3",
      waterGlow: "#1b365f",
      cloud: "#d8e4ff",
      horizon: "#343d68"
    },
    urban: {
      surface: "#343839",
      stone: "#676d6c",
      architecture: "#50595c",
      secondary: "#d0d6cf",
      sand: "#8a8577",
      snow: "#dce0dd",
      lava: "#9e4037",
      metal: "#6f777b",
      wood: "#50463e",
      foliage: "#5a6b54",
      crystal: "#aeb8b5",
      portalFrame: "#747d80",
      glow: "#f0c178",
      water: "#506d78",
      waterGlow: "#1d343b",
      cloud: "#d8d8d1",
      horizon: "#727f82"
    }
  };

  if (world.landscapeStyle === "dolomite-spires") {
    return {
      ...palettes.alpine,
      surface: "#6f7d74",
      stone: "#a39f93",
      architecture: "#a79f8f",
      secondary: "#ffd18f",
      snow: "#f1f3ed",
      foliage: "#5f7a60",
      crystal: "#b7d9de",
      portalFrame: "#b9b0a0",
      glow: "#ffd49a",
      water: "#2e7da5",
      waterGlow: "#0d344a",
      cloud: "#fff1dc",
      horizon: "#d88c68"
    };
  }

  return palettes[world.biome] ?? palettes.oceanic;
}

function objectColorForEntity(entity: WorldEntity, world: WorldModel, procedural: boolean) {
  const palette = materialPalette(world);
  const colors: Partial<Record<WorldEntity["kind"], string>> = {
    tower: palette.architecture,
    habitat: palette.architecture,
    tree: palette.wood,
    monolith: palette.stone,
    portal: palette.portalFrame,
    beacon: palette.architecture,
    ridge: palette.stone,
    platform: palette.architecture,
    water: palette.water,
    crystal: palette.crystal,
    tendril: palette.foliage,
    castle: palette.architecture,
    cathedral: palette.architecture,
    mosque: palette.architecture,
    tent: world.biome === "neon" ? palette.secondary : palette.sand,
    stoneCircle: palette.stone,
    zombie: palette.foliage
  };
  const base = new THREE.Color(colors[entity.kind] ?? palette.architecture);
  if (procedural && world.biome !== "neon") {
    base.lerp(new THREE.Color(palette.surface), 0.22);
  }
  return `#${base.getHexString()}`;
}

function accentColorForLandmark(entity: WorldEntity, world: WorldModel) {
  const palette = materialPalette(world);
  if (entity.kind === "castle" || entity.kind === "stoneCircle") {
    return palette.secondary;
  }
  if (entity.kind === "tent") {
    return world.biome === "neon" ? palette.glow : palette.sand;
  }
  return palette.portalFrame;
}

function glowColorForEntity(entity: WorldEntity, world: WorldModel) {
  const palette = materialPalette(world);
  if (entity.kind === "crystal" || entity.kind === "portal" || entity.kind === "beacon") {
    return palette.glow;
  }
  return world.biome === "neon" ? palette.secondary : palette.surface;
}

function colorForBlock(material: string, world: WorldModel, depth: number, variance: number) {
  const shade = THREE.MathUtils.clamp(1.08 + depth * 0.055 + variance * 0.032, 0.9, 1.52);
  const palette = materialPalette(world);
  const colors: Record<string, string> = {
    surface: palette.surface,
    stone: palette.stone,
    snow: palette.snow,
    sand: palette.sand,
    lava: palette.lava,
    metal: palette.metal
  };
  return new THREE.Color(colors[material] ?? materialPalette(world).surface).multiplyScalar(shade);
}

function colorForTetraCell(cell: TetraCell, world: WorldModel) {
  const shade = THREE.MathUtils.clamp(1.04 + cell.depth * 0.075 + cell.variance * 0.026, 0.86, 1.58);
  const palette = materialPalette(world);
  const colors: Record<string, string> = {
    surface: palette.surface,
    stone: palette.stone,
    snow: palette.snow,
    sand: palette.sand,
    lava: palette.lava,
    metal: palette.metal
  };
  const base = new THREE.Color(colors[cell.material] ?? materialPalette(world).surface).multiplyScalar(shade);
  if (cell.orientation === -1) {
    base.lerp(new THREE.Color(palette.secondary), world.biome === "neon" ? 0.16 : 0.08);
  }
  return base;
}

function blockSizeBuckets(blocks: FractalBlock[]) {
  return blocks.reduce<Record<string, number>>((buckets, block) => {
    const key = block.size.toFixed(2);
    buckets[key] = (buckets[key] ?? 0) + 1;
    return buckets;
  }, {});
}

function tetraSizeBuckets(cells: TetraCell[]) {
  return cells.reduce<Record<string, number>>((buckets, cell) => {
    const key = cell.size.toFixed(2);
    buckets[key] = (buckets[key] ?? 0) + 1;
    return buckets;
  }, {});
}

function fractalWaterBlocks(world: WorldModel, x: number, z: number, radius: number, depth: number) {
  const blocks: Array<{ x: number; z: number; size: number }> = [];
  const maxBlocks = 180 + world.fractalDepth * 90;

  const recurse = (cx: number, cz: number, size: number, level: number) => {
    const shoreline = Math.hypot(cx - x, cz - z) / Math.max(radius, 1);
    const ripple =
      seeded(Math.round(cx * 17 + cz * 23 + level * 31), world.terrainSeed) * 0.62 +
      seeded(Math.round(cx * 41 - cz * 29 + world.fractalDepth * 13), world.terrainSeed) * 0.38;
    const roughEdge = 1.02 + (ripple - 0.5) * iterationMix(world) * 0.22;
    if (shoreline > roughEdge || blocks.length > maxBlocks) {
      return;
    }

    const subdivide = level < depth && size > world.minimumBlockSize && (shoreline > 0.36 || ripple > 0.52 - iterationMix(world) * 0.12);
    if (subdivide) {
      const child = size / 2;
      recurse(cx - child / 2, cz - child / 2, child, level + 1);
      recurse(cx + child / 2, cz - child / 2, child, level + 1);
      recurse(cx - child / 2, cz + child / 2, child, level + 1);
      recurse(cx + child / 2, cz + child / 2, child, level + 1);
      return;
    }

    blocks.push({ x: cx, z: cz, size: size * (0.72 + ripple * 0.28) });
  };

  recurse(x, z, radius, 0);
  return blocks;
}

function fractalCloudBlocks(world: WorldModel, x: number, y: number, z: number, size: number, depth: number) {
  const blocks: Array<{ x: number; y: number; z: number; size: number; rotation: number }> = [];
  const maxBlocks = 220 + world.fractalDepth * 95;

  const recurse = (cx: number, cy: number, cz: number, blockSize: number, level: number, salt: number) => {
    blocks.push({
      x: cx,
      y: cy,
      z: cz,
      size: blockSize,
      rotation: seeded(salt + level * 13, world.terrainSeed) * Math.PI
    });

    if (level >= depth || blockSize < 0.56 || blocks.length > maxBlocks) {
      return;
    }

    const children = 4 + Math.floor(seeded(salt + 20, world.terrainSeed) * (3 + iterationMix(world) * 2));
    for (let index = 0; index < children; index += 1) {
      const angle = (index / children) * Math.PI * 2 + seeded(salt + index, world.terrainSeed);
      const childSize = blockSize * (0.42 + seeded(salt + index * 7, world.terrainSeed) * 0.2);
      const distance = blockSize * (0.42 + seeded(salt + index * 9, world.terrainSeed) * 0.76);
      recurse(
        cx + Math.cos(angle) * distance,
        cy + (seeded(salt + index * 5, world.terrainSeed) - 0.5) * blockSize * 0.34,
        cz + Math.sin(angle) * distance,
        childSize,
        level + 1,
        salt + index * 37 + 1
      );
    }
  };

  recurse(x, y, z, size, 0, Math.round(x * 13 + z * 17));
  return blocks;
}

function horizonColorFor(world: WorldModel) {
  if (world.landscapeStyle === "dolomite-spires") {
    return world.timeOfDay === "dusk" ? "#d88c68" : "#78a9bf";
  }

  const colors: Record<string, string> = {
    alpine: "#8eb5c7",
    desert: "#d0a66f",
    forest: "#517f6d",
    oceanic: "#3f91bc",
    orbital: "#22283f",
    volcanic: "#70392b",
    neon: "#313c68"
  };
  return colors[world.biome] ?? world.skyColor;
}

function horizonLevelFor(world: WorldModel) {
  if (world.landscapeStyle === "dolomite-spires") return Math.max(world.waterLevel, -1.2);
  if (world.biome === "desert") return Math.max(world.waterLevel, -3.2);
  if (world.biome === "alpine") return Math.max(world.waterLevel, -4.8);
  if (world.biome === "volcanic") return Math.max(world.waterLevel, -6.8);
  return Math.max(world.waterLevel, -2.2);
}

function cloudColorFor(world: WorldModel) {
  if (world.landscapeStyle === "dolomite-spires" && world.timeOfDay === "dusk") return "#ffe5c7";
  if (world.weather === "storm") return "#9ea9ad";
  if (world.weather === "snow") return "#eef7f7";
  if (world.weather === "ember") return "#c9a18b";
  if (world.weather === "aurora") return "#d8e7ff";
  if (world.timeOfDay === "night") return "#bac8d8";
  return "#f1f6f2";
}

function createSkyTexture(world: WorldModel) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const preset = skyPreset(world);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  preset.stops.forEach((stop) => gradient.addColorStop(stop.offset, stop.color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  drawSkyGlow(context, canvas, preset);
  if (world.timeOfDay === "night" || world.weather === "aurora") {
    drawStars(context, canvas, world);
  }
  if (world.weather === "aurora" || world.biome === "orbital" || world.biome === "neon") {
    drawNebula(context, canvas, world);
  }
  drawSkyCloudBands(context, canvas, world, preset);
  drawSkyDiscs(context, canvas, preset);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

interface SkyBody {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
  size: number;
  color: string;
  opacity: number;
}

interface SkyPreset {
  stops: Array<{ offset: number; color: string }>;
  glow: { u: number; v: number; color: string; radius: number; opacity: number };
  cloudTint: string;
  cloudOpacity: number;
  bodies: SkyBody[];
}

function skyPreset(world: WorldModel): SkyPreset {
  const byTime: Record<string, SkyPreset> = {
    dawn: {
      stops: [
        { offset: 0, color: "#315275" },
        { offset: 0.42, color: "#8fc2d1" },
        { offset: 0.72, color: "#f2b27b" },
        { offset: 1, color: "#f8d5a7" }
      ],
      glow: { u: 0.26, v: 0.62, color: "#ffd49a", radius: 0.28, opacity: 0.72 },
      cloudTint: "#ffe2bf",
      cloudOpacity: 0.2,
      bodies: [{ x: -95, y: 68, z: -190, u: 0.27, v: 0.6, size: 42, color: "#fff2b8", opacity: 0.58 }]
    },
    day: {
      stops: [
        { offset: 0, color: "#4e93cc" },
        { offset: 0.48, color: "#84c1e9" },
        { offset: 0.78, color: "#d9eef5" },
        { offset: 1, color: "#f2f3e8" }
      ],
      glow: { u: 0.23, v: 0.28, color: "#fff5bf", radius: 0.22, opacity: 0.56 },
      cloudTint: "#f8fbff",
      cloudOpacity: 0.24,
      bodies: [{ x: -145, y: 160, z: -210, u: 0.23, v: 0.28, size: 54, color: "#fff1a4", opacity: 0.66 }]
    },
    dusk: {
      stops: [
        { offset: 0, color: "#1f2c56" },
        { offset: 0.38, color: "#72517b" },
        { offset: 0.68, color: "#e18062" },
        { offset: 1, color: "#f0b47a" }
      ],
      glow: { u: 0.73, v: 0.66, color: "#ff985e", radius: 0.32, opacity: 0.78 },
      cloudTint: "#ffc29c",
      cloudOpacity: 0.26,
      bodies: [{ x: 135, y: 62, z: -205, u: 0.73, v: 0.66, size: 48, color: "#ffc27a", opacity: 0.62 }]
    },
    night: {
      stops: [
        { offset: 0, color: "#07091a" },
        { offset: 0.46, color: "#111936" },
        { offset: 0.76, color: "#20294a" },
        { offset: 1, color: "#1e2738" }
      ],
      glow: { u: 0.68, v: 0.34, color: "#c9d6ff", radius: 0.24, opacity: 0.38 },
      cloudTint: "#8fa5c6",
      cloudOpacity: 0.16,
      bodies: [
        { x: 120, y: 150, z: -225, u: 0.68, v: 0.34, size: 42, color: "#dbe6ff", opacity: 0.54 },
        { x: -175, y: 112, z: -190, u: 0.34, v: 0.43, size: 23, color: "#f0ded0", opacity: 0.34 }
      ]
    }
  };

  const preset = byTime[world.timeOfDay];
  const bodies = [...preset.bodies];
  if (world.biome === "orbital" || world.biome === "neon") {
    bodies.push(
      { x: -235, y: 85, z: -250, u: 0.18, v: 0.56, size: 58, color: materialPalette(world).glow, opacity: 0.26 },
      { x: 225, y: 118, z: -230, u: 0.83, v: 0.44, size: 34, color: "#f6d3a4", opacity: 0.3 }
    );
  }
  if (world.biome === "volcanic") {
    bodies.push({ x: -160, y: 62, z: -230, u: 0.28, v: 0.62, size: 31, color: "#ff6d45", opacity: 0.38 });
  }

  return {
    ...preset,
    cloudTint: world.weather === "ember" ? "#d99b76" : world.weather === "snow" ? "#f5fbff" : preset.cloudTint,
    cloudOpacity: world.weather === "clear" ? preset.cloudOpacity * 0.55 : preset.cloudOpacity,
    bodies
  };
}

function drawSkyGlow(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, preset: SkyPreset) {
  const x = preset.glow.u * canvas.width;
  const y = preset.glow.v * canvas.height;
  const radius = preset.glow.radius * canvas.width;
  const glow = context.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, withAlpha(preset.glow.color, preset.glow.opacity));
  glow.addColorStop(0.34, withAlpha(preset.glow.color, preset.glow.opacity * 0.32));
  glow.addColorStop(1, withAlpha(preset.glow.color, 0));
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawSkyDiscs(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, preset: SkyPreset) {
  preset.bodies.forEach((body) => {
    const x = body.u * canvas.width;
    const y = body.v * canvas.height;
    const radius = body.size * 0.38;
    const halo = context.createRadialGradient(x, y, 0, x, y, radius * 3.5);
    halo.addColorStop(0, withAlpha(body.color, body.opacity));
    halo.addColorStop(0.22, withAlpha(body.color, body.opacity * 0.34));
    halo.addColorStop(1, withAlpha(body.color, 0));
    context.fillStyle = halo;
    context.beginPath();
    context.arc(x, y, radius * 3.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = withAlpha(body.color, Math.min(body.opacity + 0.2, 0.82));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  });
}

function drawStars(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, world: WorldModel) {
  const count = world.renderQuality === "cinematic" ? 380 : 180;
  for (let index = 0; index < count; index += 1) {
    const x = seeded(index + 1500, world.terrainSeed) * canvas.width;
    const y = seeded(index + 1600, world.terrainSeed) * canvas.height * 0.68;
    const radius = 0.45 + seeded(index + 1700, world.terrainSeed) * 1.35;
    context.fillStyle = withAlpha("#ffffff", 0.22 + seeded(index + 1800, world.terrainSeed) * 0.64);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawNebula(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, world: WorldModel) {
  const bands = world.renderQuality === "cinematic" ? 12 : 7;
  for (let band = 0; band < bands; band += 1) {
    const y = canvas.height * (0.16 + seeded(band + 2100, world.terrainSeed) * 0.42);
    const color = band % 2 === 0 ? materialPalette(world).glow : materialPalette(world).secondary;
    context.strokeStyle = withAlpha(color, 0.08 + seeded(band + 2150, world.terrainSeed) * 0.12);
    context.lineWidth = 16 + seeded(band + 2200, world.terrainSeed) * 48;
    context.beginPath();
    for (let x = -80; x <= canvas.width + 80; x += 48) {
      const wave = Math.sin(x * 0.012 + band * 1.7) * 28 + Math.sin(x * 0.027 + world.terrainSeed) * 12;
      if (x === -80) {
        context.moveTo(x, y + wave);
      } else {
        context.lineTo(x, y + wave);
      }
    }
    context.stroke();
  }
}

function drawSkyCloudBands(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, world: WorldModel, preset: SkyPreset) {
  const iteration = Math.max(0, Math.min(1, (world.fractalDepth - 2) / 6));
  const bands = Math.round(14 + iteration * 18 + atmosphereMix(world) * 10);
  for (let band = 0; band < bands; band += 1) {
    const baseY = canvas.height * (0.38 + seeded(band + 2400, world.terrainSeed) * 0.5);
    const height = 8 + seeded(band + 2500, world.terrainSeed) * 34;
    const opacity = preset.cloudOpacity * (0.38 + seeded(band + 2600, world.terrainSeed) * 0.8);
    const gradient = context.createLinearGradient(0, baseY - height, 0, baseY + height);
    gradient.addColorStop(0, withAlpha(preset.cloudTint, 0));
    gradient.addColorStop(0.48, withAlpha(preset.cloudTint, opacity));
    gradient.addColorStop(1, withAlpha(preset.cloudTint, 0));
    context.fillStyle = gradient;
    context.beginPath();
    for (let x = -40; x <= canvas.width + 40; x += 28) {
      const roughness = Math.sin(x * 0.018 + band) * height * 0.28 + Math.sin(x * 0.043 + world.terrainSeed) * height * 0.12 * (1 + iteration);
      if (x === -40) {
        context.moveTo(x, baseY + roughness);
      } else {
        context.lineTo(x, baseY + roughness);
      }
    }
    context.lineTo(canvas.width + 40, baseY + height);
    context.lineTo(-40, baseY + height);
    context.closePath();
    context.fill();
  }
}

function motifColorFor(world: WorldModel) {
  return materialPalette(world).secondary;
}

function createTriangularBrickGeometry(centered = false) {
  const height = Math.sqrt(3) * 0.5;
  const y0 = centered ? -0.5 : 0;
  const y1 = centered ? 0.5 : 1;
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -0.5, y0, -height / 3,
    0.5, y0, -height / 3,
    0, y0, (height * 2) / 3,
    -0.5, y1, -height / 3,
    0.5, y1, -height / 3,
    0, y1, (height * 2) / 3
  ]);
  const indices = [
    0, 2, 1,
    3, 4, 5,
    0, 1, 4,
    0, 4, 3,
    1, 2, 5,
    1, 5, 4,
    2, 0, 3,
    2, 3, 5
  ];
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    0.5, 0.86,
    0, 1,
    1, 1,
    0.5, 0.14
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRecursivePatternTexture(
  world: WorldModel,
  mode: "terrain" | "tetra" | "water" | "object" | "spiral"
) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const palette = materialPalette(world);
  const base = new THREE.Color(mode === "water" ? palette.waterGlow : mode === "object" ? palette.architecture : palette.surface);
  const accent = new THREE.Color(mode === "spiral" ? palette.glow : palette.secondary);
  context.fillStyle = `#${base.clone().lerp(accent, mode === "spiral" ? 0.18 : 0.06).getHexString()}`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "square";
  context.lineJoin = "miter";

  if (mode === "water") {
    drawFibonacciTexture(context, world);
  } else if (mode === "spiral") {
    drawSpiralTexture(context, world);
  } else if (mode === "tetra") {
    drawTriangularTexture(context, world);
  } else {
    drawPeanoTexture(context, world, mode === "object" ? 3 : 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(mode === "object" || mode === "spiral" ? 1.5 : 3, mode === "water" ? 2 : 3);
  texture.anisotropy = 4;
  return texture;
}

function createCityAsphaltTexture(world: WorldModel) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const nx = x / canvas.width;
      const ny = y / canvas.height;
      const fine = seeded(x * 0.71 + y * 1.37, world.terrainSeed);
      const aggregate = Math.sin((nx * 42.3 + ny * 13.8 + world.terrainSeed * 0.01) * Math.PI * 2);
      const crack = Math.abs(Math.sin((nx * 8.6 - ny * 11.2 + world.terrainSeed * 0.004) * Math.PI * 2)) > 0.985 ? -22 : 0;
      const tone = THREE.MathUtils.clamp(39 + fine * 26 + aggregate * 6 + crack, 12, 88);
      const index = (y * canvas.width + x) * 4;
      image.data[index] = tone;
      image.data[index + 1] = tone + 3;
      image.data[index + 2] = tone + 4;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  context.strokeStyle = "rgba(220,215,190,0.18)";
  context.lineWidth = 3;
  for (let stripe = 0; stripe < 5; stripe += 1) {
    const y = 40 + stripe * 96 + seeded(stripe + 5200, world.terrainSeed) * 20;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(512, y + seeded(stripe + 5300, world.terrainSeed) * 14 - 7);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.anisotropy = 8;
  return texture;
}

function createCityAsphaltNormalTexture(world: WorldModel) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const nx = x / canvas.width;
      const ny = y / canvas.height;
      const grain = Math.sin((nx * 91.4 + ny * 37.2 + world.terrainSeed * 0.02) * Math.PI * 2);
      const tar = Math.sin((nx * 21.8 - ny * 16.6 + world.terrainSeed * 0.013) * Math.PI * 2);
      const index = (y * canvas.width + x) * 4;
      image.data[index] = Math.round(128 + grain * 26 + tar * 12);
      image.data[index + 1] = Math.round(128 + grain * 18 - tar * 16);
      image.data[index + 2] = 236;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.anisotropy = 8;
  return texture;
}

function createBuildingFacadeTexture(world: WorldModel, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const base = new THREE.Color(height > 30 ? "#495256" : "#3d4548");
  const highlight = new THREE.Color("#6f7a7e");
  const shadow = new THREE.Color("#24292b");
  context.fillStyle = `#${base.getHexString()}`;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    const band = y % 28 < 2 ? 0.18 : 0;
    const tone = base.clone().lerp(highlight, band).lerp(shadow, seeded(y + 7100, world.terrainSeed) * 0.07);
    context.fillStyle = `#${tone.getHexString()}`;
    context.fillRect(0, y, canvas.width, 1);
  }

  context.fillStyle = "rgba(180,200,198,0.16)";
  for (let y = 18; y < canvas.height; y += 36) {
    for (let x = 14; x < canvas.width; x += 32) {
      if (seeded(x * 3 + y * 7, world.terrainSeed) < 0.32) {
        continue;
      }
      context.fillRect(x, y, 13, 18);
      if (seeded(x + y + 7200, world.terrainSeed) > 0.78) {
        context.fillStyle = "rgba(255,202,132,0.26)";
        context.fillRect(x, y, 13, 18);
        context.fillStyle = "rgba(180,200,198,0.16)";
      }
    }
  }

  context.strokeStyle = "rgba(0,0,0,0.28)";
  context.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 32) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, Math.max(1, height / 18));
  texture.anisotropy = 8;
  return texture;
}

function createDolomiteTerrainTexture(world: WorldModel) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const palette = materialPalette(world);
  const base = new THREE.Color(palette.stone);
  const warm = new THREE.Color(palette.secondary);
  const shadow = new THREE.Color("#566159");
  const image = context.createImageData(canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const nx = x / canvas.width;
      const ny = y / canvas.height;
      const strata = Math.sin((ny * 38 + Math.sin(nx * 13 + world.terrainSeed) * 1.6) * Math.PI * 2);
      const grain = Math.sin((nx * 97.3 + ny * 31.1 + world.terrainSeed * 0.017) * Math.PI * 2) * 0.5 +
        Math.sin((nx * 23.8 - ny * 75.4) * Math.PI * 2) * 0.34;
      const lichen = Math.max(0, Math.sin((nx * 15.3 + ny * 19.7 + world.terrainSeed * 0.04) * Math.PI * 2));
      const color = base.clone()
        .lerp(warm, Math.max(0, strata) * 0.12)
        .lerp(shadow, Math.max(0, -strata) * 0.16)
        .multiplyScalar(0.9 + grain * 0.08 + lichen * 0.05);
      const index = (y * canvas.width + x) * 4;
      image.data[index] = Math.round(THREE.MathUtils.clamp(color.r * 255, 0, 255));
      image.data[index + 1] = Math.round(THREE.MathUtils.clamp(color.g * 255, 0, 255));
      image.data[index + 2] = Math.round(THREE.MathUtils.clamp(color.b * 255, 0, 255));
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 7);
  texture.anisotropy = 8;
  return texture;
}

function createDolomiteNormalTexture(world: WorldModel) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const nx = x / canvas.width;
      const ny = y / canvas.height;
      const ridge = Math.sin((ny * 46 + Math.sin(nx * 8 + world.terrainSeed * 0.03)) * Math.PI * 2);
      const crack = Math.sin((nx * 34.1 - ny * 11.7 + world.terrainSeed * 0.011) * Math.PI * 2);
      const index = (y * canvas.width + x) * 4;
      image.data[index] = Math.round(128 + ridge * 38 + crack * 12);
      image.data[index + 1] = Math.round(128 + ridge * 18 - crack * 18);
      image.data[index + 2] = 232;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 10);
  texture.anisotropy = 8;
  return texture;
}

function dolomiteTerrainColor(height: number, slope: number, world: WorldModel) {
  const palette = materialPalette(world);
  const waterline = new THREE.Color("#536c67");
  const limestone = new THREE.Color(palette.stone);
  const cliff = new THREE.Color("#8a867d");
  const snow = new THREE.Color(palette.snow);
  const warm = new THREE.Color(palette.secondary);
  const elevation = THREE.MathUtils.clamp((height - world.waterLevel) / Math.max(world.terrainHeight, 1), 0, 1);
  const steepness = THREE.MathUtils.clamp(slope / 5.5, 0, 1);
  const color = limestone
    .clone()
    .lerp(waterline, height < world.waterLevel + 0.8 ? 0.42 : 0)
    .lerp(cliff, steepness * 0.36)
    .lerp(snow, THREE.MathUtils.smoothstep(elevation, 0.62, 0.9) * 0.68)
    .lerp(warm, Math.max(0, 0.22 - steepness * 0.12));
  return color.multiplyScalar(THREE.MathUtils.lerp(0.72, 1.18, elevation));
}

function drawPeanoTexture(context: CanvasRenderingContext2D, world: WorldModel, depth: number) {
  context.strokeStyle = withAlpha(materialPalette(world).secondary, world.biome === "neon" ? 0.58 : 0.42);
  context.lineWidth = 4;
  const draw = (x: number, y: number, size: number, level: number, flip: boolean) => {
    if (level <= 0) {
      context.strokeRect(x + size * 0.18, y + size * 0.18, size * 0.64, size * 0.64);
      return;
    }
    const third = size / 3;
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        if ((row + column + (flip ? 1 : 0)) % 2 === 0) {
          draw(x + column * third, y + row * third, third, level - 1, !flip);
        }
      }
    }
    context.beginPath();
    const points = flip
      ? [[0.18, 0.18], [0.82, 0.18], [0.82, 0.5], [0.18, 0.5], [0.18, 0.82], [0.82, 0.82]]
      : [[0.18, 0.82], [0.82, 0.82], [0.82, 0.5], [0.18, 0.5], [0.18, 0.18], [0.82, 0.18]];
    points.forEach(([px, py], index) => {
      const tx = x + px * size;
      const ty = y + py * size;
      if (index === 0) context.moveTo(tx, ty);
      else context.lineTo(tx, ty);
    });
    context.stroke();
  };
  draw(0, 0, 256, depth, world.terrainSeed % 2 === 0);
}

function drawTriangularTexture(context: CanvasRenderingContext2D, world: WorldModel) {
  context.strokeStyle = withAlpha(materialPalette(world).secondary, world.biome === "neon" ? 0.62 : 0.46);
  context.lineWidth = 3;
  const recurse = (x: number, y: number, size: number, level: number) => {
    const h = size * Math.sqrt(3) * 0.5;
    context.beginPath();
    context.moveTo(x, y + h);
    context.lineTo(x + size / 2, y);
    context.lineTo(x + size, y + h);
    context.closePath();
    context.stroke();
    if (level <= 0) return;
    recurse(x, y + h / 2, size / 2, level - 1);
    recurse(x + size / 2, y + h / 2, size / 2, level - 1);
    recurse(x + size / 4, y, size / 2, level - 1);
  };
  recurse(8, 16, 240, 4);
}

function drawFibonacciTexture(context: CanvasRenderingContext2D, world: WorldModel) {
  context.strokeStyle = withAlpha(materialPalette(world).secondary, world.biome === "neon" ? 0.52 : 0.38);
  context.fillStyle = withAlpha("#ffffff", 0.18);
  context.lineWidth = 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let index = 1; index < 180; index += 1) {
    const radius = Math.sqrt(index) * 8;
    const angle = index * golden + world.terrainSeed * 0.03;
    const x = 128 + Math.cos(angle) * radius;
    const y = 128 + Math.sin(angle) * radius;
    context.beginPath();
    context.arc(x, y, 1.4 + (index % 5) * 0.16, 0, Math.PI * 2);
    context.fill();
  }
  for (let ring = 0; ring < 5; ring += 1) {
    context.beginPath();
    context.arc(128, 128, 28 + ring * 22, 0, Math.PI * 2);
    context.stroke();
  }
}

function createWaterNormalTexture(world: WorldModel) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const nx = x / canvas.width;
      const ny = y / canvas.height;
      const ripple =
        Math.sin((nx * 19 + ny * 4.2 + world.terrainSeed * 0.013) * Math.PI * 2) * 0.32 +
        Math.sin((nx * -5.4 + ny * 16.2 + world.terrainSeed * 0.021) * Math.PI * 2) * 0.27 +
        Math.sin((nx * 38.4 + ny * 31.6) * Math.PI * 2) * 0.09;
      const cross =
        Math.cos((nx * 12.5 - ny * 9.2 + world.terrainSeed * 0.017) * Math.PI * 2) * 0.28 +
        Math.sin((nx * 28.2 + ny * 6.8) * Math.PI * 2) * 0.11;
      const index = (y * canvas.width + x) * 4;
      image.data[index] = Math.round(128 + ripple * 82);
      image.data[index + 1] = Math.round(128 + cross * 82);
      image.data[index + 2] = 232;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(world.landscapeStyle === "dolomite-spires" ? 7 : 4, world.landscapeStyle === "dolomite-spires" ? 5 : 3);
  texture.anisotropy = 8;
  return texture;
}

function drawSpiralTexture(context: CanvasRenderingContext2D, world: WorldModel) {
  context.strokeStyle = withAlpha(materialPalette(world).glow, world.biome === "neon" ? 0.7 : 0.52);
  context.lineWidth = 4;
  context.beginPath();
  for (let step = 0; step < 360; step += 1) {
    const angle = step * 0.18;
    const radius = step * 0.32;
    const x = 128 + Math.cos(angle + world.terrainSeed) * radius;
    const y = 128 + Math.sin(angle + world.terrainSeed) * radius;
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  drawPeanoTexture(context, world, 2);
}

function withAlpha(color: string, alpha: number) {
  const parsed = new THREE.Color(color);
  return `rgba(${Math.round(parsed.r * 255)}, ${Math.round(parsed.g * 255)}, ${Math.round(parsed.b * 255)}, ${alpha})`;
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.72)");
    gradient.addColorStop(0.48, "rgba(255,255,255,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(disposeMaterial);
    } else if (child instanceof THREE.Sprite) {
      disposeMaterial(child.material);
    } else if (child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(disposeMaterial);
    }
  });
}

function disposeMaterial(material: THREE.Material) {
  const maybeTextured = material as THREE.Material & {
    map?: THREE.Texture;
    emissiveMap?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
    metalnessMap?: THREE.Texture;
    alphaMap?: THREE.Texture;
  };
  maybeTextured.map?.dispose();
  maybeTextured.emissiveMap?.dispose();
  maybeTextured.normalMap?.dispose();
  maybeTextured.roughnessMap?.dispose();
  maybeTextured.metalnessMap?.dispose();
  maybeTextured.alphaMap?.dispose();
  material.dispose();
}
