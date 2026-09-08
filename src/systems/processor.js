import { createVectorResourceFill, drawResourceShape, getVectorResourceOutline } from "../entities/ResourcePickup.js?v=fresh-20260908-1855-2f42a441";
import { RESOURCE_COLOR, getResourceShape } from "./resourceDefinitions.js?v=fresh-20260908-1855-2f42a441";

const UNIT_SIZE = 22;
const GRAVITY = 780;
const SIDE_PIPE_LIP_HEIGHT = 72;
const SIDE_PIPE_LIP_DEPTH = 26;
const SIDE_PIPE_NECK_LENGTH = 14;
const SIDE_PIPE_NECK_HEIGHT = 38;
const BOUNCE = 0.18;
const FLOOR_FRICTION = 0.82;
const SOLVER_STEPS = 4;
const ANGULAR_DRAG = 0.86;
const FLOOR_ANGULAR_DRAG = 0.48;
const COLLISION_COMPRESSION = 0.9;
const TRIANGLE_SLOPE_PUSH = 0.42;
const MAX_ANGULAR_VELOCITY = 1.8;
const COMPACTION_COUNT = 10;

// Bursting a ten-stack and re-gathering one are two different moments, and they
// used to run into each other. `startCompaction` is called every frame the
// processor is idle, so the instant a bundle was burst its own fragments — ten
// loose units of exactly one kind, sitting together — were the best gather
// candidates in the chamber and were seized on the very next frame. With other
// material around it looked less like ore settling and more like the burst being
// undone.
//
// Two changes. Freshly scattered units are LEFT ALONE for a moment, so the burst
// gets to be a burst. And the gather that follows is a field that builds rather
// than a snap: it barely tugs at first and takes a couple of seconds to become
// something the ore cannot resist.
const SCATTER_SETTLE_SECONDS = 0.85;
const COMPACTION_DURATION = 2.6;

// Acceleration toward the gather point, as a multiple of the remaining distance
// per second. The ramp is quadratic, so most of the strength arrives late.
const COMPACTION_PULL_START = 0.5;
const COMPACTION_PULL_END = 11;
// Ore keeps falling while the field is still weak; gravity hands over as the
// pull takes hold, which is what makes the gather read as magnetic rather than
// as an animation playing.
const COMPACTION_DRAG = 0.9;
// How quickly free-floating material gives up speed when there is no gravity to
// settle it.
//
// This is a per-frame multiplier, so small changes matter enormously. 0.985 is
// a 60% loss every second, which stalls material a couple of hundred pixels
// from the inlet; 0.997 is 17% a second, slack enough that a burst crosses the
// whole bay and packs against the far wall. In between, a unit leaving the pipe
// at full speed coasts roughly two thirds of the way across before it gives up,
// which is far enough to mingle and near enough that the bay goes still.
const DRIFT_DAMPING = 0.991;
// Minimum spacing, in seconds, between units actually entering the bay.
//
// The slot pattern cycled `units.length % 4`, so a burst of more than four
// spawned units directly on top of each other: the pair solver then pushed the
// overlapping pair apart symmetrically, cancelling the forward velocity they
// arrived with, and the whole burst stalled in the mouth of the pipe. Units are
// still CREATED immediately — cargo value is summed from the list and must not
// lag — but they queue inside the pipe and are released one at a time.
// At 85ms and 190px/s a unit is only 16px behind the one in front of it while
// being nearly 40px wide, so a burst simply rear-ended itself and stopped in a
// heap by the mouth. Spacing alone would make a bulk arrival dribble for ten
// seconds, so the fan below does most of the work and this does the rest.
const SPAWN_RELEASE_INTERVAL = 0.14;
// Slots per cycle. At four, the fifth unit repeated the first one's exact
// trajectory and caught it up.
//
// The slot no longer picks an exact angle, only a BAND. Each unit leaves at a
// random point inside its band, so consecutive units still spread across the
// whole fan instead of bunching, but no two ever trace the same line. Fixed
// angles per slot meant every sixth unit followed an identical path, and the
// bay filled with visible stripes of ore.
const SPAWN_SLOTS = 6;
// Half-width of the fan, in bay units per second.
const SPAWN_FAN_SPREAD = 210;
// How much the exit speed varies, either side of full.
const SPAWN_SPEED_JITTER = 0.26;
// Material arrives from the world through an end-on transfer tube. It begins
// as a distant speck at the dark mouth, reaches full hold scale almost at once,
// and then becomes ordinary loose cargo governed by bay inertia.
const TUBE_EMERGENCE_SECONDS = 0.32;
const TUBE_DISTANCE_SCALE = 0.14;

