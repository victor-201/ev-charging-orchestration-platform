import { Inject, Injectable } from '@nestjs/common';
import { USER_PROFILE_REPOSITORY, IUserProfileRepository } from '../../domain/repositories/user-profile.repository.interface';
import { CloudinaryService } from '../../infrastructure/cloudinary/cloudinary.service';

@Injectable()
export class UploadAvatarUseCase {
  constructor(
    @Inject(USER_PROFILE_REPOSITORY) private readonly profileRepo: IUserProfileRepository,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async execute(userId: string, buffer: Buffer, mimetype: string): Promise<string> {
    const { secureUrl, publicId } = await this.cloudinary.uploadImage(buffer, mimetype);

    const profile = await this.profileRepo.findByUserId(userId);
    if (profile?.avatarUrl) {
      const oldPublicId = this.cloudinary.extractPublicIdFromUrl(profile.avatarUrl);
      if (oldPublicId && oldPublicId !== publicId) {
        await this.cloudinary.deleteImage(oldPublicId);
      }
    }

    if (profile) {
      profile.update({ avatarUrl: secureUrl });
      await this.profileRepo.upsert(profile);
    }

    return secureUrl;
  }
}
