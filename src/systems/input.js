export function createInput() {
  const pressedKeys = new Set();
  const gameKeys = new Set(["KeyA", "KeyD", "KeyW", "KeyS"]);

  window.addEventListener("keydown", (event) => {
    if (gameKeys.has(event.code)) {
      event.preventDefault();
    }

    pressedKeys.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.code);
  });

  return {
    isDown(code) {
      return pressedKeys.has(code);
    },
  };
}
