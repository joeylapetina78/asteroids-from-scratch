export function createInput() {
  const pressedKeys = new Set();
  const justPressedKeys = new Set();
  const gameKeys = new Set(["KeyA", "KeyD", "KeyW", "KeyS", "Space"]);

  window.addEventListener("keydown", (event) => {
    if (gameKeys.has(event.code)) {
      event.preventDefault();
    }

    if (!pressedKeys.has(event.code)) {
      justPressedKeys.add(event.code);
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

    wasPressed(code) {
      return justPressedKeys.has(code);
    },

    clearGameKeys() {
      gameKeys.forEach((code) => {
        pressedKeys.delete(code);
        justPressedKeys.delete(code);
      });
    },

    finishFrame() {
      justPressedKeys.clear();
    },
  };
}
