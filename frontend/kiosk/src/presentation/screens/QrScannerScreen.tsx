/**
 * EVOLTTOUCH Kiosk — QR Scanner Screen (Flow 1: Pre-booked)
 *
 * The KIOSK scans the QR code displayed on the USER'S PHONE.
 * The QR contains a short-lived JWT (qrToken) with { bookingId, userId }.
 *
 * Steps:
 *   1. User opens their app → Booking Detail → shows QR (booking JWT)
 *   2. User holds phone in front of kiosk camera
 *   3. This screen decodes the JWT via camera
 *   4. Calls startBookingSession(bookingId, qrToken) → POST /charging/start
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";
import { QrCode, CheckCircle, XCircle, RotateCcw, Smartphone } from "lucide-react";

interface QrScannerScreenProps {
  onScanSuccess: (bookingId: string, qrToken: string) => void;
  onCancel: () => void;
}

type ScanState = "SCANNING" | "SUCCESS" | "ERROR";

// Minimal JWT decode (no verify — server verifies)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

const QrScannerScreen: React.FC<QrScannerScreenProps> = ({
  onScanSuccess,
  onCancel,
}) => {
  const scannerContainerId = "kiosk-qr-scanner";
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scanState, setScanState] = useState<ScanState>("SCANNING");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [scannedData, setScannedData] = useState<{
    bookingId: string;
    qrToken: string;
  } | null>(null);

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      if (scanState !== "SCANNING") return;

      // Stop scanner immediately
      scannerRef.current?.clear().catch(() => {});

      // The QR in the user's app contains the raw JWT token (qrToken)
      const rawToken = decodedText.trim();

      // Attempt to decode payload to extract bookingId
      const payload = decodeJwtPayload(rawToken);

      if (!payload || typeof payload.bookingId !== "string") {
        setScanState("ERROR");
        setErrorMsg(
          "Mã QR không hợp lệ. Vui lòng yêu cầu khách mở ứng dụng → Đặt lịch → Chi tiết lịch."
        );
        return;
      }

      const bookingId = payload.bookingId as string;
      setScanState("SUCCESS");
      setScannedData({ bookingId, qrToken: rawToken });

      // Slight delay for success animation, then start session
      setTimeout(() => {
        onScanSuccess(bookingId, rawToken);
      }, 1200);
    },
    [scanState, onScanSuccess]
  );

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      scannerContainerId,
      {
        fps: 10,
        qrbox: { width: 320, height: 320 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true,
        aspectRatio: 1.0,
      },
      false // verbose
    );

    scanner.render(handleScanSuccess, (errorMsg) => {
      // Suppress continuous "No QR code" errors — they are expected
      if (!errorMsg.includes("No MultiFormat Readers")) {
        console.debug("[KioskQR] scan error:", errorMsg);
      }
    });

    scannerRef.current = scanner;

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [handleScanSuccess]);

  const handleRetry = () => {
    setScanState("SCANNING");
    setErrorMsg("");
    setScannedData(null);
    // Re-render scanner
    scannerRef.current?.clear().catch(() => {});
    const scanner = new Html5QrcodeScanner(
      scannerContainerId,
      {
        fps: 10,
        qrbox: { width: 320, height: 320 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true,
        aspectRatio: 1.0,
      },
      false
    );
    scanner.render(handleScanSuccess, () => {});
    scannerRef.current = scanner;
  };

  return (
    <motion.div
      key="scan-qr"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="flex-1 flex flex-col h-full p-10"
    >
      {/* Ambient glow */}
      <div
        className="ambient-glow w-[40%] h-[40%] top-[-5%] left-[-5%]"
        style={{ background: "var(--primary)", opacity: 0.06 }}
      />
      <div
        className="ambient-glow w-[30%] h-[30%] bottom-[-5%] right-[-5%]"
        style={{ background: "var(--secondary)", opacity: 0.05 }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-[20px] flex items-center justify-center"
            style={{
              background: "var(--card-bg)",
              backdropFilter: "blur(40px)",
              border: "1.5px solid var(--card-border)",
              boxShadow: "0 0 20px var(--cyan-glow)",
            }}
          >
            <QrCode size={26} style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h1
              className="text-2xl font-black tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Xác thực đặt lịch
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Hướng camera vào mã QR trên điện thoại khách hàng
            </p>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="glass-pill px-5 py-2.5 flex items-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
        >
          <RotateCcw size={14} />
          <span className="text-sm font-semibold">Quay lại</span>
        </button>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-center justify-between gap-12">
        {/* Left: Scanner */}
        <div className="flex-1 flex flex-col items-center gap-6">
          <AnimatePresence mode="wait">
            {scanState === "SCANNING" && (
              <motion.div
                key="scanner"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative"
              >
                {/* Scanner container styled */}
                <div
                  className="overflow-hidden"
                  style={{
                    borderRadius: "24px",
                    border: "2px solid var(--primary)",
                    boxShadow: "0 0 30px var(--cyan-glow)",
                  }}
                >
                  <div
                    id={scannerContainerId}
                    style={{ width: "380px", maxWidth: "100%" }}
                  />
                </div>

                {/* Pulsing ring */}
                <motion.div
                  animate={{ scale: [1, 1.04, 1], opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-3xl pointer-events-none"
                  style={{ border: "2px solid var(--primary)" }}
                />
              </motion.div>
            )}

            {scanState === "SUCCESS" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.4 }}
                >
                  <CheckCircle size={96} style={{ color: "var(--success)" }} />
                </motion.div>
                <p
                  className="text-xl font-black"
                  style={{ color: "var(--text-primary)" }}
                >
                  Xác thực thành công!
                </p>
                <p
                  className="text-sm text-center"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Đang khởi động phiên sạc...
                </p>
                {scannedData && (
                  <div
                    className="px-4 py-2 rounded-xl text-xs font-mono"
                    style={{
                      background: "var(--pill-bg)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Booking: {scannedData.bookingId}
                  </div>
                )}
              </motion.div>
            )}

            {scanState === "ERROR" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <XCircle size={96} style={{ color: "var(--danger)" }} />
                <p
                  className="text-xl font-black"
                  style={{ color: "var(--text-primary)" }}
                >
                  Không nhận diện được mã
                </p>
                <p
                  className="text-sm text-center max-w-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {errorMsg}
                </p>
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
                    color: "#fff",
                    border: "none",
                  }}
                >
                  <RotateCcw size={16} />
                  Thử lại
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Instructions */}
        <div
          className="w-80 flex flex-col gap-5 p-7 rounded-[28px] border"
          style={{
            background: "var(--card-bg)",
            backdropFilter: "blur(40px)",
            border: "1.5px solid var(--card-border)",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div className="flex items-center gap-3">
            <Smartphone size={20} style={{ color: "var(--primary)" }} />
            <h3
              className="font-black text-base"
              style={{ color: "var(--text-primary)" }}
            >
              Hướng dẫn khách hàng
            </h3>
          </div>

          {[
            {
              step: "1",
              text: "Mở ứng dụng EV Charging trên điện thoại",
            },
            {
              step: "2",
              text: 'Vào mục "Đặt lịch" → chọn lịch đã đặt',
            },
            {
              step: "3",
              text: "Mở màn hình chi tiết và hiện mã QR",
            },
            {
              step: "4",
              text: "Đặt điện thoại trước camera kiosk",
            },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
                }}
              >
                {step}
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {text}
              </p>
            </div>
          ))}

          <div
            className="mt-2 p-3 rounded-xl text-xs leading-relaxed"
            style={{
              background: "var(--pill-bg)",
              color: "var(--text-muted)",
              border: "1px solid var(--pill-border)",
            }}
          >
            💡 Mã QR chỉ có hiệu lực từ 15 phút trước đến 5 phút sau giờ đặt.
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default QrScannerScreen;
