import { parseC2mJsonV1, type C2mJsonV1 } from "../../../src/c2m/c2mJsonV1.js";

export const MIN_C2M_MAP_SIZE = 10;
export const MAX_C2M_MAP_SIZE = 100;
export const DEFAULT_C2M_MAP_SIZE = 32;

function parseMapDimension(name: string, value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  if (value < MIN_C2M_MAP_SIZE || value > MAX_C2M_MAP_SIZE) {
    throw new Error(
      `${name} must be between ${MIN_C2M_MAP_SIZE} and ${MAX_C2M_MAP_SIZE} inclusive`,
    );
  }
  return value;
}

export function createEmptyC2mDoc(
  options: Readonly<{
    width?: number;
    height?: number;
  }> = {},
): C2mJsonV1 {
  const width = parseMapDimension("width", options.width ?? DEFAULT_C2M_MAP_SIZE);
  const height = parseMapDimension("height", options.height ?? DEFAULT_C2M_MAP_SIZE);

  return parseC2mJsonV1({
    schema: "c2mTools.c2m.json.v1",
    fileVersion: "7",
    map: {
      width,
      height,
      tiles: Array<string>(width * height).fill("FLOOR"),
    },
  });
}
