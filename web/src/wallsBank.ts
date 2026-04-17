export {
  filterWallsBankRecords,
  findWallsBankRecord,
  pickRandomWallsBankRecords,
} from "dattools/walls-core";
export type { FilterWallsBankOptions, WallsBankRecord } from "dattools/walls-core";

import wallsBankUrl from "dattools/walls-bank.json?url";
import {
  buildWallsBankRecords,
  parseWallsBank,
  type WallsBankJson,
  type WallsBankOccurrence,
  type WallsBankRecord,
} from "dattools/walls-core";

const BLOCKLISTED_SET_NAMES = new Set<string>(["Bad_Apple"]);

export type LoadedWallsBank = Readonly<{
  bank: WallsBankJson;
  records: ReadonlyArray<WallsBankRecord>;
}>;

function isBlocklistedOccurrence(entry: WallsBankOccurrence): boolean {
  return BLOCKLISTED_SET_NAMES.has(entry.setName);
}

export async function loadWallsBank(signal?: AbortSignal): Promise<LoadedWallsBank> {
  const requestInit: RequestInit = {};
  if (signal) requestInit.signal = signal;

  const response = await fetch(wallsBankUrl, requestInit);
  if (!response.ok) {
    throw new Error(
      `Failed to load walls bank: ${response.status} ${response.statusText}. Verify the dattools dependency includes walls-bank.json.`,
    );
  }

  const bank = parseWallsBank((await response.json()) as unknown);
  return {
    bank,
    records: buildWallsBankRecords(bank, {
      includeOccurrence: (entry) => !isBlocklistedOccurrence(entry),
    }),
  };
}
