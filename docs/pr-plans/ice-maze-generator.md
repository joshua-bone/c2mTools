# Ice Maze Generator PR Plan

## Goal

Build a region-based ice maze generator that works inside arbitrary level regions, scales from small to large masks, and is analyzable through an extracted graph of actual slide behavior.

## Design constraints

- Geometry is first-class: generation starts from a region mask, not an abstract graph.
- The authoritative graph is extracted from the finished tile layout.
- The same pipeline must work for rectangular levels, subregions inside hand-authored maps, and irregular masks.
- Chips should prefer leaf nodes.
- The exit should be a leaf node.
- Any node granting pre-exit access to the exit region should be a chip socket.
- The maze must remain explorable before sockets open, excluding the gated exit region.

## PR 1: Region contract and ice graph types

### Scope

- Add a reusable region input model for procedural generators.
- Define the core ice-maze data types:
  - region mask
  - control node
  - slide edge
  - extracted slide graph
  - gated exit cut metadata
- Add small fixtures for rectangular and irregular regions.

### Deliverables

- New `procedural_generation` types/helpers for region-bounded generation.
- Test fixtures that describe allowed cells, reserved cells, and required entry/exit anchors.
- A lightweight debug serializer for graph snapshots.

### Acceptance criteria

- A generator can accept a region smaller than the board.
- Fixtures can represent both `10x10` and larger masks with the same API.
- Tests cover mask parsing, bounds, and anchor validation.

## PR 2: Slide simulator and graph extractor

### Scope

- Implement a Chip-on-ice simulator for `ICE` and `ICE_CORNER_*` traversal.
- Extract the control graph from an actual tile layout by finding:
  - stopping points
  - deterministic slide outcomes
  - dead ends
  - loops or invalid runs
- Distinguish the directed slide graph from its reciprocal undirected exploration view.

### Deliverables

- `simulateIceRun(...)` from a control point plus direction.
- `extractIceMazeGraph(...)` from a map or region.
- Graph normalization helpers for analysis and snapshot tests.

### Acceptance criteria

- Tests cover straight runs, corner turns, reversible corridors, dead ends, and loop detection.
- The extractor produces stable node and edge identities for a fixed layout.
- We can inspect a generated or hand-authored ice region as a graph without any generator logic involved.

## PR 3: Verifier for chips, sockets, and gated exit regions

### Scope

- Add graph-level validation for design rules:
  - connected pre-socket exploration region
  - chip leaves
  - exit leaf
  - socket cut separates the exit region from the rest
  - exit unreachable before sockets open
  - exit reachable after sockets open
- Support exceptions and diagnostics so failed generations are explainable.

### Deliverables

- `verifyIceMazeLayout(...)` returning structured diagnostics.
- Cut and reachability analysis helpers.
- Human-readable failure summaries for CLI/debug output.

### Acceptance criteria

- Tests cover both passing and failing layouts.
- Verifier reports why a layout fails instead of only returning `false`.
- A hand-authored fixture with sockets and exit gating can be analyzed end-to-end.

## PR 4: Region-lattice embedder

### Scope

- Implement the first scalable geometry-first generator.
- Place candidate control nodes directly inside the region.
- Connect them with straight slide corridors that fit the mask.
- Materialize `ICE` and `ICE_CORNER_*` tiles from those corridors.
- Reserve room for start, chip leaves, socket cut, and exit leaf.

### Deliverables

- A reusable region-lattice maze builder with seed-based determinism.
- Tuning parameters for density, minimum corridor length, branching, and exit-region size.
- Rejection and retry loop driven by the verifier from PR 3.

### Acceptance criteria

- Works on at least:
  - a small rectangular region
  - a large rectangular region
  - an irregular masked region
- Produces analyzable layouts whose extracted graphs satisfy the verifier.
- Uses the same algorithm and code path for all region sizes.

## PR 5: Graph/debug outputs and exploration tooling

### Scope

- Add tooling so generated mazes can be viewed and inspected as graphs.
- Export graph JSON and a simple visual format such as Graphviz DOT.
- Add CLI/debug commands for:
  - generate region maze
  - extract graph from region
  - verify layout
  - dump diagnostics

### Deliverables

- CLI entry points under `procedural_generation/`.
- Graph export helpers.
- Snapshot fixtures for graph outputs from deterministic seeds.

### Acceptance criteria

- We can generate a maze, inspect its graph, and verify it with one repeatable workflow.
- Output is deterministic for a fixed seed.
- Diagnostics are usable enough to debug failed or awkward layouts quickly.

## PR 6: Integration with level generation workflows

### Scope

- Integrate the ice maze pipeline into the procedural generation framework as another region-aware algorithm family.
- Support embedding mazes into partially authored levels without owning the whole board.
- Document the workflow and extension points.

### Deliverables

- Generator entry point that accepts:
  - seed
  - region mask
  - start anchor
  - exit anchor or exit region hint
  - chip count target or density target
- Docs for using the generator in full-board and subregion scenarios.
- End-to-end tests covering a generated `.c2m` with an embedded ice region.

### Acceptance criteria

- The same generator can fill an entire board or a bounded subregion.
- Integration does not assume a specific level size.
- Region ownership is explicit so the generator does not overwrite authored content outside the mask.

## Execution order

1. PR 1 establishes the shared contract.
2. PR 2 makes graph extraction authoritative.
3. PR 3 defines correctness.
4. PR 4 generates layouts against that verifier.
5. PR 5 makes the system inspectable.
6. PR 6 wires it into real level-building flows.

## Immediate next step

Implement PR 1 and PR 2 together only if they stay small enough to review cleanly; otherwise start with PR 1 alone. The critical path is to make graph extraction real before any maze-generation heuristics start shaping the codebase.
