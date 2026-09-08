# Simule

Realtime recursive 3D world simulator with chat-driven world reconstruction.

**GitHub repository description:** A Vite, React, and Three.js lab for exploring recursive 3D worlds, fractal terrain, variable-scale geometry, and conversational scene rebuilding.

Simule is an experimental open-world sandbox for generating and exploring stylized 3D environments. It combines a first-person Three.js simulation with a lightweight "Builder Ops" chat interface that can reconstruct the active world in realtime: change the biome, rebuild terrain, add structures, switch weather, adjust recursion depth, and create new spatial forms without leaving the viewport.

The project is intentionally playful and research-oriented. It explores how Minecraft-like block worlds can move beyond a uniform grid by using recursive, variable-scale geometry, tetrahedral lattices, metaballs, active cellular-lattice effects, and procedural forms that reveal more detail as the iteration depth increases.

## Features

- First-person exploration with mouse look, walking, kayak-style momentum controls, arrow-key movement, and fullscreen mode.
- Conversational world builder for live scene reconstruction.
- Preset worlds including a modern city with jet-black robotic centaurs and NPC walkers, a flooded Dolomite spire landscape, tetrahedral landscapes, metaball basins, alpine citadels, orbital skies, volcanic terrain, and a reactive tendril grove.
- Recursive controls for iteration depth, minimum block size, maximum block size, render quality, atmosphere/mist balance, and water level.
- Multiple geometry modes: fractal blocks, tetrahedral lattice worlds, metaball terrain and objects, and smoother procedural forms.
- Naturalistic world elements including recursive trees, waterforms, coastlines, stone circles, castles, cathedrals, tents, portals, crystals, and swaying tendrils.
- Atmospheric rendering with bloom-style highlights, lens flare cues, sun/moon/planet sky compositions, clouds, fog, aurora, and time-of-day palettes.
- Reflective shader water for the Dolomite world with procedural ripple normals, variable water level, and subtle sunset glints.
- City shooter mode with street-level first-person movement, NPC walkers, a detailed spacebar-fired pistol, bullet tracers, casing ejection, glowing impact marks, explosion sparks, headshot kills, and three-hit body kills.
- Active lattice behavior for animated materials such as water and special substances.
- Vercel-ready static deployment configuration.

## Builder Ops Examples

Try commands like:

```text
create an empty modern city overrun by zombies
turn on ray tracing bloom and lens flare
use self-similar fractal blocks with more detail
create a flooded dolomite spire landscape at sunset
make it a volcanic night world with ember weather
add three towers and a glowing portal
raise mountains and add a river
regenerate a dense forest world
make it orbital with aurora weather
add three swaying tendrils near the path
```

## Controls

- Click the viewport to enter first-person mode.
- `W` / `Up`: move forward, or paddle forward and build momentum in Dolomite Floodlands.
- `S` / `Down`: move backward, or slow down/gently reverse in Dolomite Floodlands.
- `A` / `Left`, `D` / `Right`: turn left/right.
- `Space`: fire the pistol in Dead Manhattan, or jump in non-city ground worlds.
- Mouse: look around.
- Fullscreen button: enter or exit fullscreen.

Dead Manhattan is a modern city scene: jet-black horned robotic centaurs move toward the player, NPCs walk sidewalk routes, headshots kill in one shot, and body shots kill after three hits.

The Dolomite Floodlands view behaves like a kayak: repeated forward input builds speed, release glides to a stop, and turning eases in and out instead of snapping.

## Tech Stack

- React 19
- Three.js
- TypeScript
- Vite
- Vitest
- Lucide React icons

## Getting Started

Install dependencies:

```bash
npm ci
```

Run the local development server:

```bash
npm run dev
```

Run tests:

```bash
npm run test
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Deploying To Vercel

This repo includes `vercel.json` for static Vite deployment:

- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: all routes rewrite to `index.html`

After pushing to GitHub, import the repository in Vercel. Vercel should use the committed config automatically.

## Project Status

Simule is a prototype and creative engine lab. The current focus is procedural form generation, more convincing recursive geometry, stronger world cohesion, and richer first-person interaction.
