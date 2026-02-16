import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Flask hardware backend URL (final_deployment/app.py runs on :5000)
const FLASK_BACKEND = 'http://localhost:5000';

app.use(cors());
app.use(express.json());

// ═══════════════════ Hardware connection state ═══════════════════

let hardwareConnected = false;
let lastHardwareCheck = 0;

/** Probe Flask backend to see if it's running */
async function checkHardwareBackend() {
    const now = Date.now();
    // Only check every 5 seconds to avoid hammering
    if (now - lastHardwareCheck < 5000) return hardwareConnected;
    lastHardwareCheck = now;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${FLASK_BACKEND}/status`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
            hardwareConnected = true;
            return true;
        }
    } catch {
        hardwareConnected = false;
    }
    return false;
}

/** Proxy a request to Flask backend. Returns JSON or null if Flask is down. */
async function proxyToFlask(endpoint, method = 'GET', body = null) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const opts = {
            method,
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body && method !== 'GET') {
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(`${FLASK_BACKEND}${endpoint}`, opts);
        clearTimeout(timeout);
        if (res.ok) return await res.json();
    } catch { /* Flask not available */ }
    return null;
}

// ═══════════════════ Demo/Fallback State ═══════════════════

let systemState = {
    mode: 'IDLE',
    connected: false,
    connectedPort: 'None (Demo)',
    uptime: 0,
    modelsLoaded: true,
    heartModelStatus: 'loaded',
    lungModelStatus: 'loaded',
    lastCalibration: new Date(Date.now() - 3600000).toISOString(),
};

let sensorData = {
    temperature: 36.5,
    audioLevel: 0,
    movement: 0,
    knobValue: 0,
    heartRate: 72,
    respiratoryRate: 16,
    spO2: 98,
};

let examProgress = 0;
let examInterval = null;
let examResult = null;

// Demo triage history
const triageHistory = [
    {
        id: 'triage-001',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        type: 'heart',
        riskLevel: 'LOW',
        diagnosis: 'Normal',
        confidence: 0.94,
        details: {
            heartClassification: { Normal: 0.94, Abnormal: 0.06 },
            temperature: 36.5,
            heartRate: 72,
            audioLevel: 35,
            explanation: 'Heart sounds are within normal parameters. S1 and S2 clearly audible with no murmurs detected.',
            riskFactors: [],
        },
    },
    {
        id: 'triage-002',
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        type: 'lung',
        riskLevel: 'MEDIUM',
        diagnosis: 'Wheeze Detected',
        confidence: 0.78,
        details: {
            lungClassification: { Normal: 0.18, Wheeze: 0.62, Crackle: 0.12, Both: 0.08 },
            temperature: 37.2,
            respiratoryRate: 22,
            audioLevel: 42,
            explanation: 'Wheezing detected in lung sounds. Possible airway narrowing. Recommend follow-up with physician.',
            riskFactors: ['Elevated respiratory rate', 'Slight fever'],
        },
    },
    {
        id: 'triage-003',
        timestamp: new Date(Date.now() - 259200000).toISOString(),
        type: 'heart',
        riskLevel: 'HIGH',
        diagnosis: 'Abnormality Detected',
        confidence: 0.87,
        details: {
            heartClassification: { Normal: 0.13, Abnormal: 0.87 },
            temperature: 38.1,
            heartRate: 112,
            audioLevel: 56,
            explanation: 'Possible murmur detected in heart sounds. Elevated heart rate and temperature. Immediate referral recommended.',
            riskFactors: ['Elevated heart rate (>100 BPM)', 'Fever (38.1\u00B0C)', 'Abnormal heart sound pattern'],
        },
    },
    {
        id: 'triage-004',
        timestamp: new Date(Date.now() - 345600000).toISOString(),
        type: 'lung',
        riskLevel: 'LOW',
        diagnosis: 'Normal',
        confidence: 0.96,
        details: {
            lungClassification: { Normal: 0.96, Wheeze: 0.02, Crackle: 0.01, Both: 0.01 },
            temperature: 36.4,
            respiratoryRate: 15,
            audioLevel: 28,
            explanation: 'Lung sounds are clear bilaterally. Normal breathing pattern observed. No adventitious sounds detected.',
            riskFactors: [],
        },
    },
    {
        id: 'triage-005',
        timestamp: new Date(Date.now() - 432000000).toISOString(),
        type: 'heart',
        riskLevel: 'LOW',
        diagnosis: 'Normal',
        confidence: 0.91,
        details: {
            heartClassification: { Normal: 0.91, Abnormal: 0.09 },
            temperature: 36.7,
            heartRate: 68,
            audioLevel: 30,
            explanation: 'Heart sounds normal. Regular rhythm, no murmurs or gallops.',
            riskFactors: [],
        },
    },
];

// ═══════════════════ Simulate Sensors (demo mode) ═══════════════════
setInterval(() => {
    systemState.uptime += 1;
    if (!hardwareConnected) {
        sensorData.temperature = +(36.2 + Math.random() * 1.2).toFixed(1);
        sensorData.audioLevel = Math.floor(Math.random() * 60);
        sensorData.movement = Math.random() > 0.85 ? 1 : 0;
        sensorData.knobValue = Math.floor(Math.random() * 1024);
        sensorData.heartRate = Math.floor(65 + Math.random() * 20);
        sensorData.respiratoryRate = Math.floor(14 + Math.random() * 6);
        sensorData.spO2 = Math.floor(96 + Math.random() * 3);
    }
}, 1000);

// Periodically check for hardware backend
setInterval(() => { checkHardwareBackend(); }, 5000);
checkHardwareBackend(); // Initial check

// ═══════════════════ API Routes ═══════════════════

// System status — proxy to Flask or return demo data
app.get('/api/status', async (req, res) => {
    const hwAvailable = await checkHardwareBackend();

    if (hwAvailable) {
        const flaskData = await proxyToFlask('/status');
        if (flaskData) {
            return res.json({
                mode: flaskData.mode || 'IDLE',
                connected: true,
                connectedPort: flaskData.connected_port || 'Hardware',
                uptime: systemState.uptime,
                modelsLoaded: true,
                heartModelStatus: 'loaded',
                lungModelStatus: 'loaded',
                lastCalibration: systemState.lastCalibration,
                timestamp: new Date().toISOString(),
                examProgress: flaskData.mode === 'EXAMINING' ? examProgress : null,
                examResult: flaskData.mode === 'RESULT' ? examResult : null,
                totalTriages: triageHistory.length,
                riskBreakdown: {
                    low: triageHistory.filter(t => t.riskLevel === 'LOW').length,
                    medium: triageHistory.filter(t => t.riskLevel === 'MEDIUM').length,
                    high: triageHistory.filter(t => t.riskLevel === 'HIGH').length,
                    critical: triageHistory.filter(t => t.riskLevel === 'CRITICAL').length,
                },
                hardwareConnected: true,
                diagnosis: flaskData.diagnosis,
                riskLevel: flaskData.risk_level,
            });
        }
    }

    // Fallback: demo data — server IS connected, just no hardware
    res.json({
        ...systemState,
        connected: true,
        timestamp: new Date().toISOString(),
        examProgress: systemState.mode === 'EXAMINING' ? examProgress : null,
        examResult: systemState.mode === 'RESULT' ? examResult : null,
        totalTriages: triageHistory.length,
        riskBreakdown: {
            low: triageHistory.filter(t => t.riskLevel === 'LOW').length,
            medium: triageHistory.filter(t => t.riskLevel === 'MEDIUM').length,
            high: triageHistory.filter(t => t.riskLevel === 'HIGH').length,
            critical: triageHistory.filter(t => t.riskLevel === 'CRITICAL').length,
        },
        hardwareConnected: false,
    });
});

// Sensor data — proxy to Flask or return demo data
app.get('/api/sensor-data', async (req, res) => {
    if (hardwareConnected) {
        const flaskData = await proxyToFlask('/status');
        if (flaskData) {
            return res.json({
                temperature: flaskData.temp ?? sensorData.temperature,
                audioLevel: flaskData.audio_level ?? sensorData.audioLevel,
                movement: flaskData.movement ?? sensorData.movement,
                knobValue: flaskData.knob_val ?? sensorData.knobValue,
                heartRate: sensorData.heartRate,
                respiratoryRate: sensorData.respiratoryRate,
                spO2: sensorData.spO2,
                timestamp: new Date().toISOString(),
                source: 'hardware',
            });
        }
    }

    res.json({
        ...sensorData,
        timestamp: new Date().toISOString(),
        source: 'demo',
    });
});

// Start examination — try Flask first, fallback to demo
app.post('/api/exam/start', async (req, res) => {
    const { type } = req.body;

    // Try proxying to Flask hardware backend
    if (hardwareConnected) {
        const result = await proxyToFlask('/start_exam', 'POST', {});
        if (result && result.s === 'started') {
            systemState.mode = 'EXAMINING';
            examProgress = 0;
            examResult = null;

            // Poll Flask for progress
            examInterval = setInterval(async () => {
                const flaskStatus = await proxyToFlask('/status');
                if (flaskStatus) {
                    if (flaskStatus.mode === 'RESULT') {
                        clearInterval(examInterval);
                        examInterval = null;
                        systemState.mode = 'RESULT';

                        // Build result from Flask data
                        const isAbnormal = flaskStatus.risk_level === 'HIGH';
                        examResult = buildExamResult(type, isAbnormal, flaskStatus);
                        triageHistory.unshift(examResult);
                    }
                }
                examProgress = Math.min(examProgress + 2, 99);
            }, 200);

            return res.json({ status: 'started', type, source: 'hardware' });
        }
    }

    // Fallback: demo examination
    if (systemState.mode !== 'IDLE') {
        return res.status(400).json({ error: 'System is busy' });
    }

    systemState.mode = 'EXAMINING';
    examProgress = 0;
    examResult = null;

    examInterval = setInterval(() => {
        examProgress += 2;
        if (examProgress >= 100) {
            clearInterval(examInterval);
            examInterval = null;
            systemState.mode = 'RESULT';

            const isAbnormal = Math.random() > 0.6;
            examResult = buildExamResult(type, isAbnormal);
            triageHistory.unshift(examResult);
        }
    }, 100);

    res.json({ status: 'started', type, source: 'demo' });
});

/** Build an exam result object */
function buildExamResult(type, isAbnormal, flaskData = null) {
    if (type === 'heart') {
        const normalConf = isAbnormal ? +(0.1 + Math.random() * 0.3).toFixed(2) : +(0.75 + Math.random() * 0.2).toFixed(2);
        const abnormalConf = +(1 - normalConf).toFixed(2);
        return {
            id: `triage-${String(triageHistory.length + 1).padStart(3, '0')}`,
            timestamp: new Date().toISOString(),
            type: 'heart',
            riskLevel: isAbnormal ? 'HIGH' : 'LOW',
            diagnosis: isAbnormal ? 'Abnormality Detected' : 'Normal',
            confidence: isAbnormal ? abnormalConf : normalConf,
            details: {
                heartClassification: { Normal: normalConf, Abnormal: abnormalConf },
                temperature: flaskData?.temp ?? sensorData.temperature,
                heartRate: sensorData.heartRate,
                audioLevel: flaskData?.audio_level ?? sensorData.audioLevel,
                explanation: isAbnormal
                    ? 'Possible murmur detected. Recommend referral for echocardiography.'
                    : 'Heart sounds within normal parameters. S1 and S2 clearly audible.',
                riskFactors: isAbnormal ? ['Abnormal heart sound pattern', 'Elevated audio signal'] : [],
            },
        };
    } else {
        const classes = ['Normal', 'Wheeze', 'Crackle', 'Both'];
        const picked = isAbnormal ? classes[Math.floor(1 + Math.random() * 2)] : 'Normal';
        const conf = +(0.7 + Math.random() * 0.25).toFixed(2);
        const remaining = +(1 - conf).toFixed(2);
        const classification = {};
        classes.forEach(c => {
            classification[c] = c === picked ? conf : +(remaining / 3).toFixed(2);
        });
        return {
            id: `triage-${String(triageHistory.length + 1).padStart(3, '0')}`,
            timestamp: new Date().toISOString(),
            type: 'lung',
            riskLevel: isAbnormal ? 'MEDIUM' : 'LOW',
            diagnosis: isAbnormal ? `${picked} Detected` : 'Normal',
            confidence: conf,
            details: {
                lungClassification: classification,
                temperature: flaskData?.temp ?? sensorData.temperature,
                respiratoryRate: sensorData.respiratoryRate,
                audioLevel: flaskData?.audio_level ?? sensorData.audioLevel,
                explanation: isAbnormal
                    ? `${picked} detected in lung sounds. Recommend follow-up examination.`
                    : 'Lung sounds clear bilaterally. Normal breathing pattern.',
                riskFactors: isAbnormal ? [`${picked} detected`, 'Abnormal respiratory pattern'] : [],
            },
        };
    }
}

// Stop examination
app.post('/api/exam/stop', async (req, res) => {
    if (hardwareConnected) {
        await proxyToFlask('/reset', 'POST');
    }
    if (examInterval) {
        clearInterval(examInterval);
        examInterval = null;
    }
    systemState.mode = 'IDLE';
    examProgress = 0;
    examResult = null;
    res.json({ status: 'stopped' });
});

// Reset to idle
app.post('/api/reset', async (req, res) => {
    if (hardwareConnected) {
        await proxyToFlask('/reset', 'POST');
    }
    if (examInterval) {
        clearInterval(examInterval);
        examInterval = null;
    }
    systemState.mode = 'IDLE';
    examProgress = 0;
    examResult = null;
    res.json({ status: 'reset' });
});

// ═══════════════════ Tracker Proxy (Python MJPEG server on :5050) ═══════════════════

const TRACKER_BACKEND = 'http://localhost:5050';

// MJPEG feed — pipe the stream directly through
app.get('/api/tracker/feed', async (req, res) => {
    const mode = req.query.mode || 'heart';
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const upstream = await fetch(`${TRACKER_BACKEND}/feed?mode=${mode}`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!upstream.ok) {
            return res.status(502).json({ error: 'Tracker not available' });
        }

        // Forward headers and pipe the MJPEG stream
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Pipe Node.js readable stream to response
        const reader = upstream.body.getReader();
        const pump = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done || res.destroyed) break;
                    res.write(value);
                }
            } catch { /* stream ended */ }
            res.end();
        };
        pump();

        req.on('close', () => {
            try { reader.cancel(); } catch { }
        });
    } catch {
        res.status(502).json({ error: 'Tracker server not running. Start tracker_server.py first.' });
    }
});

// Tracker status
app.get('/api/tracker/status', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const resp = await fetch(`${TRACKER_BACKEND}/status`, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) {
            const data = await resp.json();
            return res.json({ ...data, available: true });
        }
    } catch { }
    res.json({ available: false, mode: null, visited: {}, progress: 0 });
});

// Tracker reset
app.post('/api/tracker/reset', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const resp = await fetch(`${TRACKER_BACKEND}/reset`, {
            method: 'POST',
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok) return res.json(await resp.json());
    } catch { }
    res.json({ status: 'tracker_unavailable' });
});

// Tracker availability check
app.get('/api/tracker/health', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        const resp = await fetch(`${TRACKER_BACKEND}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) return res.json({ available: true });
    } catch { }
    res.json({ available: false });
});

