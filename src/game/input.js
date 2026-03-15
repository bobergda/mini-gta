export function createInput(targetWindow, domElement) {
  const keys = new Set();
  const pressed = new Set();
  const look = { x: 0, y: 0 };
  let wheel = 0;
  let fireQueued = false;
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
    "f",
    "p",
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
      if (key === "f") {
        fireQueued = true;
      }
    }
    keys.add(key);
  });

  targetWindow.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  targetWindow.addEventListener("blur", () => {
    keys.clear();
    pressed.clear();
    fireQueued = false;
    dragging = false;
  });

  domElement.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      fireQueued = true;
    }
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
    consumeFire() {
      if (!fireQueued) return false;
      fireQueued = false;
      return true;
    },
  };
}
