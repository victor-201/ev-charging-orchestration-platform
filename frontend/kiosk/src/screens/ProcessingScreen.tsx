/**
 * EVOLTTOUCH Kiosk — Processing/Stopped Screen
 *
 * Shown during the transition from ACTIVE → BILLED.
 * Displays a premium loading animation while the backend:
 *   1. Stops the OCPP session
 *   2. Calculates final fees (energy + idle)
 *   3. Generates VNPay QR
 *
 * Business Function [22]: Stop session → billing.completed_v1
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

const ProcessingScreen: React.FC = () => {
  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col items-center justify-center gap-12"
    >
      {/* Ambient */}
      <div className="ambient-glow bg-[var(--warning)] opacity-[0.06] w-[50%] h-[50%] top-[0%] left-[25%]" />

      {/* Spinner complex */}
      <div className="relative w-40 h-40">
        {/* Outer ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--primary)] border-r-[var(--primary)]/30"
        />
        {/* Middle ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-4 rounded-full border-2 border-transparent border-t-[var(--secondary)] border-r-[var(--secondary)]/20"
        />
        {/* Inner orb */}
        <div className="absolute inset-8 glass rounded-full flex items-center justify-center">
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Zap size={28} className="text-[var(--primary)]" />
          </motion.div>
        </div>
      </div>

      {/* Text */}
      <div className="text-center space-y-3">
        <h2 className="text-4xl font-bold tracking-tight">Đang xử lý...</h2>
        <p className="text-[var(--text-secondary)] text-lg">
          Đang ngắt kết nối an toàn và tạo hóa đơn điện tử
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex flex-col gap-3 text-left">
        {[
          'Ngắt dòng điện an toàn',
          'Tính toán chi phí chính xác',
          'Tạo mã QR thanh toán',
        ].map((step, i) => (
          <motion.div
            key={step}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.4 }}
            className="flex items-center gap-3"
          >
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.4 }}
              className="w-2 h-2 rounded-full bg-[var(--primary)]"
            />
            <span className="text-sm text-[var(--text-secondary)] font-medium">{step}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default ProcessingScreen;
