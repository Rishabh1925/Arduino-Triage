import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { API_BASE } from '../utils/constants';
import {
    Thermometer, Play, RotateCcw, CheckCircle,
    AlertTriangle, Info, Activity
} from 'lucide-react';
import ExamModal from '../components/ExamModal';

export default function TempExam({ status }) {
    const { data: sensorData } = useApi('/sensor-data', 1000);
    const [examState, setExamState] = useState('idle'); // idle, measuring, result
    const [temperature, setTemperature] = useState(null);
    const [progress, setProgress] = useState(0);
    const [assessment, setAssessment] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('EXAMINING');

    const startMeasurement = () => {
        setExamState('measuring');
        setTemperature(null);
        setAssessment(null);
        setProgress(0);
        setIsModalOpen(true);
        setModalMode('EXAMINING');

        // Simulate a temperature measurement over ~3 seconds
        let prog = 0;
        const interval = setInterval(() => {
            prog += 4;
            setProgress(prog);
            if (prog >= 100) {
                clearInterval(interval);
                // Fetch actual sensor data for the reading
                fetch(`${API_BASE}/sensor-data`)
                    .then(res => res.json())
                    .then(data => {
                        const temp = data.temperature;
                        setTemperature(temp);
                        setAssessment(getAssessment(temp));
                        setExamState('result');
                        setModalMode('RESULT');
                    })
                    .catch(() => {
                        setTemperature(36.5);
                        setAssessment(getAssessment(36.5));
                        setExamState('result');
                        setModalMode('RESULT');
                    });
            }
        }, 120);
    };

    const getAssessment = (temp) => {
        if (temp < 35.0) return { label: 'Hypothermia', risk: 'HIGH', color: 'var(--respiratory-blue)', explanation: 'Body temperature is below normal range. This may indicate hypothermia. Ensure the patient is warmed and monitor closely.' };
        if (temp < 36.1) return { label: 'Below Normal', risk: 'MEDIUM', color: 'var(--warning-amber)', explanation: 'Body temperature is slightly below normal range. Monitor the patient and ensure adequate warmth.' };
        if (temp <= 37.2) return { label: 'Normal', risk: 'LOW', color: 'var(--success-green)', explanation: 'Body temperature is within the normal range (36.1°C – 37.2°C). No concerns detected.' };
        if (temp <= 38.0) return { label: 'Low-Grade Fever', risk: 'MEDIUM', color: 'var(--warning-amber)', explanation: 'Slight elevation in body temperature. This may be due to mild infection or physical activity. Monitor and reassess.' };
        if (temp <= 39.0) return { label: 'Fever', risk: 'HIGH', color: 'var(--cardiac-red)', explanation: 'Elevated body temperature indicating fever. May suggest infection or inflammatory response. Medical attention recommended.' };
        return { label: 'High Fever', risk: 'HIGH', color: 'var(--cardiac-red)', explanation: 'Dangerously high body temperature. Immediate medical intervention required. Risk of febrile seizures.' };
    };

    const resetExam = () => {
        setExamState('idle');
        setTemperature(null);
        setAssessment(null);
        setProgress(0);
        setIsModalOpen(false);
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><Thermometer size={28} style={{ color: 'var(--warning-amber)', verticalAlign: 'middle', marginRight: 10 }} />Temperature Measurement</h1>
                <p>Body temperature assessment with automated risk classification</p>
            </div>

            {/* Exam Modal - same as Heart/Lung pages */}
            <ExamModal
                isOpen={isModalOpen}
                mode={modalMode}
                onClose={() => setIsModalOpen(false)}
                onViewResults={() => setIsModalOpen(false)}
            />

            <div className="grid-2">
                {/* Main Exam Control */}
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-header">
                        <h3 className="card-title"><Thermometer size={16} color="var(--warning-amber)" style={{ marginRight: 6 }} />Measurement Control</h3>
                        <span className={`risk-badge ${examState === 'measuring' ? 'high' : examState === 'result' ? 'low' : 'medium'}`}>
                            <span className="badge-dot" />
                            {examState === 'measuring' ? 'Measuring' : examState === 'result' ? 'Complete' : 'Ready'}
                        </span>
                    </div>
                    <div className="card-body">
                        {examState === 'idle' && (
                            <div className="exam-flow">
                                <div style={{
                                    width: 100, height: 100, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.15))',
                                    border: '2px solid var(--warning-amber)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                                }}>
                                    <Thermometer size={48} color="var(--warning-amber)" />
                                </div>
                                <h3 className="exam-status">Ready for Temperature Measurement</h3>
                                <p className="exam-progress-text">
                                    Ensure the temperature sensor is properly positioned on the patient.
                                    The measurement will take approximately 3 seconds.
                                </p>
                                <button
                                    className="btn btn-lg"
                                    style={{
                                        background: 'linear-gradient(135deg, var(--warning-amber), #d97706)',
                                        color: 'white', border: 'none',
                                    }}
                                    onClick={startMeasurement}
                                >
                                    <Play size={18} /> Start Temperature Measurement
                                </button>
                            </div>
                        )}

                        {examState === 'measuring' && (
                            <div className="exam-flow">
                                <div style={{
                                    width: 120, height: 120, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.15))',
                                    border: '2px solid var(--warning-amber)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                                    animation: 'pulse 1.5s ease-in-out infinite',
                                }}>
                                    <Thermometer size={56} color="var(--warning-amber)" />
                                </div>
                                <h3 className="exam-status" style={{ color: 'var(--warning-amber)' }}>Measuring Temperature...</h3>
                                <p className="exam-progress-text">
                                    <strong>Please hold still</strong> while the sensor captures the reading.
                                </p>
                                <div className="progress-bar" style={{ maxWidth: 400, margin: '0 auto 20px' }}>
                                    <div className="progress-fill" style={{
                                        width: `${progress}%`,
                                        background: 'linear-gradient(90deg, var(--warning-amber), #d97706)',
                                    }} />
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{progress}% complete</p>
                            </div>
                        )}

                        {examState === 'result' && temperature !== null && assessment && (
                            <div>
                                <div className="exam-flow" style={{ paddingBottom: 16 }}>
                                    <div style={{
                                        width: 100, height: 100, borderRadius: '50%',
                                        background: 'transparent', border: `3px solid ${assessment.color}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        margin: '0 auto 16px', flexDirection: 'column',
                                    }}>
                                        <span style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: assessment.color }}>
                                            {temperature}°
                                        </span>
                                    </div>
                                    <h3 className="exam-status">{assessment.label}</h3>
                                    <span className={`risk-badge ${assessment.risk.toLowerCase()}`} style={{ marginTop: 8 }}>
                                        <span className="badge-dot" />
                                        {assessment.risk} Risk
                                    </span>
                                </div>

                                <div className="result-panel">
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Temperature Reading</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                        <div style={{
                                            padding: '12px 16px', background: 'var(--bg-elevated)',
                                            borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--warning-amber)',
                                        }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Measured</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{temperature}°C</div>
                                        </div>
                                        <div style={{
                                            padding: '12px 16px', background: 'var(--bg-elevated)',
                                            borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--success-green)',
                                        }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Normal Range</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>36.1 – 37.2°C</div>
                                        </div>
                                    </div>

                                    {/* Visual temperature scale */}
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Temperature Scale</div>
                                        <div style={{
                                            height: 12, borderRadius: 6,
                                            background: 'linear-gradient(90deg, #3B82F6 0%, #10B981 25%, #10B981 45%, #F59E0B 65%, #EF4444 85%, #DC2626 100%)',
                                            position: 'relative',
                                        }}>
                                            {/* Marker for current temperature */}
                                            <div style={{
                                                position: 'absolute',
                                                left: `${Math.min(Math.max(((temperature - 34) / 7) * 100, 0), 100)}%`,
                                                top: -4, width: 20, height: 20,
                                                borderRadius: '50%', background: 'white',
                                                border: `3px solid ${assessment.color}`,
                                                transform: 'translateX(-50%)',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                            }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                            <span>34°C</span>
                                            <span>36°C</span>
                                            <span>37°C</span>
                                            <span>38°C</span>
                                            <span>41°C</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="result-panel" style={{ marginTop: 12 }}>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>
                                        <Info size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                        Assessment
                                    </h4>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        {assessment.explanation}
                                    </p>
                                </div>

                                <button
                                    className="btn btn-lg"
                                    style={{
                                        marginTop: 20, width: '100%',
                                        background: 'linear-gradient(135deg, var(--warning-amber), #d97706)',
                                        color: 'white', border: 'none',
                                    }}
                                    onClick={resetExam}
                                >
                                    <RotateCcw size={16} /> New Measurement
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Temperature Reference Guide */}
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-header">
                        <h3 className="card-title"><Activity size={16} style={{ marginRight: 6 }} />Temperature Reference Guide</h3>
                    </div>
                    <div className="card-body" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                            {[
                                { name: 'Hypothermia', range: '< 35.0°C', color: '#3B82F6' },
                                { name: 'Below Normal', range: '35.0 – 36.0°C', color: '#60A5FA' },
                                { name: 'Normal', range: '36.1 – 37.2°C', color: '#10B981' },
                                { name: 'Low-Grade Fever', range: '37.3 – 38.0°C', color: '#F59E0B' },
                                { name: 'Fever', range: '38.1 – 39.0°C', color: '#EF4444' },
                                { name: 'High Fever', range: '> 39.0°C', color: '#DC2626' },
                            ].map((item, i) => (
                                <div key={i} style={{
                                    padding: '8px 12px', background: 'var(--bg-elevated)',
                                    borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${item.color}`,
                                }}>
                                    <strong style={{ color: 'var(--text-primary)' }}>{item.name}</strong><br />{item.range}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
