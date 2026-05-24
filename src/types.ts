export type BoardShape = 'circle';

export interface ProcessingParams {
  brightness: number; // -1 to 1
  contrast: number; // 0.2 to 2.5
  threshold: number; // 0 to 1
  edgeStrength: number; // 0 to 1
  quantization: number; // 2 to 8 levels
  pegCount: number;
  boardDiameterMm: number;
  circleRadiusMm: number;
  marginMm: number;
  iterations: number;
  lineInk: number; // 0.01 to 0.3 darkness addition per pass
  minPegGap: number;
  previewResolution: number;
}

export interface BoardPreset {
  id: string;
  name: string;
  boardDiameterMm: number;
  circleRadiusMm: number;
  marginMm: number;
  pegCount: number;
}

export interface Peg {
  index: number;
  x: number;
  y: number;
  angle: number;
}

export interface PathSegment {
  from: number;
  to: number;
  lengthMm: number;
}

export interface MaterialEstimate {
  nailCount: number;
  threadLengthMm: number;
  threadLengthM: number;
  threadLengthWithWasteMm: number;
  estimatedSpools: number;
  recommendedSpoolLengthM: number;
}

export interface ImageAnalysis {
  width: number;
  height: number;
  meanLuminance: number;
  stdLuminance: number;
  suggestedContrast: number;
  suggestedThreshold: number;
  edgeHint: number;
}

export interface PatternResult {
  pegs: Peg[];
  path: number[];
  segments: PathSegment[];
  targetSize: number;
  targetMap: Float32Array;
  currentMap: Float32Array;
  analysis: ImageAnalysis;
  material: MaterialEstimate;
  score: number;
  stoppedEarly: boolean;
}

export interface ImageInputPayload {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  name: string;
  type: string;
}

export type WorkerRequest = {
  kind: 'generate';
  jobId: number;
  image: ImageInputPayload;
  params: ProcessingParams;
};

export type WorkerProgress = {
  kind: 'progress';
  jobId: number;
  stage: string;
  progress: number;
};

export type WorkerResult = {
  kind: 'result';
  jobId: number;
  payload: PatternResult;
};

export type WorkerError = {
  kind: 'error';
  jobId: number;
  message: string;
};

export type WorkerMessage = WorkerProgress | WorkerResult | WorkerError;
