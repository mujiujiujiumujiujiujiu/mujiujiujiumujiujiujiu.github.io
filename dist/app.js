(() => {
  "use strict";

  const W = 904;
  const H = 572;
  const TAU = Math.PI * 2;
  const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif';
  const REDUCE_MOTION = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d", { alpha: false });
  const fluidCanvas = document.createElement("canvas");
  const fluidCtx = fluidCanvas.getContext("2d");

  if (!ctx || !fluidCtx) return;

  ctx.imageSmoothingEnabled = true;
  fluidCtx.imageSmoothingEnabled = true;

  const COLORS = {
    ink: "#f3f5fb",
    soft: "#b0b8cb",
    dim: "#6c7487",
    line: "rgba(230, 236, 250, 0.12)",
    panel: "rgba(12, 17, 27, 0.74)",
    panelStrong: "rgba(9, 13, 21, 0.90)",
    vat: "#101824",
    mint: "#eaf5ff",
    blue: "#84b6ff",
    warm: "#ffd391",
  };

  const VAT = { x: 30, y: 132, w: 844, h: 410, r: 34 };
  const LIQUID = { x: 51, y: 174, w: 802, h: 343, r: 24 };
  const SPECTRUM = { x: 180, y: 68, w: 604, h: 46 };
  const RESET_BUTTON = { x: 800, y: 67, w: 72, h: 48 };

  const state = {
    time: 0,
    selected: { h: 28, rgb: null, source: "牛顿色环" },
    force: { x: 0, y: 0, energy: 0, angle: 0 },
    strokes: 0,
    drops: 0,
    samples: 0,
    hasInteracted: false,
    toast: "点按取样 · 拖动搅拌 · 长按播撒",
    toastUntil: 999,
    sampleFx: null,
    flash: 0,
  };
  state.selected.rgb = hsvToRgb(state.selected.h, 0.86, 0.98);

  const pointer = {
    active: false,
    id: null,
    region: "none",
    x: W / 2,
    y: H / 2,
    lastX: W / 2,
    lastY: H / 2,
    startX: W / 2,
    startY: H / 2,
    downAt: 0,
    moved: false,
    longPress: false,
    lastSpray: 0,
    hover: false,
  };

  const ripples = [];
  const particles = [];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function smoothstep(edge0, edge1, value) {
    const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return amount * amount * (3 - 2 * amount);
  }

  function seededNoise(x, y) {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function hsvToRgb(hue, saturation, value) {
    const h = ((hue % 360) + 360) % 360 / 60;
    const i = Math.floor(h);
    const f = h - i;
    const p = value * (1 - saturation);
    const q = value * (1 - saturation * f);
    const t = value * (1 - saturation * (1 - f));
    const rows = [
      [value, t, p],
      [q, value, p],
      [p, value, t],
      [p, q, value],
      [t, p, value],
      [value, p, q],
    ];
    const rgb = rows[(i + 6) % 6];
    return { r: rgb[0], g: rgb[1], b: rgb[2] };
  }

  function rgbToHsv(rgb) {
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    const delta = max - min;
    let h = 0;
    if (delta > 0.0001) {
      if (max === rgb.r) h = 60 * (((rgb.g - rgb.b) / delta) % 6);
      else if (max === rgb.g) h = 60 * ((rgb.b - rgb.r) / delta + 2);
      else h = 60 * ((rgb.r - rgb.g) / delta + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max <= 0 ? 0 : delta / max, v: max };
  }

  function rgbToHex(rgb) {
    const toHex = (channel) => Math.round(clamp(channel, 0, 1) * 255).toString(16).padStart(2, "0");
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
  }

  function colorName(hue) {
    const names = ["红", "橙", "黄", "黄绿", "绿", "青", "天蓝", "蓝", "靛", "紫", "品红", "玫红"];
    return names[Math.round((((hue % 360) + 360) % 360) / 30) % names.length];
  }

  function roundedRectPath(target, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    target.beginPath();
    target.moveTo(x + r, y);
    target.arcTo(x + width, y, x + width, y + height, r);
    target.arcTo(x + width, y + height, x, y + height, r);
    target.arcTo(x, y + height, x, y, r);
    target.arcTo(x, y, x + width, y, r);
    target.closePath();
  }

  function roundedRect(x, y, width, height, radius, fill, stroke = null) {
    roundedRectPath(ctx, x, y, width, height, radius);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function text(value, x, y, size, color = COLORS.ink, weight = 400, align = "left", baseline = "alphabetic") {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(value, x, y);
  }

  function screenPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) * W / rect.width, 0, W),
      y: clamp((event.clientY - rect.top) * H / rect.height, 0, H),
    };
  }

  function inRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function inVat(point) {
    if (!inRect(point, LIQUID)) return false;
    const localX = point.x - LIQUID.x;
    const localY = point.y - LIQUID.y;
    const r = LIQUID.r;
    if (localX >= r && localX <= LIQUID.w - r) return true;
    if (localY >= r && localY <= LIQUID.h - r) return true;
    const cornerX = localX < r ? r : LIQUID.w - r;
    const cornerY = localY < r ? r : LIQUID.h - r;
    return Math.hypot(localX - cornerX, localY - cornerY) <= r;
  }

  function setToast(message, duration = 2.2) {
    state.toast = message;
    state.toastUntil = state.time + duration;
  }

  function addRipple(x, y, color, maxRadius = 44, life = 0.9, width = 1.4) {
    ripples.push({ x, y, color, maxRadius, life, width, age: 0 });
  }

  function addParticles(x, y, rgb, count = 5, speed = 28) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const velocity = speed * (0.45 + Math.random() * 0.9);
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 7,
        size: 1.2 + Math.random() * 2.2,
        life: 0.36 + Math.random() * 0.46,
        age: 0,
        rgb,
      });
    }
  }

  const fluid = (() => {
    const nx = 160;
    const ny = 69;
    const count = nx * ny;
    fluidCanvas.width = nx;
    fluidCanvas.height = ny;
    const dyeR = new Float32Array(count);
    const dyeG = new Float32Array(count);
    const dyeB = new Float32Array(count);
    const dyeA = new Float32Array(count);
    const dyeR0 = new Float32Array(count);
    const dyeG0 = new Float32Array(count);
    const dyeB0 = new Float32Array(count);
    const dyeA0 = new Float32Array(count);
    const vx = new Float32Array(count);
    const vy = new Float32Array(count);
    const vx0 = new Float32Array(count);
    const vy0 = new Float32Array(count);
    const divergence = new Float32Array(count);
    let pressure = new Float32Array(count);
    let pressure0 = new Float32Array(count);
    const image = fluidCtx.createImageData(nx, ny);

    function index(x, y) {
      return y * nx + x;
    }

    function sample(array, x, y) {
      const sx = clamp(x, 0, nx - 1);
      const sy = clamp(y, 0, ny - 1);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(nx - 1, x0 + 1);
      const y1 = Math.min(ny - 1, y0 + 1);
      const tx = sx - x0;
      const ty = sy - y0;
      const a = array[index(x0, y0)];
      const b = array[index(x1, y0)];
      const c = array[index(x0, y1)];
      const d = array[index(x1, y1)];
      return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
    }

    function reset() {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const k = index(x, y);
          const ux = (x + 0.5) / nx;
          const uy = (y + 0.5) / ny;
          const dx = (ux - 0.5) * 1.05;
          const dy = (uy - 0.52) * 1.18;
          const radius = Math.hypot(dx, dy);
          const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360 + 16) % 360;
          const edge = 1 - smoothstep(0.58, 0.82, radius);
          const texture = seededNoise(x + 11, y + 17);
          const rgb = hsvToRgb(angle, 0.73 + 0.1 * (1 - radius), 0.84 + 0.12 * (1 - radius));
          const swirl = 4.4 + texture * 0.9;
          dyeR[k] = rgb.r;
          dyeG[k] = rgb.g;
          dyeB[k] = rgb.b;
          dyeA[k] = clamp(0.82 + edge * 0.16 + (texture - 0.5) * 0.04, 0.72, 1);
          vx[k] = -dy * swirl;
          vy[k] = dx * swirl;
        }
      }
      dyeR0.set(dyeR);
      dyeG0.set(dyeG);
      dyeB0.set(dyeB);
      dyeA0.set(dyeA);
      vx0.set(vx);
      vy0.set(vy);
      divergence.fill(0);
      pressure.fill(0);
      pressure0.fill(0);
    }

    function applyImpulse(screenX, screenY, dx, dy, radius = 31) {
      const gx = (screenX - LIQUID.x) / LIQUID.w * (nx - 1);
      const gy = (screenY - LIQUID.y) / LIQUID.h * (ny - 1);
      const rx = Math.max(2, radius / LIQUID.w * nx);
      const ry = Math.max(2, radius / LIQUID.h * ny);
      const forceX = dx / (LIQUID.w / nx) * 4.5;
      const forceY = dy / (LIQUID.h / ny) * 4.5;
      const minX = Math.max(1, Math.floor(gx - rx * 2.2));
      const maxX = Math.min(nx - 2, Math.ceil(gx + rx * 2.2));
      const minY = Math.max(1, Math.floor(gy - ry * 2.2));
      const maxY = Math.min(ny - 2, Math.ceil(gy + ry * 2.2));
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const nxp = (x - gx) / rx;
          const nyp = (y - gy) / ry;
          const weight = Math.exp(-(nxp * nxp + nyp * nyp) * 0.72);
          const k = index(x, y);
          vx[k] += forceX * weight;
          vy[k] += forceY * weight;
        }
      }
    }

    function paint(screenX, screenY, rgb, amount = 0.038, radius = 24, dx = 0, dy = 0) {
      const gx = (screenX - LIQUID.x) / LIQUID.w * (nx - 1);
      const gy = (screenY - LIQUID.y) / LIQUID.h * (ny - 1);
      const rx = Math.max(2, radius / LIQUID.w * nx);
      const ry = Math.max(2, radius / LIQUID.h * ny);
      const minX = Math.max(1, Math.floor(gx - rx * 2.2));
      const maxX = Math.min(nx - 2, Math.ceil(gx + rx * 2.2));
      const minY = Math.max(1, Math.floor(gy - ry * 2.2));
      const maxY = Math.min(ny - 2, Math.ceil(gy + ry * 2.2));
      const forceX = dx / (LIQUID.w / nx) * 2.2;
      const forceY = dy / (LIQUID.h / ny) * 2.2;
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const nxp = (x - gx) / rx;
          const nyp = (y - gy) / ry;
          const weight = Math.exp(-(nxp * nxp + nyp * nyp) * 0.72);
          if (weight < 0.012) continue;
          const k = index(x, y);
          const deposit = amount * weight;
          const mix = clamp(deposit * 3.0, 0, 0.38);
          dyeR[k] = lerp(dyeR[k], rgb.r, mix);
          dyeG[k] = lerp(dyeG[k], rgb.g, mix);
          dyeB[k] = lerp(dyeB[k], rgb.b, mix);
          dyeA[k] = clamp(dyeA[k] + deposit * 0.28, 0.7, 1);
          vx[k] += forceX * weight;
          vy[k] += forceY * weight;
        }
      }
    }

    function sampleColor(screenX, screenY) {
      const gx = (screenX - LIQUID.x) / LIQUID.w * (nx - 1);
      const gy = (screenY - LIQUID.y) / LIQUID.h * (ny - 1);
      return {
        r: sample(dyeR, gx, gy),
        g: sample(dyeG, gx, gy),
        b: sample(dyeB, gx, gy),
      };
    }

    function project() {
      for (let y = 1; y < ny - 1; y += 1) {
        for (let x = 1; x < nx - 1; x += 1) {
          const k = index(x, y);
          divergence[k] = 0.5 * (vx[index(x + 1, y)] - vx[index(x - 1, y)] + vy[index(x, y + 1)] - vy[index(x, y - 1)]);
        }
      }
      pressure.fill(0);
      for (let iteration = 0; iteration < 5; iteration += 1) {
        for (let y = 1; y < ny - 1; y += 1) {
          for (let x = 1; x < nx - 1; x += 1) {
            const k = index(x, y);
            pressure0[k] = (pressure[index(x - 1, y)] + pressure[index(x + 1, y)] + pressure[index(x, y - 1)] + pressure[index(x, y + 1)] - divergence[k]) * 0.25;
          }
        }
        const swap = pressure;
        pressure = pressure0;
        pressure0 = swap;
      }
      for (let y = 1; y < ny - 1; y += 1) {
        for (let x = 1; x < nx - 1; x += 1) {
          const k = index(x, y);
          vx[k] -= 0.52 * (pressure[index(x + 1, y)] - pressure[index(x - 1, y)]);
          vy[k] -= 0.52 * (pressure[index(x, y + 1)] - pressure[index(x, y - 1)]);
        }
      }
    }

    function step(dt) {
      const safeDt = clamp(dt, 0.008, 0.034);
      vx0.set(vx);
      vy0.set(vy);
      for (let y = 1; y < ny - 1; y += 1) {
        for (let x = 1; x < nx - 1; x += 1) {
          const k = index(x, y);
          const backX = x - vx0[k] * safeDt * 0.78;
          const backY = y - vy0[k] * safeDt * 0.78;
          const advectedX = sample(vx0, backX, backY);
          const advectedY = sample(vy0, backX, backY);
          const neighborX = (vx0[index(x - 1, y)] + vx0[index(x + 1, y)] + vx0[index(x, y - 1)] + vx0[index(x, y + 1)]) * 0.25;
          const neighborY = (vy0[index(x - 1, y)] + vy0[index(x + 1, y)] + vy0[index(x, y - 1)] + vy0[index(x, y + 1)]) * 0.25;
          vx[k] = lerp(advectedX * 0.996, neighborX, 0.025);
          vy[k] = lerp(advectedY * 0.996, neighborY, 0.025);
        }
      }
      for (let x = 0; x < nx; x += 1) {
        vx[index(x, 0)] *= 0.28;
        vy[index(x, 0)] *= 0.28;
        vx[index(x, ny - 1)] *= 0.28;
        vy[index(x, ny - 1)] *= 0.28;
      }
      for (let y = 0; y < ny; y += 1) {
        vx[index(0, y)] *= 0.28;
        vy[index(0, y)] *= 0.28;
        vx[index(nx - 1, y)] *= 0.28;
        vy[index(nx - 1, y)] *= 0.28;
      }
      project();

      dyeR0.set(dyeR);
      dyeG0.set(dyeG);
      dyeB0.set(dyeB);
      dyeA0.set(dyeA);
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const k = index(x, y);
          const backX = x - vx[k] * safeDt * 0.92;
          const backY = y - vy[k] * safeDt * 0.92;
          dyeR[k] = sample(dyeR0, backX, backY);
          dyeG[k] = sample(dyeG0, backX, backY);
          dyeB[k] = sample(dyeB0, backX, backY);
          dyeA[k] = Math.max(0.72, sample(dyeA0, backX, backY) * 0.9997);
          vx[k] *= Math.pow(0.993, safeDt * 60);
          vy[k] *= Math.pow(0.993, safeDt * 60);
        }
      }
    }

    function render(time) {
      const data = image.data;
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const k = index(x, y);
          const a = clamp(dyeA[k], 0, 1);
          const shimmer = 1 + 0.035 * Math.sin(time * 0.9 + x * 0.22 + y * 0.14);
          const r = clamp(dyeR[k] * shimmer * a + (13 / 255) * (1 - a), 0, 1);
          const g = clamp(dyeG[k] * shimmer * a + (19 / 255) * (1 - a), 0, 1);
          const b = clamp(dyeB[k] * shimmer * a + (29 / 255) * (1 - a), 0, 1);
          const p = k * 4;
          data[p] = Math.round(r * 255);
          data[p + 1] = Math.round(g * 255);
          data[p + 2] = Math.round(b * 255);
          data[p + 3] = 255;
        }
      }
      fluidCtx.putImageData(image, 0, 0);
    }

    reset();
    return { nx, ny, reset, step, render, paint, applyImpulse, sampleColor };
  })();

  function selectHue(hue, source = "牛顿色环") {
    const normalized = ((hue % 360) + 360) % 360;
    state.selected = { h: normalized, rgb: hsvToRgb(normalized, 0.86, 0.98), source };
    state.hasInteracted = true;
    state.flash = 0.28;
    setToast(`已选择 ${colorName(normalized)}色 · 长按染缸播撒`, 1.7);
  }

  function selectFromSpectrum(x) {
    const ratio = clamp((x - SPECTRUM.x) / SPECTRUM.w, 0, 1);
    selectHue(ratio * 360);
  }

  function resetScene() {
    fluid.reset();
    state.strokes = 0;
    state.drops = 0;
    state.samples = 0;
    state.hasInteracted = false;
    state.force.x = 0;
    state.force.y = 0;
    state.force.energy = 0;
    state.force.angle = 0;
    state.sampleFx = null;
    state.flash = 0.5;
    ripples.length = 0;
    particles.length = 0;
    setToast("染缸已复位 · 点按取样，拖动搅拌，长按播撒", 2.6);
  }

  function beginSpray() {
    if (!pointer.active || pointer.region !== "vat" || pointer.longPress) return;
    pointer.longPress = true;
    pointer.lastSpray = state.time - 0.1;
    state.hasInteracted = true;
    setToast(`播撒 ${colorName(state.selected.h)}色 · 拖动改变流向`, 2.2);
    addRipple(pointer.x, pointer.y, rgbToHex(state.selected.rgb), 30, 0.7, 1.2);
    addParticles(pointer.x, pointer.y, state.selected.rgb, 10, 34);
  }

  function sprayAt(x, y, dx = 0, dy = 0) {
    fluid.paint(x, y, state.selected.rgb, REDUCE_MOTION ? 0.026 : 0.04, 25, dx, dy);
    state.drops += 1;
    state.force.x = lerp(state.force.x, dx * 9, 0.12);
    state.force.y = lerp(state.force.y, dy * 9, 0.12);
    state.force.energy = clamp(Math.hypot(state.force.x, state.force.y) / 42, 0, 1);
    state.force.angle = Math.atan2(state.force.y, state.force.x);
    if (state.time - pointer.lastSpray > 0.12) {
      addParticles(x, y, state.selected.rgb, 2, 18);
    }
  }

  function updatePointerAction() {
    if (!pointer.active || pointer.region !== "vat") return;
    const held = state.time - pointer.downAt;
    if (!pointer.longPress && held >= 0.36) beginSpray();
    if (pointer.longPress && state.time - pointer.lastSpray >= 0.035) {
      const dx = (pointer.x - pointer.lastX) * 0.35;
      const dy = (pointer.y - pointer.lastY) * 0.35;
      sprayAt(pointer.x, pointer.y, dx, dy);
      pointer.lastSpray = state.time;
    }
  }

  function update(dt) {
    state.time += dt;
    updatePointerAction();
    fluid.step(dt);
    for (const ripple of ripples) ripple.age += dt;
    for (const particle of particles) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.985;
      particle.vy = particle.vy * 0.985 + 8 * dt;
    }
    while (ripples.length && ripples[0].age > ripples[0].life) ripples.shift();
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      if (particles[i].age > particles[i].life) particles.splice(i, 1);
    }
    state.force.energy = lerp(state.force.energy, 0, 0.08);
    state.force.x = lerp(state.force.x, 0, 0.055);
    state.force.y = lerp(state.force.y, 0, 0.055);
    if (Math.hypot(state.force.x, state.force.y) > 0.01) state.force.angle = Math.atan2(state.force.y, state.force.x);
    state.flash = Math.max(0, state.flash - dt);
    if (state.sampleFx) {
      state.sampleFx.age += dt;
      if (state.sampleFx.age > 1.15) state.sampleFx = null;
    }
  }

  function drawBackground() {
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#090d16");
    base.addColorStop(0.48, "#0a101a");
    base.addColorStop(1, "#060910");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(474, 314, 40, 474, 314, 520);
    glow.addColorStop(0, "rgba(42, 74, 130, 0.16)");
    glow.addColorStop(0.55, "rgba(24, 46, 86, 0.06)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#9aaed2";
    ctx.lineWidth = 1;
    for (let x = 20; x < W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 112);
      ctx.lineTo(x, H - 14);
      ctx.stroke();
    }
    for (let y = 124; y < H; y += 32) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(W - 18, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSpectrum() {
    roundedRect(SPECTRUM.x, SPECTRUM.y, SPECTRUM.w, SPECTRUM.h, 14, "rgba(8, 12, 20, 0.88)", "rgba(236, 241, 255, 0.18)");
    ctx.save();
    roundedRectPath(ctx, SPECTRUM.x + 4, SPECTRUM.y + 4, SPECTRUM.w - 8, SPECTRUM.h - 8, 10);
    ctx.clip();
    const gradient = ctx.createLinearGradient(SPECTRUM.x, 0, SPECTRUM.x + SPECTRUM.w, 0);
    const stops = [
      [0, "#ff2e3d"],
      [0.14, "#ff8a25"],
      [0.27, "#ffe45a"],
      [0.40, "#9eea57"],
      [0.52, "#24d6ab"],
      [0.64, "#39b7ff"],
      [0.76, "#496cff"],
      [0.88, "#b04bff"],
      [1, "#ff2e3d"],
    ];
    for (const [stop, color] of stops) gradient.addColorStop(stop, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(SPECTRUM.x, SPECTRUM.y, SPECTRUM.w, SPECTRUM.h);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffffff";
    for (let i = 1; i < 12; i += 1) ctx.fillRect(SPECTRUM.x + i * SPECTRUM.w / 12, SPECTRUM.y, 1, SPECTRUM.h);
    ctx.restore();

    const selectedX = SPECTRUM.x + state.selected.h / 360 * SPECTRUM.w;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(selectedX, SPECTRUM.y - 6);
    ctx.lineTo(selectedX, SPECTRUM.y + SPECTRUM.h + 6);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(selectedX - 6, SPECTRUM.y - 7);
    ctx.lineTo(selectedX + 6, SPECTRUM.y - 7);
    ctx.lineTo(selectedX, SPECTRUM.y - 1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(selectedX - 6, SPECTRUM.y + SPECTRUM.h + 7);
    ctx.lineTo(selectedX + 6, SPECTRUM.y + SPECTRUM.h + 7);
    ctx.lineTo(selectedX, SPECTRUM.y + SPECTRUM.h + 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHeader() {
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(32, 111.5);
    ctx.lineTo(W - 32, 111.5);
    ctx.stroke();

    text("DYE LAB  /  NEWTON RING", 38, 25, 11, COLORS.dim, 700);
    text("色彩染缸", 38, 55, 25, COLORS.ink, 700);

    roundedRect(727, 13, 145, 35, 17, COLORS.panel, COLORS.line);
    ctx.fillStyle = rgbToHex(state.selected.rgb);
    ctx.beginPath();
    ctx.arc(747, 30.5, 9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.lineWidth = 1;
    ctx.stroke();
    text(`当前 ${rgbToHex(state.selected.rgb)}`, 764, 35, 12, COLORS.ink, 600);

    text("牛顿色环", 38, 95, 13, COLORS.soft, 600);
    text("点击色带切换投染色", 38, 108, 11, COLORS.dim, 400);
    drawSpectrum();

    const resetHover = pointer.hover && inRect(pointer, RESET_BUTTON);
    roundedRect(RESET_BUTTON.x, RESET_BUTTON.y, RESET_BUTTON.w, RESET_BUTTON.h, 14, resetHover ? "rgba(29, 37, 53, 0.95)" : COLORS.panel, resetHover ? "rgba(236, 241, 255, 0.32)" : COLORS.line);
    text("重置", RESET_BUTTON.x + RESET_BUTTON.w / 2, RESET_BUTTON.y + 29, 14, resetHover ? COLORS.ink : COLORS.soft, 600, "center");
  }

  function drawForceMeter() {
    const x = 681;
    const y = 160;
    text("受力方向", x, y, 11, COLORS.dim, 600);
    const cx = x + 66;
    const cy = y - 4;
    const length = 24;
    const amount = clamp(state.force.energy, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.46 + amount * 0.52;
    ctx.strokeStyle = amount > 0.08 ? COLORS.mint : COLORS.dim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(state.force.angle) * length * 0.5, cy - Math.sin(state.force.angle) * length * 0.5);
    ctx.lineTo(cx + Math.cos(state.force.angle) * length * (0.5 + amount * 0.42), cy + Math.sin(state.force.angle) * length * (0.5 + amount * 0.42));
    ctx.stroke();
    const tipX = cx + Math.cos(state.force.angle) * length * (0.5 + amount * 0.42);
    const tipY = cy + Math.sin(state.force.angle) * length * (0.5 + amount * 0.42);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(state.force.angle - 0.55) * 6, tipY - Math.sin(state.force.angle - 0.55) * 6);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(state.force.angle + 0.55) * 6, tipY - Math.sin(state.force.angle + 0.55) * 6);
    ctx.stroke();
    ctx.restore();

    roundedRect(x, y + 11, 103, 5, 3, "rgba(236, 241, 255, 0.10)");
    roundedRect(x, y + 11, 103 * amount, 5, 3, amount > 0.05 ? "rgba(132, 182, 255, 0.85)" : "rgba(132, 182, 255, 0.35)");
  }

  function drawVat() {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.52)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    const frame = ctx.createLinearGradient(0, VAT.y, 0, VAT.y + VAT.h);
    frame.addColorStop(0, "#1b2637");
    frame.addColorStop(0.45, "#131c2a");
    frame.addColorStop(1, "#0b111b");
    roundedRect(VAT.x, VAT.y, VAT.w, VAT.h, VAT.r, frame, "rgba(223, 233, 255, 0.20)");
    ctx.restore();

    roundedRectPath(ctx, LIQUID.x, LIQUID.y, LIQUID.w, LIQUID.h, LIQUID.r);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = COLORS.vat;
    ctx.fillRect(LIQUID.x, LIQUID.y, LIQUID.w, LIQUID.h);
    fluid.render(state.time);
    ctx.drawImage(fluidCanvas, LIQUID.x, LIQUID.y, LIQUID.w, LIQUID.h);

    const sheen = ctx.createLinearGradient(0, LIQUID.y, 0, LIQUID.y + LIQUID.h);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0.15)");
    sheen.addColorStop(0.14, "rgba(255, 255, 255, 0.025)");
    sheen.addColorStop(0.65, "rgba(6, 8, 14, 0.03)");
    sheen.addColorStop(1, "rgba(3, 5, 10, 0.26)");
    ctx.fillStyle = sheen;
    ctx.fillRect(LIQUID.x, LIQUID.y, LIQUID.w, LIQUID.h);

    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = LIQUID.y + 54 + i * 57;
      ctx.beginPath();
      for (let x = LIQUID.x - 20; x <= LIQUID.x + LIQUID.w + 20; x += 18) {
        const wave = Math.sin(x * 0.018 + state.time * (0.45 + i * 0.04) + i * 2.2) * (2 + i * 0.45);
        if (x === LIQUID.x - 20) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(234, 245, 255, 0.30)";
    roundedRectPath(ctx, LIQUID.x, LIQUID.y, LIQUID.w, LIQUID.h, LIQUID.r);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
    ctx.beginPath();
    ctx.moveTo(VAT.x + 34, VAT.y + 1);
    ctx.lineTo(VAT.x + VAT.w - 34, VAT.y + 1);
    ctx.stroke();
    ctx.restore();

    text("NEWTON VAT  /  LIQUID SPECTRUM", 68, 157, 11, "rgba(243, 245, 251, 0.68)", 700);
    text("混合层实时流动", 68, 174, 11, "rgba(176, 184, 203, 0.78)", 400);
    drawForceMeter();
  }

  function drawRipplesAndParticles() {
    ctx.save();
    roundedRectPath(ctx, LIQUID.x, LIQUID.y, LIQUID.w, LIQUID.h, LIQUID.r);
    ctx.clip();
    for (const ripple of ripples) {
      const progress = clamp(ripple.age / ripple.life, 0, 1);
      ctx.globalAlpha = (1 - progress) * 0.7;
      ctx.strokeStyle = ripple.color;
      ctx.lineWidth = ripple.width * (1 - progress * 0.35);
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.maxRadius * (0.2 + progress * 0.8), 0, TAU);
      ctx.stroke();
    }
    for (const particle of particles) {
      const progress = clamp(particle.age / particle.life, 0, 1);
      ctx.globalAlpha = (1 - progress) * 0.84;
      ctx.fillStyle = rgbToHex(particle.rgb);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (1 - progress * 0.35), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawStatusBar() {
    const x = 68;
    const y = 478;
    const width = 768;
    const height = 43;
    roundedRect(x, y, width, height, 15, "rgba(7, 11, 18, 0.70)", "rgba(236, 241, 255, 0.16)");
    ctx.fillStyle = rgbToHex(state.selected.rgb);
    ctx.beginPath();
    ctx.arc(x + 23, y + 21.5, 8.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const toastActive = state.time < state.toastUntil;
    text(toastActive ? state.toast : "点按取样 · 拖动把流体推向你想要的方向 · 长按播撒", x + 43, y + 26, 13, toastActive ? COLORS.ink : COLORS.soft, 500);
    text(`${state.strokes} 次搅拌`, x + width - 179, y + 26, 12, COLORS.dim, 500);
    text(`${state.drops} 滴`, x + width - 82, y + 26, 12, COLORS.warm, 600, "right");
  }

  function drawSampleFx() {
    const fx = state.sampleFx;
    if (!fx) return;
    const progress = clamp(fx.age / 1.15, 0, 1);
    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.86;
    ctx.strokeStyle = rgbToHex(fx.rgb);
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, 13 + progress * 20, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx.x - 22, fx.y);
    ctx.lineTo(fx.x + 22, fx.y);
    ctx.moveTo(fx.x, fx.y - 22);
    ctx.lineTo(fx.x, fx.y + 22);
    ctx.stroke();
    text(`取样 ${rgbToHex(fx.rgb)}`, fx.x + 18, fx.y - 18 - progress * 7, 12, rgbToHex(fx.rgb), 700);
    ctx.restore();
  }

  function drawPointer() {
    if (!pointer.hover && !pointer.active) return;
    const point = pointer;
    if (!inVat(point)) return;
    ctx.save();
    const active = pointer.active && pointer.longPress;
    const radius = active ? 18 + Math.sin(state.time * 5) * 2 : 15;
    ctx.globalAlpha = active ? 0.9 : 0.54;
    ctx.strokeStyle = active ? rgbToHex(state.selected.rgb) : COLORS.mint;
    ctx.lineWidth = active ? 2 : 1.2;
    ctx.setLineDash(active ? [] : [3, 5]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = rgbToHex(state.selected.rgb);
    ctx.globalAlpha = active ? 0.9 : 0.75;
    ctx.beginPath();
    ctx.arc(point.x, point.y, active ? 4 : 2.5, 0, TAU);
    ctx.fill();
    if (active) text(`播撒 · ${colorName(state.selected.h)}色`, point.x + 25, point.y - 18, 12, COLORS.ink, 600);
    ctx.restore();
  }

  function drawFlash() {
    if (state.flash <= 0) return;
    ctx.save();
    ctx.globalAlpha = state.flash * 0.14;
    ctx.fillStyle = rgbToHex(state.selected.rgb);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawHeader();
    drawVat();
    drawRipplesAndParticles();
    drawSampleFx();
    drawStatusBar();
    drawPointer();
    drawFlash();
  }

  function registerWebMcp() {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const registrationOptions = { signal: lifecycle.signal };
    const register = (tool) => {
      try {
        void Promise.resolve(modelContext.registerTool(tool, registrationOptions)).catch(() => {});
      } catch (error) {
        // WebMCP is an optional enhancement; pointer and keyboard input remain standalone.
      }
    };

    register({
      name: "select_newton_color",
      title: "选择牛顿色环颜色",
      description: "从 0 到 360 度的牛顿色环中选择投染颜色，并更新页面当前色彩。",
      inputSchema: {
        type: "object",
        properties: { hue: { type: "number", minimum: 0, maximum: 360 } },
        required: ["hue"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input.hue !== "number" || !Number.isFinite(input.hue)) throw new Error("hue 必须是 0 到 360 的数字");
        const hue = clamp(input.hue, 0, 360);
        selectHue(hue, "WebMCP 选色");
        return { hue: Number(hue.toFixed(1)), color: rgbToHex(state.selected.rgb) };
      },
    });

    register({
      name: "pour_newton_dye",
      title: "向染缸播撒颜色",
      description: "在染缸内以归一化坐标播撒当前颜色；x 和 y 的范围都是 0 到 1。",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", minimum: 0, maximum: 1 },
          y: { type: "number", minimum: 0, maximum: 1 },
          drops: { type: "integer", minimum: 1, maximum: 8 },
        },
        required: ["x", "y"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input.x !== "number" || typeof input.y !== "number" || !Number.isFinite(input.x) || !Number.isFinite(input.y)) {
          throw new Error("x 和 y 必须是 0 到 1 的数字");
        }
        const x = clamp(input.x, 0, 1);
        const y = clamp(input.y, 0, 1);
        const drops = Number.isInteger(input.drops) ? clamp(input.drops, 1, 8) : 1;
        const screenX = LIQUID.x + LIQUID.w * x;
        const screenY = LIQUID.y + LIQUID.h * y;
        for (let i = 0; i < drops; i += 1) {
          const spread = i === 0 ? 0 : 9;
          const angle = i * 2.399;
          sprayAt(screenX + Math.cos(angle) * spread, screenY + Math.sin(angle) * spread, 0, 0);
        }
        state.hasInteracted = true;
        addRipple(screenX, screenY, rgbToHex(state.selected.rgb), 48, 0.9, 1.4);
        setToast(`已播撒 ${drops} 滴 ${colorName(state.selected.h)}色`, 1.8);
        return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), drops, color: rgbToHex(state.selected.rgb) };
      },
    });

    register({
      name: "reset_newton_vat",
      title: "复位色彩染缸",
      description: "恢复均匀分布的初始牛顿色环流体，并清空当前互动反馈。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        resetScene();
        return { status: "reset", color: rgbToHex(state.selected.rgb) };
      },
    });
  }

  function onPointerDown(event) {
    event.preventDefault();
    const point = screenPoint(event);
    pointer.active = true;
    pointer.id = event.pointerId;
    pointer.region = inRect(point, SPECTRUM) ? "spectrum" : inRect(point, RESET_BUTTON) ? "reset" : inVat(point) ? "vat" : "none";
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.lastX = point.x;
    pointer.lastY = point.y;
    pointer.startX = point.x;
    pointer.startY = point.y;
    pointer.downAt = state.time;
    pointer.moved = false;
    pointer.longPress = false;
    pointer.lastSpray = state.time;
    canvas.setPointerCapture?.(event.pointerId);

    if (pointer.region === "spectrum") {
      selectFromSpectrum(point.x);
      return;
    }
    if (pointer.region === "reset") {
      resetScene();
      return;
    }
    if (pointer.region === "vat") {
      state.hasInteracted = true;
      addRipple(point.x, point.y, "rgba(255, 255, 255, 0.85)", 20, 0.52, 1.1);
    }
  }

  function onPointerMove(event) {
    const point = screenPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.hover = true;
    if (!pointer.active || pointer.id !== event.pointerId) return;
    event.preventDefault();
    const dx = point.x - pointer.lastX;
    const dy = point.y - pointer.lastY;
    if (Math.hypot(point.x - pointer.startX, point.y - pointer.startY) > 9) pointer.moved = true;

    if (pointer.region === "spectrum") {
      selectFromSpectrum(point.x);
    } else if (pointer.region === "vat" && (Math.abs(dx) + Math.abs(dy) > 0.3)) {
      if (!pointer.longPress) {
        fluid.applyImpulse(point.x, point.y, dx, dy, 34);
        state.strokes += 1;
        state.hasInteracted = true;
      } else {
        fluid.applyImpulse(point.x, point.y, dx * 0.65, dy * 0.65, 38);
      }
      state.force.x = lerp(state.force.x, dx * 10, 0.18);
      state.force.y = lerp(state.force.y, dy * 10, 0.18);
      state.force.energy = clamp(Math.hypot(state.force.x, state.force.y) / 38, 0, 1);
      state.force.angle = Math.atan2(state.force.y, state.force.x);
      if (pointer.longPress) sprayAt(point.x, point.y, dx * 0.18, dy * 0.18);
    }
    pointer.lastX = point.x;
    pointer.lastY = point.y;
  }

  function onPointerUp(event) {
    if (!pointer.active || pointer.id !== event.pointerId) return;
    event.preventDefault();
    const region = pointer.region;
    const wasLongPress = pointer.longPress;
    const wasMoved = pointer.moved;
    const x = pointer.x;
    const y = pointer.y;
    pointer.active = false;
    pointer.id = null;
    pointer.region = "none";
    if (region === "vat") {
      if (wasLongPress) {
        setToast(`本次播撒 ${state.drops} 滴 · 再点一处继续混色`, 1.8);
        addRipple(x, y, rgbToHex(state.selected.rgb), 48, 0.9, 1.4);
      } else if (!wasMoved && state.time - pointer.downAt < 0.36) {
        const sampled = fluid.sampleColor(x, y);
        const hsv = rgbToHsv(sampled);
        state.selected = { h: hsv.h, rgb: sampled, source: "染缸取样" };
        state.samples += 1;
        state.hasInteracted = true;
        state.sampleFx = { x, y, rgb: sampled, age: 0 };
        setToast(`已取样 ${colorName(hsv.h)}色 · 可继续长按播撒`, 2.0);
        addParticles(x, y, sampled, 8, 24);
      }
    }
    pointer.lastX = x;
    pointer.lastY = y;
  }

  function onPointerCancel() {
    pointer.active = false;
    pointer.id = null;
    pointer.region = "none";
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key === "r") {
      resetScene();
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const direction = event.key === "ArrowRight" ? 1 : -1;
      selectHue(state.selected.h + direction * 12, "键盘调色");
      event.preventDefault();
      return;
    }
    if (event.key === " ") {
      const x = W / 2;
      const y = LIQUID.y + LIQUID.h * 0.55;
      fluid.paint(x, y, state.selected.rgb, 0.2, 42);
      addRipple(x, y, rgbToHex(state.selected.rgb), 62, 0.95, 1.5);
      addParticles(x, y, state.selected.rgb, 12, 42);
      state.drops += 1;
      state.hasInteracted = true;
      setToast("键盘投染 · 方向键切换颜色 · R 复位", 1.8);
      event.preventDefault();
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: false });
  canvas.addEventListener("pointercancel", onPointerCancel, { passive: false });
  canvas.addEventListener("pointerleave", () => { if (!pointer.active) pointer.hover = false; });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", onKeyDown, { passive: false });
  registerWebMcp();

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.034);
    lastFrame = now;
    update(dt);
    draw();
    window.requestAnimationFrame(frame);
  }

  draw();
  window.requestAnimationFrame(frame);
})();
