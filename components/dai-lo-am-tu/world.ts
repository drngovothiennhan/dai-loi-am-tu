// Procedural 3D world for "Đại Lôi Âm Tự". No external model files: everything is built from Three.js
// primitives so the page opens without downloads. Only the player's own monk is shown; there are no
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
}

const BOW_CYCLE = 4.5; // seconds for one full prostration (Ngũ thể đầu địa)
const GASSHO_TIME = 2.2;
const WALK_SPEED = 3.2;
const ALTAR = new THREE.Vector3(0, 0, -13.5);
const HALL_DOOR_Z = 12;
const BOUNDS = { minX: -30, maxX: 20, minZ: -16, maxZ: 38 };

// Keyframes for one bow cycle: [phase 0..1, rootY, upperX (bend forward), headX, armX, legX].
const BOW_KEYS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0.0, 0, 0, 0.1, -1.0, 0],
  [0.18, 0, 0, 0.1, -1.0, 0],
  [0.3, 0.12, 0, 0.1, -1.0, -1.3],
  [0.48, 0.12, 1.2, 0.6, -1.4, -1.3],
  [0.6, 0.12, 1.2, 0.6, -1.4, -1.3],
  [0.8, 0.12, 0, 0.1, -1.0, -1.3],
  [0.92, 0, 0, 0.1, -1.0, 0],
  [1.0, 0, 0, 0.1, -1.0, 0],
];

interface PoseValues {
  rootY: number;
  upperX: number;
  headX: number;
  armL: number;
  armR: number;
  armZL: number;
  armZR: number;
  legL: number;
  legR: number;
}

const REST: PoseValues = {
  rootY: 0, upperX: 0, headX: 0, armL: 0.05, armR: 0.05, armZL: 0.08, armZR: -0.08, legL: 0, legR: 0,
};

