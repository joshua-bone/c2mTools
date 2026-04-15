export type OpenedDocumentFile = Readonly<
  | {
      kind: "c2m";
      name: string;
      bytes: Uint8Array;
    }
  | {
      kind: "json";
      name: string;
      text: string;
    }
>;

export type EditorPlatform = Readonly<{
  openDocumentFile: () => Promise<OpenedDocumentFile | null>;
  saveC2mFile: (fileName: string, bytes: Uint8Array) => Promise<void>;
  saveJsonFile: (fileName: string, text: string) => Promise<void>;
  openExternalUrl: (url: string) => void;
}>;
