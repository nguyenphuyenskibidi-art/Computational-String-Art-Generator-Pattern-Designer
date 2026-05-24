interface UploadPanelProps {
  fileName?: string;
  onFile: (file: File) => void;
  loading: boolean;
  error?: string | null;
}

export function UploadPanel({ fileName, onFile, loading, error }: UploadPanelProps) {
  return (
    <div className="upload-panel">
      <label className="upload-panel__dropzone">
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <div className="upload-panel__icon">⬆</div>
        <div className="upload-panel__title">Drop an image or browse</div>
        <div className="upload-panel__subtitle">JPG, PNG, SVG · processed locally in your browser</div>
      </label>
      <div className="upload-panel__meta">
        <div>{fileName ? `Loaded: ${fileName}` : 'No image loaded yet'}</div>
        <div>{loading ? 'Processing…' : 'Idle'}</div>
        {error ? <div className="upload-panel__error">{error}</div> : null}
      </div>
    </div>
  );
}
