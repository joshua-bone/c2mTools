import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ISLIDE_GENERATOR_CONFIG,
  generateISlideLayout,
} from "../../procedural_generation/islide_generator.js";
import ISlideStudioApp, { buildViewGraph } from "./ISlideStudioApp.js";

describe("I SLIDE studio acceptance", () => {
  it("gives every generator slider its visible accessible name", () => {
    const html = renderToStaticMarkup(createElement(ISlideStudioApp));
    const labels = ["Chips", "Branches", "Loops", "Sparkle density", "Route spread", "Asymmetry"];

    expect(html.match(/type="range"/g)).toHaveLength(labels.length);
    for (const label of labels) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it("numbers graph chip titles by chip order rather than raw node order", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const chipLabels = buildViewGraph(layout)
      .nodes.filter((node) => node.role === "chip")
      .map((node) => node.label);

    expect(chipLabels).toEqual(Array.from({ length: 99 }, (_, index) => `Chip ${index + 1}`));
  });
});
