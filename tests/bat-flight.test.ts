import assert from "node:assert/strict";
import test from "node:test";
import { ambientFlight, flightPath } from "../src/lib/flight.ts";

test("la courbe partagée du dragon garde ses points, sa distance et ses prolongements", () => {
  const straight = flightPath([{ x: 0, y: 20 }, { x: 50, y: 20 }, { x: 100, y: 20 }]);
  assert.ok(Math.abs(straight.total - 100) < 1e-8);
  for (const distance of [-20, 0, 35, 100, 120]) {
    const spot = straight.at(distance);
    assert.ok(Math.abs(spot.x - distance) < 1e-8);
    assert.equal(spot.y, 20);
    assert.equal(spot.angle, 0);
  }
  const waypoints = [{ x: 0, y: 80 }, { x: 100, y: 40 }, { x: 200, y: 100 }, { x: 150, y: 150 }, { x: 300, y: 70 }];
  const curve = flightPath(waypoints);
  waypoints.forEach((point, index) => {
    const spot = curve.at(curve.lengths[index * 60]);
    assert.ok(Math.hypot(spot.x - point.x, spot.y - point.y) < 1e-8);
  });
  assert.ok(curve.total > 400);
});

const values = (transform: string) => transform.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);

test("les petits vols varient en altitude, font demi-tour et gardent leur profil sans oscillation", () => {
  for (const kind of ["bat", "allay"] as const) {
  for (const width of [300, 1000, 1600]) {
    for (const height of [200, 700]) {
      for (const phase of [0, 0.3, 1, 1.1344640137963142, Math.PI / 2, Math.PI, 3.9008108782073267, 4.4156830075456535, 4.7, 5.916666164260777, 6]) {
        const left = ambientFlight(width, height, true, phase, kind);
        const right = ambientFlight(width, height, false, phase, kind);
        assert.deepEqual(left, ambientFlight(width, height, true, phase, kind));
        let turns = 0;
        const positions = left.motion.map(({ transform, offset }, index) => {
          const [x, y, tilt] = values(transform);
          const mirrored = values(right.motion[index].transform);
          assert.ok(Math.abs(x + mirrored[0] - width) < 1e-9);
          assert.ok(Math.abs(y - mirrored[1]) < 1e-8);
          assert.ok(Math.abs(tilt + mirrored[2]) < 1e-8);
          assert.ok(y > height * 0.1 && y < height * 0.5);
          assert.ok(Math.abs(tilt) <= (kind === "allay" ? 8 : 18));
          assert.equal(left.facing[index].offset, offset);
          assert.equal(left.facing[index].easing, "steps(1, end)");
          assert.ok(Math.abs(values(left.facing[index].transform)[0]) === 1);
          assert.equal(values(left.facing[index].transform)[0], -values(right.facing[index].transform)[0]);
          if (index && left.facing[index].transform !== left.facing[index - 1].transform) turns++;
          return [x, y, tilt];
        });
        assert.ok(positions[0][0] < -80);
        assert.ok(positions.at(-1)![0] > width + 80 || positions.at(-1)![0] < -80);
        assert.ok(turns >= 1 && turns <= 3);
        assert.ok(Math.max(...positions.map((point) => point[1])) - Math.min(...positions.map((point) => point[1])) > height * 0.03);
        let forward = false;
        let backward = false;
        const distances: number[] = [];
        for (let index = 1; index < positions.length - 1; index++) {
          const [previous, current, next] = positions.slice(index - 1, index + 2);
          const dx = current[0] - previous[0];
          const dy = current[1] - previous[1];
          const distance = Math.hypot(dx, dy);
          distances.push(distance);
          const aheadX = next[0] - current[0];
          const aheadY = next[1] - current[1];
          const alignment = (dx * aheadX + dy * aheadY) / (distance * Math.hypot(aheadX, aheadY));
          assert.ok(alignment > Math.cos(25 * Math.PI / 180), "pas de virage en épingle");
          if (current[0] > 0 && current[0] < width) {
            forward ||= dx > 0;
            backward ||= dx < 0;
            const ahead = next[0] - current[0];
            if (Math.sign(dx) === Math.sign(ahead) && Math.abs(dx) > distance * 0.6) assert.equal(values(left.facing[index].transform)[0], Math.sign(dx));
          }
        }
        assert.ok(forward && backward);
        const median = [...distances].sort((a, b) => a - b)[Math.floor(distances.length / 2)];
        assert.ok(Math.max(...distances) < median * 1.02, "pas de saut dans la trajectoire");
        assert.ok(Math.min(...distances) > median * 0.95, "pas d'arrêt au demi-tour");
      }
    }
  }
  }
});
