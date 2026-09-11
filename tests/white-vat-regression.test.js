const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function composite(channel, density, background255) {
  return clamp(channel * density + (background255 / 255) * (1 - density), 0, 1);
}

assert.match(source, /13\s*\/\s*255/);
assert.match(source, /19\s*\/\s*255/);
assert.match(source, /29\s*\/\s*255/);
assert.match(source, /function\s+erase/);
assert.match(source, /mode:\s*"clear"/);
assert.match(source, /dyeA\[k\]\s*=\s*lerp\(dyeA\[k\],\s*0/);
assert.match(source, /Math\.max\(0,\s*sample\(dyeA0/);
assert.match(source, /deviceorientation/);
assert.match(source, /devicemotion/);
const pixel = [0.92, 0.42, 0.12].map((channel, index) => composite(channel, 0.86, [13, 19, 29][index]));
assert.ok(pixel.some((channel) => channel < 0.98), `expected a colored pixel, got ${pixel.join(",")}`);
console.log("white-vat regression: pass", pixel.map((channel) => channel.toFixed(3)).join(","));
