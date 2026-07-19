import { drawResourceShape } from "../entities/ResourcePickup.js?v=fresh-20260718-1945-861127d";
import { RESOURCE_COLOR, getResourceShape } from "./resourceDefinitions.js?v=fresh-20260718-1945-861127d";

const UNIT_SIZE = 22;
const GRAVITY = 780;
const BOUNCE = 0.18;
const FLOOR_FRICTION = 0.82;
const SOLVER_STEPS = 4;
const ANGULAR_DRAG = 0.86;
const FLOOR_ANGULAR_DRAG = 0.48;
const COLLISION_COMPRESSION = 0.9;
const TRIANGLE_SLOPE_PUSH = 0.42;
const MAX_ANGULAR_VELOCITY = 1.8;
const COMPACTION_COUNT = 10;
const COMPACTION_DURATION = 0.38;

// Processor is a small square-unit physics canvas. It is used for both the
// clickable processor and the non-clickable cargo hold, with behavior selected
// by the constructor options.
export class Processor {
  constructor(canvas, onUnitProcessed = () => {}, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.onUnitProcessed = onUnitProcessed;
    this.isClickable = options.isClickable ?? true;
    this.enableCompaction = options.enableCompaction ?? false;
    this.getUnitFlags = options.getUnitFlags ?? (() => ({}));
    this.units = [];
    this.sparks = [];
    this.compaction = null;
    this.lastFrameTime = 0;

    if (this.isClickable) {
      canvas.addEventListener("click", (event) => this.handleClick(event));
    }
  }

  start() {
    requestAnimationFrame((time) => this.frame(time));
  }

  addUnit(type, metadata = {}) {
    const slot = this.units.length % 4;
    const spacing = UNIT_SIZE + 4;

    const quantity = metadata.quantity ?? 1;

    this.units.push({
      type,
      ...metadata,
      color: RESOURCE_COLOR[type] ?? "#ff7452",
      shape: getResourceShape(type),
      x: this.canvas.width / 2 - spacing * 2 + slot * spacing,
      y: 30,
      vx: (slot - 1.5) * 12,
      vy: 0,
      angle: (Math.random() - 0.5) * 0.5,
      angularVelocity: (Math.random() - 0.5) * 0.9,
      quantity,
      size: getUnitSize(quantity),
    });
  }

  getUnitCounts() {
    return this.units.reduce((counts, unit) => {
      counts[unit.type] = (counts[unit.type] ?? 0) + (unit.quantity ?? 1);
      return counts;
    }, {});
  }

  drainUnits() {
    const units = [...this.units];
    this.units = [];

    return units;
  }

  removeUnits(type, count) {
    const removedUnits = [];
    const keptUnits = [];
    let remaining = count;

    this.units.forEach((unit) => {
      const quantity = unit.quantity ?? 1;
      const removedQuantity = unit.type === type ? Math.min(quantity, remaining) : 0;

      if (removedQuantity > 0) {
        removedUnits.push({
          ...unit,
          quantity: removedQuantity,
          size: getUnitSize(removedQuantity),
        });
        remaining -= removedQuantity;
      }

      if (removedQuantity < quantity) {
        keptUnits.push({
          ...unit,
          quantity: quantity - removedQuantity,
          size: getUnitSize(quantity - removedQuantity),
        });
      }
    });

    if (remaining > 0) {
      return [];
    }

    this.units = keptUnits;
    return removedUnits;
  }

  getSaveSnapshot() {
    return {
      units: this.units.map((unit) => ({
        type: unit.type,
        x: unit.x,
        y: unit.y,
        vx: unit.vx,
        vy: unit.vy,
        angle: unit.angle ?? 0,
        angularVelocity: unit.angularVelocity ?? 0,
        sourceClaimId: unit.sourceClaimId ?? null,
        sourceClaimName: unit.sourceClaimName ?? null,
        quantity: unit.quantity ?? 1,
      })),
    };
  }

  loadSaveSnapshot(snapshot) {
    if (!snapshot?.units) {
      return;
    }

    this.units = snapshot.units.map((unit) => ({
      type: unit.type,
      color: RESOURCE_COLOR[unit.type] ?? "#ff7452",
      shape: getResourceShape(unit.type),
      x: unit.x,
      y: unit.y,
      vx: unit.vx,
      vy: unit.vy,
      angle: unit.angle ?? 0,
      angularVelocity: unit.angularVelocity ?? 0,
      sourceClaimId: unit.sourceClaimId ?? null,
      sourceClaimName: unit.sourceClaimName ?? null,
      quantity: unit.quantity ?? 1,
      size: getUnitSize(unit.quantity ?? 1),
    }));
  }

