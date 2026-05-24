import type { ImageAnalysis, PathSegment, PatternResult, Peg, ProcessingParams } from '../types';
import { generateCircularPegs, pegGapDistance } from './peg';

const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(EPSILON, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function rgbToLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sampleLumaFromBuffer(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): number {
  const sx = clamp(x, 0, width - 1);
  const sy = clamp(y, 0, height - 1);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const l00 = rgbToLuma(data[i00], data[i00 + 1], data[i00 + 2]);
  const l10 = rgbToLuma(data[i10], data[i10 + 1], data[i10 + 2]);
  const l01 = rgbToLuma(data[i01], data[i01 + 1], data[i01 + 2]);
  const l11 = rgbToLuma(data[i11], data[i11 + 1], data[i11 + 2]);

  const top = lerp(l00, l10, tx);
  const bottom = lerp(l01, l11, tx);
  return lerp(top, bottom, ty) / 255;
}

function computeHistogramStats(lumas: number[]): ImageAnalysis {
  const count = Math.max(1, lumas.length);
  let sum = 0;
  let sumSq = 0;
  let min = 1;
  let max = 0;
  for (const l of lumas) {
    sum += l;
    sumSq += l * l;
    min = Math.min(min, l);
    max = Math.max(max, l);
  }
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  const std = Math.sqrt(variance);
  const dynamicRange = Math.max(EPSILON, max - min);
  const suggestedContrast = clamp(1.18 + (0.24 - std) * 1.75 + (0.55 - dynamicRange) * 0.68, 0.82, 1.95);
  const suggestedThreshold = clamp(0.42 + (0.5 - mean) * 0.22, 0.22, 0.68);
  const edgeHint = clamp(std * 1.6, 0, 1);
  return {
    width: 0,
    height: 0,
    meanLuminance: mean,
    stdLuminance: std,
    suggestedContrast,
    suggestedThreshold,
    edgeHint,
  };
}

function coverSamplePoint(
  gridX: number,
  gridY: number,
  gridSize: number,
  srcWidth: number,
  srcHeight: number,
): { x: number; y: number } {
  const nx = (gridX + 0.5) / gridSize;
  const ny = (gridY + 0.5) / gridSize;
  const scale = Math.max(gridSize / Math.max(EPSILON, srcWidth), gridSize / Math.max(EPSILON, srcHeight));
  const cropWidth = srcWidth / scale;
  const cropHeight = srcHeight / scale;
  const cropX = (srcWidth - cropWidth) / 2;
  const cropY = (srcHeight - cropHeight) / 2;
  return {
    x: cropX + nx * cropWidth,
    y: cropY + ny * cropHeight,
  };
}

function sampleBilinear(grid: Float32Array, size: number, x: number, y: number): number {
  const sx = clamp(x, 0, size - 1);
  const sy = clamp(y, 0, size - 1);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;

  const i00 = y0 * size + x0;
  const i10 = y0 * size + x1;
  const i01 = y1 * size + x0;
  const i11 = y1 * size + x1;

  const top = lerp(grid[i00], grid[i10], tx);
  const bottom = lerp(grid[i01], grid[i11], tx);
  return lerp(top, bottom, ty);
}

function buildLumaGrid(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  gridSize: number,
): { lumaGrid: Float32Array; lumaSamples: number[] } {
  const lumaGrid = new Float32Array(gridSize * gridSize);
  const lumaSamples: number[] = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const { x: sx, y: sy } = coverSamplePoint(x, y, gridSize, sourceWidth, sourceHeight);
      const luma = sampleLumaFromBuffer(source, sourceWidth, sourceHeight, sx, sy);
      const idx = y * gridSize + x;
      lumaGrid[idx] = luma;
      lumaSamples.push(luma);
    }
  }

  return { lumaGrid, lumaSamples };
}

