import type { PatternResult, ProcessingParams } from '../types';
import { formatNumber } from '../utils/image';
import { makeSequenceText } from '../utils/export';
import { formatMaterialEstimate, recommendThreadColors } from '../utils/material';

interface InfoPanelProps {
  result: PatternResult | null;
  params: ProcessingParams;
}

export function InfoPanel({ result, params }: InfoPanelProps) {
  const colors = recommendThreadColors(true);
  return (
    <div className="info-panel">
      <div className="info-card">
        <div className="info-card__title">Materials</div>
        {result ? (
          <>
            <div className="info-stat">{result.material.nailCount} nails</div>
            <div className="info-stat">{result.material.threadLengthM.toFixed(1)} m thread</div>
            <div className="info-stat">{result.material.estimatedSpools} spool(s) suggested</div>
            <div className="info-note">{formatMaterialEstimate(result.material)}</div>
          </>
        ) : (
          <div className="info-note">Upload an image to see estimates.</div>
        )}
      </div>

      <div className="info-card">
        <div className="info-card__title">Preview sequence</div>
        <div className="info-sequence">{result ? makeSequenceText(result.path, 14) : 'No path yet'}</div>
      </div>

      <div className="info-card">
        <div className="info-card__title">Colour suggestions</div>
        <div className="chips">
          {colors.map((color) => (
            <span key={color} className="chip">{color}</span>
          ))}
        </div>
      </div>

      <div className="info-card">
        <div className="info-card__title">Current settings</div>
        <div className="info-note">Board diameter {formatNumber(params.boardDiameterMm)} mm</div>
        <div className="info-note">Circle radius {formatNumber(params.circleRadiusMm)} mm</div>
        <div className="info-note">Iterations {formatNumber(params.iterations)}</div>
      </div>
    </div>
  );
}
