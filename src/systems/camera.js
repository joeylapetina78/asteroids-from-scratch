export function createCamera(canvas) {
  return {
    x: 0,
    y: 0,

    follow(target) {
      this.x = target.position.x - canvas.width / 2;
      this.y = target.position.y - canvas.height / 2;
    },
  };
}
