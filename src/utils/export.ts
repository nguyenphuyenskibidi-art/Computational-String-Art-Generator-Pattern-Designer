import { jsPDF } from 'jspdf';
import type { PatternResult, ProcessingParams } from '../types';
import { formatNumber } from './image';

const SVG_NS = 'http://www.w3.org/2000/svg';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function joinSequence(path: number[], limit = 48): string {
  const seq = path.slice(0, limit).map((n) => String(n + 1)).join(' → ');
  return path.length > limit ? `${seq} …` : seq;
}

function mmToPx(mm: number, dpi = 220): number {
  return (mm / 25.4) * dpi;
}

function createSvgElement(svg: string): SVGSVGElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() === 'parsererror') {
    throw new Error('Failed to build SVG');
  }
  return root as unknown as SVGSVGElement;
}

export function buildSummarySvg(result: PatternResult, params: ProcessingParams): string {
  const width = 297;
  const height = 210;
  const sequence = joinSequence(result.path, 34);
  const palette = ['Monochrome black', 'Charcoal gray', 'Deep navy'];
  const boardPreviewSize = 98;
  const boardX = 172;
  const boardY = 48;

  const scale = params.boardDiameterMm / Math.max(1, result.targetSize - 1);
  const radiusMm = params.circleRadiusMm;
  const pegPoints = result.pegs
    .map((peg, index) => {
      const x = boardX + ((peg.x * scale) / params.boardDiameterMm) * boardPreviewSize;
      const y = boardY + ((peg.y * scale) / params.boardDiameterMm) * boardPreviewSize;
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.15" fill="#111" />`;
    })
    .join('');
  const lines = result.segments
    .slice(0, 180)
    .map((segment) => {
      const from = result.pegs[segment.from];
      const to = result.pegs[segment.to];
      const x1 = boardX + ((from.x * scale) / params.boardDiameterMm) * boardPreviewSize;
      const y1 = boardY + ((from.y * scale) / params.boardDiameterMm) * boardPreviewSize;
      const x2 = boardX + ((to.x * scale) / params.boardDiameterMm) * boardPreviewSize;
      const y2 = boardY + ((to.y * scale) / params.boardDiameterMm) * boardPreviewSize;
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#111" stroke-opacity="0.16" stroke-width="0.55" stroke-linecap="round" />`;
    })
    .join('');

  return `
  <svg xmlns="${SVG_NS}" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f7f4ee" />
    <text x="16" y="24" font-size="10" font-family="Inter, Arial, sans-serif" fill="#111">String Art Studio · Pattern Report</text>
    <text x="16" y="38" font-size="18" font-family="Inter, Arial, sans-serif" font-weight="700" fill="#111">${escapeXml(result.material.nailCount.toString())} nails · ${result.material.threadLengthM.toFixed(1)} m thread</text>

    <rect x="16" y="52" width="144" height="122" rx="10" fill="#fff" stroke="#d8d2c8" />
    <text x="26" y="70" font-size="9" font-family="Inter, Arial, sans-serif" fill="#444">Material summary</text>
    <text x="26" y="87" font-size="12" font-family="Inter, Arial, sans-serif" fill="#111">Nails: ${result.material.nailCount}</text>
    <text x="26" y="102" font-size="12" font-family="Inter, Arial, sans-serif" fill="#111">Thread: ${result.material.threadLengthM.toFixed(1)} m</text>
    <text x="26" y="117" font-size="12" font-family="Inter, Arial, sans-serif" fill="#111">With waste: ${(result.material.threadLengthWithWasteMm / 1000).toFixed(1)} m</text>
    <text x="26" y="132" font-size="12" font-family="Inter, Arial, sans-serif" fill="#111">Spools: ${result.material.estimatedSpools} × ${result.material.recommendedSpoolLengthM} m</text>
    <text x="26" y="147" font-size="12" font-family="Inter, Arial, sans-serif" fill="#111">Contrast: ${params.contrast.toFixed(2)} · Brightness: ${params.brightness.toFixed(2)}</text>
    <text x="26" y="162" font-size="12" font-family="Inter, Arial, sans-serif" fill="#111">Colour hint: ${palette[0]}</text>

    <rect x="170" y="20" width="110" height="110" rx="12" fill="#fff" stroke="#d8d2c8" />
    ${lines}
    <circle cx="${(boardX + boardPreviewSize / 2).toFixed(2)}" cy="${(boardY + boardPreviewSize / 2).toFixed(2)}" r="${((radiusMm / params.boardDiameterMm) * boardPreviewSize).toFixed(2)}" fill="none" stroke="#111" stroke-width="1.2" />
    ${pegPoints}

    <rect x="170" y="138" width="110" height="36" rx="10" fill="#fff" stroke="#d8d2c8" />
    <text x="178" y="153" font-size="8.6" font-family="Inter, Arial, sans-serif" fill="#444">Sequence preview</text>
    <text x="178" y="166" font-size="10" font-family="Inter, Arial, sans-serif" fill="#111">${escapeXml(sequence || 'No path yet')}</text>

    <rect x="16" y="182" width="264" height="18" rx="9" fill="#fff" stroke="#d8d2c8" />
    <text x="24" y="194" font-size="8.7" font-family="Inter, Arial, sans-serif" fill="#444">Print at 100% for the board page. The board page in the PDF is scaled to physical millimetres.</text>
  </svg>`;
}

