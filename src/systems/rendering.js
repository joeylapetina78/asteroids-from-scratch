export function clearScreen(context, canvas) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#07080c";
  context.fillRect(0, 0, canvas.width, canvas.height);
}

export function drawGrid(context, canvas, camera) {
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.06)";
  context.lineWidth = 1;

  const gridSize = 48;
  const startX = -positiveModulo(camera.x, gridSize);
  const startY = -positiveModulo(camera.y, gridSize);

  for (let x = startX; x <= canvas.width; x += gridSize) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  for (let y = startY; y <= canvas.height; y += gridSize) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.restore();
}

export function drawVector(context, position, velocity, camera) {
  const screenX = position.x - camera.x;
  const screenY = position.y - camera.y;

  context.save();
  context.strokeStyle = "rgba(92, 200, 255, 0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(screenX, screenY);
  context.lineTo(screenX + velocity.x * 0.25, screenY + velocity.y * 0.25);
  context.stroke();
  context.restore();
}

export function isVisible(entity, canvas, camera) {
  const margin = entity.radius ?? 0;
  const screenX = entity.position.x - camera.x;
  const screenY = entity.position.y - camera.y;

  return (
    screenX > -margin &&
    screenX < canvas.width + margin &&
    screenY > -margin &&
    screenY < canvas.height + margin
  );
}

function positiveModulo(value, size) {
  return ((value % size) + size) % size;
}
