const REVEAL_RADIUS = 720;
const PULL_RADIUS = 980;
const INNER_RADIUS = 150;

export class DriftMouth {
  constructor({ id, x, y, seed }) {
    this.id = id;
    this.type = "drift-mouth";
    this.position = { x, y };
    this.seed = seed;
    this.radius = PULL_RADIUS;
    this.reveal = 0;
    this.hasRevealed = false;
    this.justRevealed = false;
  }

  update(deltaSeconds, world) {
    this.justRevealed = false;
    const shipDistance = distance(this.position, world.ship.position);
    const targetReveal = shipDistance < REVEAL_RADIUS ? 1 - shipDistance / REVEAL_RADIUS : 0;
    this.reveal += (targetReveal - this.reveal) * Math.min(1, deltaSeconds * 1.8);

    if (!this.hasRevealed && this.reveal > 0.32) {
      this.hasRevealed = true;
      this.justRevealed = true;
    }

    if (this.reveal <= 0.02) {
      return;
    }

    pullBody(this.position, world.ship, deltaSeconds, 36 * this.reveal, PULL_RADIUS);
    world.pickups.forEach((pickup) => pullBody(this.position, pickup, deltaSeconds, 90 * this.reveal, PULL_RADIUS));
    world.lifeforms.forEach((lifeform) => pullBody(this.position, lifeform, deltaSeconds, 54 * this.reveal, PULL_RADIUS));
  }

  consumeReveal() {
    const revealed = this.justRevealed;
    this.justRevealed = false;
    return revealed;
  }

  draw(context, camera) {
    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;
    const time = performance.now();
    const pulse = 0.5 + Math.sin(time / 840 + this.seed) * 0.22;
    const open = this.reveal;

    if (open <= 0.025) {
      context.save();
      context.strokeStyle = "rgba(188, 120, 255, 0.08)";
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(screenX, screenY, 90 + pulse * 24, 0.2, Math.PI * 1.45);
      context.stroke();
      context.restore();
      return;
    }

    context.save();
    context.translate(screenX, screenY);
    context.globalAlpha = 0.35 + open * 0.55;

    const mouthRadius = INNER_RADIUS * (0.35 + open * 0.9);
    const rippleCount = 4;

    for (let index = rippleCount; index >= 1; index -= 1) {
      context.strokeStyle = `rgba(194, 112, 255, ${0.05 + open * 0.09})`;
      context.lineWidth = 1.2;
      drawAngularRing(context, mouthRadius + index * 70 + pulse * index * 10, 9 + index, time / (1800 + index * 220));
    }

    context.fillStyle = `rgba(0, 0, 0, ${0.45 + open * 0.35})`;
    context.strokeStyle = `rgba(255, 116, 229, ${0.24 + open * 0.4})`;
    context.lineWidth = 2.4;
    context.beginPath();
    context.arc(0, 0, mouthRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.strokeStyle = `rgba(255, 198, 252, ${0.16 + open * 0.36})`;
    for (let index = 0; index < 14; index += 1) {
      const angle = (Math.PI * 2 * index) / 14 + time / 2600;
      const inner = mouthRadius * 0.42;
      const outer = mouthRadius * (0.82 + ((index + this.seed) % 3) * 0.08);
      context.beginPath();
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle + 0.1) * outer, Math.sin(angle + 0.1) * outer);
      context.stroke();
    }

    context.strokeStyle = `rgba(126, 240, 255, ${0.12 + open * 0.28})`;
    context.lineWidth = 1.4;
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6 - time / 3100;
      const radius = mouthRadius * (1.28 + (index % 2) * 0.18);
      context.beginPath();
      context.moveTo(Math.cos(angle) * mouthRadius * 0.72, Math.sin(angle) * mouthRadius * 0.72);
      context.lineTo(Math.cos(angle + 0.18) * radius, Math.sin(angle + 0.18) * radius);
      context.lineTo(Math.cos(angle + 0.36) * mouthRadius * 0.92, Math.sin(angle + 0.36) * mouthRadius * 0.92);
      context.stroke();
    }

    context.restore();
  }
}

function drawAngularRing(context, radius, pointCount, rotation) {
  context.beginPath();
  for (let index = 0; index < pointCount; index += 1) {
    const angle = rotation + (Math.PI * 2 * index) / pointCount;
    const jitter = index % 2 === 0 ? 1 : 0.88;
    const x = Math.cos(angle) * radius * jitter;
    const y = Math.sin(angle) * radius * jitter;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.closePath();
  context.stroke();
}

function pullBody(center, body, deltaSeconds, strength, radius) {
  if (!body?.velocity) {
    return;
  }

  const dx = center.x - body.position.x;
  const dy = center.y - body.position.y;
  const bodyDistance = Math.hypot(dx, dy);

  if (bodyDistance <= 0 || bodyDistance > radius) {
    return;
  }

  const falloff = 1 - bodyDistance / radius;
  const innerBoost = bodyDistance < INNER_RADIUS ? 1.8 : 1;
  const force = strength * falloff * innerBoost * deltaSeconds;

  body.velocity.x += (dx / bodyDistance) * force;
  body.velocity.y += (dy / bodyDistance) * force;
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
