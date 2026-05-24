# String Art Studio MVP

A browser-based string-art pattern generator that runs fully in the client. It accepts JPG, PNG, and SVG images, analyses contrast, generates a circular nail board, and exports printable PNG/PDF reports.

## Stack

- React + TypeScript + Vite
- Plain CSS for styling
- SVG-based rendering for crisp preview and export
- Web Worker for path generation, keeping the UI responsive
- jsPDF for PDF export

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. No backend is required.

## Build for production

```bash
npm run build
npm run preview
```

The `dist/` folder is static and can be self-hosted on any static file host.

## How to use

1. Upload a JPG, PNG, or SVG.
2. Pick a board preset or tweak the controls.
3. Watch the preview update as the worker rebuilds the path.
4. Export PNG or PDF.

## Control guide

- **Brightness**: shifts the source image lighter or darker before processing.
- **Contrast**: expands or compresses the tonal range.
- **Threshold**: pushes the image toward harder dark/light zones.
- **Edge strength**: adds more emphasis to edges.
- **Quantization**: reduces the number of tonal levels.
- **Board size**: physical diameter in millimetres.
- **Circle radius**: nail circle radius on the board.
- **Margin**: keeps the nail circle away from the outer edge.
- **Nail count**: number of pegs around the circle.
- **Iterations**: number of greedy line steps.
- **Line density**: how aggressively each line darkens the target.
- **Preview resolution**: worker scoring resolution. Higher is slower, but smoother.

## Export and print

- **PNG** exports the board page at high resolution.
- **PDF** exports two pages:
  - an A4 summary page
  - a board page sized in physical millimetres for 100% printing

For correct print scale, disable printer options such as “Fit to page” or “Shrink to printable area” and print at 100% scale.

## Best input images

- Use high-contrast portraits or bold graphic shapes.
- Crop subjects near the center.
- Avoid busy backgrounds if you want cleaner string paths.
- For SVG inputs, simple vector art often produces the cleanest result.

## Current limitations

- MVP is monochrome only.
- The path generator is greedy, not globally optimal.
- Circular board template is implemented first; other shapes are a natural next step.
- The material estimate is an approximation based on segment length plus waste.

## Good next extensions

- multi-colour threading
- square or polygon boards
- save and load presets
- undo/redo for parameter changes
- Web Worker caching for reused image states
- optional local persistence with IndexedDB
