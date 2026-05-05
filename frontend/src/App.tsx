import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import SearchPage from './pages/Search';
import LoadingPage from './pages/Loading';
import ResultsPage from './pages/Results';
import TripDetailPage from './pages/TripDetail';
import SavedPage from './pages/Saved';
import AlertsPage from './pages/Alerts';
import LoginPage from './pages/Login';
import UpgradePage from './pages/Upgrade';

export default function App() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<SearchPage />} />
        <Route path="/loading" element={<LoadingPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/trip/:id" element={<TripDetailPage />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/upgrade" element={<UpgradePage />} />
        <Route path="*" element={<SearchPage />} />
      </Routes>
    </AnimatePresence>
  );
}
