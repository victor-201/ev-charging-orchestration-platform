'use client';

import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import Portal from '@/core/components/ui/Portal';

interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function GlassModal({ open, onClose, children, className = '' }: GlassModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`relative overflow-hidden rounded-[28px] border shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto ${className}`}
              style={{
                background: 'var(--card-bg)',
                backdropFilter: 'blur(60px)',
                WebkitBackdropFilter: 'blur(60px)',
                border: '1.5px solid var(--card-border)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--sq-shine)' }} />

              <div className="corner-marker cm-tl" />
              <div className="corner-marker cm-tr" />
              <div className="corner-marker cm-bl" />
              <div className="corner-marker cm-br" />

              <div className="relative z-10 p-6">
                {children}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

export function ModalHeader({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b pb-3 mb-4" style={{ borderColor: 'var(--card-border)' }}>
      <div className="flex items-center gap-2.5">
        {children}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-faded)' }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold" style={{ color: 'var(--text-faded)' }}>{label}</label>
      {children}
    </div>
  );
}

export function ModalValue({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-sm font-medium ${className}`} style={{ color: 'var(--text-main)' }}>
      {children}
    </div>
  );
}

export function ModalCopyValue({ text, onCopy }: { text: string; onCopy?: () => void }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer transition-colors text-xs font-mono"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        onCopy?.();
      }}
    >
      <span className="truncate pr-2" style={{ color: 'var(--text-main)' }}>{text}</span>
      <span className="shrink-0 text-[10px] font-semibold" style={{ color: 'var(--text-faded)' }}>Sao chép</span>
    </div>
  );
}
