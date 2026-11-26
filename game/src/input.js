// Input: keyboard state + mouse clicks. The game exposes clickable buttons as
// rectangles in screen space; main.js registers them per screen, input.js
// dispatches the click. No pointer lock, no network, desktop keyboard + mouse.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    pitch: 0, // -1 down .. +1 up (ArrowUp = nose up)
    roll: 0, // -1 left .. +1 right
    throttle: 0, // -1 .. +1 delta per second
    mouse: { x: 0, y: 0, clicked: null },
    pressed: new Set(), // edge-triggered keys, consumed by main.js
  };
  const DOWN = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  window.addEventListener('keydown', (e) => {
    if (DOWN.includes(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    input.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
  });
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.clicked = {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  });
  return input;
}

export function pollStick(input) {
  const k = input.keys;
  input.pitch = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
  input.roll = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
  input.throttle = (k.has('KeyW') || k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : 0)
    - (k.has('KeyS') || k.has('ControlLeft') ? 1 : 0);
}

export function takePressed(input, code) {
  if (input.pressed.has(code)) { input.pressed.delete(code); return true; }
  return false;
}

// A button registry: main.js rebuilds it every frame for the current screen.
export function createButtons() {
  const list = [];
  return {
    list,
    add(id, x, y, w, h) { list.push({ id, x, y, w, h }); },
    clear() { list.length = 0; },
    hit(mx, my) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b.id;
      }
      return null;
    },
  };
}