// Triage history
app.get('/api/triage/history', (req, res) => {
    res.json(triageHistory);
});

// Single triage detail
app.get('/api/triage/:id', (req, res) => {
    const triage = triageHistory.find(t => t.id === req.params.id);
    if (!triage) return res.status(404).json({ error: 'Not found' });
    res.json(triage);
});

// Calibration
let calibrationState = { status: 'idle', progress: 0 };
let calibrationInterval = null;

app.post('/api/calibration/start', (req, res) => {
    if (calibrationState.status === 'running') {
        return res.status(400).json({ error: 'Calibration already running' });
    }
    calibrationState = { status: 'running', progress: 0 };
    calibrationInterval = setInterval(() => {
        calibrationState.progress += 5;
        if (calibrationState.progress >= 100) {
            clearInterval(calibrationInterval);
            calibrationInterval = null;
            calibrationState = { status: 'complete', progress: 100 };
            systemState.lastCalibration = new Date().toISOString();
        }
    }, 200);
    res.json({ status: 'started' });
});

app.get('/api/calibration/status', (req, res) => {
    res.json(calibrationState);
});

// Model info
app.get('/api/models', (req, res) => {
    res.json({
        heart: {
            name: 'Heart Sound Classifier',
            version: '1.0.0',
            status: 'loaded',
            size: '1.8 MB',
            accuracy: '92%',
            inputShape: '64x87 mel-spectrogram',
            classes: ['Normal', 'Abnormal'],
            inferenceTime: '~150ms',
        },
        lung: {
            name: 'Lung Sound Classifier',
            version: '1.0.0',
            status: 'loaded',
            size: '1.9 MB',
            accuracy: '85%',
            inputShape: '64x87 mel-spectrogram',
            classes: ['Normal', 'Wheeze', 'Crackle', 'Both'],
            inferenceTime: '~160ms',
        },
    });
});

