export async function compressImage(file: File): Promise<File> {
  try {
    if (
      !file.type.startsWith("image/") ||
      file.type === "image/svg+xml" ||
      file.type === "image/gif"
    ) {
      return file;
    }
    if (file.size < 200 * 1024) return file;

    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    const MAX_DIMENSION = 1920;
    let targetWidth = width;
    let targetHeight = height;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      targetWidth = Math.round(width * ratio);
      targetHeight = Math.round(height * ratio);
    }

    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.82,
    });

    if (blob.size >= file.size) return file;

    const nextName = file.name.replace(/\.[^.]+$/, ".jpg");
    return new File([blob], nextName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
