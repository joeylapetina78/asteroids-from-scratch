const SPRING_STRENGTH = 18;
const SPRING_DAMPING = 5.4;
const MAX_SHIP_OFFSET = 150;

export function createCamera(canvas) {
  return {
    x: 0,
    y: 0,
    centerX: 0,
    centerY: 0,
    velocityX: 0,
    velocityY: 0,

    follow(target, deltaSeconds) {
      const displacementX = target.position.x - this.centerX;
      const displacementY = target.position.y - this.centerY;
      const accelerationX = displacementX * SPRING_STRENGTH - this.velocityX * SPRING_DAMPING;
      const accelerationY = displacementY * SPRING_STRENGTH - this.velocityY * SPRING_DAMPING;

      this.velocityX += accelerationX * deltaSeconds;
      this.velocityY += accelerationY * deltaSeconds;
      this.centerX += this.velocityX * deltaSeconds;
      this.centerY += this.velocityY * deltaSeconds;

      this.keepShipNearCenter(target);

      this.x = this.centerX - canvas.width / 2;
      this.y = this.centerY - canvas.height / 2;
    },

    keepShipNearCenter(target) {
      const offsetX = target.position.x - this.centerX;
      const offsetY = target.position.y - this.centerY;
      const offsetDistance = Math.hypot(offsetX, offsetY);

      if (offsetDistance <= MAX_SHIP_OFFSET) {
        return;
      }

      const scale = MAX_SHIP_OFFSET / offsetDistance;
      this.centerX = target.position.x - offsetX * scale;
      this.centerY = target.position.y - offsetY * scale;
    },
  };
}
