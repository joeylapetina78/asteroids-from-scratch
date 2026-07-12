export function createInput() {
  const pressedKeys = new Set();
  const justPressedKeys = new Set();
  const keyLastSeenAt = new Map();
  const gameKeys = new Set(["KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "Space"]);
  const STALE_GAME_KEY_MS = 1600;
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
      keyLastSeenAt.delete(code);
    });
  }

  function clearAllKeys() {
    pressedKeys.clear();
    justPressedKeys.clear();
    keyLastSeenAt.clear();
  }

  function markKeySeen(code) {
    keyLastSeenAt.set(code, performance.now());
  }

  function expireStaleGameKey(code) {
    if (!gameKeys.has(code) || !pressedKeys.has(code)) {
      return;
    }

    const lastSeenAt = keyLastSeenAt.get(code) ?? 0;
    if (performance.now() - lastSeenAt <= STALE_GAME_KEY_MS) {
      return;
    }

    pressedKeys.delete(code);
    justPressedKeys.delete(code);
    keyLastSeenAt.delete(code);
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
        keyLastSeenAt.delete(event.code);
        return;
      }
    }

    if (!pressedKeys.has(event.code)) {
      justPressedKeys.add(event.code);
    }

    pressedKeys.add(event.code);
    markKeySeen(event.code);
  });

  window.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.code);
    justPressedKeys.delete(event.code);
    keyLastSeenAt.delete(event.code);
  });

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

  document.addEventListener(
    "pointerup",
    (event) => {
      if (isInteractiveTarget(event.target)) {
        clearGameKeys({ includeDock: true });
      }
    },
    true,
  );

  document.addEventListener(
    "focusin",
    (event) => {
      if (isInteractiveTarget(event.target)) {
        clearGameKeys({ includeDock: true });
      }
    },
    true,
  );

  return {
    isDown(code) {
      expireStaleGameKey(code);
      return pressedKeys.has(code);
    },

    wasPressed(code) {
      expireStaleGameKey(code);
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

    finishFrame() {
      justPressedKeys.clear();
    },
  };
}
