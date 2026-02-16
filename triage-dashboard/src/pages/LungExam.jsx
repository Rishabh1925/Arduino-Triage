import { useState, useEffect, useRef } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import {
    Wind, Play, Square, RotateCcw, CheckCircle,
    AlertTriangle, XCircle, Info, Stethoscope, Radio,
    Camera, CameraOff
} from 'lucide-react';
import ExamModal from '../components/ExamModal';
import TrackerModal from '../components/TrackerModal';


export default function LungExam({ status }) {

    const { data: systemStatus, refetch: refetchStatus } = useApi('/status', 500);
    const [examState, setExamState] = useState('idle');
    const [result, setResult] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [trackerAvailable, setTrackerAvailable] = useState(false);
    const [showCamera, setShowCamera] = useState(false);

    // Check tracker availability
    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch('/api/tracker/health');
                const data = await res.json();
                setTrackerAvailable(data.available);
            } catch { setTrackerAvailable(false); }
        };
        check();
        const interval = setInterval(check, 10000);
        return () => clearInterval(interval);
    }, []);

    // Track previous mode to detect transitions
    const prevModeRef = useRef(status?.mode);

    useEffect(() => {
        const currentMode = systemStatus?.mode;
        const prevMode = prevModeRef.current;

        if (currentMode === 'EXAMINING' && prevMode !== 'EXAMINING') {
            // Started new exam
            setExamState('examining');
            setResult(null);
            setIsModalOpen(true);
        } else if (currentMode === 'RESULT' && prevMode === 'EXAMINING') {
            // Transitioned from Examining -> Result
            setExamState('result');
            setResult(systemStatus.examResult);
            setIsModalOpen(true);
        } else if (currentMode === 'RESULT' && !result && systemStatus?.examResult) {
            // Just loaded page with existing result
            setExamState('result');
            setResult(systemStatus.examResult);
        }

        prevModeRef.current = currentMode;
    }, [systemStatus]);

    const startExam = async () => {
        await apiPost('/exam/start', { type: 'lung' });
        setExamState('examining');
        setResult(null);
        setIsModalOpen(true);
    };

    const stopExam = async () => {
        await apiPost('/exam/stop');
        setExamState('idle');
        setResult(null);
    };

    const resetExam = async () => {
        await apiPost('/reset');
        setExamState('idle');
        setResult(null);
        refetchStatus();
    };

    const getRiskIcon = (level) => {
        switch (level) {
            case 'LOW': return <CheckCircle size={20} />;
            case 'MEDIUM': return <AlertTriangle size={20} />;
            case 'HIGH': return <XCircle size={20} />;
            default: return <Info size={20} />;
        }
    };

    const classColors = {
        Normal: 'var(--success-green)',
        Wheeze: 'var(--warning-amber)',
        Crackle: 'var(--cardiac-red)',
        Both: 'var(--critical-purple)',
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><Wind size={28} style={{ color: 'var(--respiratory-blue)', verticalAlign: 'middle', marginRight: 10 }} />Lung Examination</h1>
                <p>Respiratory auscultation with AI-powered lung sound classification</p>
            </div>

            {/* Exam Modal */}
            <ExamModal
                isOpen={isModalOpen}
                mode={examState === 'examining' ? 'EXAMINING' : 'RESULT'}
                onClose={() => setIsModalOpen(false)}
                onViewResults={() => setIsModalOpen(false)}
            />

            <div className="grid-2">
                {/* Exam Control */}
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-header">
                        <h3 className="card-title"><Wind size={16} color="var(--respiratory-blue)" style={{ marginRight: 6 }} />Examination Control</h3>
                        <span className={`risk-badge ${examState === 'examining' ? 'high' : examState === 'result' ? 'low' : 'medium'}`}>
                            <span className="badge-dot" />
                            {examState === 'examining' ? 'Recording' : examState === 'result' ? 'Complete' : 'Ready'}
                        </span>
                    </div>
                    <div className="card-body">
                        {examState === 'idle' && (
                            <div className="exam-flow">
                                <div style={{
                                    width: 100, height: 100, borderRadius: '50%',
                                    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                                }}>
                                    <Wind size={48} color="var(--respiratory-blue)" className="breathe" />
                                </div>
                                <h3 className="exam-status">Ready for Lung Examination</h3>
                                <p className="exam-progress-text">
                                    Ensure stethoscope is placed on one of the 6 anterior or posterior lung auscultation points.
                                </p>
                                <button
                                    className="btn btn-lg"
                                    onClick={startExam}
                                    disabled={status?.mode === 'EXAMINING'}
                                    style={{
                                        background: 'var(--text-primary)',
                                        color: 'var(--bg-secondary)', border: 'none',
                                    }}
                                >
                                    <Play size={18} /> Start Lung Exam
                                </button>
                            </div>
                        )}

                        {examState === 'examining' && (
                            <div className="exam-flow">
                                <div style={{
                                    width: 120, height: 120, borderRadius: '50%',
                                    background: 'var(--bg-elevated)', border: '1px solid var(--respiratory-blue)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                                }}>
                                    <Wind size={56} color="var(--respiratory-blue)" className="breathe" />
                                </div>
                                <h3 className="exam-status" style={{ color: 'var(--respiratory-blue)' }}>Recording Lung Sounds...</h3>
                                <p className="exam-progress-text">
                                    <strong>Check Hardware Display</strong> for signal monitoring.
                                </p>
                                <div className="progress-bar" style={{ maxWidth: 400, margin: '0 auto 20px' }}>
                                    <div className="progress-fill" style={{
                                        width: `${systemStatus?.examProgress || 0}%`,
                                        background: 'var(--respiratory-blue)',
                                    }} />
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {systemStatus?.examProgress || 0}% complete
                                </p>
                                <button className="btn btn-secondary" onClick={stopExam} style={{ marginTop: 12 }}>
                                    <Square size={16} /> Stop Examination
                                </button>
                            </div>
                        )}

                        {examState === 'result' && result && (
                            <div>
                                <div className="exam-flow" style={{ paddingBottom: 16 }}>
                                    <div style={{
                                        width: 80, height: 80, borderRadius: '50%',
                                        background: 'transparent', border: '2px solid var(--text-primary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
                                    }}>
                                        <Wind size={40} color={result.riskLevel === 'LOW' ? 'var(--success-green)' : 'var(--respiratory-blue)'} />
                                    </div>
                                    <h3 className="exam-status">{result.diagnosis}</h3>
                                    <span className={`risk-badge ${result.riskLevel.toLowerCase()}`} style={{ marginTop: 8 }}>
                                        <span className="badge-dot" />
                                        {result.riskLevel} Risk
                                    </span>
                                </div>

                                {/* Classification breakdown */}
                                <div className="result-panel">
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Classification Results</h4>
                                    {result.details?.lungClassification && Object.entries(result.details.lungClassification).map(([cls, conf]) => (
                                        <div className="confidence-bar" key={cls}>
                                            <span className="confidence-label">{cls}</span>
                                            <div className="confidence-track">
                                                <div className="confidence-fill" style={{
                                                    width: `${(conf * 100)}%`,
                                                    background: cls !== 'Normal' ? 'var(--respiratory-blue)' : 'var(--success-green)',
                                                }} />
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: 45 }}>
                                                {(conf * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Explanation */}
                                <div className="result-panel" style={{ marginTop: 12 }}>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>
                                        <Info size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                        AI Explanation
                                    </h4>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        {result.details?.explanation}
                                    </p>
                                    {result.details?.riskFactors?.length > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--warning-amber)', marginBottom: 6 }}>
                                                Risk Factors:
                                            </p>
                                            <ul style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: 16 }}>
                                                {result.details.riskFactors.map((f, i) => <li key={i}>{f}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                <button className="btn btn-primary" onClick={resetExam} style={{ marginTop: 20, width: '100%' }}>
                                    <RotateCcw size={16} /> New Examination
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Lung Positioning Guide */}
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-header">
                        <h3 className="card-title"><Stethoscope size={16} style={{ marginRight: 6 }} />Lung Auscultation Points</h3>
                        {trackerAvailable && (
                            <button className="btn btn-sm btn-secondary" onClick={() => setShowCamera(true)}>
                                <Camera size={14} /> Open Camera
                            </button>
                        )}
                    </div>
                    <div className="card-body" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                            {[
                                { name: 'Right Apex', desc: 'Infraclavicular, right midclavicular' },
                                { name: 'Left Apex', desc: 'Infraclavicular, left midclavicular' },
                                { name: 'Right Upper', desc: '2nd intercostal space, anterior' },
                                { name: 'Left Upper', desc: '2nd intercostal space, anterior' },
                                { name: 'Right Middle', desc: '4th intercostal space, right midclavicular' },
                                { name: 'Right Lower', desc: '6th intercostal space, right midclavicular' },
                                { name: 'Left Lower', desc: '6th intercostal space, left midclavicular' },
                            ].map((p, i) => (
                                <div key={i} style={{
                                    padding: '8px 12px', background: 'var(--bg-elevated)',
                                    borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--respiratory-blue)',
                                }}>
                                    <strong style={{ color: 'var(--text-primary)' }}>{p.name}</strong><br />{p.desc}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Fullscreen Tracker Modal */}
            <TrackerModal isOpen={showCamera} mode="lung" onClose={() => setShowCamera(false)} />
        </div>
    );
}
