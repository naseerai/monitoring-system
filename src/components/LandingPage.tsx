import { useState, useEffect, useRef } from 'react';
import {
  Shield, Activity, Server, Terminal, Lock, CheckCircle,
  ChevronRight, Menu, X, Wifi, Box, Cpu, Database, ArrowRight
} from 'lucide-react';

interface Props {
  onNavigateToLogin: () => void;
}

export default function LandingPage({ onNavigateToLogin }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const scanRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouse({
        x: e.clientX,
        y: e.clientY,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  return (
    <div
      style={{
        background: '#050505',
        minHeight: '100vh',
        fontFamily: "'Space Grotesk', sans-serif",
        color: '#fff',
        overflowX: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: `
            radial-gradient(
              500px circle at ${mouse.x}px ${mouse.y}px,
              rgba(223,255,0,0.12),
              transparent 40%
            ),
            radial-gradient(
              700px circle at ${mouse.x}px ${mouse.y}px,
              rgba(0,200,255,0.08),
              transparent 55%
            )
          `,
          transition: 'background 0.08s linear',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');

        /* Scanning line animation */
        @keyframes scanDown {
          0%   { top: 0%; opacity: 0.8; }
          100% { top: 100%; opacity: 0; }
        }
        .scan-line {
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(223,255,0,0.6), transparent);
          box-shadow: 0 0 12px rgba(223,255,0,0.4);
          animation: scanDown 3s linear infinite;
          pointer-events: none;
          z-index: 10;
        }

        /* Pulse badge */
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
        }
        .pulse-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #22c55e;
          animation: pulse 2s ease-in-out infinite;
          display: inline-block;
        }

        /* Grid bg */
        .grid-bg {
          background-image:
            linear-gradient(rgba(223,255,0,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(223,255,0,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        /* Glow orbs */
        .glow-orb-1 {
          position: absolute; top: -100px; left: 50%;
          transform: translateX(-50%);
          width: 700px; height: 400px;
          background: radial-gradient(ellipse, rgba(223,255,0,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .glow-orb-2 {
          position: absolute; bottom: 0; left: 0;
          width: 400px; height: 400px;
          background: radial-gradient(ellipse, rgba(0,150,255,0.06) 0%, transparent 70%);
          pointer-events: none;
        }

        /* Feature card hover */
        .feature-card {
          border: 1px solid #1a1a1a;
          background: #0c0c0c;
          border-radius: 16px;
          padding: 28px;
          transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
          cursor: default;
        }
        .feature-card:hover {
          border-color: rgba(223,255,0,0.35);
          box-shadow: 0 0 30px rgba(223,255,0,0.08), inset 0 0 20px rgba(223,255,0,0.02);
          transform: translateY(-4px);
        }

        /* Glass card */
        .glass-card {
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
        }

        /* Sticky nav */
        .nav-sticky {
          position: fixed; top: 0; left: 0; right: 0;
          z-index: 100;
          transition: background 0.3s, border-color 0.3s, backdrop-filter 0.3s;
        }
        .nav-scrolled {
          background: rgba(5,5,5,0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid #1a1a1a;
        }

        /* CTA button */
        .btn-primary {
          background: #DFFF00;
          color: #000;
          font-weight: 700;
          border: none;
          padding: 12px 28px;
          border-radius: 10px;
          font-size: 14px;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s, transform 0.15s;
          white-space: nowrap;
        }
        .btn-primary:hover {
          background: #c8e600;
          box-shadow: 0 0 24px rgba(223,255,0,0.4);
          transform: translateY(-1px);
        }
        .btn-outline {
          background: transparent;
          color: #fff;
          font-weight: 600;
          border: 1px solid #333;
          padding: 12px 28px;
          border-radius: 10px;
          font-size: 14px;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: border-color 0.2s, box-shadow 0.2s;
          white-space: nowrap;
        }
        .btn-outline:hover {
          border-color: rgba(223,255,0,0.4);
          box-shadow: 0 0 16px rgba(223,255,0,0.08);
        }

        /* Tech row icon */
        .tech-icon {
          display: flex; align-items: center; gap: 10px;
          color: #888; font-size: 14px; font-weight: 500;
          padding: 10px 20px;
          border: 1px solid #1a1a1a;
          border-radius: 40px;
          transition: border-color 0.2s, color 0.2s;
        }
        .tech-icon:hover { border-color: #DFFF00; color: #DFFF00; }

        /* Terminal mac dots */
        .mac-dot { width: 12px; height: 12px; border-radius: 50%; }

        /* Responsive nav */
        @media (max-width: 768px) {
          .nav-links { display: none; }
          .nav-links.open {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 64px; left: 0; right: 0;
            background: rgba(5,5,5,0.97);
            border-bottom: 1px solid #1a1a1a;
            padding: 20px;
            gap: 16px;
          }
          .hero-title { font-size: clamp(36px, 8vw, 72px) !important; }
          .hero-graphic { margin-top: 40px; }
          .two-col { grid-template-columns: 1fr !important; }
          .stats-row { grid-template-columns: 1fr !important; gap: 12px !important; }
          .feature-grid { grid-template-columns: 1fr !important; }
          .tech-row { flex-wrap: wrap !important; justify-content: center !important; }
          .cta-buttons { flex-direction: column !important; align-items: center !important; }
          .footer-inner { flex-direction: column !important; align-items: center !important; gap: 16px !important; text-align: center !important; }
          .footer-links { justify-content: center !important; }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .float-anim { animation: float 4s ease-in-out infinite; }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className={`nav-sticky ${scrolled ? 'nav-scrolled' : ''}`}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'rgba(223,255,0,0.12)', border: '1px solid rgba(223,255,0,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={16} color="#DFFF00" />
            </div>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.12em', color: '#fff' }}>MYACCESS </span>
          </div>

          {/* Center links */}
          <div className={`nav-links ${menuOpen ? 'open' : ''}`} style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            {['Network', 'Nodes', 'Security', 'Docs', 'Pricing'].map(link => (
              <button key={link} onClick={() => scrollTo(link.toLowerCase())}
                style={{ background: 'none', border: 'none', color: '#999', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.2s', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#DFFF00')}
                onMouseLeave={e => (e.currentTarget.style.color = '#999')}>
                {link}
              </button>
            ))}
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* <button onClick={onNavigateToLogin}
              style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#DFFF00')}
              onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}>
              Operator Login
            </button> */}
            <button className="btn-primary" onClick={onNavigateToLogin} style={{ padding: '8px 20px', fontSize: 13 }}>
              Get Started
            </button>
            {/* Hamburger */}
            <button onClick={() => setMenuOpen(o => !o)}
              style={{ display: 'none', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}
              className="hamburger-btn">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <style>{`.hamburger-btn { display: none !important; } @media(max-width:768px){ .hamburger-btn { display: block !important; } .nav-sticky .nav-links:not(.open) { display: none !important; } }`}</style>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section id="network" className="grid-bg" style={{ position: 'relative', paddingTop: 140, paddingBottom: 80, overflow: 'hidden' }}>
        <div className="glow-orb-1" />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', textAlign: 'center', position: 'relative' }}>

          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 40, padding: '6px 14px', marginBottom: 28 }}>
            <span className="pulse-dot" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', letterSpacing: '0.06em' }}>v2.4 Engine Now Live</span>
          </div>

          {/* Headline */}
          <h1 className="hero-title" style={{ fontSize: 'clamp(40px, 6vw, 76px)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.02em', marginBottom: 24, background: 'linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.65) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Command Your Infrastructure<br />with Precision
          </h1>

          {/* Sub-headline */}
          <p style={{ fontSize: 17, color: '#666', maxWidth: 580, margin: '0 auto 44px', lineHeight: 1.7 }}>
            Sophisticated agent-less monitoring and high-fidelity server orchestration via secure SSH tunnels. No intrusive software, just pure technical authority.
          </p>

          {/* Hero CTA */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 72 }}>
            <button className="btn-primary" onClick={onNavigateToLogin} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Initialize Cluster <ArrowRight size={15} />
            </button>
            <button className="btn-outline">View Documentation</button>
          </div>

          {/* ── SENTRY SHELL TERMINAL ─────────────────────────────── */}
          <div className="hero-graphic float-anim" style={{ position: 'relative', borderRadius: 16, border: '1px solid #1e2e1e', overflow: 'hidden', boxShadow: '0 0 60px rgba(0,200,100,0.1), 0 40px 80px rgba(0,0,0,0.6)', maxWidth: 820, margin: '0 auto' }}>

            {/* Terminal title bar */}
            <div style={{ background: '#0d1a0d', borderBottom: '1px solid #1a2a1a', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mac-dot" style={{ background: '#ff5f57' }} />
              <span className="mac-dot" style={{ background: '#ffbd2e' }} />
              <span className="mac-dot" style={{ background: '#28ca41' }} />
              <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: '#3a5a3a', letterSpacing: '0.1em' }}>SENTRY-SHELL // DATA-CLUSTER</span>
            </div>

            {/* Circuit board background area */}
            <div ref={scanRef} style={{ position: 'relative', minHeight: 520, overflow: 'hidden' }}>
              <img src="/terminal.png" alt="circuit" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.99 }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,5,5,0.2) 0%, rgba(5,5,5,0.6) 100%)' }} />

              {/* Scanning line */}
              <div className="scan-line" />

              {/* Glassmorphism stat cards */}
              <div className="stats-row" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '40px 28px' }}>
                {[
                  { icon: <Wifi size={18} color="#DFFF00" />, label: 'ACTIVE TUNNELS', value: '1,402', color: '#DFFF00' },
                  { icon: <Activity size={18} color="#00c8ff" />, label: 'NETWORK LOAD', value: '42.8%', color: '#00c8ff' },
                  { icon: <Shield size={18} color="#22c55e" />, label: 'SOVEREIGN STATE', value: 'Verified', color: '#22c55e' },
                ].map(card => (
                  <div key={card.label} className="glass-card" style={{ padding: '20px 22px', textAlign: 'left' }}>
                    <div style={{ marginBottom: 10 }}>{card.icon}</div>
                    <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 6 }}>{card.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: card.color, letterSpacing: '-0.02em' }}>{card.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE GRID ────────────────────────────────────────────────── */}
      <section id="nodes" style={{ padding: '100px 24px', position: 'relative' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 12 }}>CAPABILITIES</p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>Built for Operators. Trusted by Architects.</h2>
          </div>
          <div className="feature-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              {
                icon: <Activity size={22} color="#DFFF00" />,
                title: 'Real-Time Monitoring',
                desc: 'Zero-latency metrics broadcast through encrypted channels, offering millisecond-level visibility into your distributed nodes.',
              },
              {
                icon: <Box size={22} color="#00c8ff" />,
                title: 'Docker Orchestration',
                desc: 'Seamless container management across barrier-less Ghost clusters. Deploy, scale, and update with cryptographic certainty.',
              },
              {
                icon: <Terminal size={22} color="#a78bfa" />,
                title: 'Interactive C&C',
                desc: 'A centralized Command & Control center providing an intuitive glass interface for complex infrastructure maneuvers.',
              },
            ].map(f => (
              <div key={f.title} className="feature-card">
                <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.04)', border: '1px solid #2a2a2a', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: '#f0f0f0' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY SPOTLIGHT ──────────────────────────────────────────── */}
      <section id="security" style={{ padding: '80px 24px', position: 'relative', overflow: 'hidden' }}>
        <div className="glow-orb-2" />
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
            {/* Left */}
            <div>
              <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 14 }}>SECURITY</p>
              <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 42px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 20, lineHeight: 1.15 }}>
                Sovereign Security<br />by Design
              </h2>
              <p style={{ fontSize: 15, color: '#666', lineHeight: 1.8, marginBottom: 36 }}>
                Neon Sentry is built on the principle of sovereign control. By leveraging Supabase for industrial-grade authentication and strict Role-Based Access Control (RBAC), your infrastructure remains entirely under your jurisdiction.
              </p>

              {[
                { icon: <Lock size={16} color="#DFFF00" />, title: 'End-to-End Encryption', desc: 'All telemetry and command data flows through AES-256 encrypted SSH2 tunnels.' },
                { icon: <Database size={16} color="#DFFF00" />, title: 'Supabase Integration', desc: 'Centralised identity management with instant revocation and granular permissions.' },
              ].map(item => (
                <div key={item.title} style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
                  <div style={{ width: 36, height: 36, background: 'rgba(223,255,0,0.08)', border: '1px solid rgba(223,255,0,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Right – isometric graphic */}
          <div
  style={{
    position: "relative",
    display: "flex",
    justifyContent: "center",
  }}
>
  {/* Animated Image Container */}
  <div
    style={{
      position: "relative",
      borderRadius: 20,
      overflow: "hidden",
      border: "1px solid #1a2a1a",
      boxShadow: "0 0 60px rgba(0,200,100,0.12)",
      animation: "floatRotateZoom 8s ease-in-out infinite",
      transformOrigin: "center center",
    }}
  >
    <img
      src="/security-tablet.png"
      alt="Security Interface"
      style={{
        width: "100%",
        maxWidth: 440,
        display: "block",
      }}
    />

    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(135deg, rgba(0,200,100,0.06) 0%, transparent 60%)",
      }}
    />
  </div>

  {/* Floating badge */}
  <div
    style={{
      position: "absolute",
      top: 20,
      right: -10,
      background: "#0d1a0d",
      border: "1px solid rgba(34,197,94,0.3)",
      borderRadius: 10,
      padding: "10px 16px",
      display: "flex",
      alignItems: "center",
      gap: 8,
      animation: "badgeFloat 4s ease-in-out infinite",
    }}
  >
    <CheckCircle size={14} color="#22c55e" />
    <span
      style={{
        fontSize: 12,
        color: "#22c55e",
        fontWeight: 600,
      }}
    >
      RBAC Enforced
    </span>
  </div>

  {/* Keyframes */}
  <style>
    {`
      @keyframes floatRotateZoom {
        0% {
          transform: scale(1) rotate(0deg);
        }
        25% {
          transform: scale(1.05) rotate(2deg);
        }
        50% {
          transform: scale(1.1) rotate(0deg);
        }
        75% {
          transform: scale(1.05) rotate(-2deg);
        }
        100% {
          transform: scale(1) rotate(0deg);
        }
      }

      @keyframes badgeFloat {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-6px);
        }
      }
    `}
  </style>
</div>
          </div>
        </div>
      </section>

      {/* ── TECH STACK ROW ──────────────────────────────────────────────── */}
      <section style={{ padding: '60px 24px', borderTop: '1px solid #0f0f0f', borderBottom: '1px solid #0f0f0f' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#feeaeaff', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 32 }}>ENGINEERED WITH PRECISION</p>
          <div className="tech-row" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { icon: <Wifi size={16} />, name: 'WebSockets' },
              { icon: <Cpu size={16} />, name: 'SSH2_Core' },
              { icon: <Database size={16} />, name: 'Supabase' },
              { icon: <Server size={16} />, name: 'Node.js' },
            ].map(t => (
              <div key={t.name} className="tech-icon">
                {t.icon}
                <span>{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BOX ─────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 24, padding: 'clamp(40px, 6vw, 72px) clamp(24px, 6vw, 72px)', position: 'relative', overflow: 'hidden' }}>
            {/* Glow inside */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400, height: 200, background: 'radial-gradient(ellipse, rgba(223,255,0,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ position: 'relative' }}>
              <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 16 }}>SOVEREIGN CONTROL</p>
              <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16, lineHeight: 1.2 }}>
                Ready for Sovereign Control?
              </h2>
              <p style={{ fontSize: 16, color: '#666', marginBottom: 40, lineHeight: 1.7 }}>
                Join the ranks of elite operators orchestrating global infrastructure with Neon Sentry.
              </p>
              <div className="cta-buttons" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={onNavigateToLogin} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, padding: '14px 32px' }}>
                  Initialize Cluster <ChevronRight size={16} />
                </button>
                <button className="btn-outline" style={{ fontSize: 15, padding: '14px 32px' }}>
                  View Documentation
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{ background: '#000', borderTop: '1px solid #0f0f0f', padding: '28px 24px' }}>
        <div className="footer-inner" style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={14} color="#DFFF00" />
            <span style={{ fontSize: 13, color: '#555', fontWeight: 600, letterSpacing: '0.06em' }}>MYACCESS © 2026</span>
          </div>
          <div className="footer-links" style={{ display: 'flex', gap: 24 }}>
            {['Terms', 'Privacy', 'System Status'].map(link => (
              <a key={link} href="#"
                style={{ fontSize: 13, color: '#555', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#DFFF00')}
                onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
    </div>
  );
}
