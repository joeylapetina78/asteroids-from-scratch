const DEFAULT_SPACE_DRAG = 0.995;

export function advanceFlightBody(body, deltaSeconds, controls, flight = {}) {
  const rotationSpeed = flight.rotationSpeed ?? 2.6;
  const thrustPower = flight.thrustPower ?? 95;
  const reverseThrustMultiplier = flight.reverseThrustMultiplier ?? 0.2;
  const maxSpeed = flight.maxSpeed ?? 105;
  const brakeDrag = flight.brakeDrag ?? 0.92;
  const spaceDrag = flight.spaceDrag ?? DEFAULT_SPACE_DRAG;
  const thrustDirection = controls.reverse ? -1 : 1;

  if (controls.turn < 0) {
    body.angle -= rotationSpeed * deltaSeconds;
  } else if (controls.turn > 0) {
    body.angle += rotationSpeed * deltaSeconds;
  }

  body.isThrusting = Boolean(controls.thrust);
  if (body.isThrusting) {
    const effectivePower = thrustPower * (controls.reverse ? reverseThrustMultiplier : 1);
    body.velocity.x += Math.cos(body.angle) * effectivePower * thrustDirection * deltaSeconds;
    body.velocity.y += Math.sin(body.angle) * effectivePower * thrustDirection * deltaSeconds;
  }

  if (controls.brake) {
    body.velocity.x *= brakeDrag;
    body.velocity.y *= brakeDrag;
  }

  body.velocity.x *= spaceDrag;
  body.velocity.y *= spaceDrag;
  limitVelocity(body.velocity, maxSpeed);
  body.position.x += body.velocity.x * deltaSeconds;
  body.position.y += body.velocity.y * deltaSeconds;
}

export function limitVelocity(velocity, maxSpeed) {
  const speed = Math.hypot(velocity.x, velocity.y);

  if (speed <= maxSpeed || speed === 0) {
    return;
  }

  const scale = maxSpeed / speed;
  velocity.x *= scale;
  velocity.y *= scale;
}

export function getTurnTowardAngle(currentAngle, targetAngle, deadZone = 0.045) {
  const difference = wrapAngle(targetAngle - currentAngle);

  if (Math.abs(difference) <= deadZone) {
    return 0;
  }

  return difference < 0 ? -1 : 1;
}

export function wrapAngle(angle) {
  let wrapped = angle;

  while (wrapped > Math.PI) {
    wrapped -= Math.PI * 2;
  }
  while (wrapped < -Math.PI) {
    wrapped += Math.PI * 2;
  }

  return wrapped;
}
