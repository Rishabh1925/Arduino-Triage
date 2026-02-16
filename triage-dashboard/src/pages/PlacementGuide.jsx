import { useState, useEffect, useCallback } from 'react';
import { Camera, HeartPulse, Wind, Target, RefreshCw, Stethoscope, CheckCircle2, Circle } from 'lucide-react';
import TrackerModal from '../components/TrackerModal';

export default function PlacementGuide() {
    const [activeTab, setActiveTab] = useState('heart');
    const [trackerAvailable, setTrackerAvailable] = useState(false);
    const [checkingTracker, setCheckingTracker] = useState(false);
    const [showTracker, setShowTracker] = useState(false);
    const [trackerStatus, setTrackerStatus] = useState(null);

    // Check if tracker server is available
    const checkTracker = useCallback(async () => {
        setCheckingTracker(true);
        try {
            const res = await fetch('/api/tracker/health');
            const data = await res.json();
            setTrackerAvailable(data.available);
        } catch {
            setTrackerAvailable(false);
        }
        setCheckingTracker(false);
    }, []);

    useEffect(() => { checkTracker(); }, [checkTracker]);

    // Poll status for the sidebar info
    useEffect(() => {
        if (!showTracker) { setTrackerStatus(null); return; }
        const poll = async () => {
            try {
                const res = await fetch('/api/tracker/status');
                const data = await res.json();
                setTrackerStatus(data);
            } catch { /* ignore */ }
        };
        poll();
        const id = setInterval(poll, 1000);
        return () => clearInterval(id);
    }, [showTracker]);

    const isHeart = activeTab === 'heart';

    const heartPoints = [
        { name: 'Aortic', desc: '2nd right intercostal space, right sternal border' },
        { name: 'Pulmonic', desc: '2nd left intercostal space, left sternal border' },
        { name: "Erb's Point", desc: '3rd left intercostal space, left sternal border' },
        { name: 'Tricuspid', desc: '4th left intercostal space, left sternal border' },
        { name: 'Mitral (Apex)', desc: '5th intercostal space, midclavicular line' },
    ];

    const lungPoints = [
        { name: 'Right Apex', desc: 'Infraclavicular, right midclavicular' },
        { name: 'Left Apex', desc: 'Infraclavicular, left midclavicular' },
        { name: 'Right Upper', desc: '2nd intercostal space, anterior' },
        { name: 'Left Upper', desc: '2nd intercostal space, anterior' },
        { name: 'Right Middle', desc: '4th intercostal space, right midclavicular' },
        { name: 'Right Lower', desc: '6th intercostal space, right midclavicular' },
        { name: 'Left Lower', desc: '6th intercostal space, left midclavicular' },
    ];

    const points = isHeart ? heartPoints : lungPoints;
    const visited = trackerStatus?.visited || {};

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><Target size={28} style={{ color: 'var(--text-primary)', verticalAlign: 'middle', marginRight: 10 }} />Stethoscope Placement Guide</h1>
                <p>AI-powered body tracking with real-time stethoscope placement guidance</p>
            </div>

            {/* Tab Toggle */}
            <div className="tabs" style={{ marginBottom: 24, maxWidth: 350 }}>
                <button
                    className={`tab ${activeTab === 'heart' ? 'active' : ''}`}
                    onClick={() => setActiveTab('heart')}
                    style={activeTab === 'heart' ? { background: 'var(--cardiac-red)', color: '#fff', borderColor: 'var(--cardiac-red)' } : {}}
                >
                    <HeartPulse size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Heart Points
                </button>
                <button
                    className={`tab ${activeTab === 'lung' ? 'active' : ''}`}
                    onClick={() => setActiveTab('lung')}
                    style={activeTab === 'lung' ? { background: 'var(--respiratory-blue)', color: '#fff', borderColor: 'var(--respiratory-blue)' } : {}}
                >
                    <Wind size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Lung Points
                </button>
            </div>

            <div className="grid-2">
                {/* Launch Tracker Card */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title"><Camera size={16} style={{ marginRight: 6 }} />Camera Tracker</h3>
                        <span className={`risk-badge ${trackerAvailable ? 'low' : 'high'}`}>
                            <span className="badge-dot" />
                            {trackerAvailable ? 'Online' : 'Offline'}
                        </span>
                    </div>
                    <div className="card-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
                        {trackerAvailable ? (
                            <>
                                <div style={{
                                    width: 80, height: 80, borderRadius: '50%',
                                    background: 'var(--bg-elevated)', border: `2px solid ${isHeart ? 'var(--cardiac-red)' : 'var(--respiratory-blue)'}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 20px',
                                }}>
                                    {isHeart
                                        ? <HeartPulse size={36} color="var(--cardiac-red)" className="heartbeat" />
                                        : <Wind size={36} color="var(--respiratory-blue)" />
                                    }
                                </div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>
                                    {isHeart ? 'Heart' : 'Lung'} Placement Tracker
                                </h3>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                                    Opens a fullscreen camera view with AI-guided auscultation points overlaid on your body.
                                    Place your hand on each target to check it off.
                                </p>
                                <button
                                    className="btn btn-primary btn-lg"
                                    onClick={() => setShowTracker(true)}
                                    style={{
                                        background: isHeart ? 'var(--cardiac-red)' : 'var(--respiratory-blue)',
                                        borderColor: isHeart ? 'var(--cardiac-red)' : 'var(--respiratory-blue)',
                                    }}
                                >
                                    <Camera size={18} /> Open Camera
                                </button>
                            </>
                        ) : (
                            <>
                                <Camera size={48} color="var(--text-muted)" style={{ marginBottom: 16 }} />
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                                    Run <code style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4 }}>python tracker_server.py</code> to enable the camera tracker
                                </p>
                                <button className="btn btn-secondary" onClick={checkTracker} disabled={checkingTracker}>
                                    <RefreshCw size={14} className={checkingTracker ? 'spin' : ''} /> {checkingTracker ? 'Checking...' : 'Retry Connection'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Progress / Status Card */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title"><Stethoscope size={16} style={{ marginRight: 6 }} />
                            {isHeart ? 'Cardiac' : 'Lung'} Auscultation Points
                        </h3>
                        {trackerStatus && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {trackerStatus.done}/{trackerStatus.total} checked
                            </span>
                        )}
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {points.map((p, i) => {
                                const key = Object.keys(visited).find(k => p.name.toLowerCase().includes(k.toLowerCase().split(' ')[0]));
                                const checked = key ? visited[key] : false;
                                return (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 12px', background: 'var(--bg-elevated)',
                                        borderRadius: 'var(--radius-sm)',
                                        borderLeft: `3px solid ${checked ? 'var(--success-green)' : (isHeart ? 'var(--cardiac-red)' : 'var(--respiratory-blue)')}`,
                                        opacity: checked ? 0.7 : 1,
                                    }}>
                                        {checked
                                            ? <CheckCircle2 size={16} color="var(--success-green)" />
                                            : <Circle size={16} color="var(--text-muted)" />
                                        }
                                        <div>
                                            <strong style={{
                                                fontSize: '0.82rem', color: checked ? 'var(--success-green)' : 'var(--text-primary)',
                                                textDecoration: checked ? 'line-through' : 'none',
                                            }}>{p.name}</strong>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.desc}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Instructions Card */}
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-header">
                        <h3 className="card-title">How It Works</h3>
                    </div>
                    <div className="card-body" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                            <div>
                                <strong style={{ color: 'var(--text-primary)' }}>1. Stand in front of camera</strong><br />
                                Position yourself so your upper body is clearly visible. The AI will detect your pose automatically.
                            </div>
                            <div>
                                <strong style={{ color: 'var(--text-primary)' }}>2. Follow the targets</strong><br />
                                Colored circles appear on your chest at each auscultation point. Place your hand on each target.
                            </div>
                            <div>
                                <strong style={{ color: 'var(--text-primary)' }}>3. Verify alignment</strong><br />
                                When your hand aligns with a target, it turns green and is marked as checked in the progress list.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Fullscreen Tracker Modal */}
            <TrackerModal isOpen={showTracker} mode={activeTab} onClose={() => setShowTracker(false)} />
        </div>
    );
}
