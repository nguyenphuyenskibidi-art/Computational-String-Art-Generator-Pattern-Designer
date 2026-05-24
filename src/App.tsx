import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { FieldShell, NumberField, SelectField, SliderField } from './components/ControlGroup';
import { InfoPanel } from './components/InfoPanel';
import { UploadPanel } from './components/UploadPanel';
import type { BoardPreset, PatternResult, ProcessingParams, WorkerMessage, WorkerRequest } from './types';
import { analyzeImageData, downloadBlob, formatNumber, loadFileAsImageData } from './utils/image';
import { buildBoardSvg, exportBoardPng, exportPatternPdf, formatExportTitle, makeSequenceText } from './utils/export';
import { resolveBoardRadiusMm } from './utils/path';
import type { LoadedImageData } from './utils/image';

const PRESETS: BoardPreset[] = [
  { id: 'studio-small', name: 'Studio Small', boardDiameterMm: 320, circleRadiusMm: 132, marginMm: 12, pegCount: 80 },
  { id: 'studio-medium', name: 'Studio Medium', boardDiameterMm: 420, circleRadiusMm: 176, marginMm: 14, pegCount: 120 },
  { id: 'studio-large', name: 'Studio Large', boardDiameterMm: 560, circleRadiusMm: 240, marginMm: 16, pegCount: 160 },
];

function defaultParams(): ProcessingParams {
  const preset = PRESETS[1];
  return {
    brightness: 0,
    contrast: 1.28,
    threshold: 0.36,
    edgeStrength: 0.42,
    quantization: 4,
    pegCount: preset.pegCount,
    boardDiameterMm: preset.boardDiameterMm,
    circleRadiusMm: preset.circleRadiusMm,
    marginMm: preset.marginMm,
    iterations: 2500,
    lineInk: 0.018,
    minPegGap: 18,
    previewResolution: 192,
  };
}

