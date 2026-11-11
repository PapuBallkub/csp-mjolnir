import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure calculation logic matching BeforeAfterSlider positioning
 */
function clampPosition(x: number, width: number): number {
  if (width <= 0) return 50;
  const pos = (x / width) * 100;
  return Math.max(0, Math.min(100, pos));
}

test("clampPosition: normalizes pointer X coordinates to 0-100 percentage", () => {
  assert.equal(clampPosition(250, 500), 50);
  assert.equal(clampPosition(0, 500), 0);
  assert.equal(clampPosition(500, 500), 100);
  assert.equal(clampPosition(125, 500), 25);
  assert.equal(clampPosition(375, 500), 75);
});

test("clampPosition: clamps out-of-bound pointer values safely", () => {
  assert.equal(clampPosition(-50, 500), 0);
  assert.equal(clampPosition(600, 500), 100);
  assert.equal(clampPosition(1000, 500), 100);
});

test("clampPosition: safely handles zero or negative width without dividing by zero", () => {
  assert.equal(clampPosition(100, 0), 50);
  assert.equal(clampPosition(100, -10), 50);
});