  frame(time) {
    const deltaSeconds = Math.min((time - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = time;

    this.update(deltaSeconds);
    this.draw();

    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  update(deltaSeconds) {
    if (this.enableCompaction && !this.compaction) {
      this.startCompaction();
    }

    const compactingUnits = this.advanceCompaction(deltaSeconds);
    this.units.forEach((unit) => {
      if (compactingUnits?.has(unit)) {
        return;
      }

      unit.vy += GRAVITY * deltaSeconds;
      unit.x += unit.vx * deltaSeconds;
      unit.y += unit.vy * deltaSeconds;
      unit.angle += unit.angularVelocity * deltaSeconds;
      unit.angularVelocity *= ANGULAR_DRAG;
      unit.angularVelocity = clamp(unit.angularVelocity, -MAX_ANGULAR_VELOCITY, MAX_ANGULAR_VELOCITY);
      this.keepInsideBounds(unit);
    });

    for (let step = 0; step < SOLVER_STEPS; step += 1) {
      this.resolveUnitCollisions(compactingUnits);
      this.units.forEach((unit) => {
        if (!compactingUnits?.has(unit)) {
          this.keepInsideBounds(unit);
        }
      });
    }

    this.sparks.forEach((spark) => {
      spark.life -= deltaSeconds;
      spark.vx *= 0.94;
      spark.vy *= 0.94;
      spark.x += spark.vx * deltaSeconds;
      spark.y += spark.vy * deltaSeconds;
    });
    this.sparks = this.sparks.filter((spark) => spark.life > 0);
  }

  draw() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = "#080a0f";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawPipe();

    this.units.forEach((unit) => {
      this.context.fillStyle = unit.color;
      this.context.strokeStyle = "rgba(255,255,255,0.7)";
      this.context.lineWidth = 2;
      this.context.save();
      this.context.translate(unit.x + unit.size / 2, unit.y + unit.size / 2);
      this.context.rotate(unit.angle ?? 0);
      drawResourceShape(this.context, unit.shape, unit.size);
      if (this.getUnitFlags(unit)?.illegal) {
        drawIllegalMark(this.context, unit.size);
      }
      if ((unit.quantity ?? 1) > 1) {
        this.context.rotate(-(unit.angle ?? 0));
        this.context.fillStyle = "#080a0f";
        this.context.font = "bold 11px monospace";
        this.context.textAlign = "center";
        this.context.textBaseline = "middle";
        this.context.fillText(`x${unit.quantity}`, 0, 0);
      }
      this.context.restore();
    });

    this.sparks.forEach((spark) => {
      this.context.globalAlpha = Math.max(0, spark.life / spark.maxLife);
      this.context.fillStyle = spark.color;
      this.context.fillRect(spark.x, spark.y, spark.size, spark.size);
      this.context.globalAlpha = 1;
    });
  }

  drawPipe() {
    const pipeWidth = 78;
    const pipeX = this.canvas.width / 2 - pipeWidth / 2;

    this.context.fillStyle = "#2a303b";
    this.context.strokeStyle = "#697386";
    this.context.lineWidth = 2;
    this.context.fillRect(pipeX, 0, pipeWidth, 22);
    this.context.strokeRect(pipeX, -2, pipeWidth, 24);

    this.context.fillStyle = "#11151d";
    this.context.fillRect(pipeX + 12, 22, pipeWidth - 24, 14);
    this.context.strokeRect(pipeX + 12, 22, pipeWidth - 24, 14);
  }

  keepInsideBounds(unit) {
    if (unit.x < 0) {
      unit.x = 0;
      unit.vx = Math.abs(unit.vx) * BOUNCE;
      unit.angularVelocity += Math.abs(unit.vy) * 0.002;
    }

    if (unit.x + unit.size > this.canvas.width) {
      unit.x = this.canvas.width - unit.size;
      unit.vx = -Math.abs(unit.vx) * BOUNCE;
      unit.angularVelocity -= Math.abs(unit.vy) * 0.002;
    }

    if (unit.y + unit.size > this.canvas.height) {
      unit.y = this.canvas.height - unit.size;
      unit.vy = -Math.abs(unit.vy) * BOUNCE;
      unit.vx *= FLOOR_FRICTION;
      unit.angularVelocity = (unit.angularVelocity + unit.vx * 0.008) * FLOOR_ANGULAR_DRAG;
    }
  }

  resolveUnitCollisions(excludedUnits = null) {
    // This is intentionally a simple axis-aligned square solver. It gives us
    // readable "pile of units" behavior without introducing a physics engine.
    for (let firstIndex = 0; firstIndex < this.units.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < this.units.length; secondIndex += 1) {
        const first = this.units[firstIndex];
        const second = this.units[secondIndex];
        if (excludedUnits?.has(first) || excludedUnits?.has(second)) {
          continue;
        }
        this.resolveUnitPair(first, second);
      }
    }
  }

  resolveUnitPair(first, second) {
    const firstCenterX = first.x + first.size / 2;
    const firstCenterY = first.y + first.size / 2;
    const secondCenterX = second.x + second.size / 2;
    const secondCenterY = second.y + second.size / 2;
    const firstCollisionHalf = getCollisionSize(first) / 2;
    const secondCollisionHalf = getCollisionSize(second) / 2;
    const overlapX = firstCollisionHalf + secondCollisionHalf - Math.abs(firstCenterX - secondCenterX);
    const overlapY = firstCollisionHalf + secondCollisionHalf - Math.abs(firstCenterY - secondCenterY);

    if (overlapX <= 0 || overlapY <= 0) {
      return;
    }

    if (this.resolveTriangleSlope(first, second, overlapX, overlapY)) {
      return;
    }

    if (overlapX < overlapY) {
      const push = overlapX / 2;
      const direction = firstCenterX < secondCenterX ? -1 : 1;
      first.x += push * direction;
      second.x -= push * direction;
      first.vx *= -BOUNCE;
      second.vx *= -BOUNCE;
      first.angularVelocity += direction * Math.abs(second.vy) * 0.003;
      second.angularVelocity -= direction * Math.abs(first.vy) * 0.003;
    } else {
      const push = overlapY / 2;
      const direction = firstCenterY < secondCenterY ? -1 : 1;
      first.y += push * direction;
      second.y -= push * direction;
      first.vy *= -BOUNCE;
      second.vy *= -BOUNCE;
      const spin = (secondCenterX - firstCenterX) * 0.004;
      first.angularVelocity -= spin;
      second.angularVelocity += spin;
    }
  }

  resolveTriangleSlope(first, second, overlapX, overlapY) {
    return this.resolveTriangleSupport(first, second, overlapX, overlapY)
      || this.resolveTriangleSupport(second, first, overlapX, overlapY);
  }

  resolveTriangleSupport(support, rider, overlapX, overlapY) {
    if (support.shape !== "triangle") {
      return false;
    }

    const supportCenterX = support.x + support.size / 2;
    const supportCenterY = support.y + support.size / 2;
    const riderCenterX = rider.x + rider.size / 2;
    const riderCenterY = rider.y + rider.size / 2;
    const riderIsAbove = riderCenterY < supportCenterY + support.size * 0.2;

    if (!riderIsAbove || overlapY > overlapX * 1.35) {
      return false;
    }

    const side = riderCenterX < supportCenterX ? -1 : 1;
    const slide = Math.max(1.2, overlapY * TRIANGLE_SLOPE_PUSH);
    rider.x += slide * side;
    rider.y -= overlapY * 0.2;
    rider.vx += slide * side * 3.5;
    rider.vy *= 0.35;
    rider.angularVelocity += side * (0.18 + Math.abs(rider.vy) * 0.002);
    support.angularVelocity -= side * 0.04;

    return true;
  }

  handleClick(event) {
    const bounds = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / bounds.width;
    const scaleY = this.canvas.height / bounds.height;
    const x = (event.clientX - bounds.left) * scaleX;
    const y = (event.clientY - bounds.top) * scaleY;
    const clickedIndex = this.units.findLastIndex(
      (unit) => x >= unit.x && x <= unit.x + unit.size && y >= unit.y && y <= unit.y + unit.size,
    );

    if (clickedIndex >= 0) {
      const unit = this.units[clickedIndex];
      const shouldProcess = this.onUnitProcessed(unit.type, unit);

      if (shouldProcess === false) {
        return;
      }

      const processedQuantity = shouldProcess?.processedQuantity ?? (unit.quantity ?? 1);
      if (processedQuantity < (unit.quantity ?? 1)) {
        unit.quantity -= processedQuantity;
        unit.size = getUnitSize(unit.quantity);
        this.createCrushSparks({ ...unit, quantity: processedQuantity, size: getUnitSize(processedQuantity) });
        return;
      }

      this.units.splice(clickedIndex, 1);
      if (shouldProcess?.sparks !== false) {
        this.createCrushSparks(unit);
      }
    }
  }

  createCrushSparks(unit) {
    for (let index = 0; index < 18; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 170;

      this.sparks.push({
        x: unit.x + unit.size / 2,
        y: unit.y + unit.size / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: index % 4 === 0 ? "#ffffff" : unit.color,
        size: 2 + Math.random() * 3,
        life: 0.25 + Math.random() * 0.35,
        maxLife: 0.6,
      });
    }
  }

  startCompaction() {
    const candidatesByStack = new Map();

    this.units.forEach((unit) => {
      if ((unit.quantity ?? 1) !== 1) {
        return;
      }

      const stackKey = getStackKey(unit);
      const stack = candidatesByStack.get(stackKey) ?? [];
      stack.push(unit);
      candidatesByStack.set(stackKey, stack);
    });

    const candidates = [...candidatesByStack.values()].find((stack) => stack.length >= COMPACTION_COUNT)?.slice(0, COMPACTION_COUNT);
    if (!candidates) {
      return;
    }

    const target = candidates.reduce(
      (position, unit) => ({ x: position.x + unit.x, y: position.y + unit.y }),
      { x: 0, y: 0 },
    );
    target.x /= candidates.length;
    target.y /= candidates.length;

    this.compaction = {
      candidates,
      elapsed: 0,
      target,
      type: candidates[0].type,
      metadata: getUnitMetadata(candidates[0]),
    };
  }

  advanceCompaction(deltaSeconds) {
    if (!this.compaction) {
      return null;
    }

    const compaction = this.compaction;
    compaction.elapsed += deltaSeconds;
    const progress = Math.min(compaction.elapsed / COMPACTION_DURATION, 1);
    const easedProgress = 1 - (1 - progress) ** 3;

    compaction.candidates.forEach((unit) => {
      unit.x += (compaction.target.x - unit.x) * easedProgress;
      unit.y += (compaction.target.y - unit.y) * easedProgress;
      unit.vx = 0;
      unit.vy = 0;
      unit.angularVelocity = 0;
    });

    if (progress >= 1) {
      const size = getUnitSize(COMPACTION_COUNT);
      const bundle = {
        type: compaction.type,
        ...compaction.metadata,
        color: RESOURCE_COLOR[compaction.type] ?? "#ff7452",
        shape: getResourceShape(compaction.type),
        quantity: COMPACTION_COUNT,
        size,
        x: clamp(compaction.target.x + UNIT_SIZE / 2 - size / 2, 0, this.canvas.width - size),
        y: clamp(compaction.target.y + UNIT_SIZE / 2 - size / 2, 0, this.canvas.height - size),
        vx: 0,
        vy: -36,
        angle: 0,
        angularVelocity: 0,
      };
      const compactingSet = new Set(compaction.candidates);
      this.units = this.units.filter((unit) => !compactingSet.has(unit));
      this.units.push(bundle);
      this.createCompactionSparks(bundle);
      this.compaction = null;
      return null;
    }

    return new Set(compaction.candidates);
  }

  createCompactionSparks(unit) {
    for (let index = 0; index < 12; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 65;
      this.sparks.push({
        x: unit.x + unit.size / 2,
        y: unit.y + unit.size / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: index % 3 === 0 ? "#ffffff" : unit.color,
        size: 1.5 + Math.random() * 2,
        life: 0.18 + Math.random() * 0.18,
        maxLife: 0.36,
      });
    }
  }
}

function getCollisionSize(unit) {
  return unit.size * COLLISION_COMPRESSION;
}

function getUnitSize(quantity) {
  return quantity > 1 ? Math.round(UNIT_SIZE * 1.7) : UNIT_SIZE;
}

function getStackKey(unit) {
  return [unit.type, unit.sourceClaimId ?? "", unit.sourceClaimName ?? ""].join("|");
}

function getUnitMetadata(unit) {
  return {
    sourceClaimId: unit.sourceClaimId ?? null,
    sourceClaimName: unit.sourceClaimName ?? null,
  };
}

function drawIllegalMark(context, size) {
  const h = size * 0.36;

  context.save();
  context.strokeStyle = "rgba(8, 10, 15, 0.92)";
  context.lineWidth = 4;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(-h, -h);
  context.lineTo(h, h);
  context.moveTo(h, -h);
  context.lineTo(-h, h);
  context.stroke();

  context.strokeStyle = "rgba(255, 255, 255, 0.9)";
  context.lineWidth = 1.4;
  context.stroke();
  context.restore();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
