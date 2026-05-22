import '../../../../core/design_system/theme/app_colors.dart';

class StationMarkerSvgs {
  static String getSvg({
    required String status,
    required String text,
    bool isSelected = false,
  }) {
    String gradientId = 'grad_inactive';
    String stop1 = '#9CA3AF';
    String stop2 = '#4B5563';

    final cyanHex = AppColors.toHex(AppColors.primaryCyan);
    final limeHex = AppColors.toHex(AppColors.primaryLime);

    switch (status) {
      case 'closed':
        gradientId = 'grad_closed';
        stop1 = '#4B5563'; // Solid dark grey — Closed
        stop2 = '#4B5563';
        break;
      case 'active_full':
        gradientId = 'grad_active_full';
        stop1 = '#EF4444'; // Solid danger red — Fully occupied
        stop2 = '#EF4444';
        break;
      case 'active_empty':
        gradientId = 'grad_active_empty';
        stop1 = limeHex;   // Solid lime — All slots available
        stop2 = limeHex;
        break;
      case 'active_partial':
        gradientId = 'grad_active_partial';
        stop1 = cyanHex;   // Solid cyan — Some slots available
        stop2 = cyanHex;
        break;
      case 'maintenance':
        gradientId = 'grad_maint';
        stop1 = '#F59E0B'; // Solid amber — Under maintenance
        stop2 = '#F59E0B';
        break;
      case 'inactive':
      default:
        gradientId = 'grad_inactive';
        stop1 = '#9CA3AF'; // Solid grey — Inactive
        stop2 = '#9CA3AF';
        break;
    }

    // Determine font size
    String fontSize = text.length > 3 ? "10" : "14";
    if (text == 'CLOSE') fontSize = "12";
    if (text == 'MAINT') fontSize = "10";

    return '''
<svg width="72" height="92" viewBox="-6 -6 72 92" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="$gradientId" x1="30" y1="0" x2="30" y2="66" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="$stop1"/>
      <stop offset="50%" stop-color="$stop1"/>
      <stop offset="100%" stop-color="$stop2"/>
    </linearGradient>
  </defs>
  <!-- Ambient Shadow for selected pin -->
  \${isSelected ? '<circle cx="30" cy="30" r="28" fill="$stop1" fill-opacity="0.25"/>' : ''}
  <!-- Main Pin Body -->
  <path d="M30 80C30 80 60 52.4183 60 30C60 13.4315 46.5685 0 30 0C13.4315 0 0 13.4315 0 30C0 52.4183 30 80 30 80Z" fill="url(#$gradientId)"/>
  <!-- Highlight stroke when selected -->
  \${isSelected ? '<path d="M30 80C30 80 60 52.4183 60 30C60 13.4315 46.5685 0 30 0C13.4315 0 0 13.4315 0 30C0 52.4183 30 80 30 80Z" stroke="white" stroke-width="3" stroke-linecap="round"/>' : ''}
  <!-- Inner translucent circle -->
  <circle cx="30" cy="30" r="24" fill="white" fill-opacity="0.2"/>
  <!-- Decorative highlight ring -->
  <circle cx="30" cy="30" r="26" stroke="white" stroke-width="1.2" stroke-opacity="0.4"/>
  <!-- Charger Icon -->
  <rect x="23" y="16" width="10" height="16" rx="2" fill="white"/>
  <path d="M33 22H35C36.1046 22 37 22.8954 37 24V30C37 31.1046 36.1046 32 35 32H33" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
  <!-- Text representation of availability/state -->
  <text x="30" y="55" text-anchor="middle" font-family="Inter, sans-serif" font-weight="bold" font-size="$fontSize" fill="white">$text</text>
</svg>
''';
  }
}
