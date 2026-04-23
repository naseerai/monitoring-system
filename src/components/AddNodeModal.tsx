import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Server, User, Lock, Key, Plug, Save, Terminal, Loader2 } from 'lucide-react';

export interface NodeFormData {
  displayName: string;
  ipAddress: string;
  username: string;
  port: string;
  authType: 'password' | 'privateKey';
  credential: string;
}

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: NodeFormData) => Promise<void>;
  onTest: (data: NodeFormData) => Promise<{ success: boolean; message: string }>;
}

const initialForm: NodeFormData = {
  displayName: '',
  ipAddress: '',
  username: '',
  port: '22',
  authType: 'password',
  credential: '',
};

export default function AddNodeModal({ isOpen, onClose, onSave, onTest }: AddNodeModalProps) {
  const [form, setForm] = useState<NodeFormData>(initialForm);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setForm(initialForm);
      setTestStatus(null);
    }
  }, [isOpen]);

  const updateField = (key: keyof NodeFormData, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setTestStatus(null);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const result = await onTest(form);
      setTestStatus(result);
    } catch (err: any) {
      const msg = err?.message || String(err) || 'Connection test failed unexpectedly.';
      console.error('[Modal] handleTest error:', err);
      setTestStatus({ success: false, message: `Network error: ${msg}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      setTestStatus({ success: false, message: err.message || 'Failed to save node.' });
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full bg-[#0D0D0D] border border-[#1F1F1F] focus:border-neon-lime outline-none text-white text-sm px-4 py-2.5 rounded-lg transition-colors placeholder:text-gray-600 font-mono';
  const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500 mb-1.5';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full max-w-lg bg-[#0A0A0A] border border-neon-lime/30 rounded-2xl shadow-[0_0_60px_rgba(212,255,0,0.12)] overflow-hidden">

              {/* Header */}
              <div className="relative px-8 pt-7 pb-5 border-b border-[#1A1A1A]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon-lime/50 to-transparent" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-neon-lime/10 p-2 rounded-lg border border-neon-lime/20 text-neon-lime">
                      <Server size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white tracking-tight">Add New Node</h2>
                      <p className="text-[10px] text-gray-500 uppercase tracking-[0.18em] font-bold mt-0.5">SSH Configuration</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-gray-600 hover:text-neon-lime transition-colors p-1.5 rounded-lg hover:bg-neon-lime/5"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Form */}
              <div className="px-8 py-6 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">

                {/* Row 1: Display Name */}
                <div>
                  <label className={labelClass}>Node Display Name</label>
                  <div className="relative">
                    <Terminal size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      id="node-display-name"
                      type="text"
                      placeholder="e.g. Production Alpha"
                      value={form.displayName}
                      onChange={e => updateField('displayName', e.target.value)}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </div>

                {/* Row 2: IP + Port */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={labelClass}>IP Address / Hostname</label>
                    <div className="relative">
                      <Plug size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                      <input
                        id="node-ip-address"
                        type="text"
                        placeholder="192.168.1.100"
                        value={form.ipAddress}
                        onChange={e => updateField('ipAddress', e.target.value)}
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>SSH Port</label>
                    <input
                      id="node-ssh-port"
                      type="number"
                      placeholder="22"
                      value={form.port}
                      onChange={e => updateField('port', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Row 3: Username */}
                <div>
                  <label className={labelClass}>SSH Username</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      id="node-ssh-username"
                      type="text"
                      placeholder="root"
                      value={form.username}
                      onChange={e => updateField('username', e.target.value)}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </div>

                {/* Row 4: Auth Type */}
                <div>
                  <label className={labelClass}>Auth Type</label>
                  <div className="flex gap-2">
                    {(['password', 'privateKey'] as const).map(type => (
                      <button
                        key={type}
                        id={`auth-type-${type}`}
                        onClick={() => updateField('authType', type)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition-all ${
                          form.authType === type
                            ? 'bg-neon-lime/10 border-neon-lime/50 text-neon-lime shadow-[0_0_12px_rgba(212,255,0,0.1)]'
                            : 'border-[#1F1F1F] text-gray-500 hover:border-gray-600 hover:text-gray-300'
                        }`}
                      >
                        {type === 'password' ? <Lock size={12} /> : <Key size={12} />}
                        {type === 'password' ? 'Password' : 'Private Key'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Row 5: Credential */}
                <div>
                  <label className={labelClass}>
                    {form.authType === 'password' ? 'Password' : 'Private Key (PEM)'}
                  </label>
                  <textarea
                    id="node-credential"
                    rows={form.authType === 'privateKey' ? 5 : 2}
                    placeholder={
                      form.authType === 'password'
                        ? 'Enter SSH password'
                        : '-----BEGIN RSA PRIVATE KEY-----\n...'
                    }
                    value={form.credential}
                    onChange={e => updateField('credential', e.target.value)}
                    className={`${inputClass} resize-none leading-relaxed`}
                  />
                </div>

                {/* Test Result */}
                <AnimatePresence>
                  {testStatus && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-xs font-mono ${
                        testStatus.success
                          ? 'bg-neon-lime/5 border-neon-lime/30 text-neon-lime'
                          : 'bg-red-500/5 border-red-500/30 text-red-400'
                      }`}
                    >
                      <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${testStatus.success ? 'bg-neon-lime' : 'bg-red-500'} animate-pulse`} />
                      <span>{testStatus.message}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 border-t border-[#1A1A1A] flex items-center justify-between gap-3">
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-neon-lime/20 to-transparent" />
                <button
                  id="btn-test-connection"
                  onClick={handleTest}
                  disabled={isTesting || isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-neon-lime/30 text-neon-lime text-xs font-bold uppercase tracking-widest hover:bg-neon-lime/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isTesting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plug size={14} />
                  )}
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    id="btn-cancel-node"
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white border border-[#1F1F1F] hover:border-gray-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-save-node"
                    onClick={handleSave}
                    disabled={isSaving || isTesting || !form.displayName || !form.ipAddress || !form.username}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-neon-lime text-black text-xs font-bold uppercase tracking-widest hover:bg-[#BDE600] transition-all neon-glow disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    {isSaving ? 'Saving...' : 'Save Node'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
