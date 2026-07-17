// Client-side avatar upload via Cloudinary signed uploads. We ask our own
// /api/cloudinary-sign route for a signature (keeping the API secret on the
// server), then POST the file straight to Cloudinary so the image bytes never
// round-trip through our backend.

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * Validate and upload an avatar image, returning its secure Cloudinary URL.
 * Throws UploadError with a user-facing message on any validation or transport
 * failure.
 */
export async function uploadAvatar(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new UploadError('Please choose a JPEG, PNG, WebP, or GIF image.');
  }
  if (file.size > MAX_BYTES) {
    throw new UploadError('Image is too large — please keep it under 5 MB.');
  }

  let sign: {
    cloudName: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    folder: string;
    transformation: string;
  };
  try {
    const res = await fetch('/api/cloudinary-sign', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new UploadError(body.error || 'Could not start the upload.');
    }
    sign = await res.json();
  } catch (err) {
    if (err instanceof UploadError) throw err;
    throw new UploadError('Could not reach the upload service.');
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sign.apiKey);
  form.append('timestamp', String(sign.timestamp));
  form.append('signature', sign.signature);
  form.append('folder', sign.folder);
  form.append('transformation', sign.transformation);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
      { method: 'POST', body: form }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new UploadError(body?.error?.message || 'Upload failed. Please try again.');
    }
    const data = await res.json();
    if (!data.secure_url) {
      throw new UploadError('Upload succeeded but no image URL was returned.');
    }
    return data.secure_url as string;
  } catch (err) {
    if (err instanceof UploadError) throw err;
    throw new UploadError('Upload failed. Please try again.');
  }
}
