export function createInput() {
  const pressedKeys = new Set();
  const justPressedKeys = new Set();
  const gameKeys = new Set(["KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "Space"]);

  window.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      return;
    }

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

  window.addEventListener("blur", () => {
    pressedKeys.clear();
    justPressedKeys.clear();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pressedKeys.clear();
      justPressedKeys.clear();
    }
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
        if (code === "KeyE") {
          return;
        }

        pressedKeys.delete(code);
        justPressedKeys.delete(code);
      });
    },

    finishFrame() {
      justPressedKeys.clear();
    },
  };
}