export function buildBoardSvg(result: PatternResult, params: ProcessingParams): string {
  const pageMargin = 12;
  const size = params.boardDiameterMm + pageMargin * 2;
  const scale = params.boardDiameterMm / Math.max(1, result.targetSize - 1);
  const pageWidth = size;
  const pageHeight = size + 18;
  const boardX = pageMargin;
  const boardY = pageMargin;
  const pegRadius = Math.max(0.6, params.boardDiameterMm * 0.006);
  const ringRadius = params.circleRadiusMm;

  const pegLines = result.segments
    .map((segment) => {
      const from = result.pegs[segment.from];
      const to = result.pegs[segment.to];
      const x1 = boardX + from.x * scale;
      const y1 = boardY + from.y * scale;
      const x2 = boardX + to.x * scale;
      const y2 = boardY + to.y * scale;
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#111" stroke-opacity="0.15" stroke-width="0.45" stroke-linecap="round" />`;
    })
    .join('');

  const pegs = result.pegs
    .map((peg, idx) => {
      const x = boardX + peg.x * scale;
      const y = boardY + peg.y * scale;
      const label = idx + 1;
      const labelRadius = params.circleRadiusMm + 6;
      const lx = boardX + (params.boardDiameterMm / 2) + Math.cos(peg.angle) * labelRadius;
      const ly = boardY + (params.boardDiameterMm / 2) + Math.sin(peg.angle) * labelRadius;
      return `
        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${pegRadius.toFixed(2)}" fill="#111" />
        <text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" font-size="4.2" font-family="Inter, Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#444">${label}</text>
      `;
    })
    .join('');

  return `
  <svg xmlns="${SVG_NS}" width="${pageWidth}mm" height="${pageHeight}mm" viewBox="0 0 ${pageWidth} ${pageHeight}">
    <rect width="100%" height="100%" fill="#fbfaf7" />
    <text x="12" y="8.8" font-size="5.2" font-family="Inter, Arial, sans-serif" fill="#444">Board page · print at 100%</text>
    <rect x="${boardX}" y="${boardY}" width="${params.boardDiameterMm}" height="${params.boardDiameterMm}" rx="2" fill="#fff" stroke="#d8d2c8" />
    <circle cx="${(boardX + params.boardDiameterMm / 2).toFixed(2)}" cy="${(boardY + params.boardDiameterMm / 2).toFixed(2)}" r="${ringRadius.toFixed(2)}" fill="none" stroke="#111" stroke-width="0.7" />
    ${pegLines}
    ${pegs}
    <text x="12" y="${pageHeight - 5}" font-size="4.6" font-family="Inter, Arial, sans-serif" fill="#444">Nails: ${result.material.nailCount} · Thread: ${result.material.threadLengthM.toFixed(1)} m · Sequence: ${escapeXml(joinSequence(result.path, 20))}</text>
  </svg>`;
}

async function svgToCanvas(svg: string, widthPx: number, heightPx: number): Promise<HTMLCanvasElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to rasterize SVG'));
    img.src = src;
  });
}

export async function exportBoardPng(result: PatternResult, params: ProcessingParams, dpi = 220): Promise<Blob> {
  const svg = buildBoardSvg(result, params);
  const widthMm = params.boardDiameterMm + 24;
  const heightMm = params.boardDiameterMm + 42;
  const canvas = await svgToCanvas(svg, Math.round(mmToPx(widthMm, dpi)), Math.round(mmToPx(heightMm, dpi)));
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PNG export failed'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export async function exportPatternPdf(result: PatternResult, params: ProcessingParams): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const summarySvg = buildSummarySvg(result, params);
  const summaryCanvas = await svgToCanvas(summarySvg, Math.round(mmToPx(297)), Math.round(mmToPx(210)));
  const summaryData = summaryCanvas.toDataURL('image/png');
  pdf.addImage(summaryData, 'PNG', 0, 0, 297, 210, undefined, 'FAST');

  pdf.addPage([params.boardDiameterMm + 24, params.boardDiameterMm + 42], 'p');
  const boardSvg = buildBoardSvg(result, params);
  const boardWidth = params.boardDiameterMm + 24;
  const boardHeight = params.boardDiameterMm + 42;
  const boardCanvas = await svgToCanvas(boardSvg, Math.round(mmToPx(boardWidth)), Math.round(mmToPx(boardHeight)));
  const boardData = boardCanvas.toDataURL('image/png');
  pdf.addImage(boardData, 'PNG', 0, 0, boardWidth, boardHeight, undefined, 'FAST');

  return pdf.output('blob');
}

export function makeSequenceText(path: number[], limit = 24): string {
  return joinSequence(path, limit);
}

export function boardScaleMmPerUnit(result: PatternResult, params: ProcessingParams): number {
  return params.boardDiameterMm / Math.max(1, result.targetSize - 1);
}

export function formatExportTitle(name: string): string {
  return `${name.replace(/\.[^.]+$/, '') || 'string-art'}`;
}
