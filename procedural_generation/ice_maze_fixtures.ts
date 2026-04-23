import {
  createProceduralRegion,
  type ProceduralRegion,
  type ProceduralRegionInput,
} from "./ice_maze.js";

const SMALL_RECT_REGION_INPUT: ProceduralRegionInput = {
  name: "small-rect-room",
  board: {
    width: 10,
    height: 10,
  },
  mask: {
    kind: "ascii",
    origin: { x: 2, y: 3 },
    rows: ["S...", ".R..", "....", "..E."],
  },
};

const IRREGULAR_REGION_INPUT: ProceduralRegionInput = {
  name: "irregular-cavern",
  board: {
    width: 16,
    height: 12,
  },
  mask: {
    kind: "ascii",
    origin: { x: 4, y: 2 },
    rows: ["##S###", "#...##", "#.R..#", "#..#E#", "######"],
  },
};

export const SMALL_RECT_REGION_FIXTURE: ProceduralRegion =
  createProceduralRegion(SMALL_RECT_REGION_INPUT);

export const IRREGULAR_REGION_FIXTURE: ProceduralRegion =
  createProceduralRegion(IRREGULAR_REGION_INPUT);

export function getIceMazeRegionFixtures(): ReadonlyArray<ProceduralRegion> {
  return [SMALL_RECT_REGION_FIXTURE, IRREGULAR_REGION_FIXTURE];
}
