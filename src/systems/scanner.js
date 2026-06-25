const SCAN_RANGE = 1800;
const SCAN_HALF_ANGLE = Math.PI / 5;
const SCAN_PULSE_SECONDS = 0.45;
const SCAN_MARKER_SECONDS = 3.5;
const EDGE_MARGIN = 28;
const MARKER_RADIUS = 7;
const FUEL_COLOR = "#ff7452";
const CRYSTAL_COLOR = "#73d2ff";

export function createScanner(canvas) {
  return {
    pulseAge: SCAN_PULSE_SECONDS,
    markerAge: SCAN_MARKER_SECONDS,
    targets: [],

    scan(ship, asteroids) {
      this.pulseAge = 0;
      this.targets = findResourceAsteroids(ship, asteroids);
      this.markerAge = this.targets.length > 0 ? 0 : SCAN_MARKER_SECONDS;
    },

    update(deltaSeconds) {
      this.pulseAge += deltaSeconds;
      this.markerAge += deltaSeconds;

      if (this.markerAge >= SCAN_MARKER_SECONDS) {
        this.targets = [];
      }
    },

    draw(context, camera, ship) {
      drawScanPulse(context, camera, ship, this.pulseAge);

      this.targets.forEach((target) => {
        drawTargetMarker(context, canvas, camera, ship, target, this.markerAge);
      });
    },
  };
}

function findResourceAsteroids(ship, asteroids) {
  return asteroids
    .map((asteroid) => {
      const type = getResourceType(asteroid);
      const offsetX = asteroid.position.x - ship.position.x;
      const offsetY = asteroid.position.y - ship.position.y;
      const distance = Math.hypot(offsetX, offsetY);

      return { asteroid, type, distance, offsetX, offsetY };
    })
    .filter(
      (result) =>
        result.type &&
        result.distance > 0 &&
        result.distance <= SCAN_RANGE &&
        isInForwardCone(ship.angle, result.offsetX, result.offsetY),
    )
    .sort((first, second) => first.distance - second.distance);
}

function getResourceType(asteroid) {
  const dominantResource = Object.entries(asteroid.resources)
    .filter(([resource]) => resource !== "stone")
    .reduce((best, [resource, amount]) => (amount > best.amount ? { resource, amount } : best), {
      resource: null,
      amount: 0,
    }).resource;

  if (!dominantResource) {
    return null;
  }

  return dominantResource === "iron" ? "fuel" : "crystal";
}

function isInForwardCone(angle, offsetX, offsetY) {
  const targetAngle = Math.atan2(offsetY, offsetX);
  const angleDifference = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));

  return Math.abs(angleDifference) <= SCAN_HALF_ANGLE;
}

function drawScanPulse(context, camera, ship, pulseAge) {
  if (pulseAge >= SCAN_PULSE_SECONDS) {
    return;
  }

  const progress = pulseAge / SCAN_PULSE_SECONDS;
  const screenX = ship.position.x - camera.x;
  const screenY = ship.position.y - camera.y;

  context.save();
  context.translate(screenX, screenY);
  context.rotate(ship.angle);
  context.strokeStyle = `rgba(115, 210, 255, ${0.5 * (1 - progress)})`;
  context.fillStyle = `rgba(115, 210, 255, ${0.08 * (1 - progress)})`;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, 0);
  context.arc(0, 0, SCAN_RANGE * progress, -SCAN_HALF_ANGLE, SCAN_HALF_ANGLE);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawTargetMarker(context, canvas, camera, ship, target, markerAge) {
  const shipScreenX = ship.position.x - camera.x;
  const shipScreenY = ship.position.y - camera.y;
  const directionX = target.asteroid.position.x - ship.position.x;
  const directionY = target.asteroid.position.y - ship.position.y;
  const directionLength = Math.hypot(directionX, directionY);

  if (directionLength === 0) {
    return;
  }

  const edgePoint = getEdgePoint(shipScreenX, shipScreenY, directionX / directionLength, directionY / directionLength, canvas);
  const alpha = Math.max(0.18, 1 - markerAge / SCAN_MARKER_SECONDS);
  const color = target.type === "fuel" ? FUEL_COLOR : CRYSTAL_COLOR;

  context.save();
  context.strokeStyle = getRgba(color, alpha * 0.45);
  context.fillStyle = getRgba(color, alpha * 0.7);
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(shipScreenX, shipScreenY);
  context.lineTo(edgePoint.x, edgePoint.y);
  context.stroke();
  context.beginPath();
  context.arc(edgePoint.x, edgePoint.y, MARKER_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = color;
  context.stroke();
  context.restore();
}

function getRgba(hexColor, alpha) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getEdgePoint(startX, startY, directionX, directionY, canvas) {
  const times = [];

  if (directionX > 0) {
    times.push((canvas.width - EDGE_MARGIN - startX) / directionX);
  } else if (directionX < 0) {
    times.push((EDGE_MARGIN - startX) / directionX);
  }

  if (directionY > 0) {
    times.push((canvas.height - EDGE_MARGIN - startY) / directionY);
  } else if (directionY < 0) {
    times.push((EDGE_MARGIN - startY) / directionY);
  }

  const positiveTimes = times.filter((value) => value > 0);
  const time = positiveTimes.length > 0 ? Math.min(...positiveTimes) : 0;

  return {
    x: startX + directionX * time,
    y: startY + directionY * time,
  };
}
