import { getResourceColor, getResourceShape, normalizeResourceType } from "./resourceDefinitions.js";
import { drawResourceShape } from "../entities/ResourcePickup.js";

const SCAN_RANGE = 1800;
const SCAN_HALF_ANGLE = Math.PI / 5;
const SCAN_PULSE_SECONDS = 0.45;
const SCAN_MARKER_SECONDS = 3.5;
const EDGE_MARGIN = 28;
const MARKER_SIZE = 14;
const SITE_COLOR = "#f5f7fb";
const SITE_SCAN_RANGE = 3200;

export function createScanner(canvas) {
  return {
    pulseAge: SCAN_PULSE_SECONDS,
    markerAge: SCAN_MARKER_SECONDS,
    targets: [],

    scan(ship, asteroids, sites = [], options = {}) {
      this.pulseAge = 0;
      const scanTargets = options.targets ?? ["resources"];
      const resourceTargets = scanTargets.includes("resources") ? findResourceAsteroids(ship, asteroids) : [];
      const siteTargets = scanTargets.includes("sites")
        ? findWorldSites(ship, sites, { targetSiteId: options.targetSiteId })
        : [];

      this.targets = [...resourceTargets, ...siteTargets]
        .sort((first, second) => first.distance - second.distance);
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
      const type = getDominantResource(asteroid);
      const offsetX = asteroid.position.x - ship.position.x;
      const offsetY = asteroid.position.y - ship.position.y;
      const distance = Math.hypot(offsetX, offsetY);

      return { position: asteroid.position, type, distance, offsetX, offsetY };
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

function findWorldSites(ship, sites, { targetSiteId = null } = {}) {
  return sites
    .filter((site) => !targetSiteId || site.id === targetSiteId)
    .map((site) => {
      const offsetX = site.position.x - ship.position.x;
      const offsetY = site.position.y - ship.position.y;
      const distance = Math.hypot(offsetX, offsetY);

      return { position: site.position, type: "site", distance, offsetX, offsetY };
    })
    .filter((result) => result.distance > 0 && result.distance <= SITE_SCAN_RANGE);
}

function getDominantResource(asteroid) {
  const dominant = Object.entries(asteroid.resources ?? {})
    .filter(([resource]) => resource !== "stone")
    .reduce((best, [resource, amount]) => (amount > best.amount ? { resource, amount } : best), {
      resource: null,
      amount: 0,
    });

  return dominant.resource ?? null;
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
  const directionX = target.position.x - ship.position.x;
  const directionY = target.position.y - ship.position.y;
  const directionLength = Math.hypot(directionX, directionY);

  if (directionLength === 0) {
    return;
  }

  const edgePoint = getEdgePoint(shipScreenX, shipScreenY, directionX / directionLength, directionY / directionLength, canvas);
  const alpha = Math.max(0.18, 1 - markerAge / SCAN_MARKER_SECONDS);
  const color = target.type === "site" ? SITE_COLOR : getResourceColor(normalizeResourceType(target.type));
  const rgb = hexToRgbComponents(color);

  context.save();
  context.strokeStyle = `rgba(${rgb},${(alpha * 0.3).toFixed(3)})`;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(shipScreenX, shipScreenY);
  context.lineTo(edgePoint.x, edgePoint.y);
  context.stroke();

  const shape = target.type === "site" ? "circle" : getResourceShape(target.type);
  context.translate(edgePoint.x, edgePoint.y);
  context.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
  context.fillStyle = `rgba(${rgb},${(alpha * 0.25).toFixed(3)})`;
  context.lineWidth = 1.5;
  drawResourceShape(context, shape, MARKER_SIZE);
  context.restore();
}

function hexToRgbComponents(hex) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
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
