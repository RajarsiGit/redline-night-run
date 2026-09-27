export const CONFIG = Object.freeze({
  distance: 5000,
  timeLimit: 110,
  topSpeed: 216,
  boostSpeed: 306,
  acceleration: 66,
  braking: 145,
  coast: 26,
  roadEdge: 9.1,
  lanes: [-6.75, -2.25, 2.25, 6.75],
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Pure simulation, independent of React, WebGL, and frame rate. Units: metres and seconds. */
export class RaceSimulation {
  constructor(random = Math.random) {
    this.random = random;
    this.reset('ready');
  }

  reset(phase = 'countdown') {
    this.phase = phase;
    this.previousPhase = 'racing';
    this.countdown = 3;
    this.speed = 0;
    this.x = -2.25;
    this.steer = 0;
    this.distance = 0;
    this.elapsed = 0;
    this.nitro = 100;
    this.boosting = false;
    this.boostLocked = false;
    this.lives = 3;
    this.invulnerable = 0;
    this.crashFlash = 0;
    this.bonus = 0;
    this.overtakes = 0;
    this.nearMisses = 0;
    this.combo = 1;
    this.comboTime = 0;
    this.message = '';
    this.messageTime = 0;
    this.finishReason = '';
    this.events = [];
    this.traffic = Array.from({ length: 16 }, (_, i) => this.makeTraffic(i, -100 - i * 38));
  }

  makeTraffic(id, z) {
    const lane = Math.floor(this.random() * CONFIG.lanes.length);
    return { id, x: CONFIG.lanes[lane], z, speed: 82 + this.random() * 45, passed: false, hit: false, color: id % 5 };
  }

  pause() {
    if (this.phase !== 'racing' && this.phase !== 'countdown') return;
    this.previousPhase = this.phase;
    this.phase = 'paused';
    this.boosting = false;
  }

  resume() {
    if (this.phase === 'paused') this.phase = this.previousPhase;
  }

  announce(message, duration = 1.4) {
    this.message = message;
    this.messageTime = duration;
  }

  finish(reason) {
    this.phase = reason === 'finished' ? 'finished' : 'gameover';
    this.finishReason = reason;
    this.boosting = false;
    if (reason === 'finished') this.bonus += Math.round(Math.max(0, CONFIG.timeLimit - this.elapsed) * 100);
    this.events.push(reason === 'finished' ? 'finish' : 'gameover');
  }

  step(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown <= 1e-8) {
        this.phase = 'racing';
        this.announce('GO!');
        this.events.push('go');
      }
      return;
    }
    if (this.phase !== 'racing') return;

    this.elapsed += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.crashFlash = Math.max(0, this.crashFlash - dt);
    this.messageTime = Math.max(0, this.messageTime - dt);
    this.comboTime = Math.max(0, this.comboTime - dt);
    if (!this.comboTime) this.combo = 1;

    if (!input.boost || this.nitro >= 22) this.boostLocked = false;
    this.boosting = !!input.boost && this.nitro > 0 && !this.boostLocked && this.speed > 45 && !input.brake;
    if (this.boosting) {
      this.nitro = Math.max(0, this.nitro - 29 * dt);
      if (this.nitro === 0) this.boostLocked = true;
    } else {
      this.nitro = Math.min(100, this.nitro + 9 * dt);
    }

    const targetSpeed = this.boosting ? CONFIG.boostSpeed : CONFIG.topSpeed;
    if (input.brake) this.speed -= CONFIG.braking * dt;
    else if (input.accelerate || this.boosting) {
      this.speed = this.speed < targetSpeed
        ? Math.min(targetSpeed, this.speed + (this.boosting ? 108 : CONFIG.acceleration) * dt)
        : Math.max(targetSpeed, this.speed - 80 * dt);
    } else this.speed -= CONFIG.coast * dt;
    this.speed = clamp(this.speed, 0, CONFIG.boostSpeed);

    const direction = Number(!!input.right) - Number(!!input.left);
    this.steer += (direction - this.steer) * Math.min(1, 12 * dt);
    this.x = clamp(this.x + this.steer * dt * (3 + this.speed / 42) * Math.min(1, this.speed / 24), -10.6, 10.6);
    if (Math.abs(this.x) > CONFIG.roadEdge) {
      this.speed = Math.max(0, this.speed - 110 * dt);
      if (this.messageTime === 0) this.announce('OFF ROAD — SLOWING DOWN', 0.7);
    }

    this.distance += this.speed / 3.6 * dt;
    for (const car of this.traffic) {
      const oldZ = car.z;
      car.z += (this.speed - car.speed) / 3.6 * dt;
      // Swept overlap prevents cars tunnelling through one another on slower frames.
      const overlaps = Math.min(oldZ, car.z) < 3.7 && Math.max(oldZ, car.z) > -3.7;
      if (!car.hit && !this.invulnerable && overlaps && Math.abs(this.x - car.x) < 1.85) {
        car.hit = true;
        this.lives -= 1;
        this.speed *= 0.36;
        this.invulnerable = 2.3;
        this.crashFlash = 0.6;
        this.combo = 1;
        this.comboTime = 0;
        this.announce(this.lives ? 'COLLISION — KEEP GOING' : 'WRECKED', 1.8);
        this.events.push('crash');
        if (!this.lives) { this.finish('wrecked'); return; }
      }
      if (!car.passed && oldZ <= 4.2 && car.z > 4.2) {
        car.passed = true;
        if (!car.hit) {
          this.overtakes += 1;
          const close = Math.abs(this.x - car.x) < 3.4;
          this.bonus += (close ? 250 : 100) * this.combo;
          if (close) {
            this.nearMisses += 1;
            this.nitro = Math.min(100, this.nitro + 10);
            this.announce(`NEAR MISS +${250 * this.combo}`);
            this.events.push('near');
          }
          this.combo = Math.min(5, this.combo + 1);
          this.comboTime = 6;
        }
      }
      if (car.z > 35 || car.z < -780) {
        const farthest = Math.min(-230, ...this.traffic.filter(other => other !== car).map(other => other.z));
        Object.assign(car, this.makeTraffic(car.id, Math.max(-730, farthest - 32 - this.random() * 20)));
      }
    }

    if (this.distance >= CONFIG.distance) {
      this.distance = CONFIG.distance;
      this.finish('finished');
    } else if (this.elapsed >= CONFIG.timeLimit) this.finish('timeout');
  }

  drainEvents() { return this.events.splice(0); }

  snapshot() {
    return {
      phase: this.phase, countdown: Math.ceil(this.countdown), speed: Math.round(this.speed),
      distance: this.distance, remaining: Math.max(0, CONFIG.timeLimit - this.elapsed),
      elapsed: this.elapsed, nitro: this.nitro, boosting: this.boosting, lives: this.lives,
      score: Math.floor(this.distance * 2 + this.bonus), overtakes: this.overtakes,
      nearMisses: this.nearMisses, combo: this.combo, progress: this.distance / CONFIG.distance,
      message: this.messageTime > 0 ? this.message : '', crashFlash: this.crashFlash,
      finishReason: this.finishReason,
    };
  }
}