export function getProcessorConsumptionQuantity(quantity, amountPerUnit, headroom) {
  const availableQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  const unitValue = Number(amountPerUnit) || 0;
  if (availableQuantity === 0 || unitValue <= 0 || headroom <= 0) return 0;
  if (!Number.isFinite(headroom)) return availableQuantity;
  return Math.min(availableQuantity, Math.max(1, Math.ceil(headroom / unitValue)));
}

// Processor is a small square-unit physics canvas. It is used for both the
// clickable processor and the non-clickable cargo hold, with behavior selected
// by the constructor options.
// Equal-mass contact along one axis, conserving momentum.
//
// This used to read `first.vx *= -BOUNCE; second.vx *= -BOUNCE`, which flips
// each unit's ABSOLUTE velocity rather than exchanging anything. Under a pile
// falling into a floor that is invisible, but in a bay with no gravity it means
// the first brush between two units destroys the motion of both: four solver
// steps a frame take a contact down to BOUNCE^4, about a thousandth, so a burst
// out of the pipe annihilated itself the moment two pieces touched and the heap
// stopped at the mouth. Exchanging along the contact normal instead lets a
// moving unit hand its speed to whatever it hits and the motion travel through
// the group, which is what makes material mingle instead of jam.
//
// `direction` is the outward normal for `first` — the way the solver just
// pushed it. Units already separating are left alone; only an approach
// produces an impulse, so resting contacts do not buzz.
function exchangeMomentum(first, second, axis, direction) {
  const relative = first[axis] - second[axis];

  if (relative * direction >= 0) {
    return;
  }

  const transfer = ((1 + BOUNCE) / 2) * relative;
  first[axis] -= transfer;
  second[axis] += transfer;
}

export class Processor {
  constructor(canvas, onUnitProcessed = () => {}, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.onUnitProcessed = onUnitProcessed;
    this.isClickable = options.isClickable ?? true;
    this.enableCompaction = options.enableCompaction ?? false;
    this.getUnitFlags = options.getUnitFlags ?? (() => ({}));
    this.unitScale = options.unitScale ?? 1;
    this.spawnFromLeft = options.spawnFromLeft ?? false;
    this.floorSpread = options.floorSpread ?? false;
    this.inletSide = options.inletSide ?? null;
    this.getInletCenterX = options.getInletCenterX ?? null;
    this.getInletCenterY = options.getInletCenterY ?? null;
    this.transparentBackground = options.transparentBackground ?? false;
    // A chamber the size of a wall is not a hopper. With gravity the ore all
    // ends up in a strip along the floor no matter how much of it there is;
    // without it the pile grows outward into the space it actually occupies and
    // packs against whatever is in the way.
    this.gravityScale = options.gravityScale ?? 1;
    // `() => [{ kind: "ellipse", x, y, rx, ry } | { kind: "rect", x, y, w, h }]`
    // in THIS canvas's coordinates. Re-read every frame because the things it
    // describes — the viewport scope, the module bay sliding out — move.
    this.getObstacles = options.getObstacles ?? (() => []);
    // Optional. Given the frame delta, returns {x, y} of ambient acceleration
    // acting on everything loose in the bay — how the ship's own motion is felt
    // in here. See bayInertia.js.
    this.getAmbientAcceleration = options.getAmbientAcceleration ?? null;
    this.obstacles = [];
    this.units = [];
    this.sparks = [];
    this.compaction = null;
    this.lastFrameTime = 0;

    if (this.isClickable && typeof window !== "undefined") {
      // The bay reaches in under the scope, so most of this canvas sits over
      // the viewport. A listener on the canvas itself would swallow every click
      // meant for the world behind it — selecting an actor in the portal would
      // stop working anywhere the bay overlaps. Instead the bay is transparent
      // to the pointer (see the chamber rules in styles.css) and claims a click
      // from the window only when one actually lands on a unit. Capture phase,
      // so the claim happens before the viewport's own handler runs.
      this.handleWindowClick = (event) => {
        const bounds = this.canvas.getBoundingClientRect();

        if (!bounds.width || !bounds.height) return;
        if (event.clientX < bounds.left || event.clientX > bounds.right) return;
        if (event.clientY < bounds.top || event.clientY > bounds.bottom) return;
        if (this.handleClick(event)) event.stopPropagation();
      };
      window.addEventListener("click", this.handleWindowClick, true);
    }
  }

