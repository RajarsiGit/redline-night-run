import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceSimulation, CONFIG } from '../src/game/simulation.js';

function racing() {
  const sim = new RaceSimulation(() => .2);
  sim.reset('racing');
  sim.traffic = [];
  return sim;
}
function advance(sim, seconds, input = {}, rate = 120) {
  for (let i = 0; i < Math.round(seconds * rate); i++) sim.step(1 / rate, input);
}

test('countdown, pause, and resume preserve time and input-independent state', () => {
  const sim = new RaceSimulation();
  sim.reset();
  advance(sim, 1);
  sim.pause();
  const paused = sim.snapshot();
  advance(sim, 10, { accelerate: true, boost: true });
  assert.deepEqual(sim.snapshot(), paused);
  sim.resume();
  assert.equal(sim.phase, 'countdown');
  advance(sim, 2.1);
  assert.equal(sim.phase, 'racing');
  assert.equal(sim.speed, 0);
});

test('acceleration reaches the exact speed limit; brakes stop without reversing', () => {
  const sim = racing();
  advance(sim, 5, { accelerate: true });
  assert.equal(sim.speed, CONFIG.topSpeed);
  assert.ok(sim.distance > 150);
  const before = sim.distance;
  advance(sim, 2, { brake: true });
  assert.equal(sim.speed, 0);
  assert.ok(sim.distance > before);
  advance(sim, 1, { brake: true });
  assert.equal(sim.speed, 0);
});

test('steering is bounded; shoulders slow the player down', () => {
  const sim = racing();
  advance(sim, 4, { accelerate: true });
  advance(sim, 3, { accelerate: true, right: true });
  assert.ok(sim.x <= 10.6);
  assert.ok(sim.x > CONFIG.roadEdge);
  assert.ok(sim.speed < CONFIG.topSpeed);
});

test('nitro raises top speed, depletes, then recharges when released', () => {
  const sim = racing();
  advance(sim, 4, { accelerate: true });
  advance(sim, 2, { accelerate: true, boost: true });
  assert.ok(sim.speed > CONFIG.topSpeed);
  assert.ok(sim.nitro < 45);
  advance(sim, 1.5, { accelerate: true, boost: true });
  assert.ok(sim.nitro < 5);
  assert.ok(!sim.boosting);
  advance(sim, 4, { accelerate: true });
  assert.ok(sim.nitro > 30);
  assert.equal(sim.speed, CONFIG.topSpeed);
});

test('collision consumes one life, slows the car, and grants temporary immunity', () => {
  const sim = racing();
  sim.speed = 200;
  sim.traffic = [sim.makeTraffic(1, -3), sim.makeTraffic(2, -3)];
  for (const car of sim.traffic) { car.x = sim.x; car.speed = 0; }
  sim.step(1 / 60, { accelerate: true });
  assert.equal(sim.lives, 2);
  assert.ok(sim.speed < 80);
  assert.ok(sim.invulnerable > 2);
  assert.deepEqual(sim.drainEvents(), ['crash']);
  sim.step(1 / 60, { accelerate: true });
  assert.equal(sim.lives, 2);
});

test('third collision ends a run; finished states no longer advance', () => {
  const sim = racing();
  for (let i = 0; i < 3; i++) {
    sim.invulnerable = 0; sim.speed = 150;
    sim.traffic = [{ id: i, x: sim.x, z: -2, speed: 0, passed: false, hit: false }];
    sim.step(1 / 60);
  }
  assert.equal(sim.phase, 'gameover');
  assert.equal(sim.finishReason, 'wrecked');
  const frozen = sim.snapshot();
  advance(sim, 5, { accelerate: true });
  assert.deepEqual(sim.snapshot(), frozen);
});

test('near misses reward once, recharge nitro, and increase the combo', () => {
  const sim = racing();
  sim.speed = 200; sim.nitro = 50; sim.x = 2.5;
  sim.traffic = [{ id: 0, x: 0, z: 4.1, speed: 0, passed: false, hit: false }];
  sim.step(1 / 60, { accelerate: true });
  assert.equal(sim.nearMisses, 1);
  assert.equal(sim.overtakes, 1);
  assert.equal(sim.bonus, 250);
  assert.equal(sim.combo, 2);
  assert.ok(sim.nitro > 60);
  sim.step(1 / 60);
  assert.equal(sim.bonus, 250);
});

test('crossing 5 km finishes the race with a time bonus', () => {
  const sim = racing();
  sim.distance = CONFIG.distance - 1; sim.speed = 210; sim.elapsed = 90;
  advance(sim, .1, { accelerate: true });
  assert.equal(sim.phase, 'finished');
  assert.equal(sim.distance, CONFIG.distance);
  assert.ok(sim.bonus > 1900);
  assert.ok(sim.snapshot().score > 11900);
});

test('running out of time ends the race; reset creates a clean new run', () => {
  const sim = racing();
  advance(sim, CONFIG.timeLimit + .1);
  assert.equal(sim.phase, 'gameover');
  assert.equal(sim.finishReason, 'timeout');
  sim.reset();
  assert.equal(sim.phase, 'countdown');
  assert.equal(sim.distance, 0);
  assert.equal(sim.lives, 3);
  assert.equal(sim.nitro, 100);
  assert.equal(sim.traffic.length, 16);
});

test('simulation remains consistent at different step rates', () => {
  const slow = racing(), fast = racing();
  advance(slow, 20, { accelerate: true }, 30);
  advance(fast, 20, { accelerate: true }, 120);
  assert.equal(slow.speed, fast.speed);
  assert.ok(Math.abs(slow.distance - fast.distance) < 1);
  assert.ok(Math.abs(slow.elapsed - fast.elapsed) < .001);
});
