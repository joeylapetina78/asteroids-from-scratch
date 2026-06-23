const MAX_SHIP_OFFSET = 96;
const OFFSET_SPEED = 360;
const OFFSET_CURVE = 0.42;

export function createCamera(canvas) {
  return {
    x: 0,
    y: 0,

    follow(target) {
      const lookAhead = getStylizedLookAhead(target.velocity);

      this.x = target.position.x + lookAhead.x - canvas.width / 2;
      this.y = target.position.y + lookAhead.y - canvas.height / 2;
    },
  };
}

function getStylizedLookAhead(velocity) {
  const speed = Math.hypot(velocity.x, velocity.y);

  if (speed === 0) {
    return { x: 0, y: 0 };
  }

  const speedRatio = Math.min(speed / OFFSET_SPEED, 1);
  const offsetDistance = Math.pow(speedRatio, OFFSET_CURVE) * MAX_SHIP_OFFSET;
  const scale = offsetDistance / speed;

  return {
    x: velocity.x * scale,
    y: velocity.y * scale,
  };
}
