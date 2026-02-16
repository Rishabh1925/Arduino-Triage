import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useApi } from './hooks/useApi';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import MobileTabBar from './components/MobileTabBar';
import Dashboard from './pages/Dashboard';
import HeartExam from './pages/HeartExam';
import LungExam from './pages/LungExam';
import PlacementGuide from './pages/PlacementGuide';
import Results from './pages/Results';
import TempExam from './pages/TempExam';
import SettingsPage from './pages/Settings';

function AppLayout() {
  const { data: status } = useApi('/status', 2000);

  return (
    <div className="app-layout">
      <Sidebar systemStatus={status} />
      <Navbar systemStatus={status} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard status={status} />} />
          <Route path="/heart-exam" element={<HeartExam status={status} />} />
          <Route path="/lung-exam" element={<LungExam status={status} />} />
          <Route path="/temp-exam" element={<TempExam status={status} />} />
          <Route path="/placement-guide" element={<PlacementGuide />} />
          <Route path="/results" element={<Results />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <MobileTabBar />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
