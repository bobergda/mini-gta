export function createInput(targetWindow, domElement) {
  const keys = new Set();
  const pressed = new Set();
  const look = { x: 0, y: 0 };
  let wheel = 0;
  let dragging = false;
  const blockedKeys = new Set([
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    "e",
    "r",
    " ",
    "shift",
  ]);

  targetWindow.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (blockedKeys.has(key)) {
      event.preventDefault();
    }
    if (!event.repeat) {
      pressed.add(key);
    }
    keys.add(key);
  });

  targetWindow.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  targetWindow.addEventListener("blur", () => {
    keys.clear();
    pressed.clear();
    dragging = false;
  });

  domElement.addEventListener("pointerdown", (event) => {
    dragging = true;
    domElement.setPointerCapture?.(event.pointerId);
  });

  domElement.addEventListener("pointerup", (event) => {
    dragging = false;
    if (domElement.hasPointerCapture?.(event.pointerId)) {
      domElement.releasePointerCapture(event.pointerId);
    }
  });

  targetWindow.addEventListener("pointerup", () => {
    dragging = false;
  });

  targetWindow.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    look.x += event.movementX;
    look.y += event.movementY;
  });

  domElement.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      wheel += event.deltaY;
    },
    { passive: false },
  );

  return {
    isDown(key) {
      return keys.has(key);
    },
    isAnyDown(keyList) {
      return keyList.some((key) => keys.has(key));
    },
    consumePress(key) {
      if (!pressed.has(key)) return false;
      pressed.delete(key);
      return true;
    },
    consumeAnyPress(keyList) {
      for (const key of keyList) {
        if (!pressed.has(key)) continue;
        pressed.delete(key);
        return true;
      }
      return false;
    },
    consumeLook() {
      const snapshot = { x: look.x, y: look.y };
      look.x = 0;
      look.y = 0;
      return snapshot;
    },
    consumeWheel() {
      const snapshot = wheel;
      wheel = 0;
      return snapshot;
    },
  };
}