  start() {
    requestAnimationFrame((time) => this.frame(time));
  }

  addUnit(type, metadata = {}) {
    // A counter of its own. `units.length` moves as material is consumed, so
    // two spawns either side of a click could land on the same slot.
    this.spawnIndex = (this.spawnIndex ?? -1) + 1;
    const slot = this.spawnIndex % SPAWN_SLOTS;
    const quantity = metadata.quantity ?? 1;
    const size = metadata.size ?? this.getUnitSize(quantity);
    const spacing = size + 6;

    // Stratified: the slot picks a band of the fan, the random pick a point
    // inside it. Even coverage, no repeating trajectories.
    const fan = ((slot + Math.random()) / SPAWN_SLOTS - 0.5) * 2;
    const speedJitter = 1 + (Math.random() - 0.5) * 2 * SPAWN_SPEED_JITTER;
    const inletX = this.getPipeCenterX();
    const inletY = Math.round(this.getPipeCenterY() - size / 2 + fan * 20);
    const shootsLeft = this.inletSide === "right";
    const shootsRight = this.inletSide === "left";

    this.units.push({
      type,
      ...metadata,
      // Metadata may override appearance (e.g. a sealed freight container that
      // isn't a real resource type); fall back to the resource lookups.
      color: metadata.color ?? RESOURCE_COLOR[type] ?? "#ff7452",
      shape: metadata.shape ?? getResourceShape(type),
      x: shootsLeft
        ? inletX - size / 2 + Math.random() * 9
        : shootsRight
          ? inletX - size / 2 - Math.random() * 9
          : this.spawnFromLeft ? 18 + Math.random() * 42 : this.canvas.width / 2 - spacing * 2 + slot * spacing,
      y: this.inletSide ? inletY : 30,
      vx: shootsLeft ? -220 * speedJitter : shootsRight ? 220 * speedJitter : fan * 24,
      // Held in the pipe until its turn. Physics, bounds and collisions all
      // skip a unit while `inPipe` is set, so a queue cannot shove itself apart
      // before any of it has left the mouth.
      releaseAt: (this.nextReleaseAt = Math.max(this.elapsed ?? 0, this.nextReleaseAt ?? 0) + SPAWN_RELEASE_INTERVAL),
      inPipe: true,
      emergedAt: null,
      // A real spray, not a line. In a bay with no gravity a single exit angle
      // sends everything along one path where it queues up behind itself; a
      // wide, jittered fan means consecutive units diverge immediately and
      // mingle with whatever is already floating there.
      vy: this.inletSide ? fan * SPAWN_FAN_SPREAD : 0,
      angle: (Math.random() - 0.5) * 0.5,
      angularVelocity: (Math.random() - 0.5) * 0.9,
      quantity,
      size,
    });
  }

