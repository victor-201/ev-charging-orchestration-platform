/**
 * EVOLTTOUCH Kiosk — Error Screen
 *
 * Displayed when API calls fail or unexpected errors occur.
 * Provides a retry option and support code.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw, Phone } from 'lucide-react';

interface ErrorScreenProps {
  message: string;
  onRetry: () => void;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ message, onRetry }) => {
  const errorCode = `ERR-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  return (
    <motion.div
      key="error"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="flex-1 flex flex-col items-center justify-center gap-10"
    >
      {/* Danger ambient */}
      <div className="ambient-glow bg-[var(--danger)] opacity-[0.08] w-[50%] h-[50%] top-[10%] left-[25%]" />

      {/* Icon */}
      <motion.div
        animate={{ rotate: [-2, 2, -2] }}
        transition={{ duration: 0.5, repeat: 3, ease: 'easeInOut' }}
        className="w-24 h-24 rounded-3xl flex items-center justify-center"
        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
      >
        <AlertTriangle size={44} className="text-[var(--danger)]" />
      </motion.div>

      {/* Text */}
      <div className="text-center space-y-3 max-w-lg">
        <h2 className="text-5xl font-black tracking-tight text-gradient-warm">Lỗi hệ thống</h2>
        <p className="text-[var(--text-secondary)] text-lg leading-relaxed">
          {message || 'Đã xảy ra lỗi không xác định. Vui lòng thử lại hoặc liên hệ hỗ trợ.'}
        </p>
        <p className="text-xs font-mono text-[var(--text-muted)] mt-2">{errorCode}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-5">
        <button className="btn-primary flex items-center gap-3" onClick={onRetry}>
          <RotateCcw size={18} />
          Thử lại
        </button>
        <button className="btn-secondary flex items-center gap-3">
          <Phone size={18} />
          Hỗ trợ: 1900-0000
        </button>
      </div>
    </motion.div>
  );
};

export default ErrorScreen;
