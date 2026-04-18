export type OpenedDocumentSourceEntry = Readonly<{
  relativePath: string;
  bytes: Uint8Array;
}>;

export type OpenedDocumentSource = Readonly<
  | {
      kind: "file";
      name: string;
      bytes: Uint8Array;
    }
  | {
      kind: "collection";
      name: string;
      entries: ReadonlyArray<OpenedDocumentSourceEntry>;
    }
>;

export type EditorPlatform = Readonly<{
  openDocumentSource: () => Promise<OpenedDocumentSource | null>;
  saveC2mFile: (fileName: string, bytes: Uint8Array) => Promise<void>;
  saveZipFile: (fileName: string, bytes: Uint8Array) => Promise<void>;
  saveJsonFile: (fileName: string, text: string) => Promise<void>;
  openExternalUrl: (url: string) => void;
}>;
