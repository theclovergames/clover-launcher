import assert from "node:assert/strict";
import test from "node:test";
import { glideAcross, planFlight } from "../src/lib/flight.ts";

const [width, height, margin] = [760, 560, 220];

/** Vol complet image par image ; chaque image passe à `frame`. */
function fly(advance: ReturnType<typeof glideAcross>, frame: (glide: NonNullable<ReturnType<typeof advance>>) => void) {
  let seconds = 0;
  let last = null;
  for (let glide = advance(1 / 60); glide; glide = advance(1 / 60)) {
    seconds += 1 / 60;
    frame(glide);
    last = { ...glide };
  }
  return { seconds, last };
}

test("chaque passage traverse le ciel sans en sortir par le haut ni tomber dans les collines", () => {
  for (let run = 0; run < 300; run++) {
    const { seconds, last } = fly(glideAcross(width, height, margin), (glide) => {
      assert.ok(glide.y > -margin / 2 && glide.y < height * 0.76, `hauteur ${glide.y}`);
      assert.ok(glide.scale >= 0.35 && glide.scale <= 1);
      assert.ok(glide.spread >= 0 && glide.spread <= 1);
    });
    assert.ok(last, "le passage a duré au moins une image");
    assert.ok(seconds < 40, `passage de ${seconds.toFixed(1)} s`);
    // Sorti par le bord opposé à son entrée.
    assert.ok(last.dir > 0 ? last.x > width : last.x < 0);
  }
});

test("les loopings ont lieu à l'écart du personnage, qui occupe le milieu du ciel", () => {
  let loops = 0;
  for (let run = 0; run < 300; run++) {
    let looping = false;
    fly(glideAcross(width, height, margin, { ...planFlight(height), loop: Math.random() < 0.5 ? 0.07 : 0.84 }), (glide) => {
      // Au-delà de la verticale en remontant : seul un looping y mène.
      if (glide.pitch < -2) {
        looping = true;
        assert.ok(glide.x < width * 0.32 || glide.x > width * 0.68, `looping à x = ${glide.x.toFixed(0)}`);
      }
    });
    if (looping) loops++;
  }
  assert.ok(loops > 100, `${loops} loopings sur 300`);
});

test("un groupe garde sa formation, figures comprises : personne ne se touche", () => {
  for (let run = 0; run < 200; run++) {
    const plan = { ...planFlight(height), loop: 2 };
    const [lead, follow] = [glideAcross(width, height, margin, plan), glideAcross(width, height, margin, plan, 160)];
    for (let a = lead(1 / 60), b = follow(1 / 60); a && b; a = lead(1 / 60), b = follow(1 / 60)) {
      assert.ok(Math.abs(a.x - b.x - a.dir * 160) < 0.5 && Math.abs(a.y - b.y) < 0.5, `écart ${(a.x - b.x).toFixed(0)}, ${(a.y - b.y).toFixed(0)}`);
    }
  }
});