  resizeToDisplay() {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (width === this.canvas.width && height === this.canvas.height) return;

    const scaleX = width / Math.max(1, this.canvas.width);
    const scaleY = height / Math.max(1, this.canvas.height);
    this.units.forEach((unit) => {
      unit.x *= scaleX;
      unit.y *= scaleY;
    });
    this.canvas.width = width;
    this.canvas.height = height;
  }

  getUnitSize(quantity) {
    return Math.round(getUnitSize(quantity) * this.unitScale);
  }

  getPipeCenterY() {
    const requestedCenter = this.getInletCenterY?.();
    return Number.isFinite(requestedCenter)
      ? clamp(requestedCenter, SIDE_PIPE_LIP_HEIGHT / 2, this.canvas.height - SIDE_PIPE_LIP_HEIGHT / 2)
      : this.canvas.height / 2;
  }

  getPipeCenterX() {
    const requestedCenter = this.getInletCenterX?.();
    if (Number.isFinite(requestedCenter)) return clamp(requestedCenter, SIDE_PIPE_LIP_HEIGHT / 2, this.canvas.width - SIDE_PIPE_LIP_HEIGHT / 2);
    return this.inletSide === "right"
      ? this.canvas.width - SIDE_PIPE_NECK_LENGTH - SIDE_PIPE_LIP_DEPTH / 2
      : SIDE_PIPE_NECK_LENGTH + SIDE_PIPE_LIP_DEPTH / 2;
  }

