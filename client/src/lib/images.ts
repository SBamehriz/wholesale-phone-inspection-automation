/** Longest edge of a stored inspection photo. */
const MAX_EDGE = 1280;
const QUALITY = 0.72;

/**
 * Shrinks and re encodes a photo before it leaves the browser.
 *
 * These are evidence of condition, not product shots. A 1280px JPEG shows a
 * hairline crack perfectly well and keeps the whole gallery for one device
 * down to a few hundred kilobytes instead of a few dozen megabytes.
 */
export async function toStoredImage(source: Blob): Promise<string> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot process images");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    bitmap.close();
  }
}

export function captureFrame(video: HTMLVideoElement): Promise<string> {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);

  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("This browser cannot capture frames"));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return Promise.resolve(canvas.toDataURL("image/jpeg", QUALITY));
}
