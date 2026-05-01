import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Activity, Server, Terminal, Lock, CheckCircle,
  ChevronRight, ChevronLeft, ChevronDown, Menu, X, Wifi, Box, Cpu, Database, ArrowRight, ZoomIn, Maximize2
} from 'lucide-react';

interface Props {
  onNavigateToLogin: () => void;
}

const GALLERY_ITEMS = [
  {
    img: '/dashboard.png',
    title: 'Operations Dashboard',
    tag: 'MONITORING',
    desc: 'Live fleet-wide overview — CPU, RAM, network, disk, and uptime across all nodes at a glance.',
  },
  {
    img: '/terminal.png',
    title: 'Sentry Shell Terminal',
    tag: 'TERMINAL',
    desc: 'Full xterm.js interactive SSH terminal with real-time telemetry panels and multi-node switching.',
  },
  {
    img: '/security-tablet.png',
    title: 'Security & RBAC Console',
    tag: 'SECURITY',
    desc: 'Role-based access control interface — assign nodes, manage operators, and enforce permissions.',
  },
  {
    img: '/terminal.png',
    title: 'Node Control Surface',
    tag: 'NODES',
    desc: 'Per-node deep-dive: hardware specs, Docker containers, process table, and orchestration controls.',
  },
];

function GalleryLightbox({
  items, index, onClose, onPrev, onNext, onGoTo,
}: {
  items: typeof GALLERY_ITEMS;
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (i: number) => void;
}) {
  const item = items[index];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(16px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid #333', color: '#fff', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
      >
        <X size={18} />
      </button>

      {/* Counter */}
      <div style={{ position: 'absolute', top: 24, left: 24, fontSize: 11, color: '#555', letterSpacing: '0.12em', fontWeight: 700 }}>
        {index + 1} / {items.length}
      </div>

      {/* Main image container */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1100,
          background: 'linear-gradient(180deg, #0a0f0a 0%, #060606 100%)',
          border: '1px solid #1a2a1a',
          borderRadius: 20, overflow: 'hidden',
          boxShadow: '0 0 80px rgba(0,200,100,0.12)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Window bar */}
        <div style={{ background: '#0d1a0d', borderBottom: '1px solid #162416', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28ca41', display: 'inline-block' }} />
          <span style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#3a5a3a', letterSpacing: '0.1em' }}>MYACCESS // {item.tag}</span>
        </div>

        {/* Image */}
        <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', background: '#050505' }}>
          <img
            src={item.img}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.4s' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 60%, rgba(5,5,5,0.5) 100%)' }} />
        </div>

        {/* Caption */}
        <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 10, color: '#DFFF00', letterSpacing: '0.16em', fontWeight: 700, display: 'block', marginBottom: 4 }}>{item.tag}</span>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{item.title}</h3>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.65, maxWidth: 600 }}>{item.desc}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button onClick={e => { e.stopPropagation(); onPrev(); }}
              style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid #2a2a2a', color: '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#DFFF00'; e.currentTarget.style.color = '#DFFF00'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#aaa'; }}
            ><ChevronLeft size={18} /></button>
            <button onClick={e => { e.stopPropagation(); onNext(); }}
              style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid #2a2a2a', color: '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#DFFF00'; e.currentTarget.style.color = '#DFFF00'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#aaa'; }}
            ><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>

      {/* Thumbnail strip */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', gap: 10, marginTop: 16, overflowX: 'auto', maxWidth: '100%', paddingBottom: 4 }}
      >
        {items.map((it, i) => (
          <button
            key={i}
            onClick={e => { e.stopPropagation(); onGoTo(i); }}
            style={{
              width: 80, height: 52, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
              border: i === index ? '2px solid #DFFF00' : '2px solid #222',
              boxShadow: i === index ? '0 0 12px rgba(223,255,0,0.3)' : 'none',
              padding: 0, cursor: 'pointer', transition: 'all 0.2s',
              opacity: i === index ? 1 : 0.5,
            }}
          >
            <img src={it.img} alt={it.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </button>
        ))}
      </div>

      <p style={{ marginTop: 14, fontSize: 11, color: '#444', letterSpacing: '0.08em' }}>ESC to close · ← → to navigate</p>
    </div>
  );
}

