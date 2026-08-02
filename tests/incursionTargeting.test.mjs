import assert from "node:assert/strict";
import test from "node:test";
import { FlightFighter } from "../src/entities/FlightFighter.js";
import { MiningWorkerShip } from "../src/entities/MiningWorkerShip.js";
import { selectIncursionTarget } from "../src/systems/incursionTargeting.js";

function target(id, x, { value = 1, vulnerability = 1, detectable = true } = {}) {
  return { id, position: { x, y: 0 }, velocity: { x: 0, y: 0 }, strategicValue: value, vulnerability, detectable };
}

test("incursions consider every visible attackable actor rather than only the player", () => {
  const selected = selectIncursionTarget({ x: 0, y: 0 }, [
    target("player-ship", 700),
    target("freighter", 280),
    target("miner", 360, { value: 1.4 }),
  ], { maximumRange: 1_000 });
  assert.equal(selected.id, "miner", "economic value can outweigh a modest distance difference");
});

test("undetectable, invulnerable, and out-of-range actors cannot be selected", () => {
  const selected = selectIncursionTarget({ x: 0, y: 0 }, [
    { ...target("cloaked", 10), detectable: false },
    { ...target("protected", 20), attackable: false },
    target("distant", 1_100),
    target("valid", 400),
  ], { maximumRange: 1_000 });
  assert.equal(selected.id, "valid");
});

test("a fighter acquires an NPC economic target and tags its shot with custody", () => {
  const fighter = new FlightFighter({ id: "fighter", x: 0, y: 0, angle: 0, seed: 1 });
  fighter.fireCooldown = 0;
  fighter.update(0.016, {
    attackableTargets: [target("haul-one", 300)],
    portalPosition: { x: 0, y: 0 },
  });
  assert.equal(fighter.targetId, "haul-one");
  assert.equal(fighter.consumeShots()[0]?.targetId, "haul-one");
});

test("mining craft now have a real weapon-damage lifecycle", () => {
  const worker = new MiningWorkerShip({ id: "miner", name: "Miner", institutionId: "mine-co", controllerInstitutionId: "person:miner", x: 0, y: 0 });
  worker.damage(35);
  assert.equal(worker.hull, 85);
  assert.equal(worker.isAlive, true);
  worker.damage(100);
  assert.equal(worker.hull, 0);
  assert.equal(worker.isAlive, false);
});
