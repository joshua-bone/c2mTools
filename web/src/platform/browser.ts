import type { EditorPlatform, OpenedDocumentSource } from "./types";

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

type BrowserReadableFile = Pick<File, "name" | "arrayBuffer" | "webkitRelativePath">;
type DirectoryCapableInput = HTMLInputElement & {
  webkitdirectory: boolean;
};

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
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

function normalizePickedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").trim();
}

function stripSingleRootDirectoryPrefix(paths: ReadonlyArray<string>): Readonly<{
  name: string | null;
  relativePaths: ReadonlyArray<string>;
}> {
  if (paths.length <= 0) {
    return {
      name: null,
      relativePaths: paths,
    };
  }

  const firstPathParts = paths[0]!.split("/");
  if (firstPathParts.length <= 1) {
    return {
      name: null,
      relativePaths: paths,
    };
  }

  const sharedRoot = firstPathParts[0]!;
  if (
    sharedRoot.length <= 0 ||
    !paths.every((path) => {
      const pathParts = path.split("/");
      return pathParts.length > 1 && pathParts[0] === sharedRoot;
    })
  ) {
    return {
      name: null,
      relativePaths: paths,
    };
  }

  return {
    name: sharedRoot,
    relativePaths: paths.map((path) => path.slice(sharedRoot.length + 1)),
  };
}

function pickFilesFromInput(
  options: Readonly<{
    accept?: string;
    directory?: boolean;
    multiple?: boolean;
  }>,
): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input") as DirectoryCapableInput;
    input.type = "file";
    input.accept = options.accept ?? "";
    input.multiple = options.multiple ?? false;
    input.hidden = true;
    input.webkitdirectory = options.directory ?? false;

    const parent = document.body ?? document.documentElement;
    let settled = false;

    const finish = (files: File[] | null) => {
      if (settled) return;
      settled = true;
      input.removeEventListener("cancel", handleCancel);
      input.remove();
      resolve(files);
    };
    const handleCancel = () => {
      finish(null);
    };

    input.addEventListener(
      "change",
      () => {
        finish(input.files ? Array.from(input.files) : null);
      },
      { once: true },
    );
    input.addEventListener("cancel", handleCancel, { once: true });
    parent.appendChild(input);
    input.click();
  });
}

function promptOpenMode(): Promise<"file" | "folder" | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(18, 26, 31, 0.28)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "9999";

    const panel = document.createElement("div");
    panel.style.width = "min(360px, calc(100vw - 32px))";
    panel.style.borderRadius = "20px";
    panel.style.background = "#ffffff";
    panel.style.boxShadow = "0 20px 48px rgba(18, 26, 31, 0.2)";
    panel.style.padding = "20px";
    panel.style.display = "grid";
    panel.style.gap = "12px";

    const title = document.createElement("div");
    title.textContent = "Open";
    title.style.fontSize = "24px";
    title.style.fontWeight = "700";
    title.style.color = "#1f2a34";

    const description = document.createElement("div");
    description.textContent = "Choose a single level/zip file or open a levelset folder.";
    description.style.fontSize = "14px";
    description.style.lineHeight = "1.4";
    description.style.color = "#5f7487";

    const buttonRow = document.createElement("div");
    buttonRow.style.display = "grid";
    buttonRow.style.gridTemplateColumns = "1fr 1fr";
    buttonRow.style.gap = "12px";

    const fileButton = document.createElement("button");
    fileButton.type = "button";
    fileButton.textContent = "File or Zip";
    fileButton.style.border = "1px solid #cfd9e2";
    fileButton.style.borderRadius = "14px";
    fileButton.style.padding = "12px 14px";
    fileButton.style.font = "inherit";
    fileButton.style.fontWeight = "600";
    fileButton.style.background = "#ffffff";
    fileButton.style.cursor = "pointer";

    const folderButton = document.createElement("button");
    folderButton.type = "button";
    folderButton.textContent = "Folder";
    folderButton.style.border = "1px solid #cfd9e2";
    folderButton.style.borderRadius = "14px";
    folderButton.style.padding = "12px 14px";
    folderButton.style.font = "inherit";
    folderButton.style.fontWeight = "600";
    folderButton.style.background = "#ffffff";
    folderButton.style.cursor = "pointer";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.style.border = "1px solid #cfd9e2";
    cancelButton.style.borderRadius = "14px";
    cancelButton.style.padding = "10px 14px";
    cancelButton.style.font = "inherit";
    cancelButton.style.background = "#f8fbfd";
    cancelButton.style.color = "#445564";
    cancelButton.style.cursor = "pointer";
    cancelButton.style.justifySelf = "end";

    buttonRow.append(fileButton, folderButton);
    panel.append(title, description, buttonRow, cancelButton);
    overlay.append(panel);

    let settled = false;
    const finish = (value: "file" | "folder" | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve(value);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish(null);
      }
    });
    fileButton.addEventListener("click", () => finish("file"));
    folderButton.addEventListener("click", () => finish("folder"));
    cancelButton.addEventListener("click", () => finish(null));
    document.addEventListener("keydown", onKeyDown);
    (document.body ?? document.documentElement).appendChild(overlay);
  });
}

export async function readLocalDocumentSource(
  file: BrowserReadableFile,
): Promise<OpenedDocumentSource> {
  return {
    kind: "file",
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

export async function readLocalDocumentSourceList(
  files: ReadonlyArray<BrowserReadableFile>,
  fallbackName = "Opened Set",
): Promise<OpenedDocumentSource | null> {
  if (files.length <= 0) return null;
  if (files.length === 1 && !files[0]!.webkitRelativePath) {
    return readLocalDocumentSource(files[0]!);
  }

  const rawPaths = files.map((file) =>
    normalizePickedPath(file.webkitRelativePath?.trim() ? file.webkitRelativePath : file.name),
  );
  const stripped = stripSingleRootDirectoryPrefix(rawPaths);
  const entries = await Promise.all(
    files.map(async (file, index) => ({
      relativePath: stripped.relativePaths[index]!,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );

  return {
    kind: "collection",
    name: stripped.name ?? fallbackName,
    entries: entries.filter((entry) => entry.relativePath.length > 0),
  };
}

async function openDocumentSource(): Promise<OpenedDocumentSource | null> {
  const mode = await promptOpenMode();
  if (!mode) return null;

  if (mode === "folder") {
    const files = await pickFilesFromInput({
      directory: true,
      multiple: true,
    });
    return files ? readLocalDocumentSourceList(files) : null;
  }

  const files = await pickFilesFromInput({
    accept: ".c2m,.json,.zip",
  });
  if (!files || files.length <= 0) return null;
  return readLocalDocumentSource(files[0]!);
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

async function saveZipFile(fileName: string, bytes: Uint8Array): Promise<void> {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  await saveBlobLocally(fileName, new Blob([ab], { type: "application/zip" }), {
    description: "CC2 level set archive",
    mimeType: "application/zip",
    extensions: [".zip"],
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
  openDocumentSource,
  saveC2mFile,
  saveZipFile,
  saveJsonFile,
  openExternalUrl,
};

export { createAbortError };
