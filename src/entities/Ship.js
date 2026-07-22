import { advanceFlightBody, limitVelocity } from "../systems/flightPhysics.js?v=fresh-20260721-2114-33b9943";

const DEFAULT_ROTATION_SPEED = 2.6;
const DEFAULT_THRUST_POWER = 95;
const DEFAULT_REVERSE_THRUST_MULTIPLIER = 0.2;
const DEFAULT_FUEL_BURN_RATE = 6;
const DEFAULT_MAX_SPEED = 105;
const DEFAULT_BOOST_THRUST_MULTIPLIER = 4.2;
const DEFAULT_BOOST_MAX_SPEED_MULTIPLIER = 2.2;
const DEFAULT_BOOST_DURATION_SECONDS = 0.3;
const DEFAULT_BOOST_FUEL_COST = 18;
const DEFAULT_BOOST_COOLDOWN_SECONDS = 1.2;
const SHIP_FRAMES = {
  "yard-skiff": {
    points: [
      { x: 22, y: 0 },
      { x: -11, y: -13 },
      { x: -7, y: 0 },
      { x: -11, y: 13 },
    ],
    cockpit: null,
    details: {
      lines: [
        [{ x: -1, y: -7 }, { x: 11, y: 0 }],
        [{ x: -1, y: 7 }, { x: 11, y: 0 }],
      ],
    },
  },
  dart: {
    points: [
      { x: 22, y: 0 },
      { x: -14, y: -12 },
      { x: -8, y: 0 },
      { x: -14, y: 12 },
    ],
    cockpit: null,
  },
  explorer: {
    points: [
      { x: 25, y: 0 },
      { x: 13, y: -7 },
      { x: 5, y: -15 },
      { x: -5, y: -11 },
      { x: -19, y: -17 },
      { x: -15, y: -5 },
      { x: -25, y: 0 },
      { x: -15, y: 5 },
      { x: -19, y: 17 },
      { x: -5, y: 11 },
      { x: 5, y: 15 },
      { x: 13, y: 7 },
    ],
    cockpit: { x: 4, y: 0, radius: 4.5 },
    details: {
      lines: [
        [{ x: 13, y: -7 }, { x: 21, y: -13 }],
        [{ x: 13, y: 7 }, { x: 21, y: 13 }],
        [{ x: -8, y: -10 }, { x: -13, y: -2 }],
        [{ x: -8, y: 10 }, { x: -13, y: 2 }],
        [{ x: -18, y: 0 }, { x: -26, y: 0 }],
      ],
      arcs: [
        { x: 28, y: 0, radius: 5, start: -0.75, end: 0.75 },
        { x: 30, y: 0, radius: 8, start: -0.55, end: 0.55 },
      ],
    },
  },
};

export class Ship {
  constructor(x, y, engine, shipFrame = {}) {
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.angle = -Math.PI / 2;
    this.engine = engine;
    this.shipFrame = shipFrame;
    this.isThrusting = false;
    this.isCloaked = false;
    this.cloakConfig = null;
    this.boostDurationRemaining = 0;
    this.boostCooldown = 0;
  }

  update(deltaSeconds, input) {
    this.boostCooldown = Math.max(0, this.boostCooldown - deltaSeconds);
    const canThrust = this.engine.powered && input.isDown("KeyW") && this.engine.fuel > 0;
    const canStrafe = this.engine.powered && this.engine.fuel > 0 && this.hasLateralThrusters();
    const isBoosting = this.engine.powered && this.boostDurationRemaining > 0;
    const strafe = canStrafe ? (input.isDown("KeyQ") ? -1 : input.isDown("KeyE") ? 1 : 0) : 0;
    const boostDefaultsForward = isBoosting && !canThrust && strafe === 0;
    if (canThrust || (canStrafe && (input.isDown("KeyQ") || input.isDown("KeyE")))) {
      this.engine.fuel = Math.max(0, this.engine.fuel - this.getFuelBurnRate() * deltaSeconds);
    }

    advanceFlightBody(
      this,
      deltaSeconds,
      {
        turn: this.engine.powered ? (input.isDown("KeyA") ? -1 : input.isDown("KeyD") ? 1 : 0) : 0,
        thrust: canThrust || boostDefaultsForward,
        brake: this.engine.powered && input.isDown("KeyS"),
        reverse: this.engine.thrustMode === "reverse",
        strafe,
        boost: isBoosting,
      },
      {
        rotationSpeed: this.getRotationSpeed(),
        thrustPower: this.getThrustPower(),
        reverseThrustMultiplier: this.getReverseThrustMultiplier(),
        lateralThrustMultiplier: this.getLateralThrustMultiplier(),
        boostThrustMultiplier: this.getBoostThrustMultiplier(),
        boostMaxSpeedMultiplier: this.getBoostMaxSpeedMultiplier(),
        maxSpeed: this.getMaxSpeed(),
      },
    );

    this.boostDurationRemaining = Math.max(0, this.boostDurationRemaining - deltaSeconds);
  }

  startForwardBoost() {
    if (!this.hasForwardBoost() || !this.engine.powered || this.engine.fuel < this.getBoostFuelCost() || this.boostCooldown > 0) {
      return false;
    }

    this.engine.fuel = Math.max(0, this.engine.fuel - this.getBoostFuelCost());
    this.boostDurationRemaining = this.getBoostDurationSeconds();
    this.boostCooldown = this.getBoostCooldownSeconds();
    return true;
  }

  stopThrusting() {
    this.isThrusting = false;
  }

  stopBoosting() {
    this.boostDurationRemaining = 0;
  }

