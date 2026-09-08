import { mimeForExt, sniffPictureExt } from "./picture-names";

export type PendingPic = { data: string; mime: string; preview: string };

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function isHeif(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  if (bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
  return ["heic", "heif", "mif1", "msf1", "heix", "hevc"].includes(brand);
}

function jpegFromDataUrl(dataUrl: string): Blob {
  const raw = dataUrl.split(",")[1] || "";
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

function canvasToJpeg(img: {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}): Promise<Blob> {
  const edge = Math.max(img.width, img.height, 1);
  const scale = Math.min(1, 1920 / edge);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Cannot draw picture"));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  img.draw(ctx, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b && b.size > 32) {
        resolve(b);
        return;
      }
      try {
        resolve(jpegFromDataUrl(canvas.toDataURL("image/jpeg", 0.84)));
      } catch {
        reject(new Error("Could not encode picture"));
      }
    }, "image/jpeg", 0.84);
  });
}

async function rasterToJpeg(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    try {
      const blob = await canvasToJpeg({
        width: bmp.width,
        height: bmp.height,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      });
      if (blob.size > 2_000_000) throw new Error("Picture is still over 2 MB");
      return blob;
    } finally {
      bmp.close();
    }
  } catch {
    /* Image() is more tolerant on Android gallery files */
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    const blob = await canvasToJpeg({
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      draw: (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h),
    });
    if (blob.size > 2_000_000) throw new Error("Picture is still over 2 MB");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function encodePicture(file: File): Promise<PendingPic> {
  const declared = (file.type || "").toLowerCase();
  if (declared.includes("svg") || declared.includes("xml")) throw new Error("SVG is not allowed");

  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (head[0] === 0x3c) throw new Error("SVG is not allowed");
  const sniffed = sniffPictureExt(head);

  if (sniffed === "gif" && file.size <= 2_000_000) {
    return { data: await blobToBase64(file), mime: mimeForExt("gif"), preview: URL.createObjectURL(file) };
  }

  try {
    const jpeg = await rasterToJpeg(file);
    return { data: await blobToBase64(jpeg), mime: "image/jpeg", preview: URL.createObjectURL(jpeg) };
  } catch (e) {
    if (e instanceof Error && e.message.includes("2 MB")) throw e;
    if (isHeif(head)) {
      throw new Error("This phone photo is HEIC. Save it as JPG or take a screenshot, then attach.");
    }
    throw new Error("Could not read that picture on this phone. Try a screenshot or a JPG.");
  }
}

export async function uploadPendingPictures(
  project: string,
  scope: "log" | "discussion",
  target: string,
  pics: PendingPic[],
): Promise<string[]> {
  const names: string[] = [];
  for (const p of pics) {
    const raw = atob(p.data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const r = await fetch(
      `/api/picture?project=${encodeURIComponent(project)}&scope=${encodeURIComponent(scope)}&target=${encodeURIComponent(target)}`,
      {
        method: "POST",
        headers: { "content-type": p.mime || "image/jpeg" },
        body: bytes,
      },
    );
    const j = (await r.json()) as { ok?: boolean; name?: string; error?: string };
    if (!r.ok || !j.name) throw new Error(j.error || `Picture upload HTTP ${r.status}`);
    names.push(j.name);
  }
  return names;
}
