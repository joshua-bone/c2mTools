// src/c2m/render/cc2Renderer.ts (Node wrapper)
import type { C2mJsonV1 } from "../c2mJsonV1.js";
import type { MapJson } from "../mapCodec.js";
import { writePngRgba } from "./png.js";
import { CC2RendererCore } from "./cc2RendererCore.js";

export class CC2Renderer extends CC2RendererCore {
  public renderMapToPng(map: MapJson): Buffer {
    return writePngRgba(this.renderMap(map));
  }

  public renderLevelDocToPng(doc: C2mJsonV1): Buffer {
    return writePngRgba(this.renderLevelDoc(doc));
  }
}

export { CC2RendererCore };
