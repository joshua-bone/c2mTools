import { useCallback, useMemo, useRef, useState } from "react";

// Import your existing codec directly from repo src.
// NOTE: Your codec uses relative imports ending in .js; vite.config.ts rewrites those to .ts.
import {
  decodeC2mToJsonV1,
  encodeC2mFromJsonV1,
  parseC2mJsonV1,
  stringifyC2mJsonV1,
} from "../../src/c2m/c2mJsonV1";

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

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const canSave = useMemo(() => jsonText.trim().length > 0, [jsonText]);

  const loadC2mFile = useCallback(async (file: File) => {
    setError(null);
    setWarnings([]);
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);

      const warnList: string[] = [];
      const doc = decodeC2mToJsonV1(bytes, (m) => warnList.push(m));

      setWarnings(warnList);
      setJsonText(stringifyC2mJsonV1(doc));
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

  const onSaveAsC2m = useCallback(() => {
    setError(null);

    try {
      const parsedUnknown: unknown = JSON.parse(jsonText);
      const doc = parseC2mJsonV1(parsedUnknown);
      const bytes = encodeC2mFromJsonV1(doc);

      downloadBytes(defaultOutputName(fileName), bytes);
    } catch (e: unknown) {
      setError(asErrorMessage(e));
    }
  }, [jsonText, fileName]);

  return (
    <div className="container">
      <div className="header">
        <button onClick={onOpenClick}>Open C2M…</button>
        <button onClick={onSaveAsC2m} disabled={!canSave}>
          Save as C2M
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".c2m"
          style={{ display: "none" }}
          onChange={onFileChange}
        />

        <div className="spacer" />

        <span className="badge">{fileName ?? "No file loaded"}</span>
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
        <textarea
          spellCheck={false}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder="JSON will appear here after you open a .c2m file…"
        />
      </div>

      <div className="messages">
        {error ? <div className="msg error">{error}</div> : null}
        {warnings.map((w, i) => (
          <div key={i} className="msg warn">
            {w}
          </div>
        ))}
      </div>
    </div>
  );
}