interface Monk {
  root: THREE.Group;
  upper: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  eyes: THREE.Mesh[];
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

function sampleBowKeys(p: number): PoseValues {
  const keys = BOW_KEYS;
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const [p0, ...a] = keys[i];
  const [p1, ...b] = keys[i + 1];
  const k = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
  return {
    ...REST,
    rootY: lerp(a[0], b[0], k),
    upperX: lerp(a[1], b[1], k),
    headX: lerp(a[2], b[2], k),
    armL: lerp(a[3], b[3], k),
    armR: lerp(a[3], b[3], k),
    legL: lerp(a[4], b[4], k),
    legR: lerp(a[4], b[4], k),
  };
}

function buildMonk(): Monk {
  const skin = new THREE.MeshStandardMaterial({ color: 0xf5cbb7, roughness: 0.7 });
  const robe = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.8 });
  const robeDark = new THREE.MeshStandardMaterial({ color: 0x784b2a, roughness: 0.85 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.9 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.5 });
  const cheek = new THREE.MeshStandardMaterial({ color: 0xf08c7a, roughness: 0.8 });

  const root = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = 0.5;
  root.add(upper);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.78, 18), robe);
  torso.position.y = 0.39;
  upper.add(torso);
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 18), robeDark);
  sash.position.y = 0.2;
  upper.add(sash);

  const head = new THREE.Group();
  head.position.y = 1.0;
  upper.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), skin);
  head.add(skull);

  const eyeGeo = new THREE.SphereGeometry(0.05, 10, 10);
  const eyes: THREE.Mesh[] = [];
  [-0.14, 0.14].forEach((x) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 0.04, 0.37);
    head.add(eye);
    eyes.push(eye);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), cheek);
    c.position.set(x * 1.6, -0.08, 0.33);
    head.add(c);
  });

  const armGeo = new THREE.CapsuleGeometry(0.1, 0.4, 4, 10);
  armGeo.translate(0, -0.27, 0);
  const makeArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.42, 0.7, 0);
    const arm = new THREE.Mesh(armGeo, robe);
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), skin);
    hand.position.y = -0.55;
    pivot.add(hand);
    upper.add(pivot);
    return pivot;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  const legGeo = new THREE.CapsuleGeometry(0.13, 0.28, 4, 10);
  legGeo.translate(0, -0.2, 0);
  const makeLeg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.16, 0.5, 0);
    const leg = new THREE.Mesh(legGeo, robeDark);
    pivot.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), shoe);
    foot.position.set(0, -0.44, 0.06);
    pivot.add(foot);
    root.add(pivot);
    return pivot;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  return { root, upper, head, armL, armR, legL, legR, eyes };
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
  private monk: Monk;
  private pose: PoseValues = { ...REST };
  private target: THREE.Vector3 | null = null;
  private afterWalk: (() => void) | null = null;
  private mode: "stand" | "bow" | "dance" = "stand";
  private bowT = 0;
  private danceT = 0;
  private gasshoT = 0;
  private walkPhase = 0;
  private meditateAcc = 0;
  private blinkT = 0;
  private zone: Zone = "hall";
  private lastPose: Pose = "stand";
  private cameraGoal = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private cameraTween = false;
  private keyDir = new THREE.Vector2();
  private keysDown = new Set<string>();
  private pointerDown: { x: number; y: number } | null = null;
  private lanterns: THREE.Object3D[] = [];
  private smoke: THREE.Points;
  private smokeBase: Float32Array;
  private foliage: THREE.Object3D;
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

  constructor(container: HTMLElement, events: WorldEvents = {}) {
    this.container = container;
    this.events = events;

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
    this.applyCameraPreset("hall", true);

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
    this.monk = buildMonk();
    this.scene.add(this.monk.root);
    this.monk.root.position.set(0, 0, 3);
    this.monk.root.rotation.y = Math.PI;

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
    this.foliage = this.courtyardFoliage;
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

  private courtyardFoliage: THREE.Object3D = new THREE.Group();

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

    const gold = new THREE.MeshStandardMaterial({ color: 0xffc13b, metalness: 0.7, roughness: 0.3, emissive: 0x6b4300, emissiveIntensity: 0.4 });
    [-5.5, 5.5].forEach((x) => {
      const col = this.addMesh(new THREE.CylinderGeometry(0.65, 0.7, 13, 24), wood);
      col.position.set(x, 6.5, -9.5);
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        const a = t * Math.PI * 6 * (x < 0 ? 1 : -1);
        points.push(new THREE.Vector3(x + Math.cos(a) * 0.85, 0.8 + t * 10.5, -9.5 + Math.sin(a) * 0.85));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      this.addMesh(new THREE.TubeGeometry(curve, 80, 0.18, 12, false), gold);
      const head = this.addMesh(new THREE.ConeGeometry(0.4, 1, 10), gold);
      head.position.set(x, 11.6, -9.5);
      head.rotation.x = Math.PI;
    });

    // Altar: octagonal base, golden lotus, seated Buddha with mandorla.
    const base = this.addMesh(new THREE.CylinderGeometry(4.8, 5.2, 1.4, 8), wood);
    base.position.set(0, 0.7, ALTAR.z);
    const lotusProfile = [
      new THREE.Vector2(0.01, 0), new THREE.Vector2(1.8, 0.2), new THREE.Vector2(2.4, 0.6),
      new THREE.Vector2(1.2, 1.0), new THREE.Vector2(0.01, 1.1),
    ];
    const lotus = this.addMesh(
      new THREE.LatheGeometry(lotusProfile, 32),
      new THREE.MeshStandardMaterial({ color: 0xffbf3c, emissive: 0xff9800, emissiveIntensity: 0.45, metalness: 0.5, roughness: 0.35 }),
    );
    lotus.position.set(0, 1.4, ALTAR.z);
    const buddha = new THREE.Group();
    buddha.position.set(0, 1.4, ALTAR.z);
    this.scene.add(buddha);
    const body = this.addMesh(new THREE.CylinderGeometry(1.0, 1.3, 2.4, 20), gold, buddha);
    body.position.y = 1.5;
    const bust = this.addMesh(new THREE.SphereGeometry(0.7, 24, 24), gold, buddha);
    bust.position.y = 3.3;
    const ush = this.addMesh(new THREE.SphereGeometry(0.22, 12, 12), gold, buddha);
    ush.position.y = 4.1;
    const mandorla = this.addMesh(
      new THREE.RingGeometry(2.6, 3.3, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd76b, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
      buddha,
    );
    mandorla.position.set(0, 2.6, -0.6);

    const altarLight = new THREE.PointLight(0xffaa33, 40, 22, 1.5);
    altarLight.position.set(0, 2.6, ALTAR.z + 3);
    this.scene.add(altarLight);

    // Lanterns hung from the roof; four of them cast warm light.
    const lanternGeo = new THREE.CylinderGeometry(0.45, 0.55, 0.9, 6);
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0xff7722, emissive: 0xff5511, emissiveIntensity: 0.9 });
    const lanternPositions: Array<[number, number, number]> = [
      [-8, 7.5, -8], [8, 7.5, -8], [-8, 7.5, 6], [8, 7.5, 6], [-3, 8, 2], [3, 8, 2],
    ];
    lanternPositions.forEach(([x, y, z], i) => {
      const group = new THREE.Group();
      group.position.set(x, y, z);
      this.scene.add(group);
      const cord = this.addMesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 4), this.stone(0x2b1a10), group);
      cord.position.y = 1.9;
      this.addMesh(lanternGeo, lanternMat, group);
      this.lanterns.push(group);
      if (i < 4) {
        const light = new THREE.PointLight(0xff7722, 18, 12, 1.5);
        light.position.set(0, -0.2, 0);
        group.add(light);
      }
    });

    // Incense burners in front of the hall entrance.
    [-3, 3].forEach((x) => {
      const bronze = this.stone(0x9a7b3c, 0.4);
      const bowl = this.addMesh(new THREE.CylinderGeometry(0.7, 0.5, 0.7, 20), bronze);
      bowl.position.set(x, 0.35, 10);
      const rim = this.addMesh(new THREE.TorusGeometry(0.7, 0.06, 8, 24), bronze);
      rim.position.set(x, 0.72, 10);
      rim.rotation.x = Math.PI / 2;
      [-0.25, 0, 0.25].forEach((dx) => {
        const stick = this.addMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), this.stone(0x8b2a1a));
        stick.position.set(x + dx, 1.2, 10);
      });
    });
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

    // Bodhi tree: trunk plus clusters of golden leaves that glow.
    const treeRoot = new THREE.Group();
    treeRoot.position.set(-5.5, 0, 19.5);
    this.scene.add(treeRoot);
    const bark = this.stone(0x6e4a2a, 0.9);
    this.addMesh(new THREE.CylinderGeometry(0.35, 0.7, 4.2, 10), bark, treeRoot).position.y = 2.1;
    for (let i = 0; i < 6; i++) {
      const branch = this.addMesh(new THREE.CylinderGeometry(0.08, 0.16, 2.4, 6), bark, treeRoot);
      const a = (i / 6) * Math.PI * 2;
      branch.position.set(Math.cos(a) * 0.8, 4.6, Math.sin(a) * 0.8);
      branch.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    }
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0xffcc33, emissiveIntensity: 0.65, roughness: 0.5 });
    const foliage = new THREE.Group();
    foliage.position.y = 5.2;
    treeRoot.add(foliage);
    const leafGeo = new THREE.IcosahedronGeometry(0.6, 0);
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 60; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const r = 1.2 + rand() * 2.6;
      const a = rand() * Math.PI * 2;
      leaf.position.set(Math.cos(a) * r, rand() * 2.2 + 0.4, Math.sin(a) * r * 0.8);
      leaf.scale.setScalar(0.6 + rand() * 0.5);
      foliage.add(leaf);
    }
    this.courtyardFoliage = foliage;

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
    const bloomMat = new THREE.MeshStandardMaterial({ color: 0xff66aa, emissive: 0xff66aa, emissiveIntensity: 0.7 });
    for (let i = 0; i < 6; i++) {
      const bloom = this.addMesh(new THREE.ConeGeometry(0.22, 0.45, 8), bloomMat);
      bloom.position.set(5.5 + Math.cos(i) * 2.6, 0.3, 21.5 + Math.sin(i * 1.7) * 2.2);
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

  private applyCameraPreset(zone: Zone, immediate: boolean): void {
    const presets: Record<Zone, [number, number, number, number, number, number]> = {
      hall: [0, 8.5, 13.5, 0, 3, -8],
      courtyard: [0, 10, 46, 0, 1, 20],
      bridge: [-18, 8, 42, -24, 0, 27],
    };
    const [px, py, pz, lx, ly, lz] = presets[zone];
    this.cameraGoal.pos.set(px, py, pz);
    this.cameraGoal.look.set(lx, ly, lz);
    if (immediate) {
      this.camera.position.copy(this.cameraGoal.pos);
      this.controls.target.copy(this.cameraGoal.look);
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
    this.monk.root.position.set(cushion.x, 0, cushion.z);
    this.monk.root.rotation.y = Math.atan2(ALTAR.x - cushion.x, ALTAR.z - cushion.z);
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
    const pos = this.monk.root.position;
    if (this.keyDir.lengthSq() > 0) {
      const step = this.keyDir.clone().normalize().multiplyScalar(WALK_SPEED * dt);
      pos.x += step.x;
      pos.z += step.y;
      this.walkPhase += dt * 9;
      this.monk.root.rotation.y = Math.atan2(step.x, step.y);
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
    const targetYaw = Math.atan2(dx, dz);
    this.monk.root.rotation.y = targetYaw;
  }

  private computeTargetPose(t: number): PoseValues {
    if (this.gasshoT > 0) {
      return { ...REST, headX: 0.25, upperX: 0.1, armL: -1.0, armR: -1.0, armZL: 0.35, armZR: -0.35 };
    }
    if (this.seatedId !== null) {
      return { ...REST, rootY: 0.22, headX: 0.08, armL: -1.0, armR: -1.0, armZL: 0.25, armZR: -0.25, legL: -1.45, legR: -1.45 };
    }
    if (this.target || this.keyDir.lengthSq() > 0) {
      const s = Math.sin(this.walkPhase);
      return {
        ...REST,
        rootY: Math.abs(Math.cos(this.walkPhase)) * 0.05,
        legL: s * 0.6,
        legR: -s * 0.6,
        armL: -s * 0.5,
        armR: s * 0.5,
      };
    }
    if (this.mode === "bow") return sampleBowKeys(this.bowT / BOW_CYCLE);
    if (this.mode === "dance") {
      const s = Math.sin(this.danceT * 6);
      return {
        ...REST,
        rootY: Math.abs(s) * 0.12,
        armL: -1.2 + s * 0.6,
        armR: -1.2 - s * 0.6,
        armZL: 0.8 + s * 0.3,
        armZR: -0.8 - s * 0.3,
        legL: s * 0.3,
        legR: -s * 0.3,
      };
    }
    // Idle breathing.
    return {
      ...REST,
      headX: Math.sin(t * 2) * 0.02,
      armL: 0.05 + Math.sin(t * 2.5) * 0.02,
      armR: 0.05 + Math.sin(t * 2.5) * 0.02,
    };
  }

  private poseLabel(): Pose {
    if (this.gasshoT > 0) return "gassho";
    if (this.seatedId !== null) return "sit";
    if (this.target || this.keyDir.lengthSq() > 0) return "walk";
    return this.mode === "bow" ? "bow" : this.mode === "dance" ? "dance" : "stand";
  }

  private applyPose(dt: number, t: number): void {
    const want = this.computeTargetPose(t);
    const k = Math.min(1, dt * 14);
    const p = this.pose;
    (Object.keys(p) as Array<keyof PoseValues>).forEach((key) => {
      p[key] = lerp(p[key], want[key], k);
    });
    const monk = this.monk;
    monk.root.position.y = p.rootY;
    const dancing = this.mode === "dance" && !this.target && this.seatedId === null && this.gasshoT <= 0;
    monk.upper.rotation.x = p.upperX;
    monk.upper.rotation.y = dancing ? Math.sin(this.danceT * 3) * 0.4 : lerp(monk.upper.rotation.y, 0, k);
    monk.head.rotation.x = p.headX;
    monk.armL.rotation.set(p.armL, 0, p.armZL);
    monk.armR.rotation.set(p.armR, 0, p.armZR);
    monk.legL.rotation.x = p.legL;
    monk.legR.rotation.x = p.legR;

    this.blinkT -= dt;
    if (this.blinkT <= 0) this.blinkT = 3 + Math.random() * 2;
    const eyeOpen = this.seatedId !== null || this.gasshoT > 0 ? 0.15 : this.blinkT < 0.12 ? 0.15 : 1;
    monk.eyes.forEach((eye) => eye.scale.y = eyeOpen);
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

  // Camera only glides to a zone preset while a transition is running, so orbit dragging is not
  // pulled back every frame.
  private updateCamera(dt: number): void {
    if (!this.cameraTween) return;
    const k = Math.min(1, dt * 2.2);
    this.camera.position.lerp(this.cameraGoal.pos, k);
    this.controls.target.lerp(this.cameraGoal.look, k);
    if (this.camera.position.distanceTo(this.cameraGoal.pos) < 0.05) this.cameraTween = false;
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

    const zone = this.zoneFor(this.monk.root.position.x, this.monk.root.position.z);
    if (zone !== this.zone) {
      this.applyCameraPreset(zone, false);
    }
    const label = this.poseLabel();
    if (label !== this.lastPose) {
      this.lastPose = label;
      this.events.onPoseChange?.(label);
    }

    this.lanterns.forEach((lantern, i) => {
      lantern.rotation.z = Math.sin(t * 1.5 + i) * 0.06;
    });
    this.foliage.rotation.y = Math.sin(t * 0.2) * 0.05;
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
