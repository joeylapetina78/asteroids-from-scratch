import test from "node:test";
import assert from "node:assert/strict";

import {
  METER_GRAINS,
  PANEL_CONTENT_WIDTH,
  PANEL_MINOR_GRID,
  PANEL_MAKERS,
  getMeterGrain,
  getPanelMaker,
  getPanelMakerId,
} from "../src/content/ships/panelMakers.js";

// The mounting standard, asserted. A maker may choose any grain it likes; it
// may not choose one that fails to tile the bay, because then its meter stops
// lining up with the instrument stacked above it.
test("every meter grain tiles the panel content width exactly", () => {
  Object.entries(METER_GRAINS).forEach(([name, grain]) => {
    assert.equal(
      grain.cells * grain.pitch,
      PANEL_CONTENT_WIDTH,
      `${name} does not tile ${PANEL_CONTENT_WIDTH}px`,
    );
  });
});

test("every meter grain sits on the minor grid, bar inside pitch", () => {
  Object.entries(METER_GRAINS).forEach(([name, grain]) => {
    assert.equal(grain.pitch % PANEL_MINOR_GRID, 0, `${name} pitch is off the grid`);
    assert.ok(grain.bar < grain.pitch, `${name} bar does not fit its pitch`);
  });
});

test("every maker's control height is a multiple of the minor grid", () => {
  Object.values(PANEL_MAKERS).forEach((maker) => {
    assert.equal(
      maker.controlHeight % PANEL_MINOR_GRID,
      0,
      `${maker.id} control height is off the grid`,
    );
  });
});

// The constraint that makes half-offset placement safe: a panel parked on a
// midpoint moves its whole interior by half a column, so the minor grid has to
// BE that half or nothing inside it lands on a drawn line any more.
test("the minor grid is exactly half the major one", () => {
  assert.equal(PANEL_MINOR_GRID * 2, 24);
  assert.equal(PANEL_CONTENT_WIDTH % PANEL_MINOR_GRID, 0);
});

test("the engine's maker follows the fitted drive, not a table", () => {
  assert.equal(getPanelMakerId("engine", { engineBrand: "Vektor" }), "vektor");
  assert.equal(getPanelMakerId("engine", { engineBrand: "Rook" }), "rook");
  // An unrecognised drive is unbranded rather than a crash.
  assert.equal(getPanelMakerId("engine", { engineBrand: "Nobody" }), "generic");
  assert.equal(getPanelMakerId("engine"), "generic");
});

test("panels without fitted equipment come from the maker table", () => {
  assert.equal(getPanelMakerId("hull"), "rook");
  assert.equal(getPanelMakerId("beacon-locator"), "vektor");
  assert.equal(getPanelMakerId("not-a-panel"), "generic");
});

test("an unknown maker resolves rather than throwing", () => {
  assert.equal(getPanelMaker("nope").id, "generic");
  assert.deepEqual(getMeterGrain("nope"), METER_GRAINS.standard);
  assert.deepEqual(getMeterGrain("rook"), METER_GRAINS.coarse);
});