function computeEdgeMap(lumaGrid: Float32Array, size: number): Float32Array {
  const edge = new Float32Array(size * size);
  let maxValue = 0;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const a = lumaGrid[(y - 1) * size + (x - 1)];
      const b = lumaGrid[(y - 1) * size + x];
      const c = lumaGrid[(y - 1) * size + (x + 1)];
      const d = lumaGrid[y * size + (x - 1)];
      const f = lumaGrid[y * size + (x + 1)];
      const g = lumaGrid[(y + 1) * size + (x - 1)];
      const h = lumaGrid[(y + 1) * size + x];
      const i = lumaGrid[(y + 1) * size + (x + 1)];
      const gx = -a + c - 2 * d + 2 * f - g + i;
      const gy = -a - 2 * b - c + g + 2 * h + i;
      const value = Math.sqrt(gx * gx + gy * gy);
      const idx = y * size + x;
      edge[idx] = value;
      maxValue = Math.max(maxValue, value);
    }
  }
  const normalize = Math.max(EPSILON, maxValue);
  for (let i = 0; i < edge.length; i += 1) {
    edge[i] = clamp(edge[i] / normalize, 0, 1);
  }
  return edge;
}

function computeTargetMap(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  gridSize: number,
  circleRadiusPx: number,
  params: ProcessingParams,
): {
  target: Float32Array;
  analysis: ImageAnalysis;
  edgeMap: Float32Array;
} {
  const { lumaGrid, lumaSamples } = buildLumaGrid(source, sourceWidth, sourceHeight, gridSize);
  const edgeMap = computeEdgeMap(lumaGrid, gridSize);
  const analysis = computeHistogramStats(lumaSamples);
  analysis.width = sourceWidth;
  analysis.height = sourceHeight;

  const target = new Float32Array(gridSize * gridSize);
  const center = (gridSize - 1) / 2;
  const radius = circleRadiusPx;
  const radiusSq = radius * radius;

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const idx = y * gridSize + x;
      if (dx * dx + dy * dy > radiusSq) {
        target[idx] = 0;
        continue;
      }

      let adjusted = clamp((lumaGrid[idx] - 0.5) * params.contrast + 0.5 + params.brightness, 0, 1);
      const quantLevels = Math.max(2, Math.round(params.quantization));
      adjusted = Math.round(adjusted * (quantLevels - 1)) / (quantLevels - 1);
      let darkness = 1 - adjusted;
      darkness = smoothstep(0, 1, darkness);
      const thresholded = darkness >= params.threshold ? 1 : darkness * 0.56;
      darkness = lerp(darkness, thresholded, clamp(params.threshold, 0, 1));

      const edge = edgeMap[idx] * clamp(params.edgeStrength, 0, 1);
      const centerBias = 1 - clamp(Math.sqrt(dx * dx + dy * dy) / Math.max(EPSILON, radius), 0, 1);
      const centerSuppression = 1 - centerBias * 0.18;

      target[idx] = clamp((darkness * 0.84 + edge * 0.78) * centerSuppression, 0, 1);
    }
  }

  return { target, analysis, edgeMap };
}

function lineSamples(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  sampleCount: number,
): Array<{ x: number; y: number; t: number }> {
  const samples: Array<{ x: number; y: number; t: number }> = [];
  for (let i = 0; i <= sampleCount; i += 1) {
    const t = i / sampleCount;
    samples.push({ x: lerp(ax, bx, t), y: lerp(ay, by, t), t });
  }
  return samples;
}

function sampleGridValue(grid: Float32Array, size: number, x: number, y: number): number {
  return sampleBilinear(grid, size, x, y);
}

