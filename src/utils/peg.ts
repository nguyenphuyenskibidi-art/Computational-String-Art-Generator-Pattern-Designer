import type { Peg } from '../types';

export function generateCircularPegs(count: number, radiusMm: number, centerX: number, centerY: number, rotationDeg = -90): Peg[] {
  const pegs: Peg[] = [];
  const rotation = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < count; i += 1) {
    const angle = rotation + (i / count) * Math.PI * 2;
    pegs.push({
      index: i,
      x: centerX + Math.cos(angle) * radiusMm,
      y: centerY + Math.sin(angle) * radiusMm,
      angle,
    });
  }
  return pegs;
}

export function pegLabel(index: number): string {
  return String(index + 1);
}

export function pegGapDistance(count: number, minGapPercent = 0.02): number {
  return Math.max(2, Math.round(count * minGapPercent));
}
