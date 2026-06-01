/// Validates QR codes against ocpp dynamic timing bounds
class QrValidator {
  QrValidator._();

  /// Walk-in charger QR: EVCHARGER-{UUID} encoded on physical charger pole
  /// This is the QR the USER'S APP scans from the physical charger/kiosk.
  static final _chargerPattern =
      RegExp(r'^EVCHARGER-[0-9a-fA-F-]{36}$');

  /// Booking QR: EV-{8-char bookingId}-{16-char random hex}
  /// This is the JWT-derived QR displayed in the USER'S APP for the KIOSK to scan.
  static final _pattern =
      RegExp(r'^EV-[A-Za-z0-9]{8}-[A-Fa-f0-9]{16}$');

  /// Validates booking QR format (displayed on app, scanned by kiosk)
  static bool isValidFormat(String qrCode) => _pattern.hasMatch(qrCode);

  /// Validates charger QR format (on physical pole, scanned by user app)
  static bool isChargerQr(String qrCode) => _chargerPattern.hasMatch(qrCode);

  /// Returns true for booking QR (app shows → kiosk scans)
  static bool isBookingQr(String qrCode) => _pattern.hasMatch(qrCode);

  /// Extracts chargerId from a charger pole QR code: EVCHARGER-{uuid}
  static String? extractChargerId(String qrCode) {
    if (!isChargerQr(qrCode)) return null;
    return qrCode.replaceFirst('EVCHARGER-', '');
  }

  /// Validates request lands inside reservation activation limits
  /// Valid range: startTime - 15 minutes to endTime + 5 minutes
  static bool isWithinWindow(DateTime startTime, DateTime endTime) {
    final now = DateTime.now();
    final validFrom = startTime.subtract(const Duration(minutes: 15));
    final validUntil = endTime.add(const Duration(minutes: 5));
    return now.isAfter(validFrom) && now.isBefore(validUntil);
  }

  /// Time remaining until the activation window opens
  static Duration? timeUntilWindowOpens(DateTime startTime) {
    final validFrom = startTime.subtract(const Duration(minutes: 15));
    final now = DateTime.now();
    if (now.isBefore(validFrom)) {
      return validFrom.difference(now);
    }
    return null; // Active
  }

  /// Time remaining until the activation window closes
  static Duration? timeUntilWindowCloses(DateTime endTime) {
    final validUntil = endTime.add(const Duration(minutes: 5));
    final now = DateTime.now();
    if (now.isBefore(validUntil)) {
      return validUntil.difference(now);
    }
    return null; // Expired
  }

  /// Evaluates current activation window state
  static QrWindowStatus windowStatus(
      DateTime startTime, DateTime endTime) {
    final now = DateTime.now();
    final validFrom = startTime.subtract(const Duration(minutes: 15));
    final validUntil = endTime.add(const Duration(minutes: 5));

    if (now.isBefore(validFrom)) return QrWindowStatus.notYetValid;
    if (now.isAfter(validUntil)) return QrWindowStatus.expired;
    return QrWindowStatus.valid;
  }
}

enum QrWindowStatus { notYetValid, valid, expired }
