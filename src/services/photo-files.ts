/**
 * The picker and the resizer each leave a JPEG in the app cache: expo-image-picker 57 copies the photo there
 * (ios/MediaHandler.swift, android ImagePickerModule.kt) and ImageRef.saveAsync "saves the image to the file system
 * in the cache directory" (SDK 57 docs). Both are deleted once the base64 is read, so a meal photo outlives its one
 * request nowhere (ADR 0001). Expo SDK 57 file API (File).
 */
import { File } from 'expo-file-system';

export function deletePhotoFiles(uris: readonly string[]): void {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      /* not a file in this app's sandbox */
    }
  }
}
