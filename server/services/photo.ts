import { crc32, deflateSync } from "zlib";

/**
 * Made up inspection photos for the demo lots that ship with the app.
 *
 * The completion rule says a device is not done until it has photo evidence,
 * and that holds for the older orders too. Rather than committing image files
 * to the repo, those orders get a small light box render generated at boot, so
 * the galleries have something real to show. None of this runs for a photo
 * somebody actually takes.
 */

const WIDTH = 320;
const HEIGHT = 240;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

function encodePng(pixels: Buffer, width: number, height: number): Buffer {
  // Every scanline starts with a filter type byte, and 0 means no filter.
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Distance from a point to a rounded rectangle, which gives us smooth edges. */
function roundedRectDistance(
  x: number,
  y: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  radius: number,
): number {
  const dx = Math.abs(x - cx) - (halfW - radius);
  const dy = Math.abs(y - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/**
 * Draws a device against a studio backdrop. The seed decides the body colour
 * and the angle, so every device in a lot ends up with its own photo.
 */
export function syntheticDevicePhoto(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  const bodyTone = 26 + (hash % 5) * 14;
  const tint = [
    [0, 0, 0],
    [6, 4, 14],
    [10, 8, 2],
    [2, 8, 10],
  ][(hash >>> 8) % 4];
  const lean = ((hash >>> 16) % 9) - 4;

  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  const cx = WIDTH / 2 + lean;
  const cy = HEIGHT / 2;
  const halfW = 46;
  const halfH = 92;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      // The backdrop is a soft vertical falloff with a pool of light behind the device.
      const vertical = y / HEIGHT;
      const pool = Math.max(0, 1 - Math.hypot(x - cx, y - cy * 0.9) / 200);
      let r = 232 - vertical * 46 + pool * 20;
      let g = 233 - vertical * 46 + pool * 20;
      let b = 236 - vertical * 44 + pool * 20;

      // Contact shadow under the device.
      const shadow = Math.max(0, 1 - Math.hypot((x - cx) / 74, (y - (cy + halfH - 4)) / 16));
      r -= shadow * 58;
      g -= shadow * 58;
      b -= shadow * 56;

      const distance = roundedRectDistance(x, y, cx, cy, halfW, halfH, 16);
      if (distance < 1) {
        // The body gets a diagonal sheen plus a brighter inset for the screen.
        const sheen = ((x - cx) * 0.55 + (y - cy) * 0.2) / halfW;
        const screen = roundedRectDistance(x, y, cx, cy, halfW - 5, halfH - 5, 12);
        const base = screen < 0 ? bodyTone + 16 : bodyTone;
        r = base + sheen * 26 + tint[0];
        g = base + sheen * 26 + tint[1];
        b = base + sheen * 28 + tint[2];

        // Specular highlight running down the left edge of the glass.
        const edge = Math.max(0, 1 - Math.abs(x - (cx - halfW + 7)) / 3);
        r += edge * 90;
        g += edge * 92;
        b += edge * 96;

        // Feather the outline so the silhouette does not go jagged.
        if (distance > 0) {
          const blend = distance;
          r = r * (1 - blend) + 210 * blend;
          g = g * (1 - blend) + 211 * blend;
          b = b * (1 - blend) + 214 * blend;
        }
      }

      const i = (y * WIDTH + x) * 3;
      pixels[i] = Math.max(0, Math.min(255, r));
      pixels[i + 1] = Math.max(0, Math.min(255, g));
      pixels[i + 2] = Math.max(0, Math.min(255, b));
    }
  }

  return `data:image/png;base64,${encodePng(pixels, WIDTH, HEIGHT).toString("base64")}`;
}
