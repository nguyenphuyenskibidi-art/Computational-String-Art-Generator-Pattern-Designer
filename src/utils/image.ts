export interface LoadedImageData {
  width: number;
  height: number;
  imageData: ImageData;
  fileName: string;
  mimeType: string;
}

const MAX_SOURCE_DIMENSION = 1400;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function loadFileAsImageData(file: File): Promise<LoadedImageData> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const { width, height } = fitDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, MAX_SOURCE_DIMENSION);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return {
      width,
      height,
      imageData,
      fileName: file.name,
      mimeType: file.type || guessMimeType(file.name),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitDimensions(width: number, height: number, maxSize: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSize) {
    return { width, height };
  }
  const scale = maxSize / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function guessMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export function imageDataFromCanvas(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Export failed'));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function analyzeImageData(imageData: ImageData): { mean: number; stdDev: number; suggestedContrast: number; suggestedThreshold: number } {
  const { data, width, height } = imageData;
  const samples: number[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const luma = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      samples.push(luma / 255);
    }
  }
  let sum = 0;
  let sumSq = 0;
  let min = 1;
  let max = 0;
  for (const s of samples) {
    sum += s;
    sumSq += s * s;
    min = Math.min(min, s);
    max = Math.max(max, s);
  }
  const mean = sum / Math.max(1, samples.length);
  const variance = Math.max(0, sumSq / Math.max(1, samples.length) - mean * mean);
  const stdDev = Math.sqrt(variance);
  const dynamicRange = Math.max(1e-6, max - min);
  const suggestedContrast = Math.min(1.9, Math.max(0.8, 1.15 + (0.22 - stdDev) * 1.8 + (0.55 - dynamicRange) * 0.7));
  const suggestedThreshold = Math.min(0.68, Math.max(0.22, 0.44 + (0.5 - mean) * 0.2));
  return { mean, stdDev, suggestedContrast, suggestedThreshold };
}
