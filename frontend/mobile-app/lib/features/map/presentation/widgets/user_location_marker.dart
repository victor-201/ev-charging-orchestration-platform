import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_map/flutter_map.dart';

/// GPS User Location Map Marker Widget
///
/// Renders a radial glow pulse effect representing coordinates accuracy alongside
/// an orientation arrow calculated from active compass headings.
class UserLocationMarker extends StatelessWidget {
  final double? heading;

  const UserLocationMarker({
    super.key, 
    this.heading,
  });

  @override
  Widget build(BuildContext context) {
    // Query the active map rotation angle from the flutter_map camera.
    final mapRotation = MapCamera.of(context).rotation;
    
    // Rotate the SVG vector based on device heading minus the active map camera rotation to ensure correct geographic orientation.
    final angle = ((heading ?? 0.0) - mapRotation) * (3.1415926535 / 180);

    const svgString = '''
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="user_glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#3B82F6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="user_grad" x1="50" y1="30" x2="50" y2="70" gradientUnits="userSpaceOnUse">
      <stop stop-color="#60A5FA"/>
      <stop offset="1" stop-color="#2563EB"/>
    </linearGradient>
  </defs>
  <!-- Outer Glow Pulse -->
  <circle cx="50" cy="50" r="45" fill="url(#user_glow)"/>
  <!-- Main Circle White Border -->
  <circle cx="50" cy="50" r="22" fill="white" shadow="0 2 8 rgba(0,0,0,0.2)"/>
  <!-- Core Blue Dot -->
  <circle cx="50" cy="50" r="16" fill="url(#user_grad)"/>
  <!-- Directional Arrow (Triangle) - Luôn hiển thị -->
  <path d="M50 25L58 42H42L50 25Z" fill="#2563EB"/>
</svg>
''';

    return Transform.rotate(
      angle: angle,
      child: SvgPicture.string(
        svgString,
        width: 100,
        height: 100,
      ),
    );
  }
}
