import type { MaterialEstimate, PatternResult } from '../types';

export function summarizeMaterial(result: PatternResult): string[] {
  const meters = result.material.threadLengthM;
  const spool = result.material.recommendedSpoolLengthM;
  const spools = result.material.estimatedSpools;
  return [
    `${result.material.nailCount} nails`,
    `${meters.toFixed(1)} m thread`,
    `${spools} spool${spools > 1 ? 's' : ''} @ ${spool} m`,
  ];
}

export function recommendThreadColors(monochrome = true): string[] {
  return monochrome ? ['Black', 'Charcoal', 'Dark navy'] : ['Black', 'Warm gray', 'Deep red'];
}

export function formatMaterialEstimate(material: MaterialEstimate): string {
  return `${material.nailCount} nails · ${material.threadLengthM.toFixed(1)} m thread · ${material.estimatedSpools} spool${material.estimatedSpools > 1 ? 's' : ''}`;
}
