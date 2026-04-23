import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Server, User, Lock, Key, Plug, Save,
  Terminal, Loader2, Globe, Trash2, AlertTriangle,
} from 'lucide-react';

export interface EditNodeFormData {
  displayName: string;
  ipAddress:   string;
  username:    string;
  port:        string;
  region:      string;
  authType:    'password' | 'privateKey';
  credential:  string; // leave blank to keep existing
}

interface Props {
  isOpen:   boolean;
  nodeId:   string;
  initial:  Omit<EditNodeFormData, 'credential'>;
  onClose:  () => void;
  onSave:   (id: string, data: EditNodeFormData) => Promise<void>;
  onTest:   (data: EditNodeFormData) => Promise<{ success: boolean; message: string }>;
  onDelete: (id: string) => Promise<void>;
}

const REGIONS = [
  'US-East-1','US-East-2','US-West-1','US-West-2',
  'EU-West-1','EU-West-2','EU-Central-1',
  'AP-Southeast-1','AP-Southeast-2','AP-Northeast-1',
  'SA-East-1','CA-Central-1','AU-East-2',
];

export default function EditNodeModal({ isOpen, nodeId, initial, onClose, onSave, onTest, onDelete }: Props) {
  const [form, setForm] = useState<EditNodeFormData>({ ...initial, credential: '' });
  const [testStatus, setTestStatus]   = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting,  setIsTesting]    = useState(false);
  const [isSaving,   setIsSaving]     = useState(false);
  const [isDeleting, setIsDeleting]   = useState(false);
  const [confirmDel, setConfirmDel]   = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...initial, credential: '' });
      setTestStatus(null);
      setConfirmDel(false);
    }
  }, [isOpen, nodeId]);

  const set = (key: keyof EditNodeFormData, val: string) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setTestStatus(null);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await onTest(form);
      setTestStatus(res);
    } catch (e: any) {
      setTestStatus({ success: false, message: e?.message || 'Test failed.' });
    } finally { setIsTesting(false); }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(nodeId, form);
      onClose();
    } catch (e: any) {
      setTestStatus({ success: false, message: e?.message || 'Failed to save.' });
    } finally { setIsSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setIsDeleting(true);
    try {
      await onDelete(nodeId);
      onClose();
    } catch (e: any) {
      setTestStatus({ success: false, message: e?.message || 'Delete failed.' });
    } finally { setIsDeleting(false); }
  };

  const inputClass = 'w-full bg-[#0D0D0D] border border-[#1F1F1F] focus:border-neon-lime outline-none text-white text-sm px-4 py-2.5 rounded-lg transition-colors placeholder:text-gray-600 font-mono';
  const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500 mb-1.5';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="edit-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="edit-modal"
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.94, y: 24 }}
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
                      <h2 className="text-base font-bold text-white tracking-tight">Node Settings</h2>
                      <p className="text-[10px] text-gray-500 uppercase tracking-[0.18em] font-bold mt-0.5">
                        {initial.displayName}
                      </p>
                    </div>
                  </div>
                  <button onClick={onClose} className="text-gray-600 hover:text-neon-lime transition-colors p-1.5 rounded-lg hover:bg-neon-lime/5">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Form body */}
              <div className="px-8 py-6 space-y-4 max-h-[60vh] overflow-y-auto">

                {/* Display Name */}
                <div>
                  <label className={labelClass}>Display Name</label>
                  <div className="relative">
                    <Terminal size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input type="text" value={form.displayName} onChange={e => set('displayName', e.target.value)}
                      className={`${inputClass} pl-9`} placeholder="e.g. Production Alpha" />
                  </div>
                </div>

                {/* IP + Port */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={labelClass}>IP Address / Hostname</label>
                    <div className="relative">
                      <Plug size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                      <input type="text" value={form.ipAddress} onChange={e => set('ipAddress', e.target.value)}
                        className={`${inputClass} pl-9`} placeholder="192.168.1.100" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>SSH Port</label>
                    <input type="number" value={form.port} onChange={e => set('port', e.target.value)}
                      className={inputClass} placeholder="22" />
                  </div>
                </div>

                {/* Username + Region */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>SSH Username</label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                      <input type="text" value={form.username} onChange={e => set('username', e.target.value)}
                        className={`${inputClass} pl-9`} placeholder="root" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Region</label>
                    <div className="relative">
                      <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                      <select value={form.region} onChange={e => set('region', e.target.value)}
                        className={`${inputClass} pl-9 appearance-none`}>
                        {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Auth type */}
                <div>
                  <label className={labelClass}>Auth Type</label>
                  <div className="flex gap-2">
                    {(['password', 'privateKey'] as const).map(type => (
                      <button key={type} onClick={() => set('authType', type)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition-all ${
                          form.authType === type
                            ? 'bg-neon-lime/10 border-neon-lime/50 text-neon-lime'
                            : 'border-[#1F1F1F] text-gray-500 hover:border-gray-600 hover:text-gray-300'
                        }`}>
                        {type === 'password' ? <Lock size={12} /> : <Key size={12} />}
                        {type === 'password' ? 'Password' : 'Private Key'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Credential */}
                <div>
                  <label className={labelClass}>
                    {form.authType === 'password' ? 'New Password' : 'New Private Key (PEM)'}
                    <span className="ml-2 text-gray-600 normal-case tracking-normal font-normal">(leave blank to keep existing)</span>
                  </label>
                  <textarea
                    rows={form.authType === 'privateKey' ? 4 : 2}
                    placeholder={form.authType === 'password' ? '••••••••' : '-----BEGIN RSA PRIVATE KEY-----\n...'}
                    value={form.credential}
                    onChange={e => set('credential', e.target.value)}
                    className={`${inputClass} resize-none leading-relaxed`}
                  />
                </div>

                {/* Test result */}
                <AnimatePresence>
                  {testStatus && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
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

                {/* Danger zone */}
                <div className="pt-2 border-t border-[#1A1A1A]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-500/60 mb-2">Danger Zone</p>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40 ${
                      confirmDel
                        ? 'bg-red-600 border-red-500 text-white hover:bg-red-500'
                        : 'border-red-500/30 text-red-400 hover:border-red-500 hover:bg-red-500/5'
                    }`}
                  >
                    {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    {isDeleting ? 'Deleting...' : confirmDel ? '⚠ Confirm Delete' : 'Delete Node'}
                    {confirmDel && !isDeleting && <AlertTriangle size={13} />}
                  </button>
                  {confirmDel && (
                    <p className="text-[10px] text-red-400/70 text-center mt-1.5">
                      Click again to permanently remove this node.{' '}
                      <button className="underline" onClick={() => setConfirmDel(false)}>Cancel</button>
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="relative px-8 py-5 border-t border-[#1A1A1A] flex items-center justify-between gap-3">
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-neon-lime/20 to-transparent" />

                <button onClick={handleTest} disabled={isTesting || isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-neon-lime/30 text-neon-lime text-xs font-bold uppercase tracking-widest hover:bg-neon-lime/5 transition-all disabled:opacity-40">
                  {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </button>

                <div className="flex items-center gap-2">
                  <button onClick={onClose}
                    className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white border border-[#1F1F1F] hover:border-gray-600 transition-all">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={isSaving || isTesting || !form.displayName || !form.ipAddress || !form.username}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-neon-lime text-black text-xs font-bold uppercase tracking-widest hover:bg-[#BDE600] transition-all neon-glow disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {isSaving ? 'Saving...' : 'Save Changes'}
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
