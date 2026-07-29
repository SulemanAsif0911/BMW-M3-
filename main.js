/* ============================================================
   THE M3 LINEAGE — scroll-driven 3D archive
   Three.js renders a single fixed WebGL stage behind the page.
   Camera never moves. Each car simply slides in from the left
   or right edge of the frame as its chapter scrolls into view,
   then holds still while its text is read.
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

/* ---------------------------------------------------------
   Renderer / Scene / Camera  (static camera — no orbiting)
--------------------------------------------------------- */
const canvas = document.getElementById('stage-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x0a0b0d, 1);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  32,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.7, 7.6);
camera.lookAt(0, 0.75, 0);

/* Simple three-point studio lighting. No shadows — keeps frame
   rate steady no matter how dense a given model's mesh is. */
scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x0a0a0d, 1.15));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(5, 8, 6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x6fa8ff, 1.2);
rimLight.position.set(-6, 3, -6);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xfff2e6, 0.5);
fillLight.position.set(-4, 2, 6);
scene.add(fillLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(10, 48),
  new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.4, metalness: 0.12 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => {
  resize();
  clearTimeout(window.__rsz);
  window.__rsz = setTimeout(() => ScrollTrigger.refresh(), 200);
});
resize();

/* ---------------------------------------------------------
   Loaders
--------------------------------------------------------- */
const manager = new THREE.LoadingManager();
const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderPct = document.getElementById('loader-pct');
const loaderMarkEl = document.querySelector('.loader-mark');

manager.onProgress = (_url, loadedCount, total) => {
  const pct = total ? Math.min(100, Math.round((loadedCount / total) * 100)) : 0;
  loaderFill.style.width = pct + '%';
  loaderPct.textContent = pct + '%';
};

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');

const gltfLoader = new GLTFLoader(manager);
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

function loadGLB(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, (gltf) => resolve(gltf), undefined, (err) => reject(err));
  });
}

/* ---------------------------------------------------------
   Model manifest
--------------------------------------------------------- */
const CHAPTER_ORDER = ['origin', 'racer', 'tuned', 'modern'];

// side: which edge of the screen this car slides in FROM.
// Chosen opposite to where each chapter's text card sits, so the
// car never has to cross behind the copy while it arrives.
const MODELS = {
  origin: { url: 'm3-e30.glb', size: 4.2, label: 'ORIGIN — 1986', side: 'right' },
  racer: { url: 'm3-gtr-e46-2001.glb', size: 4.35, label: 'RACER — 2001', side: 'left' },
  tuned: { url: 'm3-gtr-e46-nfs.glb', size: 4.45, label: 'ICON — 2005', side: 'right' },
  modern: { url: 'm3-g81-touring.glb', size: 4.6, label: 'MODERN — 2022', side: 'left' },
};

const OFFSCREEN_X = 9.5;
const SETTLE_YAW = { origin: 0.32, racer: -0.28, tuned: 0.3, modern: -0.26 };

const state = {
  logoRoot: null,
  chapters: {}, // key -> { wrapper, ready:true }
  activeChapter: null,
};

/* ---------------------------------------------------------
   Geometry helpers
--------------------------------------------------------- */

// Centers an object at the origin on X/Z and rests it on the ground
// (y = 0), scaled so its longest dimension equals `targetSize`.
function normalizeAndGround(object, targetSize) {
  let box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);

  box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;
  return object;
}

/* ---------------------------------------------------------
   Chapter setup — one model, one wrapper, one slide-in tween
--------------------------------------------------------- */
function setupChapter(key, gltf) {
  const cfg = MODELS[key];
  const car = gltf.scene;
  normalizeAndGround(car, cfg.size);
  car.rotation.y = SETTLE_YAW[key] || 0;

  const wrapper = new THREE.Group();
  wrapper.add(car);
  wrapper.position.x = cfg.side === 'left' ? -OFFSCREEN_X : OFFSCREEN_X;
  wrapper.visible = state.activeChapter === key;
  scene.add(wrapper);

  state.chapters[key] = { wrapper, ready: true };
  buildChapterScrub(key);
}

function buildChapterScrub(key) {
  const sectionEl = document.getElementById('chapter-' + key);
  const chapter = state.chapters[key];
  if (!sectionEl || !chapter) return;

  const cfg = MODELS[key];
  const fromX = cfg.side === 'left' ? -OFFSCREEN_X : OFFSCREEN_X;

  gsap.timeline({
    scrollTrigger: {
      trigger: sectionEl,
      start: 'top 88%',
      end: 'top 38%',
      scrub: true,
      onEnter: () => showChapter(key),
      onEnterBack: () => showChapter(key),
    },
  }).fromTo(
    chapter.wrapper.position,
    { x: fromX },
    { x: 0, ease: 'power2.out', duration: 1 }
  );
}

/* ---------------------------------------------------------
   Chapter activation — exactly one car visible at a time
--------------------------------------------------------- */
function showChapter(key) {
  if (state.activeChapter === key) return;
  state.activeChapter = key;
  CHAPTER_ORDER.forEach((k) => {
    const c = state.chapters[k];
    if (c) c.wrapper.visible = k === key;
  });
  updateRail(key);
}

