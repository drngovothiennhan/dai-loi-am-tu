// Procedural 3D world for "Đại Lôi Âm Tự". No external model files: everything is built from Three.js
// primitives so the page opens without downloads. The character itself is a camera-facing sprite cut
// from the project artwork (see scripts/build-sprites.mjs). Only the player's own character is shown; there are no
// simulated companions.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type Zone = "hall" | "courtyard" | "bridge";
export type Pose = "stand" | "walk" | "sit" | "bow" | "dance" | "gassho";

export interface WorldEvents {
  onPoseChange?: (pose: Pose) => void;
  onZoneChange?: (zone: Zone) => void;
  onSeatChange?: (cushionId: number | null) => void;
  onBowComplete?: () => void;
  onSeatedSecond?: () => void;
  onArtError?: () => void;
}

const BOW_CYCLE = 4.5; // seconds for one full prostration (Ngũ thể đầu địa)
const GASSHO_TIME = 2.2;
const WALK_SPEED = 3.2;
const ALTAR = new THREE.Vector3(0, 0, -13.5);
const HALL_DOOR_Z = 12;
const BOUNDS = { minX: -30, maxX: 20, minZ: -16, maxZ: 38 };

// Keyframes for one bow cycle: [phase 0..1, rootY, upperX (bend forward), headX, armX, legX].
// Which drawing to show for each state. A character may not have every pose, so each one falls back
// along this chain until the atlas has a frame for it.
const POSE_FALLBACK: Record<string, string[]> = {
  idle: ["idle"],
  walk1: ["walk1", "idle"],
  walk2: ["walk2", "walk1", "idle"],
  pray: ["pray", "idle"],
  sit: ["sit", "kneel", "idle"],
  kneel: ["kneel", "prostrate", "pray", "idle"],
  prostrate: ["prostrate", "kneel", "pray", "idle"],
  dance: ["dance", "idle"],
};

export interface DecorArt {
  file: string;
  height: number;
  aspect: number;
}

// One shared atlas holds every character frame. A pose is the pixel rectangle of its frame in that atlas.
export type FrameRect = [number, number, number, number];

export interface CharacterArt {
  file: string;
  atlasW: number;
  atlasH: number;
  poses: Record<string, FrameRect>;
}

interface Cushion {
  id: number;
  x: number;
  z: number;
  mesh: THREE.Mesh;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function makeShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.5)");
    grad.addColorStop(0.6, "rgba(0,0,0,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

function makeCushionTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, "#ffd27a");
    grad.addColorStop(0.55, "#e8542b");
    grad.addColorStop(1, "#a8321a");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgba(255, 200, 90, 0.55)";
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(128, 128);
      g.rotate((i * Math.PI) / 4);
      g.beginPath();
      g.ellipse(0, -70, 22, 50, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.strokeStyle = "rgba(255, 221, 115, 0.9)";
    g.lineWidth = 10;
    g.beginPath();
    g.arc(128, 128, 118, 0, Math.PI * 2);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSoftDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.4)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

