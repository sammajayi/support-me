import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Signs a Cloudinary upload server-side so the API secret never ships to the
// browser. The client asks for a signature, then uploads the file directly to
// Cloudinary with it — the bytes never pass through our server.
//
// Needs three env vars (see .env.local.example):
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//
// We pin the upload to a fixed folder and let Cloudinary's incoming
// transformation downscale avatars, so a signed request can't be abused to
// dump arbitrary large assets elsewhere in the account.
const UPLOAD_FOLDER = 'supportme/avatars';
const INCOMING_TRANSFORM = 'c_limit,w_512,h_512';

export async function POST() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Image uploads are not configured on this deployment.' },
      { status: 501 }
    );
  }

  const timestamp = Math.round(Date.now() / 1000);

  // Cloudinary's signature is the SHA-1 of the signed params sorted by key and
  // joined as `k=v` pairs, with the API secret appended. Only params sent to
  // the upload endpoint (besides file, api_key, resource_type) are signed.
  const params: Record<string, string | number> = {
    folder: UPLOAD_FOLDER,
    timestamp,
    transformation: INCOMING_TRANSFORM,
  };

  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  const signature = crypto
    .createHash('sha1')
    .update(toSign + apiSecret)
    .digest('hex');

  return NextResponse.json({
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder: UPLOAD_FOLDER,
    transformation: INCOMING_TRANSFORM,
  });
}
