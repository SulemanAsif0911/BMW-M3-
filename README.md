# The M3 Lineage — a scroll-driven 3D archive

A single-page site built with **Three.js** (WebGL) and **GSAP ScrollTrigger**.
One fixed 3D stage sits behind the page. The camera never moves — as you
scroll into each chapter, that car simply slides in from the edge of the
screen (opposite side from its text card) and settles in place while you
read, then the next car takes over the same way.

## Structure

```
index.html            — page markup (hero + 4 chapters + footer)
styles.css            — design tokens (BMW-blue accent, tri-colour M rail)
main.js                — Three.js scene, GLTF loading, scroll choreography
assets/models/         — the 5 .glb files used by the site
```

## Running it

Browsers block `fetch()` of local files and ES module imports over the
bare `file://` protocol, so this needs to be served over local HTTP —
opening `index.html` by double-clicking will not work, and the page will
show a clear on-screen message telling you so if it detects that.

From inside this folder, run one of:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
# or
npx serve .
```

Three.js, GSAP/ScrollTrigger, and the two Google Fonts load from a CDN at
runtime, so whatever machine opens the site needs an internet connection.

## How it works (and why it shouldn't lag)

- **One fixed `<canvas>`** stays behind the whole page; only one WebGL
  context ever exists, which is the main reason there's no stutter
  switching between chapters.
- **The camera is completely static** — position and lookAt are set once
  and never change. No per-frame trig, no orbiting.
- **Each car gets exactly one animated property**: its wrapper group's
  X position, tweened from off-screen to center over a short scroll
  range right as its chapter enters, then it just sits still. That's the
  entire animation budget per car — cheap regardless of how many meshes
  a given model contains.
- **Only one car is ever visible at a time** — switching chapters simply
  toggles which wrapper is shown, so you never have two cars rendering
  (or fighting for the same screen space) simultaneously.
- **Loading is resilient**: only the logo + first car block the initial
  loading screen; the other three fetch quietly in the background. If a
  model fails to load — most commonly because the site was opened via
  `file://` instead of a local server — you'll see a plain-language
  message on screen instead of a silent blank page.

## The four chapters

1. **BMW M3 (E30, 1986)** — the original homologation special.
2. **BMW M3 GTR (E46, 2001)** — the V8 homologation racer that won on debut.
3. **BMW M3 GTR (E46, 2005 livery)** — the black-and-orange car from
   *Need for Speed: Most Wanted*, replacing the earlier AC Schnitzer build.
4. **BMW M3 Competition Touring (G81, 2022)** — the first-ever M3 wagon.

Specs quoted in each chapter reflect publicly documented figures for each
car. The NFS Most Wanted chapter is framed as a pop-culture appearance,
not an official BMW Motorsport specification.

## If you want to go further

The G81 Competition Touring model carries 462 individual meshes and is
by far the largest file here (~21 MB); the other four models are much
lighter. If download time on a slow connection ever becomes noticeable,
running the `.glb` files through `gltf-transform` or `gltfpack` (Draco +
Meshopt compression, texture re-encoding) can shrink them significantly
with no code changes needed — the loader already has both decoders
wired up.