export class DaiLoAmTuWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private container: HTMLElement;
  private events: WorldEvents;
  private ground: THREE.Object3D[] = [];
  private cushions: Cushion[] = [];
  private seatRing: THREE.Mesh;
  private seatedId: number | null = null;
  private actor = new THREE.Group();
  private sprite: THREE.Mesh;
  private spriteMat: THREE.MeshBasicMaterial;
  private spriteTex: THREE.Texture | null = null;
  private atlasFile: string | null = null;
  private art: CharacterArt;
  private decor: Record<string, DecorArt>;
  private billboards: THREE.Mesh[] = [];
  private facing = 1;
  private spriteH = 1.95;
  private target: THREE.Vector3 | null = null;
  private afterWalk: (() => void) | null = null;
  private mode: "stand" | "bow" | "dance" = "stand";
  private bowT = 0;
  private danceT = 0;
  private gasshoT = 0;
  private walkPhase = 0;
  private meditateAcc = 0;
  private zone: Zone = "hall";
  private lastPose: Pose = "stand";
  private cameraOffset = new THREE.Vector3(0, 6.5, 11);
  private cameraTween = false;
  private lookAt = new THREE.Vector3();
  private keyDir = new THREE.Vector2();
  private keysDown = new Set<string>();
  private pointerDown: { x: number; y: number } | null = null;
  private lanterns: THREE.PointLight[] = [];
  private smoke: THREE.Points;
  private smokeBase: Float32Array;
  private clouds: THREE.Object3D;
  private moon: THREE.Mesh;
  private hemi: THREE.HemisphereLight;
  private skyDay = new THREE.Color(0xf0c27a);
  private skyNight = new THREE.Color(0x161936);
  private fogDay = new THREE.Color(0xf3c98a);
  private fogNight = new THREE.Color(0x1d2046);
  private destroyed = false;
  private onResize = () => this.resize();
  private onKeyDown = (e: KeyboardEvent) => this.handleKey(e, true);
  private onKeyUp = (e: KeyboardEvent) => this.handleKey(e, false);
  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY };
  };
  private onPointerUp = (e: PointerEvent) => {
    const start = this.pointerDown;
    this.pointerDown = null;
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > 6) return; // a drag rotates the camera instead
    this.handleClick(e);
  };

  constructor(
    container: HTMLElement,
    art: CharacterArt,
    decor: Record<string, DecorArt>,
    events: WorldEvents = {},
  ) {
    this.container = container;
    this.events = events;
    this.art = art;
    this.decor = decor;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, this.aspect(), 0.5, 300);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 90;

    this.scene.background = this.skyDay.clone();
    this.scene.fog = new THREE.Fog(this.fogDay.clone(), 60, 170);

    this.hemi = new THREE.HemisphereLight(0xffe2b0, 0x4a2a1a, 0.9);
    this.scene.add(this.hemi);
    const moonLight = new THREE.DirectionalLight(0xffffff, 0.5);
    moonLight.position.set(6, 22, 10);
    this.scene.add(moonLight);

    this.buildHall();
    this.buildCushions();
    this.buildCourtyard();
    this.spriteMat = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      depthWrite: true,
      toneMapped: false,
    });
    this.sprite = new THREE.Mesh(new THREE.PlaneGeometry(this.spriteH, this.spriteH), this.spriteMat);
    this.sprite.position.y = this.spriteH / 2;
    this.actor.add(this.sprite);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.6),
      new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    this.actor.add(shadow);
    this.scene.add(this.actor);
    this.actor.position.set(0, 0, 5);
    this.setCharacter(art);
    this.applyCameraPreset("hall", true);

    this.seatRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.035, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd76b }),
    );
    this.seatRing.rotation.x = Math.PI / 2;
    this.seatRing.visible = false;
    this.scene.add(this.seatRing);

    this.clouds = this.buildCloudSea();
    this.scene.add(this.clouds);
    this.moon = this.buildMoon();
    this.scene.add(this.moon);
    const smokeData = this.buildSmoke();
    this.smoke = smokeData.points;
    this.smokeBase = smokeData.base;
    this.setDay(true);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.raf = requestAnimationFrame(this.tick);
  }

  // ---- public API ----------------------------------------------------------------------------

  bow(): void {
    this.cancelWalk();
    if (this.seatedId !== null) this.standUp();
    this.mode = "bow";
    this.bowT = 0;
  }

  dance(): void {
    this.cancelWalk();
    if (this.seatedId !== null) this.standUp();
    this.mode = "dance";
    this.danceT = 0;
  }

  gassho(): void {
    this.gasshoT = GASSHO_TIME;
  }

  stop(): void {
    this.cancelWalk();
    this.mode = "stand";
    this.standUp();
  }

  walkTo(x: number, z: number): void {
    this.afterWalk = null;
    this.setTarget(x, z);
  }

  setZone(zone: Zone): void {
    this.applyCameraPreset(zone, false);
  }

  setDay(day: boolean): void {
    const sky = day ? this.skyDay : this.skyNight;
    const fog = day ? this.fogDay : this.fogNight;
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(fog);
    this.hemi.intensity = day ? 0.9 : 0.35;
    this.moon.visible = !day;
  }

  dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.controls.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---- building ------------------------------------------------------------------------------


  // A piece of painted scenery standing in the 3D room. The plane is sized from the artwork's own
  // proportions and anchored at its foot, then turned to face the camera each frame.
  private addBillboard(name: string, x: number, y: number, z: number, opts: { scale?: number; faceCamera?: boolean } = {}) {
    const art = this.decor[name];
    if (!art) return null;
    const scale = opts.scale ?? 1;
    const h = art.height * scale;
    const w = h * art.aspect;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y + h / 2, z);
    this.scene.add(mesh);
    if (opts.faceCamera !== false) this.billboards.push(mesh);
    new THREE.TextureLoader().load(art.file, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      mat.map = tex;
      mat.needsUpdate = true;
    }, undefined, () => this.events.onArtError?.());
    return mesh;
  }

  private stone(color: number, rough = 0.8): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
  }

  private addMesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.scene) {
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);
    return mesh;
  }

  private buildHall(): void {
    const floor = this.addMesh(
      new THREE.BoxGeometry(32, 0.6, 30),
      new THREE.MeshStandardMaterial({ color: 0x3b1c11, roughness: 0.28, metalness: 0.12 }),
    );
    floor.position.set(0, -0.3, -3);
    this.ground.push(floor);

    const wood = this.stone(0x6e1812, 0.6);
    const back = this.addMesh(new THREE.BoxGeometry(34, 12, 0.6), this.stone(0x4a1812, 0.9));
    back.position.set(0, 6, -18.3);
    const roof = this.addMesh(new THREE.BoxGeometry(36, 0.6, 34), wood);
    roof.position.set(0, 11.5, -3);

    // Pillars: 8 along the hall, two dragon pillars flanking the altar.
    const pillarGeo = new THREE.CylinderGeometry(0.6, 0.66, 11, 20);
    [-10.5, 10.5].forEach((x) => {
      [-14, -4, 4, 10].forEach((z) => {
        const p = this.addMesh(pillarGeo, wood);
        p.position.set(x, 5.5, z);
      });
    });

    [-5.5, 5.5].forEach((x) => {
      const col = this.addMesh(new THREE.CylinderGeometry(0.65, 0.7, 13, 24), wood);
      col.position.set(x, 6.5, -9.5);
      this.addBillboard("dragon", x, 1.2, -8.6);
    });

    // Altar: octagonal base, golden lotus, seated Buddha with mandorla.
    const base = this.addMesh(new THREE.CylinderGeometry(4.8, 5.2, 1.4, 8), wood);
    base.position.set(0, 0.7, ALTAR.z);
    // The statue is painted scenery rather than geometry: a modelled Buddha built from primitives
    // reads as a bell, and this artwork is the real thing.
    this.addBillboard("buddha", 0, 1.4, ALTAR.z + 0.2);

    const altarLight = new THREE.PointLight(0xffaa33, 40, 22, 1.5);
    altarLight.position.set(0, 2.6, ALTAR.z + 3);
    this.scene.add(altarLight);

    // Standing lamps down both sides of the aisle, each with a warm point light.
    [-7.5, 7.5].forEach((x) => {
      [-11, -5, 1, 7].forEach((z, i) => {
        this.addBillboard("lantern", x, 0, z);
        if (i % 2 === 0) {
          const light = new THREE.PointLight(0xff8a33, 14, 13, 1.6);
          light.position.set(x, 2.1, z);
          this.scene.add(light);
          this.lanterns.push(light);
        }
      });
    });

    // Incense burners in front of the hall entrance; the smoke itself is particles (see buildSmoke).
    [-3, 3].forEach((x) => this.addBillboard("burner", x, 0, 10));
  }

  private buildCushions(): void {
    const texture = makeCushionTexture();
    const top = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xc23d1f, roughness: 0.7 });
    const geo = new THREE.CylinderGeometry(0.68, 0.72, 0.22, 24);
    const materials = [rim, top, rim];
    let id = 0;
    for (let row = 0; row < 9; row++) {
      for (let side = 0; side < 2; side++) {
        for (let col = 0; col < 6; col++) {
          const x = (side === 0 ? -1 : 1) * (2.4 + col * 0.85);
          const z = 6 - row * 1.6;
          const mesh = new THREE.Mesh(geo, materials);
          mesh.position.set(x, 0.11, z);
          this.scene.add(mesh);
          this.cushions.push({ id: id++, x, z, mesh });
        }
      }
    }
  }

  private buildCourtyard(): void {
    const courtyard = this.addMesh(new THREE.BoxGeometry(40, 0.6, 26), this.stone(0x6b5a47, 0.9));
    courtyard.position.set(0, -0.3, 25);
    this.ground.push(courtyard);

    // The sacred tree and the stone lanterns are painted scenery.
    this.addBillboard("tree", -5.5, 0, 19.5);
    [-11, 10.5].forEach((x) => this.addBillboard("stone-lantern", x, 0, 16));

    // Lotus pond with pink glowing blossoms.
    const pond = this.addMesh(
      new THREE.CylinderGeometry(4.2, 4.2, 0.2, 40),
      new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92 }),
    );
    pond.position.set(5.5, 0.02, 21.5);
    const pads = this.stone(0x3f8a4a, 0.7);
    for (let i = 0; i < 6; i++) {
      const pad = this.addMesh(new THREE.CircleGeometry(0.5, 16), pads);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(5.5 + Math.cos(i) * 2.6, 0.13, 21.5 + Math.sin(i * 1.7) * 2.2);
    }
    for (let i = 0; i < 6; i++) {
      this.addBillboard("lotus", 5.5 + Math.cos(i) * 2.6, 0.1, 21.5 + Math.sin(i * 1.7) * 2.2);
    }

    // Stone bridge across the mist to the west.
    const bridge = new THREE.Group();
    bridge.position.set(-26, -0.8, 28);
    this.scene.add(bridge);
    const wood = this.stone(0x6b4226, 0.85);
    for (let i = 0; i < 12; i++) {
      const plank = this.addMesh(new THREE.BoxGeometry(1.1, 0.12, 2.2), wood, bridge);
      plank.position.set(-5.5 + i * 1, 0.06, 0);
      this.ground.push(plank);
    }
    [-1.1, 1.1].forEach((z) => {
      const rail = this.addMesh(new THREE.BoxGeometry(12, 0.1, 0.1), wood, bridge);
      rail.position.set(0, 0.8, z);
    });
    // Cloud sea and mist are visual only, drawn below the ground.
  }

  private buildCloudSea(): THREE.Object3D {
    const group = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xf6eef0, transparent: true, opacity: 0.85 });
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const puff = new THREE.SphereGeometry(1, 12, 10);
    for (let i = 0; i < 60; i++) {
      const cloud = new THREE.Group();
      // Keep the sea well below the floor (floor bottom is y = -0.6) so it never pokes into the hall.
      cloud.position.set((rand() - 0.5) * 110, -6 + rand() * 1.5, (rand() - 0.3) * 110 - 10);
      for (let k = 0; k < 3; k++) {
        const p = new THREE.Mesh(puff, cloudMat);
        p.position.set((rand() - 0.5) * 5, (rand() - 0.5) * 0.6, (rand() - 0.5) * 3);
        p.scale.setScalar(2 + rand() * 2.5);
        cloud.add(p);
      }
      group.add(cloud);
    }
    return group;
  }

  private buildMoon(): THREE.Mesh {
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xf5f7ff }),
    );
    moon.position.set(8, 26, -60);
    return moon;
  }

  private buildSmoke(): { points: THREE.Points; base: Float32Array } {
    const count = 80;
    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base[i * 3] = (Math.random() - 0.5) * 0.4;
      base[i * 3 + 1] = Math.random() * 5;
      base[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(base);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.9,
      map: makeSoftDotTexture(),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    [-3, 3].forEach((x) => {
      const clone = new THREE.Points(geo, mat);
      clone.position.set(x, 1.6, 10);
      this.scene.add(clone);
    });
    points.position.set(0, 1.6, 10);
    this.scene.add(points);
    return { points, base };
  }

  // ---- movement and state --------------------------------------------------------------------

  private aspect(): number {
    return (this.container.clientWidth || 1) / (this.container.clientHeight || 1);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // The camera orbits the character rather than a fixed point in the room, so the character is always
  // the subject and never ends up behind the action bar. Each zone only changes how far back it sits.
  private applyCameraPreset(zone: Zone, immediate: boolean): void {
    const offsets: Record<Zone, [number, number, number]> = {
      hall: [0, 8.5, 17],
      courtyard: [0, 9, 19],
      bridge: [0, 8, 17],
    };
    const [ox, oy, oz] = offsets[zone];
    this.cameraOffset.set(ox, oy, oz);
    if (immediate) {
      this.camera.position.copy(this.actor.position).add(this.cameraOffset);
      this.controls.target.copy(this.actor.position).add(new THREE.Vector3(0, 2.4, -4));
      this.cameraTween = false;
    } else {
      this.cameraTween = true;
    }
    if (zone !== this.zone) {
      this.zone = zone;
      this.events.onZoneChange?.(zone);
    }
  }

  private zoneFor(x: number, z: number): Zone {
    if (z < HALL_DOOR_Z) return "hall";
    return x < -20 ? "bridge" : "courtyard";
  }

  private setTarget(x: number, z: number): void {
    if (this.seatedId !== null) this.standUp();
    this.mode = "stand";
    this.target = new THREE.Vector3(
      Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, x)),
      0,
      Math.min(BOUNDS.maxZ, Math.max(BOUNDS.minZ, z)),
    );
  }

  private cancelWalk(): void {
    this.target = null;
    this.afterWalk = null;
  }

  private sitOn(cushion: Cushion): void {
    this.afterWalk = null;
    this.seatedId = cushion.id;
    this.actor.position.set(cushion.x, 0, cushion.z);
    this.seatRing.position.set(cushion.x, 0.24, cushion.z);
    this.seatRing.visible = true;
    this.meditateAcc = 0;
    this.events.onSeatChange?.(cushion.id);
  }

  private standUp(): void {
    if (this.seatedId === null) return;
    this.seatedId = null;
    this.seatRing.visible = false;
    this.events.onSeatChange?.(null);
  }

  private pushOutOfObstacles(pos: THREE.Vector3): void {
    const obstacles: Array<[number, number, number]> = [
      [-10.5, -14, 0.9], [-10.5, -4, 0.9], [-10.5, 4, 0.9], [-10.5, 10, 0.9],
      [10.5, -14, 0.9], [10.5, -4, 0.9], [10.5, 4, 0.9], [10.5, 10, 0.9],
      [-5.5, -9.5, 1.0], [5.5, -9.5, 1.0], [0, ALTAR.z, 5.6],
      [-3, 10, 1.0], [3, 10, 1.0], [-5.5, 19.5, 1.4], [5.5, 21.5, 4.4],
    ];
    obstacles.forEach(([ox, oz, r]) => {
      const dx = pos.x - ox;
      const dz = pos.z - oz;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < r) {
        pos.x = ox + (dx / d) * r;
        pos.z = oz + (dz / d) * r;
      }
    });
  }

  private handleClick(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);

    const cushionHit = ray.intersectObjects(this.cushions.map((c) => c.mesh), false)[0];
    if (cushionHit) {
      const cushion = this.cushions.find((c) => c.mesh === cushionHit.object);
      if (cushion) {
        if (this.seatedId === cushion.id) {
          this.stop();
          return;
        }
        this.setTarget(cushion.x, cushion.z + 0.9);
        this.afterWalk = () => this.sitOn(cushion);
        return;
      }
    }
    const groundHit = ray.intersectObjects(this.ground, false)[0];
    if (groundHit) {
      this.walkTo(groundHit.point.x, groundHit.point.z);
    }
  }

  private handleKey(e: KeyboardEvent, down: boolean): void {
    const key = e.key.toLowerCase();
    const map: Record<string, string> = {
      w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right",
    };
    const dir = map[key];
    if (!dir) return;
    if (down) this.keysDown.add(dir);
    else this.keysDown.delete(dir);
    if (down && (dir === "up" || dir === "down" || dir === "left" || dir === "right")) {
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
    }
  }

  private updateKeyboard(): void {
    const x = (this.keysDown.has("right") ? 1 : 0) - (this.keysDown.has("left") ? 1 : 0);
    const z = (this.keysDown.has("down") ? 1 : 0) - (this.keysDown.has("up") ? 1 : 0);
    this.keyDir.set(x, z);
    if (this.keyDir.lengthSq() > 0) {
      this.cancelWalk();
      if (this.seatedId !== null) this.standUp();
      this.mode = "stand";
    }
  }

  private updateMovement(dt: number): void {
    const pos = this.actor.position;
    if (this.keyDir.lengthSq() > 0) {
      const step = this.keyDir.clone().normalize().multiplyScalar(WALK_SPEED * dt);
      pos.x += step.x;
      pos.z += step.y;
      this.walkPhase += dt * 9;
      if (Math.abs(step.x) > 1e-4) this.facing = step.x > 0 ? 1 : -1;
      this.pushOutOfObstacles(pos);
      pos.x = Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, pos.x));
      pos.z = Math.min(BOUNDS.maxZ, Math.max(BOUNDS.minZ, pos.z));
      return;
    }
    if (!this.target) return;
    const dx = this.target.x - pos.x;
    const dz = this.target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    if (dist <= step) {
      pos.x = this.target.x;
      pos.z = this.target.z;
      this.target = null;
      const next = this.afterWalk;
      this.afterWalk = null;
      next?.();
      return;
    }
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    this.pushOutOfObstacles(pos);
    this.walkPhase += dt * 9;
    if (Math.abs(dx) > 1e-4) this.facing = dx > 0 ? 1 : -1;
  }

  // Which drawing the current state should show.
  private wantedPose(): string {
    if (this.gasshoT > 0) return "pray";
    if (this.seatedId !== null) return "sit";
    if (this.target || this.keyDir.lengthSq() > 0) {
      return Math.sin(this.walkPhase) >= 0 ? "walk1" : "walk2";
    }
    if (this.mode === "bow") {
      const phase = this.bowT / BOW_CYCLE;
      if (phase < 0.25) return "pray";
      if (phase < 0.45) return "kneel";
      if (phase < 0.72) return "prostrate";
      return "kneel";
    }
    if (this.mode === "dance") return "dance";
    return "idle";
  }

  private frameFor(pose: string): FrameRect {
    for (const name of POSE_FALLBACK[pose] ?? [pose]) {
      const rect = this.art.poses[name];
      if (rect) return rect;
    }
    return this.art.poses.idle;
  }

  private poseLabel(): Pose {
    if (this.gasshoT > 0) return "gassho";
    if (this.seatedId !== null) return "sit";
    if (this.target || this.keyDir.lengthSq() > 0) return "walk";
    return this.mode === "bow" ? "bow" : this.mode === "dance" ? "dance" : "stand";
  }

  private applyPose(dt: number, t: number): void {
    const [x, y, w, h] = this.frameFor(this.wantedPose());
    if (this.spriteTex) {
      // Texture coordinates are bottom-up, so the atlas row is flipped.
      this.spriteTex.repeat.set(w / this.art.atlasW, h / this.art.atlasH);
      this.spriteTex.offset.set(x / this.art.atlasW, 1 - (y + h) / this.art.atlasH);
    }

    // Face the camera around the vertical axis only, so the character never lies down or shears.
    const dx = this.camera.position.x - this.actor.position.x;
    const dz = this.camera.position.z - this.actor.position.z;
    this.sprite.rotation.y = Math.atan2(dx, dz);

    // Mirror the walk drawings so the character faces the way it is going, judged in screen space.
    const right = Math.cos(this.sprite.rotation.y) * this.facing;
    const flip = right >= 0 ? 1 : -1;
    this.sprite.scale.x = lerp(this.sprite.scale.x, flip, Math.min(1, dt * 12)) || flip;

    // A small bob while walking, and a settle while seated.
    const walking = !!this.target || this.keyDir.lengthSq() > 0;
    const seated = this.seatedId !== null;
    const bob = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : Math.sin(t * 2) * 0.01;
    const targetY = (seated ? 0.16 : 0) + this.spriteH / 2 + bob;
    this.sprite.position.y = lerp(this.sprite.position.y, targetY, Math.min(1, dt * 10));
  }

  setCharacter(art: CharacterArt): void {
    this.art = art;
    if (this.spriteTex && this.atlasFile === art.file) {
      this.spriteMat.map = this.spriteTex;
      return;
    }
    new THREE.TextureLoader().load(
      art.file,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        const old = this.spriteTex;
        this.spriteTex = tex;
        this.atlasFile = art.file;
        this.spriteMat.map = tex;
        this.spriteMat.needsUpdate = true;
        old?.dispose();
      },
      undefined,
      () => this.events.onArtError?.(),
    );
  }

  private updateMode(dt: number): void {
    if (this.gasshoT > 0) this.gasshoT = Math.max(0, this.gasshoT - dt);
    if (this.mode === "bow") {
      this.bowT += dt;
      if (this.bowT >= BOW_CYCLE) {
        this.bowT -= BOW_CYCLE;
        this.events.onBowComplete?.();
      }
    }
    if (this.mode === "dance") this.danceT += dt;
    if (this.seatedId !== null) {
      this.meditateAcc += dt;
      if (this.meditateAcc >= 1) {
        this.meditateAcc -= 1;
        this.events.onSeatedSecond?.();
      }
    }
  }

  private updateCamera(dt: number): void {
    // The look-at point always tracks the character, so orbiting and walking both stay framed.
    // Aim a little above the character and a little ahead of it, so the altar stays in the frame.
    this.lookAt.copy(this.actor.position).add(new THREE.Vector3(0, 2.4, -4));
    this.controls.target.lerp(this.lookAt, Math.min(1, dt * 4));
    if (!this.cameraTween) return;
    const goal = this.actor.position.clone().add(this.cameraOffset);
    this.camera.position.lerp(goal, Math.min(1, dt * 2.2));
    if (this.camera.position.distanceTo(goal) < 0.15) this.cameraTween = false;
  }

  private tick = (): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    this.updateKeyboard();
    this.updateMovement(dt);
    this.updateMode(dt);
    this.applyPose(dt, t);

    const zone = this.zoneFor(this.actor.position.x, this.actor.position.z);
    if (zone !== this.zone) {
      this.applyCameraPreset(zone, false);
    }
    const label = this.poseLabel();
    if (label !== this.lastPose) {
      this.lastPose = label;
      this.events.onPoseChange?.(label);
    }

    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;
    this.billboards.forEach((b) => {
      b.rotation.y = Math.atan2(camX - b.position.x, camZ - b.position.z);
    });
    this.lanterns.forEach((light, i) => {
      light.intensity = 13 + Math.sin(t * 2.2 + i) * 2;
    });
    this.clouds.rotation.y = t * 0.002;
    this.animateSmoke(dt);

    this.updateCamera(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private animateSmoke(dt: number): void {
    const attr = this.smoke.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] += dt * 0.6;
      arr[i] += Math.sin(arr[i + 1] * 2) * dt * 0.05;
      if (arr[i + 1] > 5) {
        arr[i] = this.smokeBase[i];
        arr[i + 1] = 0;
        arr[i + 2] = this.smokeBase[i + 2];
      }
    }
    attr.needsUpdate = true;
  }
}
