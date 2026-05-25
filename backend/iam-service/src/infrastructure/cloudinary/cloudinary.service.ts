import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get('CLOUDINARY_API_KEY'),
      api_secret: this.config.get('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadImage(
    buffer: Buffer,
    mimetype: string,
    folder = 'avatars',
  ): Promise<{ secureUrl: string; publicId: string }> {
    const b64 = `data:${mimetype};base64,${buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(b64, {
      folder,
      transformation: [{ width: 512, height: 512, crop: 'limit', quality: 'auto' }],
    });

    return { secureUrl: result.secure_url, publicId: result.public_id };
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (e) {
      this.logger.warn(`Failed to delete Cloudinary image ${publicId}: ${e}`);
    }
  }

  extractPublicIdFromUrl(url: string): string | null {
    if (!url) return null;
    try {
      const segments = url.split('/');
      const uploadIndex = segments.indexOf('upload');
      if (uploadIndex === -1 || uploadIndex + 1 >= segments.length) return null;
      const relevant = segments.slice(uploadIndex + 1).join('/');
      const withoutVersion = relevant.replace(/^v\d+\//, '');
      return withoutVersion.replace(/\.[^.]+$/, '');
    } catch {
      return null;
    }
  }
}
