import 'package:image_picker/image_picker.dart';

class CloudinaryService {
  final ImagePicker _picker = ImagePicker();

  Future<XFile?> pickAvatarImage() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 512,
        maxHeight: 512,
        imageQuality: 85,
      );
      return image;
    } catch (e) {
      // ignore: avoid_print
      print('[CloudinaryService] Error picking image: $e');
    }
    return null;
  }
}