// Config info
app.get('/api/config', (req, res) => {
    res.json({
        triage: {
            ml_confidence_threshold: 0.7,
            temperature_fever_threshold: 38.0,
            heart_rate_high: 100,
            heart_rate_low: 50,
            respiratory_rate_high: 25,
            respiratory_rate_low: 10,
        },
        fusionWeights: {
            ml_prediction: 0.5,
            audio_analysis: 0.3,
            vital_signs: 0.2,
        },
        audio: {
            sample_rate: 8000,
            channels: 1,
            filter_range: '20-2000 Hz',
        },
        examination: {
            duration: '8 seconds',
            modes: ['heart', 'lung', 'both'],
        },
    });
});

// Hardware status endpoint — check if Flask backend is reachable
app.get('/api/hardware', async (req, res) => {
    const connected = await checkHardwareBackend();
    res.json({
        connected,
        backendUrl: FLASK_BACKEND,
        lastCheck: new Date(lastHardwareCheck).toISOString(),
    });
});

// Serve static files in production
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA fallback — serve index.html for non-API routes
    app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api')) {
            res.sendFile(join(distPath, 'index.html'));
        } else {
            next();
        }
    });
}

app.listen(PORT, () => {
    console.log(`\n  Triage API Server running at http://localhost:${PORT}`);
    console.log(`  Hardware backend: ${FLASK_BACKEND}`);
    console.log(`  Mode: ${hardwareConnected ? 'HARDWARE CONNECTED' : 'DEMO (simulated data)'}`);
    console.log(`  Exam buttons work in both modes\n`);
});
