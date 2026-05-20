import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_BACKEND_URL = "https://arhamheer-colorization10.hf.space";

const FALLBACK_OPTIONS = {
  models: [
    { id: "siggraph17", label: "SIGGRAPH 2017" },
    { id: "eccv16", label: "ECCV 2016" },
  ],
  presets: [
    { id: "natural", label: "Natural" },
    { id: "vivid", label: "Vivid" },
    { id: "warm", label: "Warm" },
    { id: "cool", label: "Cool" },
    { id: "film", label: "Film" },
  ],
};

const MAX_FILE_SIZE_MB = 15;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBackendUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const amount = bytes / 1024 ** index;
  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight, url });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };

    image.src = url;
  });
}

function getImageFromEnvironment() {
  const fromEnv = import.meta.env.VITE_BACKEND_URL || "";
  return normalizeBackendUrl(fromEnv) || DEFAULT_BACKEND_URL;
}

function comparePlaceholderText(fileName) {
  return fileName
    ? "Render the image to reveal the colorized plate."
    : "Drop a monochrome image to unlock the archive.";
}

export default function App() {
  const initialBackendUrl = useMemo(
    () =>
      normalizeBackendUrl(
        localStorage.getItem("chromatic-archive-backend") ||
          getImageFromEnvironment(),
      ),
    [],
  );

  const [backendDraft, setBackendDraft] = useState(initialBackendUrl);
  const [backendUrl, setBackendUrl] = useState(initialBackendUrl);
  const [status, setStatus] = useState("Idle");
  const [options, setOptions] = useState(FALLBACK_OPTIONS);
  const [model, setModel] = useState("siggraph17");
  const [preset, setPreset] = useState("natural");
  const [file, setFile] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);
  const [inputUrl, setInputUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [reveal, setReveal] = useState(52);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [processingMeta, setProcessingMeta] = useState(null);
  const [connectionHint, setConnectionHint] = useState(
    "Connecting to backend...",
  );

  const fileInputRef = useRef(null);
  const compareRef = useRef(null);
  const dragStateRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("chromatic-archive-backend", backendUrl);
  }, [backendUrl]);

  useEffect(() => {
    let active = true;

    async function loadOptions(url) {
      try {
        setConnectionHint("Fetching presets and models...");
        const response = await fetch(`${url}/api/options`);
        if (!response.ok) {
          throw new Error(`Backend responded with ${response.status}`);
        }

        const data = await response.json();
        if (!active) return;

        setOptions({
          models: data.models?.length ? data.models : FALLBACK_OPTIONS.models,
          presets: data.presets?.length
            ? data.presets
            : FALLBACK_OPTIONS.presets,
        });
        setStatus("Live");
        setConnectionHint("Connected to Hugging Face Space.");

        if (
          data.models?.length &&
          !data.models.some((entry) => entry.id === model)
        ) {
          setModel(data.models[0].id);
        }
        if (
          data.presets?.length &&
          !data.presets.some((entry) => entry.id === preset)
        ) {
          setPreset(data.presets[0].id);
        }
      } catch (fetchError) {
        if (!active) return;
        setStatus("Offline");
        setConnectionHint("Using fallback controls. Check the backend URL.");
        setOptions(FALLBACK_OPTIONS);
      }
    }

    loadOptions(backendUrl);

    return () => {
      active = false;
    };
  }, [backendUrl]);

  useEffect(() => {
    return () => {
      if (inputUrl) URL.revokeObjectURL(inputUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [inputUrl, resultUrl]);

  async function syncFile(nextFile) {
    if (!nextFile) return;

    if (nextFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`That file is too large. Keep it under ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    setError("");
    setProcessingMeta(null);
    setLoading(false);

    if (inputUrl) URL.revokeObjectURL(inputUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);

    try {
      const meta = await readImageDimensions(nextFile);
      setFile(nextFile);
      setFileMeta({
        width: meta.width,
        height: meta.height,
        size: formatBytes(nextFile.size),
        name: nextFile.name,
      });
      setInputUrl(meta.url);
      setResultUrl("");
      setReveal(52);
      setStatus("Image ready");
    } catch (readError) {
      setError(readError.message);
    }
  }

  function handleFileChange(event) {
    syncFile(event.target.files?.[0]);
  }

  function handleDrop(event) {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0];
    syncFile(droppedFile);
  }

  function handleDragOver(event) {
    event.preventDefault();
  }

  async function colorizeImage() {
    if (!file) {
      setError("Choose an image first.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Rendering...");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("model", model);
      form.append("preset", preset);

      const response = await fetch(`${backendUrl}/api/colorize`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        let detail = `Request failed with ${response.status}`;
        try {
          const payload = await response.json();
          detail = payload.detail || detail;
        } catch (_error) {
          const text = await response.text();
          if (text) detail = text;
        }
        throw new Error(detail);
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);

      if (resultUrl) URL.revokeObjectURL(resultUrl);

      setResultUrl(nextUrl);
      setProcessingMeta({
        model: response.headers.get("x-model") || model,
        preset: response.headers.get("x-preset") || preset,
        time: response.headers.get("x-processing-time-ms") || "—",
      });
      setReveal(58);
      setStatus("Complete");
    } catch (requestError) {
      setError(requestError.message || "Colorization failed.");
      setStatus("Error");
    } finally {
      setLoading(false);
    }
  }

  function updateReveal(event) {
    setReveal(clamp(Number(event.target.value), 0, 100));
  }

  function updatePointerReveal(event) {
    if (!compareRef.current) return;

    const rect = compareRef.current.getBoundingClientRect();
    const ratio = ((event.clientX - rect.left) / rect.width) * 100;
    setReveal(clamp(ratio, 0, 100));
  }

  function startDragging(event) {
    if (!resultUrl) return;
    dragStateRef.current = true;
    compareRef.current?.setPointerCapture?.(event.pointerId);
    updatePointerReveal(event);
  }

  function stopDragging(event) {
    dragStateRef.current = false;
    compareRef.current?.releasePointerCapture?.(event.pointerId);
  }

  function moveDragging(event) {
    if (!dragStateRef.current) return;
    updatePointerReveal(event);
  }

  function reconnectBackend() {
    const nextUrl = normalizeBackendUrl(backendDraft || DEFAULT_BACKEND_URL);
    setBackendUrl(nextUrl);
    setStatus("Reconnecting...");
  }

  const activePresetCopy =
    options.presets.find((entry) => entry.id === preset)?.label || preset;
  const activeModelCopy =
    options.models.find((entry) => entry.id === model)?.label || model;

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <main className="canvas">
        <section className="hero-panel panel panel--hero">
          <div className="eyebrow-row">
            <span className="eyebrow">Chromatic Archive</span>
            <span className="status-chip">{status}</span>
          </div>

          <h1 style={{ fontSize: "90px" }}>
            Colorization with the attitude of a museum proof sheet.
          </h1>

          <p className="hero-copy">
            Restore a monochrome photograph, then steer the mood with presets
            that feel like editorial grading notes rather than toy filters.
          </p>

          <div className="hero-metrics">
            <div>
              <span className="metric-label">Target user</span>
              <strong>Creators, archivists, and demo viewers</strong>
            </div>
            <div>
              <span className="metric-label">Unforgettable element</span>
              <strong>Sliding lightbox comparison</strong>
            </div>
            <div>
              <span className="metric-label">Tone</span>
              <strong>Editorial noir with bronze accents</strong>
            </div>
          </div>
        </section>

        <section className="grid-shell">
          <section className="panel panel--controls">
            <div className="panel-title-row">
              <div>
                <span className="section-kicker">Connection</span>
                <h2>Bind to the Hugging Face backend</h2>
              </div>
              <span className="connection-note">{connectionHint}</span>
            </div>

            <div className="connect-row">
              <label className="field field--stretch">
                <span>Backend URL</span>
                <input
                  type="url"
                  value={backendDraft}
                  onChange={(event) => setBackendDraft(event.target.value)}
                  placeholder="https://your-space.hf.space"
                />
              </label>
              <button
                type="button"
                className="button button--ghost"
                onClick={reconnectBackend}
              >
                Reconnect
              </button>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Model</span>
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                >
                  {options.models.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="field field--stretch">
                <span>Preset</span>
                <div
                  className="preset-grid"
                  role="radiogroup"
                  aria-label="Style presets"
                >
                  {options.presets.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`preset-pill ${preset === entry.id ? "is-active" : ""}`}
                      onClick={() => setPreset(entry.id)}
                      aria-pressed={preset === entry.id}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="precision-bar">
              <div>
                <span className="metric-label">Selected preset</span>
                <strong>{activePresetCopy}</strong>
              </div>
              <div>
                <span className="metric-label">Selected model</span>
                <strong>{activeModelCopy}</strong>
              </div>
            </div>
          </section>

          <section className="panel panel--upload">
            <div className="panel-title-row">
              <div>
                <span className="section-kicker">Input</span>
                <h2>Drop the monochrome source</h2>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse files
              </button>
            </div>

            <div
              className={`dropzone ${file ? "has-file" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileChange}
              />
              <div>
                <span className="dropzone-kicker">Drag and drop</span>
                <h3>
                  {file ? file.name : "Choose a photograph, sketch, or scan"}
                </h3>
                <p>{comparePlaceholderText(file?.name)}</p>
              </div>

              <div className="dropzone-copy">
                <span>PNG, JPG, JPEG</span>
                <span>Max {MAX_FILE_SIZE_MB} MB</span>
              </div>
            </div>

            {fileMeta && (
              <div className="file-strip">
                <div>
                  <span className="metric-label">Resolution</span>
                  <strong>
                    {fileMeta.width} × {fileMeta.height}
                  </strong>
                </div>
                <div>
                  <span className="metric-label">Weight</span>
                  <strong>{fileMeta.size}</strong>
                </div>
                <div>
                  <span className="metric-label">Status</span>
                  <strong>{loading ? "Rendering" : "Ready"}</strong>
                </div>
              </div>
            )}

            <div className="cta-row">
              <button
                type="button"
                className="button button--primary"
                onClick={colorizeImage}
                disabled={loading || !file}
              >
                {loading ? "Developing..." : "Render colorized plate"}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  if (inputUrl) URL.revokeObjectURL(inputUrl);
                  if (resultUrl) URL.revokeObjectURL(resultUrl);
                  setFile(null);
                  setFileMeta(null);
                  setInputUrl("");
                  setResultUrl("");
                  setProcessingMeta(null);
                  setError("");
                  setReveal(52);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Clear canvas
              </button>
            </div>

            {error && <div className="error-banner">{error}</div>}
          </section>
        </section>

        <section className="panel panel--stage">
          <div className="panel-title-row panel-title-row--stage">
            <div>
              <span className="section-kicker">Result</span>
              <h2>Lightbox comparison</h2>
            </div>

            {processingMeta ? (
              <div className="stage-meta">
                <span>Model {processingMeta.model}</span>
                <span>Preset {processingMeta.preset}</span>
                <span>{processingMeta.time} ms</span>
              </div>
            ) : (
              <div className="stage-meta">
                <span>Drag the seam after rendering</span>
              </div>
            )}
          </div>

          <div
            className={`compare-stage ${resultUrl ? "is-ready" : "is-empty"}`}
            ref={compareRef}
            onPointerDown={startDragging}
            onPointerMove={moveDragging}
            onPointerUp={stopDragging}
            onPointerLeave={stopDragging}
          >
            <div className="compare-layer compare-layer--base">
              {inputUrl ? (
                <img src={inputUrl} alt="Original upload" />
              ) : (
                <div className="compare-empty-card">Img</div>
              )}
            </div>

            <div
              className="compare-layer compare-layer--result"
              style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
            >
              {resultUrl ? (
                <img src={resultUrl} alt="Colorized output" />
              ) : (
                <div className="compare-empty-card compare-empty-card--result">
                  <span className="compare-empty-kicker">Awaiting render</span>
                  <strong>Warm it, mute it, or push it cinematic.</strong>
                  <p>{comparePlaceholderText(file?.name)}</p>
                </div>
              )}
            </div>

            <div className="compare-rail" aria-hidden="true">
              <div className="compare-handle" style={{ left: `${reveal}%` }}>
                <span>before / after</span>
              </div>
              <div className="compare-line" style={{ left: `${reveal}%` }} />
            </div>
          </div>

          <div className="slider-shell">
            <span className="metric-label">Reveal</span>
            <input
              type="range"
              min="0"
              max="100"
              value={reveal}
              onChange={updateReveal}
              aria-label="Comparison slider"
            />
            <span className="slider-value">{Math.round(reveal)}%</span>
          </div>
        </section>
      </main>
    </div>
  );
}
