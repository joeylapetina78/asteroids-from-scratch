export function clearScreen(context, canvas) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#07080c";
  context.fillRect(0, 0, canvas.width, canvas.height);
}

export function drawGrid(context, canvas) {
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.06)";
  context.lineWidth = 1;

  for (let x = 0; x <= canvas.width; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  for (let y = 0; y <= canvas.height; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.restore();
}

export function drawVector(context, position, velocity) {
  context.save();
  context.strokeStyle = "rgba(92, 200, 255, 0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(position.x, position.y);
  context.lineTo(position.x + velocity.x * 0.25, position.y + velocity.y * 0.25);
  context.stroke();
  context.restore();
}
