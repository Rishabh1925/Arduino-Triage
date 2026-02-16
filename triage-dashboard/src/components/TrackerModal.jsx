import { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, HeartPulse, Wind, CheckCircle2, Circle, Loader } from 'lucide-react';

/**
 * TrackerModal — Full-screen camera overlay for tracker feeds.
 *
 * Props:
 *   isOpen   (bool)   — Controls visibility
 *   mode     (string) — "heart" | "lung"
 *   onClose  (fn)     — Called when the user closes the modal
 */
export default function TrackerModal({ isOpen, mode = 'heart', onClose }) {
    const [status, setStatus] = useState(null);
    const [feedKey, setFeedKey] = useState(Date.now());
    const intervalRef = useRef(null);

    // Poll status while open
    useEffect(() => {
        if (!isOpen) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setStatus(null);
            return;
        }
        setFeedKey(Date.now()); // Force fresh feed

        const poll = async () => {
            try {
                const res = await fetch('/api/tracker/status');
                const data = await res.json();
                setStatus(data);
            } catch { /* ignore */ }
        };
        poll();
        intervalRef.current = setInterval(poll, 1000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [isOpen]);

    // Escape key to close
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    const resetTracker = async () => {
        try {
            await fetch('/api/tracker/reset', { method: 'POST' });
            setFeedKey(Date.now());
        } catch { /* ignore */ }
    };

    if (!isOpen) return null;

    const isHeart = mode === 'heart';
    const accentColor = isHeart ? 'var(--cardiac-red)' : 'var(--respiratory-blue, #3B82F6)';
    const Icon = isHeart ? HeartPulse : Wind;
    const title = isHeart ? 'Heart Placement Tracker' : 'Lung Placement Tracker';

    const visited = status?.visited || {};
    const entries = Object.entries(visited);
    const doneCount = entries.filter(([, v]) => v).length;
    const totalCount = entries.length || 1;
    const progress = Math.round((doneCount / totalCount) * 100);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.92)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
        }}>
            {/* Top bar */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: 56, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', padding: '0 20px',
                background: 'rgba(10, 10, 12, 0.85)',
                borderBottom: `1px solid rgba(255,255,255,0.06)`,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon size={22} color={accentColor} />
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#fff' }}>{title}</span>
                    {status && (
                        <span style={{
                            fontSize: '0.75rem', padding: '3px 10px',
                            borderRadius: 20, fontWeight: 600,
                            background: status.allDone ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                            color: status.allDone ? '#10B981' : 'rgba(255,255,255,0.5)',
                        }}>
                            {status.allDone ? 'COMPLETE' : `${doneCount}/${totalCount}`}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                        onClick={resetTracker}
                        style={{
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#fff', padding: '6px 14px', borderRadius: 6,
                            cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        <RotateCcw size={14} /> Reset
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)',
                            color: '#ff6b6b', padding: '6px 10px', borderRadius: 6,
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Camera feed — fills the center */}
            <img
                key={feedKey}
                src={`/api/tracker/feed?mode=${mode}&t=${feedKey}`}
                alt={`${mode} tracker feed`}
                style={{
                    maxWidth: 'calc(100vw - 40px)',
                    maxHeight: 'calc(100vh - 140px)',
                    borderRadius: 8,
                    border: `1px solid rgba(255,255,255,0.08)`,
                    objectFit: 'contain',
                }}
            />

            {/* Bottom progress bar */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: 56, display: 'flex', alignItems: 'center',
                padding: '0 20px', gap: 16,
                background: 'rgba(10, 10, 12, 0.85)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
                {/* Point pills */}
                <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                    {entries.map(([name, done]) => (
                        <span key={name} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: '0.72rem', padding: '3px 8px', borderRadius: 12,
                            background: done ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                            color: done ? '#10B981' : 'rgba(255,255,255,0.4)',
                            border: `1px solid ${done ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}`,
                        }}>
                            {done ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                            {name}
                        </span>
                    ))}
                </div>

                {/* Progress bar */}
                <div style={{ width: 160, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        flex: 1, height: 6, borderRadius: 3,
                        background: 'rgba(255,255,255,0.08)',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            width: `${progress}%`, height: '100%',
                            borderRadius: 3, transition: 'width 0.5s ease',
                            background: status?.allDone ? '#10B981' : accentColor,
                        }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', minWidth: 32 }}>
                        {progress}%
                    </span>
                </div>
            </div>
        </div>
    );
}
