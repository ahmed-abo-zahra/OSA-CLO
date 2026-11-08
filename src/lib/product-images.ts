import 'server-only';
import { randomUUID } from 'node:crypto';
import { DEMO_MODE } from './demo-mode';
import { saveDemoImage } from './demo-upload';
import { supabaseAdmin } from './supabase-admin';

const MAX_IMAGE_SIZE = 3_500_000;
const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', isValid: (bytes: Buffer) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/png': { extension: 'png', isValid: (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extension: 'webp', isValid: (bytes: Buffer) => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' },
} as const;

export async function uploadProductImage(file: File, partnerId: string): Promise<string> {
  if (!file || file.size <= 0) throw new Error('Choose a non-empty image file.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('Images must be 3.5 MB or smaller.');

  const imageType = IMAGE_TYPES[file.type as keyof typeof IMAGE_TYPES];
  if (!imageType) throw new Error('Upload a JPEG, PNG, or WebP image.');

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!imageType.isValid(bytes)) throw new Error('The uploaded file does not match its image type.');
  if (DEMO_MODE) return saveDemoImage(file);

  const path = `${partnerId}/${randomUUID()}.${imageType.extension}`;
  const { data, error } = await supabaseAdmin.storage
    .from('product-images')
    .upload(path, bytes, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error || !data) {
    console.error('[product-images] upload failed:', { code: error?.statusCode });
    throw new Error('Image upload failed. Please try again.');
  }

  const { data: publicUrl } = supabaseAdmin.storage.from('product-images').getPublicUrl(data.path);
  return publicUrl.publicUrl;
}
