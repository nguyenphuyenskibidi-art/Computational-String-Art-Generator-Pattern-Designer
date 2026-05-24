/// <reference lib="webworker" />

import type { WorkerMessage, WorkerRequest } from '../types';
import { generatePattern } from '../utils/path';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.kind !== 'generate') return;

  try {
    const { image, params, jobId } = message;
    const pixels = new Uint8ClampedArray(image.data);
    const result = generatePattern(pixels, image.width, image.height, params, (stage, progress) => {
      const progressMessage: WorkerMessage = { kind: 'progress', stage, progress, jobId };
      self.postMessage(progressMessage);
    });
    const successMessage: WorkerMessage = { kind: 'result', payload: result, jobId };
    self.postMessage(successMessage);
  } catch (error) {
    const failureMessage: WorkerMessage = {
      kind: 'error',
      jobId: message.kind === 'generate' ? message.jobId : 0,
      message: error instanceof Error ? error.message : 'Pattern generation failed',
    };
    self.postMessage(failureMessage);
  }
};

export {};
