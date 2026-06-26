const UNIT_SIZE = 22;
const GRAVITY = 780;
const BOUNCE = 0.18;
const FLOOR_FRICTION = 0.82;
const SOLVER_STEPS = 4;
const TYPE_COLORS = {
  fuel: "#ff7452",
  crystal: "#73d2ff",
};

export class Processor {
  constructor(canvas, onUnitProcessed = () => {}, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.onUnitProcessed = onUnitProcessed;
    this.isClickable = options.isClickable ?? true;
    this.units = [];
    this.lastFrameTime = 0;

    if (this.isClickable) {
      canvas.addEventListener("click", (event) => this.handleClick(event));
    }
  }

  start() {
    requestAnimationFrame((time) => this.frame(time));
  }

  addUnit(type) {
    const slot = this.units.length % 4;
    const spacing = UNIT_SIZE + 4;

    this.units.push({
      type,
      color: TYPE_COLORS[type],
      x: this.canvas.width / 2 - spacing * 2 + slot * spacing,
      y: 30,
      vx: (slot - 1.5) * 12,
      vy: 0,
      size: UNIT_SIZE,
    });
  }

  frame(time) {
    const deltaSeconds = Math.min((time - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = time;

    this.update(deltaSeconds);
    this.draw();

    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  update(deltaSeconds) {
    this.units.forEach((unit) => {
      unit.vy += GRAVITY * deltaSeconds;
      unit.x += unit.vx * deltaSeconds;
      unit.y += unit.vy * deltaSeconds;
      this.keepInsideBounds(unit);
    });

    for (let step = 0; step < SOLVER_STEPS; step += 1) {
      this.resolveUnitCollisions();
      this.units.forEach((unit) => this.keepInsideBounds(unit));
    }
  }

  draw() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = "#080a0f";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawPipe();

    this.units.forEach((unit) => {
      this.context.fillStyle = unit.color;
      this.context.strokeStyle = "#ffffff";
      this.context.lineWidth = 2;
      this.context.fillRect(unit.x, unit.y, unit.size, unit.size);
      this.context.strokeRect(unit.x, unit.y, unit.size, unit.size);
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
    }

    if (unit.x + unit.size > this.canvas.width) {
      unit.x = this.canvas.width - unit.size;
      unit.vx = -Math.abs(unit.vx) * BOUNCE;
    }

    if (unit.y + unit.size > this.canvas.height) {
      unit.y = this.canvas.height - unit.size;
      unit.vy = -Math.abs(unit.vy) * BOUNCE;
      unit.vx *= FLOOR_FRICTION;
    }
  }

  resolveUnitCollisions() {
    for (let firstIndex = 0; firstIndex < this.units.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < this.units.length; secondIndex += 1) {
        this.resolveUnitPair(this.units[firstIndex], this.units[secondIndex]);
      }
    }
  }

  resolveUnitPair(first, second) {
    const firstCenterX = first.x + first.size / 2;
    const firstCenterY = first.y + first.size / 2;
    const secondCenterX = second.x + second.size / 2;
    const secondCenterY = second.y + second.size / 2;
    const overlapX = first.size / 2 + second.size / 2 - Math.abs(firstCenterX - secondCenterX);
    const overlapY = first.size / 2 + second.size / 2 - Math.abs(firstCenterY - secondCenterY);

    if (overlapX <= 0 || overlapY <= 0) {
      return;
    }

    if (overlapX < overlapY) {
      const push = overlapX / 2;
      const direction = firstCenterX < secondCenterX ? -1 : 1;
      first.x += push * direction;
      second.x -= push * direction;
      first.vx *= -BOUNCE;
      second.vx *= -BOUNCE;
    } else {
      const push = overlapY / 2;
      const direction = firstCenterY < secondCenterY ? -1 : 1;
      first.y += push * direction;
      second.y -= push * direction;
      first.vy *= -BOUNCE;
      second.vy *= -BOUNCE;
    }
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
      const [unit] = this.units.splice(clickedIndex, 1);
      this.onUnitProcessed(unit.type);
    }
  }
}