function scoreCandidateLine(
  target: Float32Array,
  current: Float32Array,
  edgeMap: Float32Array,
  size: number,
  from: Peg,
  to: Peg,
  sampleCount: number,
  recentPairPenalty: boolean,
): { score: number; covered: number; lengthMm: number } {
  const samples = lineSamples(from.x, from.y, to.x, to.y, sampleCount);
  let residualScore = 0;
  let edgeScore = 0;
  let centerPenalty = 0;
  let covered = 0;
  let lengthScore = 0;

  const center = (size - 1) / 2;
  const radius = center;
  const dxMm = to.x - from.x;
  const dyMm = to.y - from.y;
  const lengthMm = Math.hypot(dxMm, dyMm);
  const lengthNorm = lengthMm / Math.max(EPSILON, size * 0.72);

  for (const sample of samples) {
    const dx = sample.x - center;
    const dy = sample.y - center;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > radius) {
      continue;
    }
    const residual = sampleGridValue(target, size, sample.x, sample.y) - sampleGridValue(current, size, sample.x, sample.y);
    const edge = sampleGridValue(edgeMap, size, sample.x, sample.y);
    const centerBias = 1 - clamp(dist / Math.max(EPSILON, radius), 0, 1);

    if (residual > 0) {
      residualScore += residual * (0.8 + edge * 1.3);
    }
    edgeScore += edge * 0.22;
    centerPenalty += centerBias * centerBias * 0.18;
    covered += 1;
  }

  const coverage = Math.max(1, covered);
  const averageResidual = residualScore / coverage;
  const averageEdge = edgeScore / coverage;
  const averageCenterPenalty = centerPenalty / coverage;

  const longLineBias = 0.68 + clamp(lengthNorm, 0, 1.3) * 0.58;
  const shortLinePenalty = clamp(0.25 - lengthNorm, 0, 0.25) * 1.55;
  const repetitionPenalty = recentPairPenalty ? 0.28 : 0;

  const score = (averageResidual * 1.72 + averageEdge * 0.62) * longLineBias - averageCenterPenalty - shortLinePenalty - repetitionPenalty;
  lengthScore = lengthMm;

  return {
    score,
    covered,
    lengthMm: lengthScore,
  };
}

function paintLine(
  current: Float32Array,
  size: number,
  from: Peg,
  to: Peg,
  inkStrength: number,
  sampleCount: number,
): void {
  const samples = lineSamples(from.x, from.y, to.x, to.y, sampleCount);
  for (const sample of samples) {
    const dx = sample.x - (size - 1) / 2;
    const dy = sample.y - (size - 1) / 2;
    if (dx * dx + dy * dy > ((size - 1) / 2) ** 2) {
      continue;
    }
    const ix = clamp(Math.round(sample.x), 0, size - 1);
    const iy = clamp(Math.round(sample.y), 0, size - 1);
    const idx = iy * size + ix;
    const strength = inkStrength * (0.82 + 0.18 * (1 - sample.t));
    current[idx] = clamp(current[idx] + strength * (1 - current[idx]), 0, 1);
  }
}