export default function App() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const [params, setParams] = useState<ProcessingParams>(defaultParams);
  const [selectedPreset, setSelectedPreset] = useState<string>('studio-medium');
  const [source, setSource] = useState<LoadedImageData | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [result, setResult] = useState<PatternResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Upload an image to begin');
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL('./workers/patternWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if ('jobId' in message && message.jobId !== requestIdRef.current) {
        return;
      }
      if (message.kind === 'progress') {
        setStage(message.stage);
        setProgress(message.progress);
        setLoading(true);
        return;
      }
      if (message.kind === 'result') {
        setResult(message.payload);
        setLoading(false);
        setProgress(1);
        setStage(message.payload.stoppedEarly ? 'Completed with early stop' : 'Pattern ready');
        return;
      }
      setError(message.message);
      setLoading(false);
      setStage('Error');
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!source || !workerRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const jobId = requestIdRef.current + 1;
      requestIdRef.current = jobId;
      setLoading(true);
      setProgress(0.02);
      setStage('Preparing pattern');
      setError(null);
      const payload: WorkerRequest = {
        kind: 'generate',
        jobId,
        image: {
          width: source.width,
          height: source.height,
          data: new Uint8ClampedArray(source.imageData.data),
          name: source.fileName,
          type: source.mimeType,
        },
        params,
      };
      workerRef.current?.postMessage(payload, [payload.image.data.buffer]);
    }, 220);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [params, source]);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  const previewSvg = useMemo(() => {
    if (!result) return '';
    return buildBoardSvg(result, params);
  }, [params, result]);

  async function handleFile(file: File) {
    setError(null);
    try {
      const loaded = await loadFileAsImageData(file);
      const analysis = analyzeImageData(loaded.imageData);
      setSource(loaded);
      setSelectedPreset('custom');
      setParams((current) => ({
        ...current,
        contrast: analysis.suggestedContrast,
        threshold: analysis.suggestedThreshold,
      }));
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      setSourceUrl(URL.createObjectURL(file));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to read the uploaded file';
      setError(message);
      setSource(null);
      setSourceUrl(null);
    }
  }

  function applyPreset(presetId: string) {
    setSelectedPreset(presetId);
    const preset = PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setParams((current) => ({
      ...current,
      boardDiameterMm: preset.boardDiameterMm,
      circleRadiusMm: preset.circleRadiusMm,
      marginMm: preset.marginMm,
      pegCount: preset.pegCount,
      minPegGap: Math.max(8, Math.round(preset.pegCount * 0.12)),
    }));
  }

  function patchParams(patch: Partial<ProcessingParams>) {
    setParams((current) => {
      const next = { ...current, ...patch };
      const maxRadius = Math.max(20, next.boardDiameterMm / 2 - next.marginMm - 1);
      next.circleRadiusMm = Math.min(next.circleRadiusMm, maxRadius);
      next.minPegGap = Math.max(2, Math.min(next.pegCount - 1, next.minPegGap));
      return next;
    });
    setSelectedPreset('custom');
  }

  async function handleExportPng() {
    if (!result) return;
    try {
      setExportBusy(true);
      const blob = await exportBoardPng(result, params);
      downloadBlob(blob, `${formatExportTitle(source?.fileName ?? 'string-art')}.png`);
    } finally {
      setExportBusy(false);
    }
  }

  async function handleExportPdf() {
    if (!result) return;
    try {
      setExportBusy(true);
      const blob = await exportPatternPdf(result, params);
      downloadBlob(blob, `${formatExportTitle(source?.fileName ?? 'string-art')}.pdf`);
    } finally {
      setExportBusy(false);
    }
  }

  const boardRadius = resolveBoardRadiusMm(params.boardDiameterMm, params.marginMm, params.circleRadiusMm);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Browser-based string art generator</div>
          <h1>String Art Studio</h1>
          <p>Upload a photo, tune the board, and generate a printable pattern right in the browser.</p>
        </div>
        <div className="topbar__status">
          <div className="status-pill">{loading ? `${Math.round(progress * 100)}% · ${stage}` : stage}</div>
          {result ? <div className="status-note">{makeSequenceText(result.path, 8)}</div> : null}
        </div>
      </header>

      <main className="layout">
        <aside className="panel panel--left">
          <UploadPanel fileName={source?.fileName} onFile={handleFile} loading={loading} error={error} />

          <FieldShell title="Template preset" hint="Circular board MVP">
            <div className="preset-row">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`preset-chip ${selectedPreset === preset.id ? 'preset-chip--active' : ''}`}
                  onClick={() => applyPreset(preset.id)}
                  type="button"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </FieldShell>

          <FieldShell title="Image processing" hint="Realtime-ish preview, processed locally">
            <SliderField label="Brightness" value={params.brightness} min={-0.4} max={0.4} step={0.01} onChange={(value) => patchParams({ brightness: value })} />
            <SliderField label="Contrast" value={params.contrast} min={0.5} max={2.0} step={0.01} onChange={(value) => patchParams({ contrast: value })} helper="Auto-set from the image, then you can nudge it." />
            <SliderField label="Threshold" value={params.threshold} min={0.05} max={0.9} step={0.01} onChange={(value) => patchParams({ threshold: value })} />
            <SliderField label="Edge strength" value={params.edgeStrength} min={0} max={1} step={0.01} onChange={(value) => patchParams({ edgeStrength: value })} />
            <SliderField label="Quantization" value={params.quantization} min={2} max={8} step={1} onChange={(value) => patchParams({ quantization: value })} helper="Fewer levels create a flatter, posterised target." />
          </FieldShell>

          <FieldShell title="Board template" hint="Physical millimetres">
            <NumberField label="Board size" value={params.boardDiameterMm} min={150} max={900} step={1} onChange={(value) => patchParams({ boardDiameterMm: value })} suffix="mm" />
            <NumberField label="Circle radius" value={params.circleRadiusMm} min={30} max={params.boardDiameterMm / 2 - params.marginMm - 1} step={1} onChange={(value) => patchParams({ circleRadiusMm: value })} suffix="mm" />
            <NumberField label="Margin" value={params.marginMm} min={0} max={40} step={1} onChange={(value) => patchParams({ marginMm: value })} suffix="mm" />
            <NumberField label="Nail count" value={params.pegCount} min={36} max={768} step={1} onChange={(value) => patchParams({ pegCount: value })} />
            <NumberField label="Iterations" value={params.iterations} min={40} max={5000} step={10} onChange={(value) => patchParams({ iterations: value })} />
            <NumberField label="Line density" value={params.lineInk} min={0.005} max={0.08} step={0.001} onChange={(value) => patchParams({ lineInk: value })} />
            <NumberField label="Min peg gap" value={params.minPegGap} min={2} max={80} step={1} onChange={(value) => patchParams({ minPegGap: value })} />
            <SliderField label="Preview resolution" value={params.previewResolution} min={72} max={256} step={1} onChange={(value) => patchParams({ previewResolution: value })} helper="Higher gives nicer scoring, lower is faster." />
          </FieldShell>
        </aside>

        <section className="panel panel--center">
          <div className="preview-toolbar">
            <div className="preview-toolbar__meta">
              <strong>Live preview</strong>
              <span>{source ? `${source.width} × ${source.height}` : 'Waiting for an image'}</span>
            </div>
            <div className="preview-toolbar__meta">
              <span>Radius {formatNumber(boardRadius)} mm</span>
              <span>Sequence {result ? result.path.length : 0}</span>
            </div>
          </div>

          <div className="preview-stage">
            {previewSvg ? (
              <div className="preview-svg" dangerouslySetInnerHTML={{ __html: previewSvg }} />
            ) : (
              <div className="empty-state">
                <div className="empty-state__title">No pattern yet</div>
                <div className="empty-state__subtitle">Drop a photo on the left and the board will wake up.</div>
              </div>
            )}
            {loading ? (
              <div className="loading-overlay">
                <div className="loading-overlay__card">
                  <div className="spinner" />
                  <div>{stage}</div>
                  <div>{Math.round(progress * 100)}%</div>
                </div>
              </div>
            ) : null}
          </div>

          {sourceUrl ? (
            <div className="source-preview">
              <div className="source-preview__title">Source image</div>
              <img src={sourceUrl} alt="Uploaded source" />
            </div>
          ) : null}
        </section>

        <aside className="panel panel--right">
          <InfoPanel result={result} params={params} />

          <div className="export-card">
            <div className="info-card__title">Export</div>
            <button type="button" className="action-button" onClick={handleExportPng} disabled={!result || exportBusy}>
              Export PNG
            </button>
            <button type="button" className="action-button action-button--primary" onClick={handleExportPdf} disabled={!result || exportBusy}>
              Export PDF
            </button>
            <div className="info-note">PDF contains an A4 summary page and a physical-size board page for 100% printing.</div>
          </div>

          <div className="export-card">
            <div className="info-card__title">Notes</div>
            <div className="info-note">Monochrome greedy solver, tuned for stable browser performance.</div>
            <div className="info-note">SVG preview stays crisp on tablet and desktop screens.</div>
            <div className="info-note">Material estimates are approximations based on segment lengths plus waste.</div>
          </div>
        </aside>
      </main>
    </div>
  );
}
