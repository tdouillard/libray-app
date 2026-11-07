import { t } from "../i18n";

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_SIZE = 512;

/* Storage path of a user's photo. Must match the storage policies in supabase/schema.sql. */
export const avatarPath = (userId: string) => `${userId}/avatar.jpg`;

/* Returns a (translated) message describing the problem with a picked file, or "" when it can be used. */
export function avatarProblem(file: Pick<File, "type" | "size">): string {
  if (!AVATAR_TYPES.includes(file.type)) return t("account.photoType");
  if (file.size > AVATAR_MAX_BYTES) return t("account.photoSize");
  return "";
}

/* Redraws the picture as a centred square JPEG. Only pixels survive: EXIF/GPS metadata and any
   embedded content are dropped. Rejects if the file cannot be decoded. */
export async function toAvatarBlob(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = Object.assign(document.createElement("canvas"), { width: AVATAR_SIZE, height: AVATAR_SIZE });
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.88)
  );
}
