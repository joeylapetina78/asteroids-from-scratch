const LOOK_AHEAD_SECONDS = 0.28;
const MAX_LOOK_AHEAD = 90;

export function createCamera(canvas) {
  return {
    x: 0,
    y: 0,

    follow(target) {
      const lookAhead = clampVector({
        x: target.velocity.x * LOOK_AHEAD_SECONDS,
        y: target.velocity.y * LOOK_AHEAD_SECONDS,
      });

      this.x = target.position.x + lookAhead.x - canvas.width / 2;
      this.y = target.position.y + lookAhead.y - canvas.height / 2;
    },
  };
}

function clampVector(vector) {
  const length = Math.hypot(vector.x, vector.y);

  if (length <= MAX_LOOK_AHEAD) {
    return vector;
  }

  const scale = MAX_LOOK_AHEAD / length;
  return {
    x: vector.x * scale,
    y: vector.y * scale,
  };
}
