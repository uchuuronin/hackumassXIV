// A picture of her screen, for "What is this?" and "What am I looking at?". Owner: C.
// Runs in the background worker, the only part of Milo allowed to take one. The panel asks the page
// first (src/guide/pagewords.ts, mayLook) and never asks for a picture of a private page.
//
// The picture is shrunk to at most 1280 pixels wide and sent as a JPEG of about 150 to 250 KB. It goes
// to Gemini through the relay, is used for that one question, and is not kept anywhere.

const WIDEST = 1280;

function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export async function takePicture(capture: (windowId: number) => Promise<string>, windowId: number): Promise<{ ok: boolean; image?: string }> {
  try {
    const dataUrl = await capture(windowId);
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, WIDEST / bitmap.width);
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
    return { ok: true, image: base64(new Uint8Array(await jpeg.arrayBuffer())) };
  } catch (err) {
    console.error('[Milo] could not take a picture of the page', err);
    return { ok: false };
  }
}
