import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = false
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-[#151921] border border-[#2D343F] rounded-xl shadow-2xl z-[9999] overflow-hidden"
          >
            <div className="p-5 border-b border-white/5 flex items-start gap-4">
              <div className={`p-2 rounded-xl ${isDestructive ? 'bg-red-500/10' : 'bg-blue-500/10'}`}>
                <AlertTriangle className={`w-5 h-5 ${isDestructive ? 'text-red-400' : 'text-blue-400'}`} />
              </div>
              <div className="flex-1 mt-0.5">
                <h2 className="text-sm font-bold text-white mb-1">{title}</h2>
                <p className="text-xs text-slate-400 leading-relaxed">{message}</p>
              </div>
              <button 
                onClick={onCancel}
                className="p-1 -mt-1 -mr-1 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 bg-black/20 flex justify-end gap-2 border-t border-white/5">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 rounded-lg transition-colors border border-transparent"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors border ${
                  isDestructive 
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border-red-500/30 hover:border-red-500' 
                    : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white border-blue-500/30 hover:border-blue-500'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
};