function GallerySection() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const openLightbox = (i: number) => setLightboxIndex(i);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const goPrev = useCallback(() => setLightboxIndex(i => (i === null ? 0 : (i - 1 + GALLERY_ITEMS.length) % GALLERY_ITEMS.length)), []);
  const goNext = useCallback(() => setLightboxIndex(i => (i === null ? 0 : (i + 1) % GALLERY_ITEMS.length)), []);
  const goTo  = useCallback((i: number) => setLightboxIndex(i), []);

  const tagColors: Record<string, string> = {
    MONITORING: '#DFFF00',
    TERMINAL:   '#a78bfa',
    SECURITY:   '#22c55e',
    NODES:      '#00c8ff',
  };

  return (
    <>
      {/* Gallery CSS */}
      <style>{`
        .gal-card {
          background: linear-gradient(180deg, #0a0f0a 0%, #070707 100%);
          border: 1px solid #1a2a1a;
          border-radius: 20px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s;
          position: relative;
        }
        .gal-card:hover {
          transform: translateY(-6px);
          border-color: rgba(223,255,0,0.4);
          box-shadow: 0 0 40px rgba(223,255,0,0.1);
        }
        .gal-img-wrap {
          position: relative;
          aspect-ratio: 16 / 10;
          overflow: hidden;
          background: #050505;
        }
        .gal-img {
          width: 100%; height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.5s ease;
        }
        .gal-card:hover .gal-img {
          transform: scale(1.04);
        }
        .gal-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, transparent 40%, rgba(5,5,5,0.7) 100%);
          opacity: 0;
          transition: opacity 0.3s;
          display: flex; align-items: center; justify-content: center;
        }
        .gal-card:hover .gal-overlay { opacity: 1; }
        .gal-zoom-icon {
          background: rgba(223,255,0,0.15);
          border: 1px solid rgba(223,255,0,0.4);
          border-radius: 50%;
          width: 52px; height: 52px;
          display: flex; align-items: center; justify-content: center;
          transform: scale(0.7);
          transition: transform 0.25s;
        }
        .gal-card:hover .gal-zoom-icon { transform: scale(1); }
        .gal-tag {
          display: inline-flex; align-items: center;
          padding: 3px 10px; border-radius: 40px;
          font-size: 9px; font-weight: 800; letter-spacing: 0.14em;
          margin-bottom: 10px;
        }
        .gal-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }
        @media (max-width: 900px) {
          .gal-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 560px) {
          .gal-grid { grid-template-columns: 1fr; }
        }
        .gal-featured {
          grid-column: 1 / -1;
        }
        @media (max-width: 560px) {
          .gal-featured { grid-column: 1; }
        }
      `}</style>

      <section id="gallery" style={{ padding: '100px 24px', position: 'relative' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 12 }}>CONTROL PANEL</p>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 14 }}>See the Interface in Action</h2>
            <p style={{ fontSize: 16, color: '#666', maxWidth: 620, margin: '0 auto', lineHeight: 1.7 }}>
              A visual tour of every surface — from the live monitoring dashboard to the interactive SSH terminal and security console.
            </p>
          </div>

          {/* Gallery grid: first card spans full width, rest 2-col */}
          <div className="gal-grid">
            {GALLERY_ITEMS.map((item, i) => {
              const tagColor = tagColors[item.tag] ?? '#DFFF00';
              return (
                <div
                  key={item.title}
                  className={`gal-card${i === 0 ? ' gal-featured' : ''}`}
                  onClick={() => openLightbox(i)}
                >
                  {/* Mac-style titlebar */}
                  <div style={{ background: '#0d1a0d', borderBottom: '1px solid #162416', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28ca41', display: 'inline-block' }} />
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#466246', letterSpacing: '0.08em' }}>MYACCESS // {item.tag}</span>
                  </div>

                  {/* Image */}
                  <div className="gal-img-wrap">
                    <img src={item.img} alt={item.title} className="gal-img" />
                    <div className="gal-overlay">
                      <div className="gal-zoom-icon">
                        <Maximize2 size={20} color="#DFFF00" />
                      </div>
                    </div>
                  </div>

                  {/* Card footer */}
                  <div style={{ padding: '18px 20px 22px' }}>
                    <div
                      className="gal-tag"
                      style={{ background: `${tagColor}18`, border: `1px solid ${tagColor}40`, color: tagColor }}
                    >
                      {item.tag}
                    </div>
                    <h3 style={{ fontSize: i === 0 ? 20 : 17, fontWeight: 700, color: '#f3f3f3', marginBottom: 8 }}>{item.title}</h3>
                    <p style={{ fontSize: 13, color: '#666', lineHeight: 1.7 }}>{item.desc}</p>
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ZoomIn size={13} color={tagColor} />
                      <span style={{ fontSize: 11, color: tagColor, fontWeight: 600, letterSpacing: '0.06em' }}>Click to expand</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total count badge */}
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <span style={{ fontSize: 12, color: '#444', letterSpacing: '0.1em' }}>
              {GALLERY_ITEMS.length} INTERFACE VIEWS — Click any to enter fullscreen
            </span>
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <GalleryLightbox
          items={GALLERY_ITEMS}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={goPrev}
          onNext={goNext}
          onGoTo={goTo}
        />
      )}
    </>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden', marginBottom: 2 }}
      onClick={() => setOpen(o => !o)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', cursor: 'pointer', background: open ? 'rgba(223,255,0,0.03)' : '#0c0c0c' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#f0f0f0' }}>{q}</span>
        <ChevronDown size={16} color="#666" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s', flexShrink: 0, marginLeft: 16 }} />
      </div>
      {open && (
        <div style={{ padding: '0 22px 18px', background: 'rgba(223,255,0,0.02)' }}>
          <p style={{ fontSize: 14, color: '#666', lineHeight: 1.75 }}>{a}</p>
        </div>
      )}
    </div>
  );
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
          .preview-grid {
  grid-template-columns: 1fr !important;
}
.product-tour-grid {
  grid-template-columns: 1fr !important;
}
.global-stats-grid {
  grid-template-columns: 1fr 1fr !important;
}
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
        /* Global Node Grid */
.node-map-card {
  background: linear-gradient(180deg, #0a0f0a 0%, #070707 100%);
  border: 1px solid #1a2a1a;
  border-radius: 24px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 50px rgba(0,255,120,0.06);
}

.node-pulse {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #DFFF00;
  box-shadow: 0 0 18px rgba(223,255,0,0.7);
  animation: pulseNode 2.5s infinite;
}

@keyframes pulseNode {
  0% { transform: scale(1); opacity: 1; }
  70% { transform: scale(2.8); opacity: 0; }
  100% { transform: scale(1); opacity: 0; }
}

/* Comparison table */
.compare-table {
  width: 100%;
  border-collapse: collapse;
}
.compare-table th,
.compare-table td {
  padding: 18px;
  border-bottom: 1px solid #1a1a1a;
  text-align: center;
}
.compare-table th {
  color: #DFFF00;
  font-size: 13px;
  letter-spacing: 0.08em;
}
.compare-table td {
  color: #ccc;
  font-size: 14px;
}

/* Product Tour Cards */
.tour-card {
  background: #0a0a0a;
  border: 1px solid #1a1a1a;
  border-radius: 20px;
  overflow: hidden;
  transition: all 0.3s ease;
}
.tour-card:hover {
  transform: translateY(-6px);
  border-color: rgba(223,255,0,0.35);
  box-shadow: 0 0 40px rgba(223,255,0,0.08);
}
.tour-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 40%, rgba(5,5,5,0.85) 100%);
}
      `}
      </style>

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
            <button className="btn-outline" onClick={() => scrollTo('nodes')}>View Features</button>
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

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="docs" style={{ padding: '100px 24px', position: 'relative' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 12 }}>HOW IT WORKS</p>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 14 }}>Up and Running in Minutes</h2>
            <p style={{ fontSize: 16, color: '#666', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>No agents, no plugins. Just your server credentials and sovereign control.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 32, position: 'relative' }}>
            {/* Connector line */}
            <div style={{ position: 'absolute', top: 36, left: '16.5%', right: '16.5%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(223,255,0,0.2), transparent)', zIndex: 0 }} />
            {[
              { step: '01', icon: '🔑', title: 'Add Your Server', desc: 'Provide an IP address, SSH credentials, and a display name. No software installation required on the target machine.' },
              { step: '02', icon: '⚡', title: 'Instant Connection', desc: 'MYACCESS opens an encrypted SSH tunnel and begins collecting real-time CPU, RAM, disk, and network telemetry.' },
              { step: '03', icon: '🛡️', title: 'Take Command', desc: 'Monitor live metrics, open an interactive terminal, manage Docker containers, and control access with RBAC roles.' },
            ].map(s => (
              <div key={s.step} style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(223,255,0,0.06)', border: '1px solid rgba(223,255,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 28 }}>
                  {s.icon}
                </div>
                <div style={{ fontSize: 10, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 700, marginBottom: 10 }}>STEP {s.step}</div>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTROL PANEL GALLERY ───────────────────────────────────────── */}
      <GallerySection />

{/* ── GLOBAL NODE MAP ───────────────────────────────────────── */}
<section style={{ padding: '100px 24px' }}>
  <div style={{ maxWidth: 1180, margin: '0 auto' }}>
    <div style={{ textAlign: 'center', marginBottom: 56 }}>
      <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 12 }}>
        GLOBAL INFRASTRUCTURE
      </p>
      <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, marginBottom: 14 }}>
        Sovereign Node Command Grid
      </h2>
      <p style={{ color: '#666', maxWidth: 720, margin: '0 auto', lineHeight: 1.7 }}>
        Real-time node intelligence across distributed infrastructure with encrypted SSH mesh visibility.
      </p>
    </div>

    <div className="node-map-card" style={{ padding: '40px', minHeight: 500 }}>
      <img
        src="/world-map.avif"
        alt="Global Map"
        style={{
          width: '100%',
          opacity: 0.18,
          objectFit: 'cover',
          filter: 'contrast(140%)'
        }}
      />

      {/* Node Points */}
      <div className="node-pulse" style={{ top: '30%', left: '22%' }} />
      <div className="node-pulse" style={{ top: '42%', left: '48%' }} />
      <div className="node-pulse" style={{ top: '55%', left: '64%' }} />
      <div className="node-pulse" style={{ top: '29%', left: '41%' }} />

      {/* Stats */}
      <div className="global-stats-grid" style={{
        position: 'absolute',
        bottom: 30,
        left: 30,
        display: 'grid',
        gridTemplateColumns: 'repeat(4,1fr)',
        gap: 18,
        width: 'calc(100% - 60px)'
      }}>
        {[
          ['42', 'ACTIVE NODES'],
          ['4', 'GLOBAL REGIONS'],
          ['99.99%', 'UPTIME'],
          ['12ms', 'AVG LATENCY']
        ].map(([value, label]) => (
          <div key={label} className="glass-card" style={{ padding: '18px' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#DFFF00' }}>{value}</div>
            <div style={{ fontSize: 11, color: '#666', letterSpacing: '0.08em' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
</section>

{/* ── FEATURE COMPARISON ───────────────────────────────────── */}
<section style={{ padding: '100px 24px' }}>
  <div style={{ maxWidth: 1000, margin: '0 auto' }}>
    <div style={{ textAlign: 'center', marginBottom: 50 }}>
      <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600 }}>
        WHY MYACCESS
      </p>
      <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800 }}>
        Infrastructure Superiority Matrix
      </h2>
    </div>

    <div style={{
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: 24,
      overflow: 'hidden'
    }}>
      <table className="compare-table">
        <thead>
          <tr>
            <th>CAPABILITY</th>
            <th>MYACCESS</th>
            <th>TRADITIONAL STACK</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Agent-less Monitoring</td><td>✅</td><td>❌</td></tr>
          <tr><td>SSH Native Control</td><td>✅</td><td>⚠️</td></tr>
          <tr><td>RBAC Security</td><td>✅</td><td>⚠️</td></tr>
          <tr><td>Real-Time Telemetry</td><td>✅</td><td>❌</td></tr>
          <tr><td>Global Node Mesh</td><td>✅</td><td>❌</td></tr>
        </tbody>
      </table>
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
                { icon: <Database size={16} color="#6366f1" />, title: 'Supabase Integration', desc: 'Centralised identity management with instant revocation and granular permissions.' },
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
      <section style={{ padding: '60px 24px', }}>
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
      <section style={{ padding: '100px 24px' }}>
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
                <button className="btn-outline" onClick={() => scrollTo('nodes')} style={{ fontSize: 15, padding: '14px 32px' }}>
                  Explore Features
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────────────── */}
      <section style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 12 }}>TRUSTED BY OPERATORS</p>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>What Operators Are Saying</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }} className="feature-grid">
            {[
              { quote: 'MYACCESS replaced three separate tools. I can monitor all 40 of our bare-metal servers from one dashboard with zero agents installed. It\'s incredibly fast.', name: 'Rahul M.', role: 'Lead DevOps Engineer', initials: 'RM' },
              { quote: 'The RBAC system is exactly what we needed. Our interns get terminal access only to staging nodes while admins control everything. Clean, surgical access control.', name: 'Priya S.', role: 'Infrastructure Architect', initials: 'PS' },
              { quote: 'Real-time telemetry over SSH tunnels with no open ports — our security team finally approved a monitoring tool. The Docker orchestration layer is a bonus.', name: 'Alex T.', role: 'Senior SRE', initials: 'AT' },
            ].map(t => (
              <div key={t.name} className="feature-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[...Array(5)].map((_, i) => <span key={i} style={{ color: '#DFFF00', fontSize: 14 }}>★</span>)}
                </div>
                <p style={{ fontSize: 14, color: '#999', lineHeight: 1.75, flex: 1 }}>"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 16, borderTop: '1px solid #1a1a1a' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(223,255,0,0.1)', border: '1px solid rgba(223,255,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#DFFF00', flexShrink: 0 }}>{t.initials}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: '#555' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 12 }}>PRICING</p>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 14 }}>Transparent, Operator-First Pricing</h2>
            <p style={{ fontSize: 16, color: '#666', maxWidth: 540, margin: '0 auto', lineHeight: 1.7 }}>No lock-in. Start free, scale when you're ready.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }} className="feature-grid">
            {[
              { name: 'Starter', price: 'Free', sub: 'forever', features: ['Up to 3 nodes', 'Real-time metrics', 'Interactive terminal', 'RBAC (2 roles)', 'Community support'], cta: 'Get Started', highlight: false },
              { name: 'Operator', price: '$29', sub: '/month', features: ['Up to 25 nodes', 'All Starter features', 'Docker orchestration', 'Full RBAC (3 roles)', 'Priority support', 'Audit logs'], cta: 'Start Free Trial', highlight: true },
              { name: 'Sovereign', price: '$99', sub: '/month', features: ['Unlimited nodes', 'All Operator features', 'SSO / SAML', 'Custom integrations', 'SLA guarantee', 'Dedicated support'], cta: 'Contact Us', highlight: false },
            ].map(plan => (
              <div key={plan.name} style={{ background: plan.highlight ? 'rgba(223,255,0,0.04)' : '#0c0c0c', border: plan.highlight ? '1px solid rgba(223,255,0,0.35)' : '1px solid #1a1a1a', borderRadius: 20, padding: 32, position: 'relative', boxShadow: plan.highlight ? '0 0 40px rgba(223,255,0,0.08)' : 'none', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {plan.highlight && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#DFFF00', color: '#000', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', padding: '4px 14px', borderRadius: 40 }}>MOST POPULAR</div>
                )}
                <p style={{ fontSize: 11, color: plan.highlight ? '#DFFF00' : '#666', letterSpacing: '0.16em', fontWeight: 700, marginBottom: 16 }}>{plan.name.toUpperCase()}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 42, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>{plan.price}</span>
                  <span style={{ fontSize: 14, color: '#555' }}>{plan.sub}</span>
                </div>
                <div style={{ height: 1, background: '#1a1a1a', margin: '24px 0' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#22c55e', fontSize: 13 }}>✓</span>
                      <span style={{ fontSize: 13, color: '#aaa' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={onNavigateToLogin}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: plan.highlight ? 'none' : '1px solid #2a2a2a', background: plan.highlight ? '#DFFF00' : 'transparent', color: plan.highlight ? '#000' : '#aaa', transition: 'all 0.2s' }}
                  onMouseEnter={e => { if (!plan.highlight) { e.currentTarget.style.borderColor = 'rgba(223,255,0,0.4)'; e.currentTarget.style.color = '#fff'; } else { e.currentTarget.style.background = '#c8e600'; } }}
                  onMouseLeave={e => { if (!plan.highlight) { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#aaa'; } else { e.currentTarget.style.background = '#DFFF00'; } }}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 24px 100px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 11, color: '#DFFF00', letterSpacing: '0.2em', fontWeight: 600, marginBottom: 12 }}>FAQ</p>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>Common Questions</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { q: 'Do I need to install an agent on my servers?', a: 'No. MYACCESS connects via standard SSH. Your server only needs to have SSH enabled — no extra software, daemons, or open ports required.' },
              { q: 'Which operating systems are supported?', a: 'Any Linux distribution with SSH access is supported. Ubuntu, Debian, CentOS, Fedora, and Alpine are all tested and working out of the box.' },
              { q: 'How does RBAC work?', a: 'There are three roles: Admin (full control), Employee (team management), and Intern (view-only on assigned nodes). Admins assign which nodes each user can access.' },
              { q: 'Is my data secure?', a: 'All connections use AES-256 encrypted SSH2 tunnels. Credentials are encrypted at rest. Authentication is powered by Supabase with industry-standard JWT sessions.' },
              { q: 'Can I self-host MYACCESS?', a: 'Yes. MYACCESS ships with a Dockerfile and docker-compose configuration. Deploy it on your own infrastructure in minutes.' },
            ].map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
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
