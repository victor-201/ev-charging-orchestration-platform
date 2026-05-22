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

const ProcessingScreen: React.FC = () => {
  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col items-center justify-center gap-12 p-10"
    >
      {/* Ambient */}
      <div 
        className="ambient-glow w-[50%] h-[50%] top-[0%] left-[25%]" 
        style={{ background: 'var(--warning)', opacity: 0.08 }} 
      />

      {/* Spinner complex */}
      <div className="relative w-40 h-40 flex-shrink-0">
        {/* Outer ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{ borderTopColor: 'var(--primary)', borderRightColor: 'rgba(16, 191, 201, 0.3)' }}
        />
        {/* Middle ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-4 rounded-full border-2 border-transparent"
          style={{ borderTopColor: 'var(--secondary)', borderRightColor: 'rgba(154, 237, 87, 0.2)' }}
        />
        {/* Inner orb */}
        <div 
          className="absolute inset-8 rounded-full flex items-center justify-center overflow-hidden"
          style={{
            background: 'var(--card-bg)',
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            border: '1.5px solid var(--card-border)',
            boxShadow: '0 0 20px var(--cyan-glow)'
          }}
        >
          <div className="absolute inset-0" style={{ background: 'var(--sq-shine)' }} />
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="relative z-10"
          >
            <img src="/EVoltTouch.png" alt="EVoltTouch Logo" className="w-8 h-8 object-contain" />
          </motion.div>
        </div>
      </div>

      {/* Text */}
      <div className="text-center space-y-3 relative z-10">
        <h2 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Đang xử lý...</h2>
        <p className="text-lg" style={{ color: 'var(--text-faded)' }}>
          Đang ngắt kết nối an toàn và tạo hóa đơn điện tử
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex flex-col gap-3 text-left relative z-10">
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
              className="w-2 h-2 rounded-full"
              style={{ background: 'var(--primary)' }}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--text-faded)' }}>{step}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default ProcessingScreen;