  getRotationSpeed() {
    return this.engine.rotationSpeed ?? DEFAULT_ROTATION_SPEED;
  }

  getThrustPower() {
    return this.engine.thrustPower ?? DEFAULT_THRUST_POWER;
  }

  getReverseThrustMultiplier() {
    return this.engine.reverseThrustMultiplier ?? DEFAULT_REVERSE_THRUST_MULTIPLIER;
  }

  getFuelBurnRate() {
    const cloakMultiplier = this.isCloaked ? (this.cloakConfig?.fuelBurnMultiplier ?? 1.35) : 1;
    return (this.engine.fuelBurnRate ?? DEFAULT_FUEL_BURN_RATE) * cloakMultiplier;
  }

  getMaxSpeed() {
    const cloakMultiplier = this.isCloaked ? (this.cloakConfig?.maxSpeedMultiplier ?? 0.78) : 1;
    return (this.engine.maxSpeed ?? DEFAULT_MAX_SPEED) * cloakMultiplier;
  }

  hasLateralThrusters() {
    return this.engine.upgrades?.includes("lateral-thrusters-mk1") ?? false;
  }

  hasForwardBoost() {
    return this.engine.upgrades?.includes("forward-boost-mk1") ?? false;
  }

  getBoostThrustMultiplier() {
    return this.hasForwardBoost() ? (this.engine.boostThrustMultiplier ?? DEFAULT_BOOST_THRUST_MULTIPLIER) : 1;
  }

  getBoostMaxSpeedMultiplier() {
    return this.hasForwardBoost() ? (this.engine.boostMaxSpeedMultiplier ?? DEFAULT_BOOST_MAX_SPEED_MULTIPLIER) : 1;
  }

  getBoostFuelCost() {
    return this.engine.boostFuelCost ?? DEFAULT_BOOST_FUEL_COST;
  }

  getBoostCooldownSeconds() {
    return this.engine.boostCooldownSeconds ?? DEFAULT_BOOST_COOLDOWN_SECONDS;
  }

  getBoostDurationSeconds() {
    return this.engine.boostDurationSeconds ?? DEFAULT_BOOST_DURATION_SECONDS;
  }

  getLateralThrustMultiplier() {
    return this.hasLateralThrusters() ? (this.engine.lateralThrustMultiplier ?? 0.62) : 0;
  }

  isVisiblyPowered() {
    return this.engine.powered && !this.isCloaked;
  }

  limitSpeed() {
    limitVelocity(this.velocity, this.getMaxSpeed());
  }

  draw(context, camera) {
    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;

    context.save();
    context.translate(screenX, screenY);
    context.rotate(this.angle);

    context.lineWidth = 2.5;
    context.strokeStyle = this.isVisiblyPowered() ? "#00e8a0" : "#2a3d45";
    context.fillStyle = this.isVisiblyPowered() ? "rgba(0, 232, 160, 0.06)" : "rgba(0, 0, 0, 0)";

    this.drawFrame(context);

    if (this.isThrusting) {
      this.drawThrust(context);
    }

    context.restore();
  }

  drawFrame(context) {
    const frame = SHIP_FRAMES[this.shipFrame.shape] ?? SHIP_FRAMES["yard-skiff"];

    context.beginPath();
    frame.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.closePath();
    context.fill();
    context.stroke();

    this.drawFrameDetails(context, frame);

    if (!frame.cockpit) {
      return;
    }

    context.save();
    context.globalAlpha = this.isVisiblyPowered() ? 0.9 : 0.3;
    context.strokeStyle = this.isVisiblyPowered() ? "#80ffdd" : "#3a4d55";
    context.beginPath();
    context.arc(frame.cockpit.x, frame.cockpit.y, frame.cockpit.radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  drawFrameDetails(context, frame) {
    if (!frame.details) {
      return;
    }

    context.save();
    context.globalAlpha = this.isVisiblyPowered() ? 0.75 : 0.28;
    context.strokeStyle = this.isVisiblyPowered() ? "#9ee8ff" : "#68717f";
    context.lineWidth = 1.35;

    frame.details.lines?.forEach(([from, to]) => {
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    });

    frame.details.arcs?.forEach((arc) => {
      context.beginPath();
      context.arc(arc.x, arc.y, arc.radius, arc.start, arc.end);
      context.stroke();
    });

    context.restore();
  }

  drawThrust(context) {
    const visual = this.engine.thrustVisual ?? {};
    const color = visual.color ?? "#ffb85c";
    const length = visual.length ?? 15;
    const width = visual.width ?? 5;
    const direction = this.engine.thrustMode === "reverse" ? 1 : -1;
    const originX = direction > 0 ? 18 : -17;
    const tipX = originX + direction * (length + Math.random() * length * 0.55);

    context.save();
    context.globalAlpha = this.isCloaked ? 0.3 : 1;
    context.strokeStyle = this.isCloaked ? "#40565b" : color;
    context.beginPath();

    if (visual.style === "bubble-string") {
      for (let index = 0; index < 4; index += 1) {
        const bubbleX = originX + direction * (index * 5 + Math.random() * 2);
        const bubbleRadius = Math.max(1.5, width - index * 0.7);
        context.moveTo(bubbleX + bubbleRadius, 0);
        context.arc(bubbleX, Math.sin(index) * 1.5, bubbleRadius, 0, Math.PI * 2);
      }
    } else if (direction > 0) {
      context.moveTo(originX, -width);
      context.lineTo(tipX, 0);
      context.lineTo(originX, width);
    } else {
      context.moveTo(originX, -width);
      context.lineTo(tipX, 0);
      context.lineTo(originX, width);
    }

    context.stroke();
    context.restore();
  }
}
