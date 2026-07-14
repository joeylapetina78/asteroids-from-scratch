export function createInput() {
  const pressedKeys = new Set();
  const justPressedKeys = new Set();
  const gameKeys = new Set(["KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "Space"]);
  let gameInputSuspended = false;

  function isTextEntryTarget(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest?.("button, input, textarea, select, label, summary, [role='button'], [contenteditable='true']"));
  }

  function clearGameKeys({ includeDock = false } = {}) {
    gameKeys.forEach((code) => {
      if (!includeDock && code === "KeyE") {
        return;
      }

      pressedKeys.delete(code);
      justPressedKeys.delete(code);
    });
  }

  function clearAllKeys() {
    pressedKeys.clear();
    justPressedKeys.clear();
  }

  window.addEventListener("keydown", (event) => {
    if (isTextEntryTarget(event.target) || isTextEntryTarget(document.activeElement)) {
      return;
    }

    if (gameKeys.has(event.code)) {
      event.preventDefault();

      if (gameInputSuspended) {
        pressedKeys.delete(event.code);
        justPressedKeys.delete(event.code);
        return;
      }
    }

    if (!pressedKeys.has(event.code)) {
      justPressedKeys.add(event.code);
    }

    pressedKeys.add(event.code);
  }, true);

  window.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.code);
    justPressedKeys.delete(event.code);
  }, true);

  window.addEventListener("blur", () => {
    clearAllKeys();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearAllKeys();
    }
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (isInteractiveTarget(event.target)) {
        clearGameKeys({ includeDock: true });
      }
    },
    true,
  );

  return {
    isDown(code) {
      return pressedKeys.has(code);
    },

    wasPressed(code) {
      return justPressedKeys.has(code);
    },

    clearAll() {
      clearAllKeys();
    },

    clearGameKeys(options) {
      clearGameKeys(options);
    },

    setGameInputSuspended(isSuspended) {
      gameInputSuspended = Boolean(isSuspended);

      if (gameInputSuspended) {
        clearGameKeys({ includeDock: true });
      }
    },

    getDebugSnapshot() {
      return {
        pressed: [...pressedKeys].sort(),
        justPressed: [...justPressedKeys].sort(),
        gamePressed: [...pressedKeys].filter((code) => gameKeys.has(code)).sort(),
        gameJustPressed: [...justPressedKeys].filter((code) => gameKeys.has(code)).sort(),
        gameInputSuspended,
      };
    },

    finishFrame() {
      justPressedKeys.clear();
    },
  };
}
