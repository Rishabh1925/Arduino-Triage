import { useNavigate } from 'react-router-dom';
import { useApi, apiPost } from '../hooks/useApi';
import {
    HeartPulse, Wind, Thermometer, Activity, Volume2,
    Move, Gauge, ArrowRight, ShieldCheck, AlertTriangle, Zap,
    Hospital, BarChart3, Microscope, ClipboardList, TrendingUp,
    Brain, Cpu, CheckCircle
} from 'lucide-react';
import { LineChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../utils/constants';

export default function Dashboard({ status }) {
    const { data: sensorData } = useApi('/sensor-data', 1000);
    const { data: history } = useApi('/triage/history');
    const { data: models } = useApi('/models');
    const navigate = useNavigate();

    // Measured values — initially null (shows -- until user clicks Measure)
    const [measuredHeartRate, setMeasuredHeartRate] = useState(null);
    const [measuredRespRate, setMeasuredRespRate] = useState(null);
    const [measuredTemp, setMeasuredTemp] = useState(null);
    const [measuring, setMeasuring] = useState({ hr: false, rr: false, temp: false });

    // Track previous history length to detect new triage results
    const prevHistoryLenRef = useRef(null);

    // Auto-populate heart rate when a new heart exam result appears
    useEffect(() => {
        if (!history || history.length === 0) return;
        if (prevHistoryLenRef.current === null) {
            // First load — just record the initial length, don't auto-populate
            prevHistoryLenRef.current = history.length;
            return;
        }
        if (history.length > prevHistoryLenRef.current) {
            // New triage added — check if it's a heart exam
            const latest = history[0];
            if (latest.type === 'heart' && latest.details?.heartRate) {
                setMeasuredHeartRate(latest.details.heartRate);
            }
        }
        prevHistoryLenRef.current = history.length;
    }, [history]);

    const measureValue = async (type) => {
        setMeasuring(prev => ({ ...prev, [type]: true }));
        try {
            const res = await fetch(`${API_BASE}/sensor-data`);
            const data = await res.json();
            if (type === 'hr') setMeasuredHeartRate(data.heartRate);
            if (type === 'rr') setMeasuredRespRate(data.respiratoryRate);
            if (type === 'temp') setMeasuredTemp(data.temperature);
        } catch (err) {
            console.error('Measure failed:', err);
        } finally {
            // Small delay so the button feels responsive
            setTimeout(() => setMeasuring(prev => ({ ...prev, [type]: false })), 400);
        }
    };

    const recentTriages = history?.slice(0, 5) || [];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><Hospital size={28} style={{ verticalAlign: 'middle', marginRight: 10 }} />Triage Dashboard</h1>
                <p>Real-time monitoring and quick-start examinations</p>
            </div>

            {/* Quick Stats */}
            <div className="grid-4" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                    <div className="stat-icon teal"><Activity size={22} /></div>
                    <div className="stat-info">
                        <div className="stat-label">System Mode</div>
                        <div className="stat-value" style={{ fontSize: '1.2rem' }}>{status?.mode || 'IDLE'}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon red"><HeartPulse size={22} /></div>
                    <div className="stat-info">
                        <div className="stat-label">Heart Rate</div>
                        {measuredHeartRate !== null ? (
                            <div className="stat-value">{measuredHeartRate} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>BPM</span></div>
                        ) : (
                            <button
                                className="btn btn-sm"
                                style={{ marginTop: 4, fontSize: '0.75rem', padding: '4px 12px', background: 'var(--cardiac-red)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                                onClick={() => navigate('/heart-exam')}
                            >
                                Measure
                            </button>
                        )}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon blue"><Wind size={22} /></div>
                    <div className="stat-info">
                        <div className="stat-label">Respiratory Rate</div>
                        {measuredRespRate !== null ? (
                            <div className="stat-value">{measuredRespRate} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/min</span></div>
                        ) : (
                            <button
                                className="btn btn-sm"
                                style={{ marginTop: 4, fontSize: '0.75rem', padding: '4px 12px', background: 'var(--respiratory-blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                                onClick={() => navigate('/lung-exam')}
                            >
                                Measure
                            </button>
                        )}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon amber"><Thermometer size={22} /></div>
                    <div className="stat-info">
                        <div className="stat-label">Temperature</div>
                        {measuredTemp !== null ? (
                            <div className="stat-value">{measuredTemp}°C</div>
                        ) : (
                            <button
                                className="btn btn-sm"
                                style={{ marginTop: 4, fontSize: '0.75rem', padding: '4px 12px', background: 'var(--warning-amber)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                                onClick={() => navigate('/temp-exam')}
                            >
                                Measure
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions + Live Waveform */}
            <div className="grid-2" style={{ marginBottom: 24 }}>
                {/* Quick Actions */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title"><Zap size={16} style={{ marginRight: 6 }} />Quick Start Examination</h3>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <button
                                className="btn btn-primary btn-lg"
                                style={{ width: '100%', justifyContent: 'space-between' }}
                                onClick={() => navigate('/heart-exam')}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <HeartPulse size={20} className="heartbeat" />
                                    Start Heart Examination
                                </span>
                                <ArrowRight size={18} />
                            </button>
                            <button
                                className="btn btn-secondary btn-lg"
                                style={{
                                    width: '100%', justifyContent: 'space-between',
                                    background: 'linear-gradient(135deg, var(--respiratory-blue), var(--respiratory-blue-dim))',
                                    color: 'white', borderColor: 'transparent',
                                }}
                                onClick={() => navigate('/lung-exam')}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Wind size={20} className="breathe" />
                                    Start Lung Examination
                                </span>
                                <ArrowRight size={18} />
                            </button>
                            <button
                                className="btn btn-secondary btn-lg"
                                style={{
                                    width: '100%', justifyContent: 'space-between',
                                    background: 'linear-gradient(135deg, var(--warning-amber), #d97706)',
                                    color: 'white', borderColor: 'transparent',
                                }}
                                onClick={() => navigate('/temp-exam')}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Thermometer size={20} />
                                    Measure Temperature
                                </span>
                                <ArrowRight size={18} />
                            </button>
                            <button
                                className="btn btn-secondary btn-lg"
                                style={{
                                    width: '100%', justifyContent: 'space-between',
                                    background: '#F5E6CA',
                                    color: '#5D4E37', borderColor: '#E8D5B5',
                                }}
                                onClick={() => navigate('/placement-guide')}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Gauge size={20} />
                                    Stethoscope Placement Guide
                                </span>
                                <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Recent Triages (Moves to 2nd column) */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title"><ClipboardList size={16} style={{ marginRight: 6, color: 'var(--accent-teal)' }} />Recent Triage Results</h3>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/results')}>View All</button>
                    </div>
                    <div className="card-body">
                        {recentTriages.length === 0 ? (
                            <div className="empty-state">
                                <p>No recent triage records found.</p>
                                <button className="btn btn-primary btn-sm" onClick={() => navigate('/heart-exam')} style={{ marginTop: 12 }}>
                                    Start New Exam
                                </button>
                            </div>
                        ) : (
                            <div className="triage-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
                                {recentTriages.map((triage) => (
                                    <div key={triage.id} className="triage-item" onClick={() => navigate(`/results/${triage.id}`)}>
                                        <div className="triage-icon">
                                            {triage.type === 'heart' ? <HeartPulse size={20} color="var(--cardiac-red)" /> : <Wind size={20} color="var(--respiratory-blue)" />}
                                        </div>
                                        <div className="triage-details">
                                            <div className="triage-diagnosis">{triage.diagnosis}</div>
                                            <div className="triage-date">{new Date(triage.timestamp).toLocaleString()}</div>
                                        </div>
                                        <div className={`risk-badge ${triage.riskLevel.toLowerCase()}`}>
                                            {triage.riskLevel}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Risk Summary Bar */}
            {status?.riskBreakdown && (
                <div className="card" style={{ marginTop: 24 }}>
                    <div className="card-header">
                        <h3 className="card-title"><TrendingUp size={16} style={{ marginRight: 6, color: 'var(--accent-teal)' }} />Risk Distribution</h3>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                            {[
                                { label: 'Low Risk', count: status.riskBreakdown.low, color: 'var(--success-green)', icon: ShieldCheck },
                                { label: 'Medium Risk', count: status.riskBreakdown.medium, color: 'var(--warning-amber)', icon: AlertTriangle },
                                { label: 'High Risk', count: status.riskBreakdown.high, color: 'var(--cardiac-red)', icon: AlertTriangle },
                                { label: 'Critical', count: status.riskBreakdown.critical, color: 'var(--critical-purple)', icon: Zap },
                            ].map(item => (
                                <div key={item.label} style={{
                                    flex: 1, minWidth: 140, textAlign: 'center', padding: 16,
                                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
                                    border: `1px solid var(--border-default)`,
                                }}>
                                    <item.icon size={20} color={item.color} style={{ marginBottom: 8 }} />
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: item.color }}>
                                        {item.count}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ML Models Info */}
            {models && (
                <div className="card" style={{ marginTop: 24 }}>
                    <div className="card-header">
                        <h3 className="card-title"><Brain size={16} style={{ marginRight: 6, color: 'var(--accent-teal)' }} />ML Models</h3>
                        <span className="risk-badge low"><span className="badge-dot" />All Loaded</span>
                    </div>
                    <div className="card-body">
                        <div className="model-info-grid">
                            {Object.entries(models).map(([key, model]) => (
                                <div key={key} className="model-card">
                                    <div className="model-card-header">
                                        <h4>
                                            {key === 'heart'
                                                ? <HeartPulse size={16} color="var(--cardiac-red)" />
                                                : <Wind size={16} color="var(--respiratory-blue)" />
                                            }
                                            {model.name}
                                        </h4>
                                        <span className="risk-badge low" style={{ fontSize: '0.68rem' }}>
                                            <span className="badge-dot" />{model.status}
                                        </span>
                                    </div>
                                    <div className="model-card-stats">
                                        {[
                                            { label: 'Version', value: model.version },
                                            { label: 'Accuracy', value: model.accuracy },
                                            { label: 'Model Size', value: model.size },
                                            { label: 'Input Shape', value: model.inputShape },
                                            { label: 'Inference Time', value: model.inferenceTime },
                                            { label: 'Classes', value: model.classes?.join(', ') },
                                        ].map((stat, i) => (
                                            <div key={i} className="model-stat">
                                                <span className="model-stat-label">{stat.label}</span>
                                                <span className="model-stat-value">{stat.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
