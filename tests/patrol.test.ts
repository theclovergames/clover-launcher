import assert from "node:assert/strict";
import test from "node:test";
import { patrolLanes } from "../src/lib/patrol.ts";

test("les sprites gardent dix pixels d'écart même aux extrémités voisines des patrouilles", () => {
  for (const width of [280, 320, 500, 960, 1500]) {
    for (const bodies of [[54, 76, 44.64, 42], [24, 24, 54, 54, 76, 44.64, 42], [26, 26, 26, 26, 26, 34]]) {
      const { scale, lanes } = patrolLanes(width, bodies);
      assert.ok(scale > 0 && scale <= 1);
      for (let index = 0; index < lanes.length; index++) {
        const lane = lanes[index];
        const left = lane.from / 100 * width - bodies[index] * scale / 2;
        const right = lane.to / 100 * width + bodies[index] * scale / 2;
        assert.ok(left >= 8 - 1e-8);
        assert.ok(right <= width - 8 + 1e-8);
        if (index > 0) {
          const previous = lanes[index - 1].to / 100 * width + bodies[index - 1] * scale / 2;
          assert.ok(left - previous >= 10 - 1e-8);
        }
      }
    }
  }
});
