import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  decodeC2mToJsonV1,
  encodeC2mFromJsonV1,
  parseC2mJsonV1,
  stringifyC2mJsonV1,
} from "../../src/c2m/c2mJsonV1";
import type { C2mJsonV1 } from "../../src/c2m/c2mJsonV1";

import { transformLevelJson, type LevelTransformKind } from "../../src/c2m/levelTransform";
import { CC2RendererCore } from "../../src/c2m/render/cc2RendererCore";
import type { CC2Tileset } from "../../src/c2m/render/cc2Tileset";
import { loadCc2Tileset } from "./loadCc2Tileset";

type ViewMode = "json" | "image";

function asErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function downloadBytes(filename: string, bytes: Uint8Array): void {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function defaultOutputName(inputName: string | null): string {
  if (!inputName) return "level.c2m";
  if (inputName.toLowerCase().endsWith(".c2m")) return inputName;
  return `${inputName}.c2m`;
}

const TILESET_URL = `${import.meta.env.BASE_URL}cc2/spritesheet.png`;

const TRANSFORMS: Array<{ label: string; op: LevelTransformKind }> = [
  { label: "Rot 90", op: "ROTATE_90" },
  { label: "Rot 180", op: "ROTATE_180" },
  { label: "Rot 270", op: "ROTATE_270" },
  { label: "Flip H", op: "FLIP_H" },
  { label: "Flip V", op: "FLIP_V" },
  { label: "Flip NW/SE", op: "FLIP_DIAG_NWSE" },
  { label: "Flip NE/SW", op: "FLIP_DIAG_NESW" },
];

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("json");

  const [fileName, setFileName] = useState<string | null>(null);

  const [jsonText, setJsonText] = useState<string>("");
  const [doc, setDoc] = useState<C2mJsonV1 | null>(null);

  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);

  const [tileset, setTileset] = useState<CC2Tileset | null>(null);
  const [tilesetError, setTilesetError] = useState<string | null>(null);

  const jsonOk = useMemo(() => parseError === null, [parseError]);
  const canSave = useMemo(() => jsonOk && jsonText.trim().length > 0, [jsonOk, jsonText]);

  // Load tileset once (user must place it at web/public/cc2/spritesheet.png)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setTilesetError(null);
        const ts = await loadCc2Tileset(TILESET_URL);
        if (cancelled) return;
        setTileset(ts);
      } catch (e: unknown) {
        if (cancelled) return;
        setTileset(null);
        setTilesetError(
          `Tileset not loaded.\nExpected: web/public/cc2/spritesheet.png\nError: ${asErrorMessage(e)}`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadC2mFile = useCallback(async (file: File) => {
    setError(null);
    setParseError(null);
    setRenderError(null);
    setWarnings([]);
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);

      const warnList: string[] = [];
      const decoded = decodeC2mToJsonV1(bytes, (m) => warnList.push(m));

      setWarnings(warnList);

      const text = stringifyC2mJsonV1(decoded);
      setJsonText(text);
      setDoc(decoded);
    } catch (e: unknown) {
      setError(asErrorMessage(e));
    }
  }, []);

  const onOpenClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.item(0) ?? null;
      if (!file) return;
      void loadC2mFile(file);
      e.target.value = "";
    },
    [loadC2mFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.item(0) ?? null;
      if (!file) return;
      void loadC2mFile(file);
    },
    [loadC2mFile],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // Debounced parse: keep doc in sync with editor text when JSON is valid.
  useEffect(() => {
    if (!jsonText.trim()) return;

    const handle = window.setTimeout(() => {
      try {
        const parsedUnknown: unknown = JSON.parse(jsonText);
        const parsedDoc = parseC2mJsonV1(parsedUnknown);
        setDoc(parsedDoc);
        setParseError(null);
      } catch (e: unknown) {
        setParseError(asErrorMessage(e));
      }
    }, 400);

    return () => window.clearTimeout(handle);
  }, [jsonText]);

  const onSaveAsC2m = useCallback(() => {
    setError(null);
    setRenderError(null);

    try {
      const parsedUnknown: unknown = JSON.parse(jsonText);
      const parsedDoc = parseC2mJsonV1(parsedUnknown);
      const bytes = encodeC2mFromJsonV1(parsedDoc);
      downloadBytes(defaultOutputName(fileName), bytes);
    } catch (e: unknown) {
      setError(asErrorMessage(e));
    }
  }, [jsonText, fileName]);

  const applyTransform = useCallback(
    (op: LevelTransformKind) => {
      if (!doc) return;
      if (parseError) return; // don’t overwrite user edits while invalid

      try {
        const next = transformLevelJson(doc, op);
        setDoc(next);
        setJsonText(stringifyC2mJsonV1(next));
        setError(null);
        setRenderError(null);
      } catch (e: unknown) {
        setError(asErrorMessage(e));
      }
    },
    [doc, parseError],
  );

  // Render image whenever doc/map changes and we are in image view.
  useEffect(() => {
    if (viewMode !== "image") return;
    if (!doc?.map) return;

    if (!tileset) {
      setRenderError(tilesetError ?? "Tileset not loaded.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const renderer = new CC2RendererCore(tileset);
      const img = renderer.renderLevelDoc(doc);

      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D context unavailable");

      const clamped = new Uint8ClampedArray(img.data);
      const imageData = new ImageData(clamped, img.width, img.height);
      ctx.putImageData(imageData, 0, 0);

      setRenderError(null);
    } catch (e: unknown) {
      setRenderError(asErrorMessage(e));
    }
  }, [viewMode, doc, tileset, tilesetError]);

  return (
    <div className="container">
      <div className="header">
        <button onClick={onOpenClick}>Open C2M…</button>
        <button onClick={onSaveAsC2m} disabled={!canSave}>
          Save as C2M
        </button>

        <div className="toolbar" style={{ marginLeft: 6 }}>
          <button onClick={() => setViewMode("json")} disabled={viewMode === "json"}>
            JSON
          </button>
          <button onClick={() => setViewMode("image")} disabled={viewMode === "image"}>
            Image
          </button>
        </div>

        <div className="toolbar" style={{ marginLeft: 6 }}>
          {TRANSFORMS.map((t) => (
            <button
              key={t.op}
              onClick={() => applyTransform(t.op)}
              disabled={!doc || !!parseError}
              title={parseError ? "Fix JSON parse errors to enable transforms" : ""}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".c2m"
          style={{ display: "none" }}
          onChange={onFileChange}
        />

        <div className="spacer" />

        <span className="badge">{fileName ?? "No file loaded"}</span>
        <span className="badge">{tileset ? "Tileset: OK" : "Tileset: missing"}</span>
        <span className="badge">{parseError ? "JSON: INVALID" : "JSON: OK"}</span>
      </div>

      <div
        className={`dropzone ${isDragOver ? "dragover" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
      >
        Drag & drop a .c2m file here, or click “Open C2M…”.
      </div>

      <div className="editorWrap">
        {viewMode === "json" ? (
          <textarea
            spellCheck={false}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder="JSON will appear here after you open a .c2m file…"
          />
        ) : (
          <div className="imagePane">
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>

      <div className="messages">
        {tilesetError ? <div className="msg warn">{tilesetError}</div> : null}
        {parseError ? <div className="msg error">{parseError}</div> : null}
        {error ? <div className="msg error">{error}</div> : null}
        {renderError ? <div className="msg error">{renderError}</div> : null}
        {warnings.map((w, i) => (
          <div key={i} className="msg warn">
            {w}
          </div>
        ))}
      </div>
    </div>
  );
}
