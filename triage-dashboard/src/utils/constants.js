// Heart auscultation positions (relative to body landmarks, % of body width/height)
export const HEART_POSITIONS = [
  { id: 'aortic', label: 'Aortic', x: 0.46, y: 0.28, description: '2nd right intercostal space, right sternal border' },
  { id: 'pulmonic', label: 'Pulmonic', x: 0.54, y: 0.28, description: '2nd left intercostal space, left sternal border' },
  { id: 'erbs', label: "Erb's Point", x: 0.52, y: 0.34, description: '3rd left intercostal space, left sternal border' },
  { id: 'tricuspid', label: 'Tricuspid', x: 0.50, y: 0.40, description: '4th left intercostal space, left sternal border' },
  { id: 'mitral', label: 'Mitral (Apex)', x: 0.56, y: 0.44, description: '5th intercostal space, midclavicular line' },
];

// Lung auscultation positions (anterior view)
export const LUNG_POSITIONS_ANTERIOR = [
  { id: 'ant_r_upper', label: 'R. Upper', x: 0.42, y: 0.24, description: 'Right upper lobe, anterior' },
  { id: 'ant_l_upper', label: 'L. Upper', x: 0.58, y: 0.24, description: 'Left upper lobe, anterior' },
  { id: 'ant_r_middle', label: 'R. Middle', x: 0.40, y: 0.34, description: 'Right middle lobe, anterior' },
  { id: 'ant_l_middle', label: 'L. Middle', x: 0.60, y: 0.34, description: 'Left middle lobe, anterior' },
  { id: 'ant_r_lower', label: 'R. Lower', x: 0.42, y: 0.44, description: 'Right lower lobe, anterior' },
  { id: 'ant_l_lower', label: 'L. Lower', x: 0.58, y: 0.44, description: 'Left lower lobe, anterior' },
];

// Risk level colors
export const RISK_COLORS = {
  LOW: '#10B981',
  MEDIUM: '#F59E0B',
  HIGH: '#E11D48',
  CRITICAL: '#7E22CE',
};

// System modes
export const SYSTEM_MODES = {
  IDLE: 'IDLE',
  EXAMINING: 'EXAMINING',
  RESULT: 'RESULT',
  CALIBRATING: 'CALIBRATING',
};

// Exam types
export const EXAM_TYPES = {
  HEART: 'heart',
  LUNG: 'lung',
};

// API base URL — relative so it works both in dev (via Vite proxy) and production (same-origin)
export const API_BASE = '/api';