/* ---------------------------------------------------------
   Progress rail
--------------------------------------------------------- */
const railFill = document.getElementById('rail-fill');
const railTicksEl = document.getElementById('rail-ticks');
const railLabel = document.getElementById('rail-label');
const TICK_TOP = [6, 35.3, 64.6, 94];

CHAPTER_ORDER.forEach((key, i) => {
  const tick = document.createElement('div');
  tick.className = 'tick';
  tick.style.top = TICK_TOP[i] + '%';
  tick.dataset.chapter = key;
  railTicksEl.appendChild(tick);
});

function updateRail(activeKey) {
  railTicksEl.querySelectorAll('.tick').forEach((t) => {
    t.classList.toggle('active', t.dataset.chapter === activeKey);
  });
  railLabel.textContent = MODELS[activeKey] ? MODELS[activeKey].label : '';
}

/* ---------------------------------------------------------
   Logo (hero)
--------------------------------------------------------- */
function setupLogo(gltf) {
  const root = gltf.scene;
  normalizeAndGround(root, 2.1);
  root.position.y += 0.4;
  scene.add(root);
  state.logoRoot = root;
}

/* ---------------------------------------------------------
   Failure handling — never leave a silently blank page
--------------------------------------------------------- */
function showLoadError(detail) {
  loaderMarkEl.textContent = 'BMW M · COULD NOT LOAD MODELS';
  const bar = document.querySelector('.loader-bar');
  if (bar) bar.style.display = 'none';
  loaderPct.innerHTML =
    'This page needs to be served over a local web server, not opened by ' +
    'double-clicking the file.<br><br>From this folder, run:<br>' +
    '<code style="color:#f3f4f6">python3 -m http.server 8080</code><br>' +
    'then open <code style="color:#f3f4f6">http://localhost:8080</code>.';
  loaderPct.style.maxWidth = '340px';
  loaderPct.style.lineHeight = '1.6';
  loaderPct.style.textAlign = 'center';
  loaderEl.classList.remove('hidden');
  if (detail) console.error(detail);
}

window.addEventListener('unhandledrejection', (e) => showLoadError(e.reason));
window.addEventListener('error', (e) => showLoadError(e.error || e.message));

/* ---------------------------------------------------------
   Boot sequence
--------------------------------------------------------- */
async function boot() {
  state.activeChapter = 'hero';

  const [logoResult, firstResult] = await Promise.allSettled([
    loadGLB('m-logo.glb'),
    loadGLB(MODELS[CHAPTER_ORDER[0]].url),
  ]);

  if (logoResult.status === 'fulfilled') {
    setupLogo(logoResult.value);
  } else {
    console.error('Logo failed to load:', logoResult.reason);
  }

  if (firstResult.status === 'fulfilled') {
    setupChapter(CHAPTER_ORDER[0], firstResult.value);
  } else {
    console.error('First chapter failed to load:', firstResult.reason);
  }

  if (logoResult.status === 'rejected' && firstResult.status === 'rejected') {
    showLoadError(firstResult.reason);
    return;
  }

  loaderEl.classList.add('hidden');
  renderer.setAnimationLoop(tick);
  initScrollSystems();

  // Remaining chapters load quietly in the background.
  CHAPTER_ORDER.slice(1).forEach((key) => {
    loadGLB(MODELS[key].url)
      .then((gltf) => setupChapter(key, gltf))
      .catch((err) => console.error('Failed to load chapter "' + key + '":', err));
  });
}

/* ---------------------------------------------------------
   Scroll systems: hero CTA, hero hint, hero<->chapter boundary
--------------------------------------------------------- */
function initScrollSystems() {
  ScrollTrigger.create({
    trigger: '#hero',
    start: 'top top',
    end: 'bottom center',
    onEnterBack: () => {
      state.activeChapter = 'hero';
      CHAPTER_ORDER.forEach((k) => {
        const c = state.chapters[k];
        if (c) c.wrapper.visible = false;
      });
      updateRail(CHAPTER_ORDER[0]);
    },
  });

  const railStart = document.getElementById('chapter-' + CHAPTER_ORDER[0]);
  const railEnd = document.getElementById('chapter-' + CHAPTER_ORDER[CHAPTER_ORDER.length - 1]);
  if (railStart && railEnd) {
    ScrollTrigger.create({
      trigger: railStart,
      start: 'top top',
      endTrigger: railEnd,
      end: 'bottom bottom',
      onUpdate: (self) => {
        railFill.style.height = self.progress * 100 + '%';
      },
    });
  }

  updateRail(CHAPTER_ORDER[0]);

  const hint = document.getElementById('scroll-hint');
  setTimeout(() => hint.classList.add('visible'), 900);
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY > 40) hint.classList.remove('visible');
    },
    { passive: true }
  );

  document.getElementById('get-started').addEventListener('click', () => {
    document.getElementById('chapter-' + CHAPTER_ORDER[0]).scrollIntoView({ behavior: 'smooth' });
  });

  ScrollTrigger.refresh();
}

/* ---------------------------------------------------------
   Render loop
--------------------------------------------------------- */
const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  if (state.logoRoot && state.activeChapter === 'hero') {
    state.logoRoot.rotation.y += dt * 0.35;
  }
  renderer.render(scene, camera);
}

boot();
