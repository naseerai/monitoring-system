import { useState } from 'react';
import { Shield, Eye, EyeOff, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage({ onBackToLanding }: { onBackToLanding: () => void }) {
  const { signIn } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <div className="min-h-screen bg-neon-dark flex items-center justify-center relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-neon-lime/8 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-neon-lime/4 blur-[120px] rounded-full pointer-events-none" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'linear-gradient(rgba(212,255,0,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(212,255,0,0.07) 1px,transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-md mx-4">
        {/* Card */}
        <div className="bg-[#111111] border border-[#222] rounded-2xl p-8 shadow-[0_0_60px_rgba(212,255,0,0.06)]">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-xl bg-neon-lime/10 border border-neon-lime/30 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(212,255,0,0.2)]">
              <Shield size={28} className="text-neon-lime" />
            </div>
            <h1 className="text-2xl font-bold tracking-tighter text-white">MYACCESS</h1>
            <p className="text-[10px] text-gray-500 tracking-[0.3em] uppercase mt-1">Server Monitoring System</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#2A2A2A] focus:border-neon-lime/60 focus:ring-1 focus:ring-neon-lime/20 rounded-lg px-4 py-3 text-white text-sm outline-none transition-all placeholder-gray-600"
                placeholder="operator@domain.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-[#2A2A2A] focus:border-neon-lime/60 focus:ring-1 focus:ring-neon-lime/20 rounded-lg px-4 py-3 pr-12 text-white text-sm outline-none transition-all placeholder-gray-600"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 flex items-start gap-2">
                <Zap size={14} className="mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-neon-lime text-black font-bold py-3 rounded-lg text-sm tracking-wide transition-all hover:bg-[#BDE600] disabled:opacity-50 disabled:cursor-not-allowed neon-glow flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="animate-spin border-2 border-black/30 border-t-black rounded-full w-4 h-4" />
              ) : (
                'AUTHENTICATE'
              )}
            </button>
            <button
  type="button"
  onClick={onBackToLanding}
  className="w-full mt-3 border border-neon-lime/40 text-neon-lime font-semibold py-3 rounded-lg text-sm tracking-wide transition-all hover:bg-neon-lime/10"
>
  GO TO LANDING PAGE
</button>
          </form>

          <p className="text-center text-[10px] text-gray-600 mt-6 tracking-widest uppercase">
            Authorised Personnel Only
          </p>
        </div>
      </div>
    </div>
  );
}
