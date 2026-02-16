import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, HeartPulse, Wind, Crosshair, ClipboardList,
    Settings, Activity, Hospital, Thermometer
} from 'lucide-react';

const navItems = [
    {
        section: 'Overview', items: [
            { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
        ]
    },
    {
        section: 'Examinations', items: [
            { to: '/heart-exam', icon: HeartPulse, label: 'Heart Exam' },
            { to: '/lung-exam', icon: Wind, label: 'Lung Exam' },
            { to: '/temp-exam', icon: Thermometer, label: 'Temp Exam' },
            { to: '/placement-guide', icon: Crosshair, label: 'Placement Guide' },
        ]
    },
    {
        section: 'Analysis', items: [
            { to: '/results', icon: ClipboardList, label: 'Triage Results' },
            { to: '/settings', icon: Settings, label: 'Settings' },
        ]
    },
];

export default function Sidebar({ systemStatus }) {
    const location = useLocation();

    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <img src="/favicon.svg" alt="Triage Station" style={{ height: 28, width: 28, marginRight: 12 }} />
                <div className="brand-text">
                    <h2>Triage Station</h2>
                    <span>Smart Rural Healthcare</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                {navItems.map(section => (
                    <div className="nav-section" key={section.section}>
                        <div className="nav-section-label">{section.section}</div>
                        {section.items.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    `nav-link ${isActive ? 'active' : ''}`
                                }
                                end={item.to === '/'}
                            >
                                <item.icon className="nav-icon" size={20} />
                                {item.label}
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="status-indicator">
                    <div className={`status-dot ${systemStatus?.connected ? '' : 'offline'}`} />
                    <span>{systemStatus?.connected ? 'System Online' : 'Disconnected'}</span>
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <Activity size={12} />
                    <span>{systemStatus?.mode || 'IDLE'}</span>
                </div>
            </div>
        </aside>
    );
}