export function generatePattern(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  params: ProcessingParams,
  onProgress?: (stage: string, progress: number) => void,
): PatternResult {
  const gridSize = Math.max(72, Math.min(180, Math.round(params.previewResolution)));
  onProgress?.('Analysing image', 0.06);
  const boardPxDiameter = Math.max(1, gridSize - 1);
  const mmPerPx = params.boardDiameterMm / boardPxDiameter;
  const circleRadiusPx = clamp((clamp(params.circleRadiusMm, 10, params.boardDiameterMm / 2 - 1) / params.boardDiameterMm) * boardPxDiameter, 8, boardPxDiameter / 2);
  const { target, analysis, edgeMap } = computeTargetMap(source, sourceWidth, sourceHeight, gridSize, circleRadiusPx, params);

  const center = (gridSize - 1) / 2;
  const pegs = generateCircularPegs(params.pegCount, circleRadiusPx, center, center);
  const current = new Float32Array(gridSize * gridSize);
  const path: number[] = [];
  const segments: PathSegment[] = [];
  const totalIterations = Math.max(1, Math.round(params.iterations));
  const minGap = Math.max(2, Math.min(params.pegCount - 1, Math.round(params.minPegGap || pegGapDistance(params.pegCount))));
  const samplesPerLine = gridSize <= 96 ? 20 : 28;
  let currentPeg = 0;
  let aggregateScore = 0;
  let stoppedEarly = false;
  const recentPairs: number[] = [];
  const recentWindow = Math.min(24, Math.max(8, Math.round(params.pegCount * 0.06)));

  onProgress?.('Building path', 0.12);
  for (let step = 0; step < totalIterations; step += 1) {
    let bestPeg = -1;
    let bestScore = -Infinity;
    let bestLength = 0;

    for (let i = 0; i < pegs.length; i += 1) {
      if (i === currentPeg) continue;
      const gap = Math.min(Math.abs(i - currentPeg), pegs.length - Math.abs(i - currentPeg));
      if (gap < minGap) continue;
      const pairKey = currentPeg < i ? currentPeg * pegs.length + i : i * pegs.length + currentPeg;
      const recentPairPenalty = recentPairs.includes(pairKey);
      const candidate = scoreCandidateLine(target, current, edgeMap, gridSize, pegs[currentPeg], pegs[i], samplesPerLine, recentPairPenalty);
      if (candidate.score > bestScore) {
        bestScore = candidate.score;
        bestPeg = i;
        bestLength = candidate.lengthMm;
      }
    }

    if (bestPeg < 0 || bestScore < 0.0025) {
      stoppedEarly = true;
      break;
    }

    const fromPeg = pegs[currentPeg];
    const toPeg = pegs[bestPeg];
    paintLine(current, gridSize, fromPeg, toPeg, params.lineInk, samplesPerLine);
    const pairKey = currentPeg < bestPeg ? currentPeg * pegs.length + bestPeg : bestPeg * pegs.length + currentPeg;
    recentPairs.unshift(pairKey);
    recentPairs.length = Math.min(recentPairs.length, recentWindow);
    path.push(bestPeg);
    segments.push({ from: currentPeg, to: bestPeg, lengthMm: bestLength * mmPerPx });
    currentPeg = bestPeg;
    aggregateScore += bestScore;

    if ((step + 1) % 6 === 0) {
      onProgress?.('Building path', 0.12 + (0.78 * (step + 1)) / totalIterations);
    }
  }

  onProgress?.('Finalizing', 0.93);

  const totalLengthMm = segments.reduce((sum, segment) => sum + segment.lengthMm, 0);
  const threadLengthWithWasteMm = totalLengthMm * 1.08 + params.boardDiameterMm * 0.8;
  const threadLengthM = totalLengthMm / 1000;
  const estimatedSpools = Math.max(1, Math.ceil(threadLengthWithWasteMm / (200 * 1000)));
  const material = {
    nailCount: params.pegCount,
    threadLengthMm: totalLengthMm,
    threadLengthM,
    threadLengthWithWasteMm,
    estimatedSpools,
    recommendedSpoolLengthM: 200,
  };

  return {
    pegs,
    path,
    segments,
    targetSize: gridSize,
    targetMap: target,
    currentMap: current,
    analysis,
    material,
    score: aggregateScore,
    stoppedEarly,
  };
}

export function pathSequencePreview(path: number[], maxItems = 12): string {
  if (path.length === 0) return 'No path yet';
  const items = path.slice(0, maxItems).map((value) => String(value + 1));
  return items.join(' -> ') + (path.length > maxItems ? ' …' : '');
}

export function resolveBoardRadiusMm(boardDiameterMm: number, marginMm: number, circleRadiusMm: number): number {
  const half = boardDiameterMm / 2;
  return clamp(circleRadiusMm || half - marginMm, 10, Math.max(10, half - marginMm));
}

export function buildPatternSummary(result: PatternResult): string {
  return `${result.pegs.length} nails, ${(result.material.threadLengthM).toFixed(1)} m thread, path length ${result.path.length}`;
}
