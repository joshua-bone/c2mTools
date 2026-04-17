import type { EditorPlatform, OpenedDocumentFile } from "./types";

type SaveFilePickerHandle = Readonly<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

type WindowWithFilePickers = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      excludeAcceptAllOption?: boolean;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<SaveFilePickerHandle>;
  };

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function resolveFileKind(name: string): OpenedDocumentFile["kind"] {
  return name.toLowerCase().endsWith(".c2m") ? "c2m" : "json";
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function saveBlobLocally(
  fileName: string,
  blob: Blob,
  fileType: Readonly<{
    description: string;
    mimeType: string;
    extensions: string[];
  }>,
): Promise<void> {
  const savePicker = (window as WindowWithFilePickers).showSaveFilePicker;
  if (!savePicker) {
    downloadBlob(fileName, blob);
    return;
  }

  const handle = await savePicker({
    suggestedName: fileName,
    excludeAcceptAllOption: false,
    types: [
      {
        description: fileType.description,
        accept: {
          [fileType.mimeType]: fileType.extensions,
        },
      },
    ],
  });

  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function pickDocumentFileFromInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".c2m,.json";
    input.hidden = true;

    const parent = document.body ?? document.documentElement;
    let settled = false;

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.removeEventListener("cancel", handleCancel);
      input.remove();
      resolve(file);
    };
    const handleCancel = () => {
      finish(null);
    };

    input.addEventListener(
      "change",
      () => {
        finish(input.files?.item(0) ?? null);
      },
      { once: true },
    );
    input.addEventListener("cancel", handleCancel, { once: true });
    parent.appendChild(input);
    input.click();
  });
}

export async function readLocalDocumentFile(
  file: Pick<File, "name" | "arrayBuffer" | "text">,
): Promise<OpenedDocumentFile> {
  const kind = resolveFileKind(file.name);

  if (kind === "c2m") {
    return {
      kind,
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    };
  }

  return {
    kind,
    name: file.name,
    text: await file.text(),
  };
}

async function openDocumentFile(): Promise<OpenedDocumentFile | null> {
  const file = await pickDocumentFileFromInput();
  if (!file) return null;
  return readLocalDocumentFile(file);
}

async function saveC2mFile(fileName: string, bytes: Uint8Array): Promise<void> {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  await saveBlobLocally(fileName, new Blob([ab], { type: "application/octet-stream" }), {
    description: "CC2 C2M level",
    mimeType: "application/octet-stream",
    extensions: [".c2m"],
  });
}

async function saveJsonFile(fileName: string, text: string): Promise<void> {
  await saveBlobLocally(fileName, new Blob([text], { type: "application/json" }), {
    description: "C2M JSON",
    mimeType: "application/json",
    extensions: [".json"],
  });
}

function openExternalUrl(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.referrerPolicy = "no-referrer";
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export const browserPlatform: EditorPlatform = {
  openDocumentFile,
  saveC2mFile,
  saveJsonFile,
  openExternalUrl,
};

export { createAbortError };