  getPipeColor() {
    if (typeof getComputedStyle !== "function") return "#7dffe0";
    return getComputedStyle(this.canvas).getPropertyValue("--cockpit-phosphor").trim() || "#7dffe0";
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
          size: this.getUnitSize(removedQuantity),
        });
        remaining -= removedQuantity;
      }

      if (removedQuantity < quantity) {
        keptUnits.push({
          ...unit,
          quantity: quantity - removedQuantity,
          size: this.getUnitSize(quantity - removedQuantity),
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
        tradeValue: unit.tradeValue ?? null,
        label: unit.label ?? null,
        quantity: unit.quantity ?? 1,
        // Persist explicit appearance so overridden units (freight containers)
        // survive reload instead of reverting to their type's default look.
        color: unit.color ?? null,
        shape: unit.shape ?? null,
        size: unit.size ?? null,
      })),
    };
  }

  loadSaveSnapshot(snapshot) {
    if (!snapshot?.units) {
      return;
    }

    this.units = snapshot.units.map((unit) => ({
      type: unit.type,
      color: unit.color ?? RESOURCE_COLOR[unit.type] ?? "#ff7452",
      shape: unit.shape ?? getResourceShape(unit.type),
      x: unit.x,
      y: unit.y,
      vx: unit.vx,
      vy: unit.vy,
      angle: unit.angle ?? 0,
      angularVelocity: unit.angularVelocity ?? 0,
      sourceClaimId: unit.sourceClaimId ?? null,
      sourceClaimName: unit.sourceClaimName ?? null,
      tradeValue: unit.tradeValue ?? null,
      label: unit.label ?? null,
      quantity: unit.quantity ?? 1,
      size: unit.size ?? this.getUnitSize(unit.quantity ?? 1),
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
    this.elapsed = (this.elapsed ?? 0) + deltaSeconds;
    this.expandPartialBundles();
    if (this.enableCompaction && !this.compaction) {
      this.startCompaction();
    }

    this.obstacles = this.getObstacles() ?? [];
    // Let through whatever is due. Held units sit in the pipe, untouched by
    // physics, until their moment.
    this.units.forEach((unit) => {
      if (unit.inPipe && this.elapsed >= (unit.releaseAt ?? 0)) {
        unit.inPipe = false;
        unit.emergedAt = this.elapsed;
      }
    });

    const compactingUnits = this.advanceCompaction(deltaSeconds);
    // Sampled once for the whole bay, not per unit: every piece of loose
    // material in the same hold feels the same shove.
    const ambient = this.getAmbientAcceleration?.(deltaSeconds) ?? null;
    this.units.forEach((unit, unitIndex) => {
      if (compactingUnits?.has(unit) || unit.inPipe) {
        return;
      }

      unit.vy += GRAVITY * this.gravityScale * deltaSeconds;

      if (ambient) {
        unit.vx += ambient.x * deltaSeconds;
        unit.vy += ambient.y * deltaSeconds;
      }

      unit.x += unit.vx * deltaSeconds;
      unit.y += unit.vy * deltaSeconds;
      unit.angle += unit.angularVelocity * deltaSeconds;
      unit.angularVelocity *= ANGULAR_DRAG;
      unit.angularVelocity = clamp(unit.angularVelocity, -MAX_ANGULAR_VELOCITY, MAX_ANGULAR_VELOCITY);
      if (this.floorSpread && unit.y + unit.size >= this.canvas.height - 3) {
        const spacing = unit.size + 7;
        const columns = Math.max(1, Math.floor((this.canvas.width - 16) / spacing));
        const targetX = 8 + (unitIndex % columns) * spacing;
        unit.vx += clamp((targetX - unit.x) * 18, -360, 360) * deltaSeconds;
      }
      this.keepInsideBounds(unit);
      this.resolveObstacles(unit);
    });

    for (let step = 0; step < SOLVER_STEPS; step += 1) {
      this.resolveUnitCollisions(compactingUnits);
      this.units.forEach((unit) => {
        if (!compactingUnits?.has(unit) && !unit.inPipe) {
          this.keepInsideBounds(unit);
          this.resolveObstacles(unit);
        }
      });
    }

    // Without gravity nothing ever settles on its own, so drifting material
    // slowly gives up its speed instead of rattling around the bay forever.
    if (this.gravityScale === 0) {
      this.units.forEach((unit) => {
        if (compactingUnits?.has(unit) || unit.inPipe) return;
        unit.vx *= DRIFT_DAMPING;
        unit.vy *= DRIFT_DAMPING;
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
    if (!this.transparentBackground) {
      this.context.fillStyle = "#080a0f";
      this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    this.drawPipe();

    this.units.forEach((unit) => {
      this.context.fillStyle = createVectorResourceFill(this.context, unit.color, unit.size);
      this.context.strokeStyle = getVectorResourceOutline(unit.color);
      this.context.lineWidth = 2;
      this.context.save();
      this.context.translate(unit.x + unit.size / 2, unit.y + unit.size / 2);
      this.context.rotate(unit.angle ?? 0);
      const emergence = unit.inPipe
        ? 0
        : unit.emergedAt == null
          ? 1
          : clamp((this.elapsed - unit.emergedAt) / TUBE_EMERGENCE_SECONDS, 0, 1);
      const perspectiveScale = TUBE_DISTANCE_SCALE + (1 - TUBE_DISTANCE_SCALE) * easeOutCubic(emergence);
      this.context.scale(perspectiveScale, perspectiveScale);
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
    if (this.inletSide) {
      const pipeCenterY = this.getPipeCenterY();
      const mouthX = this.getPipeCenterX();
      const mouthRadius = SIDE_PIPE_LIP_HEIGHT / 2;
      const pipeColor = this.getPipeColor();

      this.context.save();
      // Looking straight down the barrel: black is the distant interior, while
      // two restrained rings describe the lip without turning it into a HUD
      // panel. The viewport sits over this entire canvas in the DOM stack.
      this.context.fillStyle = "#000303";
      this.context.strokeStyle = pipeColor;
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(mouthX, pipeCenterY, mouthRadius, 0, Math.PI * 2);
      this.context.fill();
      this.context.globalAlpha = 0.78;
      this.context.stroke();
      this.context.globalAlpha = 0.28;
      this.context.beginPath();
      this.context.arc(mouthX, pipeCenterY, mouthRadius * 0.72, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
      return;
    }

    const pipeX = this.spawnFromLeft ? 12 : this.canvas.width / 2 - pipeWidth / 2;

    this.context.fillStyle = "#2a303b";
    this.context.strokeStyle = "#697386";
    this.context.lineWidth = 2;
    this.context.fillRect(pipeX, 0, pipeWidth, 22);
    this.context.strokeRect(pipeX, -2, pipeWidth, 24);

    this.context.fillStyle = "#11151d";
    this.context.fillRect(pipeX + 12, 22, pipeWidth - 24, 14);
    this.context.strokeRect(pipeX + 12, 22, pipeWidth - 24, 14);
  }

  // Push a unit out of anything solid sharing its space.
  //
  // The bays are not empty rectangles: the viewport scope bulges into them and
  // the module bay slides across. Material packs against those instead of
  // drawing over them, which is what makes both sides read as one space with
  // furniture in it rather than two boxes beside a picture.
  resolveObstacles(unit) {
    if (!this.obstacles.length) return;
    const half = unit.size / 2;

    this.obstacles.forEach((obstacle) => {
      if (obstacle.kind === "ellipse") this.pushOutOfEllipse(unit, obstacle, half);
      else if (obstacle.kind === "rect") this.pushOutOfRect(unit, obstacle, half);
    });
  }

  pushOutOfEllipse(unit, obstacle, half) {
    const rx = Math.max(1, obstacle.rx + half);
    const ry = Math.max(1, obstacle.ry + half);
    const dx = (unit.x + half) - obstacle.x;
    const dy = (unit.y + half) - obstacle.y;
    // Normalised distance: < 1 means the unit's centre is inside the padded
    // ellipse. Solved in that normalised space and mapped back, which keeps the
    // push perpendicular to the curve rather than to a circle it is not.
    const normalized = Math.hypot(dx / rx, dy / ry);
    if (normalized >= 1 || normalized === 0) return;

    const scale = 1 / normalized;
    const targetX = obstacle.x + dx * scale;
    const targetY = obstacle.y + dy * scale;
    unit.x = targetX - half;
    unit.y = targetY - half;

    const nx = (dx / rx) / normalized;
    const ny = (dy / ry) / normalized;
    const along = unit.vx * nx + unit.vy * ny;
    if (along < 0) {
      unit.vx -= along * nx * (1 + BOUNCE);
      unit.vy -= along * ny * (1 + BOUNCE);
    }
  }

  pushOutOfRect(unit, obstacle, half) {
    const left = obstacle.x - half;
    const right = obstacle.x + obstacle.w + half;
    const top = obstacle.y - half;
    const bottom = obstacle.y + obstacle.h + half;
    const cx = unit.x + half;
    const cy = unit.y + half;
    if (cx <= left || cx >= right || cy <= top || cy >= bottom) return;

    // Out by the shallowest side, so a unit clipped by a moving wall leaves the
    // way it came rather than through it.
    const outLeft = cx - left;
    const outRight = right - cx;
    const outTop = cy - top;
    const outBottom = bottom - cy;
    const smallest = Math.min(outLeft, outRight, outTop, outBottom);

    if (smallest === outLeft) { unit.x = left - half; if (unit.vx > 0) unit.vx = -unit.vx * BOUNCE; }
    else if (smallest === outRight) { unit.x = right - half; if (unit.vx < 0) unit.vx = -unit.vx * BOUNCE; }
    else if (smallest === outTop) { unit.y = top - half; if (unit.vy > 0) unit.vy = -unit.vy * BOUNCE; }
    else { unit.y = bottom - half; if (unit.vy < 0) unit.vy = -unit.vy * BOUNCE; }
  }

  // A wall arriving is not the same as a wall being there. When the module bay
  // pops out it shoves whatever it passes through, and that shove travels
  // through the pile by ordinary unit-to-unit contact.
  shoveFrom(obstacle, { strength = 900 } = {}) {
    const edge = obstacle.x + obstacle.w;
    // The whole bay feels it. A falloff measured against the wall's own width
    // gave anything more than a couple of hundred units away about a tenth of
    // the impulse, which moved the pile by two pixels — the shove has to read
    // as the bay being swept, so it never drops below a quarter strength.
    const reach = Math.max(1, this.canvas.width);
    this.units.forEach((unit) => {
      const half = unit.size / 2;
      const cx = unit.x + half;
      const cy = unit.y + half;
      if (cy < obstacle.y - half || cy > obstacle.y + obstacle.h + half) return;
      const distance = Math.max(0, cx - edge);
      const closeness = 0.25 + 0.75 * (1 - Math.min(1, distance / reach));
      unit.vx += strength * closeness;
      // A sweep rattles what it passes as well as pushing it.
      unit.vy += (Math.random() - 0.5) * strength * 0.3;
      unit.angularVelocity += (Math.random() - 0.5) * 3.2;
    });
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

    // There was never a ceiling here: with gravity pulling everything down it
    // could not be reached. A drift bay has no down, so a unit thrown upward by
    // the inlet fan simply left through the top of the viewport.
    if (unit.y < 0) {
      unit.y = 0;
      unit.vy = Math.abs(unit.vy) * BOUNCE;
      unit.angularVelocity += Math.abs(unit.vx) * 0.002;
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
        // A unit still in the pipe is not in the room yet.
        if (first.inPipe || second.inPipe) {
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
      exchangeMomentum(first, second, "vx", direction);
      first.angularVelocity += direction * Math.abs(second.vy) * 0.003;
      second.angularVelocity -= direction * Math.abs(first.vy) * 0.003;
    } else {
      const push = overlapY / 2;
      const direction = firstCenterY < secondCenterY ? -1 : 1;
      first.y += push * direction;
      second.y -= push * direction;
      exchangeMomentum(first, second, "vy", direction);
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
    let clickedIndex = -1;
    let nearestDistance = Infinity;
    this.units.forEach((unit, index) => {
      const dx = x - (unit.x + unit.size / 2);
      const dy = y - (unit.y + unit.size / 2);
      const distance = Math.hypot(dx, dy);
      const hitRadius = Math.max(30, unit.size * 1.15);
      if (distance <= hitRadius && distance <= nearestDistance) {
        nearestDistance = distance;
        clickedIndex = index;
      }
    });

    if (clickedIndex >= 0) {
      const unit = this.units[clickedIndex];
      const shouldProcess = this.onUnitProcessed(unit.type, unit);

      if (shouldProcess === false) {
        unit.vy = -Math.max(110, Math.abs(unit.vy) * 0.7);
        unit.vx += (x < unit.x + unit.size / 2 ? 1 : -1) * 34;
        unit.angularVelocity += 0.8;
        return true;
      }

      const processedQuantity = shouldProcess?.processedQuantity ?? (unit.quantity ?? 1);
      if (processedQuantity < (unit.quantity ?? 1)) {
        const remainderQuantity = unit.quantity - processedQuantity;
        this.units.splice(clickedIndex, 1);
        this.explodeBundle(unit, remainderQuantity);
        this.createCrushSparks({ ...unit, quantity: processedQuantity, size: this.getUnitSize(processedQuantity) });
        return true;
      }

      this.units.splice(clickedIndex, 1);
      if (shouldProcess?.sparks !== false) {
        this.createCrushSparks(unit);
      }

      return true;
    }

    return false;
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

  explodeBundle(bundle, quantity) {
    const centerX = bundle.x + bundle.size / 2;
    const centerY = bundle.y + bundle.size / 2;
    const metadata = getUnitMetadata(bundle);
    for (let index = 0; index < quantity; index += 1) {
      const angle = (Math.PI * 2 * index) / Math.max(1, quantity) + (Math.random() - 0.5) * 0.3;
      const speed = 130 + Math.random() * 110;
      const size = this.getUnitSize(1);
      this.units.push({
        type: bundle.type,
        ...metadata,
        color: bundle.color ?? RESOURCE_COLOR[bundle.type] ?? "#ff7452",
        shape: bundle.shape ?? getResourceShape(bundle.type),
        quantity: 1,
        size,
        x: clamp(centerX - size / 2 + Math.cos(angle) * 5, 0, this.canvas.width - size),
        y: clamp(centerY - size / 2 + Math.sin(angle) * 5, 0, this.canvas.height - size),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 85,
        angle: (Math.random() - 0.5) * 0.5,
        angularVelocity: (Math.random() - 0.5) * 2.4,
        // Off limits to the gather until it has had a moment to fly. Staggered
        // slightly so ten fragments do not all become eligible on one frame,
        // which is what made the re-gather feel like a switch flipping.
        settleUntil: (this.elapsed ?? 0) + SCATTER_SETTLE_SECONDS + Math.random() * 0.25,
      });
    }
  }

  expandPartialBundles() {
    const partialBundles = this.units.filter((unit) => (unit.quantity ?? 1) > 1 && unit.quantity !== COMPACTION_COUNT);
    partialBundles.forEach((bundle) => {
      const index = this.units.indexOf(bundle);
      if (index >= 0) this.units.splice(index, 1);
      this.explodeBundle(bundle, bundle.quantity);
    });
  }

  startCompaction() {
    const candidatesByStack = new Map();

    const now = this.elapsed ?? 0;

    this.units.forEach((unit) => {
      if ((unit.quantity ?? 1) !== 1) {
        return;
      }

      // Still settling from a burst, or not out of the pipe yet.
      if ((unit.settleUntil ?? 0) > now || unit.inPipe) {
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

    // Weak at first, then increasingly hard to resist. The old version lerped a
    // fraction of the REMAINING DISTANCE every frame, which compounds — the
    // fragments were most of the way home before the eye registered they had
    // moved. This accelerates them instead, so they lean in, gather speed, and
    // arrive.
    const pull = COMPACTION_PULL_START + (COMPACTION_PULL_END - COMPACTION_PULL_START) * progress * progress;
    const gravityShare = 1 - easedProgress;

    compaction.candidates.forEach((unit) => {
      const dx = compaction.target.x - unit.x;
      const dy = compaction.target.y - unit.y;
      unit.vx += dx * pull * deltaSeconds;
      unit.vy += dy * pull * deltaSeconds;
      unit.vy += GRAVITY * gravityShare * deltaSeconds;
      unit.vx *= COMPACTION_DRAG;
      unit.vy *= COMPACTION_DRAG;
      unit.x += unit.vx * deltaSeconds;
      unit.y += unit.vy * deltaSeconds;
      // Tumbling settles as the field takes hold rather than stopping dead.
      unit.angle += (unit.angularVelocity ?? 0) * deltaSeconds;
      unit.angularVelocity = (unit.angularVelocity ?? 0) * (1 - easedProgress * 0.4);
    });

    if (progress >= 1) {
      const size = this.getUnitSize(COMPACTION_COUNT);
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

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function getCollisionSize(unit) {
  return unit.size * COLLISION_COMPRESSION;
}

function getUnitSize(quantity) {
  return quantity > 1 ? Math.round(UNIT_SIZE * 1.7) : UNIT_SIZE;
}

function getStackKey(unit) {
  return [unit.type, unit.color ?? "", unit.shape ?? ""].join("|");
}

function getUnitMetadata(unit) {
  return {
    sourceClaimId: unit.sourceClaimId ?? null,
    sourceClaimName: unit.sourceClaimName ?? null,
    tradeValue: unit.tradeValue ?? null,
    label: unit.label ?? null,
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
