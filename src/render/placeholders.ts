/**
 * Placeholder art drawn in code, so the game is playable before any real art exists.
 * Everything is vector shapes rasterised into one atlas at load time.
 */

export interface AtlasItem {
  /** Texture coordinates, v measured from the top. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Size in the world, metres. The item stands on its bottom centre. */
  width: number;
  height: number;
}

export interface SceneryAtlas {
  canvas: HTMLCanvasElement;
  items: Record<string, AtlasItem>;
}

const ATLAS_SIZE = 2048;

type Painter = (c: CanvasRenderingContext2D, w: number, h: number) => void;

function pine(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.fillStyle = "#5a3d24";
  c.fillRect(w * 0.45, h * 0.78, w * 0.1, h * 0.22);
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const top = h * (0.02 + i * 0.15);
    const bottom = h * (0.3 + i * 0.13);
    const half = w * (0.16 + i * 0.075);
    const g = c.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0);
    g.addColorStop(0, "#2f7a3a");
    g.addColorStop(0.55, "#1f5c2c");
    g.addColorStop(1, "#15441f");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(w / 2, top);
    c.lineTo(w / 2 + half, bottom);
    c.lineTo(w / 2 - half, bottom);
    c.closePath();
    c.fill();
  }
}

function palm(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.strokeStyle = "#7a5a36";
  c.lineWidth = w * 0.07;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(w * 0.5, h);
  c.quadraticCurveTo(w * 0.42, h * 0.55, w * 0.52, h * 0.2);
  c.stroke();
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
    const len = w * (0.42 + 0.06 * Math.sin(i * 2.3));
    const tipX = w * 0.52 + Math.cos(a) * len;
    const tipY = h * 0.2 + Math.sin(a) * len * 0.55 + len * 0.35;
    c.strokeStyle = i % 2 ? "#2e8b45" : "#3fa657";
    c.lineWidth = w * 0.06;
    c.beginPath();
    c.moveTo(w * 0.52, h * 0.2);
    c.quadraticCurveTo(w * 0.52 + Math.cos(a) * len * 0.6, h * 0.2 + Math.sin(a) * len * 0.6, tipX, tipY);
    c.stroke();
  }
}

function post(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.fillStyle = "#f2f2f2";
  c.fillRect(w * 0.35, h * 0.12, w * 0.3, h * 0.88);
  c.fillStyle = "#e8482e";
  c.fillRect(w * 0.35, h * 0.12, w * 0.3, h * 0.16);
  c.fillStyle = "#ffb300";
  c.beginPath();
  c.arc(w * 0.5, h * 0.2, w * 0.1, 0, Math.PI * 2);
  c.fill();
}

function sign(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.fillStyle = "#8d949c";
  c.fillRect(w * 0.47, h * 0.4, w * 0.06, h * 0.6);
  c.fillStyle = "#1456b8";
  c.beginPath();
  c.roundRect(w * 0.06, h * 0.04, w * 0.88, h * 0.42, w * 0.04);
  c.fill();
  c.strokeStyle = "#ffffff";
  c.lineWidth = w * 0.025;
  c.stroke();
  // a plain arrow; no text, so nothing needs translating
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.moveTo(w * 0.24, h * 0.22);
  c.lineTo(w * 0.58, h * 0.22);
  c.lineTo(w * 0.58, h * 0.13);
  c.lineTo(w * 0.78, h * 0.25);
  c.lineTo(w * 0.58, h * 0.37);
  c.lineTo(w * 0.58, h * 0.28);
  c.lineTo(w * 0.24, h * 0.28);
  c.closePath();
  c.fill();
}

function shadow(c: CanvasRenderingContext2D, w: number, h: number): void {
  // a round gradient squashed into an ellipse
  c.save();
  c.translate(w / 2, h / 2);
  c.scale(1, h / w);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.7, "rgba(0,0,0,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(-w / 2, -w / 2, w, w);
  c.restore();
}

/** name: painter, pixel box in the atlas, size in metres */
const ITEMS: Array<[string, Painter, number, number, number, number]> = [
  ["pine", pine, 512, 1024, 5.5, 11],
  ["palm", palm, 512, 1024, 6, 12],
  ["post", post, 96, 384, 0.3, 1.2],
  ["sign", sign, 512, 512, 4.5, 4.5],
  ["shadow", shadow, 512, 256, 1, 0.5],
];

export function createSceneryAtlas(): SceneryAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ATLAS_SIZE;
  const c = canvas.getContext("2d")!;
  const items: Record<string, AtlasItem> = {};
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const gap = 8;
  for (const [name, painter, w, h, width, height] of ITEMS) {
    if (x + w > ATLAS_SIZE) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.rect(0, 0, w, h);
    c.clip();
    painter(c, w, h);
    c.restore();
    items[name] = { u0: x / ATLAS_SIZE, v0: y / ATLAS_SIZE, u1: (x + w) / ATLAS_SIZE, v1: (y + h) / ATLAS_SIZE, width, height };
    x += w + gap;
    rowHeight = Math.max(rowHeight, h);
  }
  return { canvas, items };
}

/** A generic open-top car seen from behind, used when no rendered sprite sheet is present. */
export function createPlaceholderCar(frameWidth: number, frameHeight: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const c = canvas.getContext("2d")!;
  const cx = frameWidth / 2;
  const bottom = frameHeight * 0.8;
  const bodyW = frameWidth * 0.5;
  const bodyH = frameHeight * 0.42;

  c.fillStyle = "#15161a";
  c.fillRect(cx - bodyW * 0.5, bottom - bodyH * 0.22, bodyW * 0.16, bodyH * 0.3);
  c.fillRect(cx + bodyW * 0.34, bottom - bodyH * 0.22, bodyW * 0.16, bodyH * 0.3);

  const paint = c.createLinearGradient(0, bottom - bodyH, 0, bottom);
  paint.addColorStop(0, "#f0443a");
  paint.addColorStop(1, "#a81d20");
  c.fillStyle = paint;
  c.beginPath();
  c.roundRect(cx - bodyW / 2, bottom - bodyH, bodyW, bodyH, bodyW * 0.08);
  c.fill();

  c.strokeStyle = "#1b1c20";
  c.lineWidth = frameHeight * 0.018;
  c.fillStyle = "rgba(20,40,60,0.3)";
  c.beginPath();
  c.moveTo(cx - bodyW * 0.36, bottom - bodyH);
  c.lineTo(cx - bodyW * 0.28, bottom - bodyH * 1.55);
  c.lineTo(cx + bodyW * 0.28, bottom - bodyH * 1.55);
  c.lineTo(cx + bodyW * 0.36, bottom - bodyH);
  c.closePath();
  c.fill();
  c.stroke();

  c.fillStyle = "#ff8a5c";
  c.fillRect(cx - bodyW * 0.44, bottom - bodyH * 0.72, bodyW * 0.24, bodyH * 0.16);
  c.fillRect(cx + bodyW * 0.2, bottom - bodyH * 0.72, bodyW * 0.24, bodyH * 0.16);
  c.fillStyle = "#1b1c20";
  c.fillRect(cx - bodyW * 0.42, bottom - bodyH * 0.16, bodyW * 0.84, bodyH * 0.12);
  return canvas;
}
