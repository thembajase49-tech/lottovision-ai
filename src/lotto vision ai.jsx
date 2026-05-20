import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Trophy,
  Brain,
  Globe,
  ScanLine,
  BarChart3,
  Sparkles,
  Crown,
  Wallet,
  TrendingUp,
  ShieldCheck,
  User,
  LogIn,
  Database,
  LogOut,
  Lock,
  CreditCard,
  CheckCircle2,
  Loader2,
  Menu,
  X,
  RefreshCw,
  Activity,
  LineChart as LineChartIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, firebaseConfigured } from './firebase';

const formatAuthError = (error) => {
  const code = error?.code?.replace('auth/', '').replaceAll('-', ' ');

  if (!code) {
    return 'Authentication failed. Please try again.';
  }

  return code.charAt(0).toUpperCase() + code.slice(1);
};

const fallbackDraws = [
  {
    country: 'South Africa',
    game: 'PowerBall',
    jackpot: 'R 125M',
    time: '20:59',
    status: 'Live',
    lastNumbers: ['04', '11', '18', '29', '33', '41'],
  },
  {
    country: 'USA',
    game: 'Mega Millions',
    jackpot: '$220M',
    time: '21:00',
    status: 'Tracking',
    lastNumbers: ['07', '13', '22', '31', '38', '45'],
  },
  {
    country: 'UK',
    game: 'UK Lotto',
    jackpot: 'GBP 18M',
    time: '20:00',
    status: 'Tracking',
    lastNumbers: ['03', '16', '21', '32', '39', '47'],
  },
];

const fallbackHistory = [
  {
    id: 'sa-1',
    game: 'PowerBall',
    date: '2026-05-15',
    numbers: ['04', '11', '18', '29', '33', '41'],
    jackpot: 'R 125M',
  },
  {
    id: 'sa-2',
    game: 'PowerBall',
    date: '2026-05-12',
    numbers: ['07', '14', '22', '31', '38', '45'],
    jackpot: 'R 118M',
  },
  {
    id: 'us-1',
    game: 'Mega Millions',
    date: '2026-05-14',
    numbers: ['06', '13', '24', '33', '40', '49'],
    jackpot: '$220M',
  },
  {
    id: 'uk-1',
    game: 'UK Lotto',
    date: '2026-05-14',
    numbers: ['03', '16', '21', '32', '39', '47'],
    jackpot: 'GBP 18M',
  },
];

const confidenceGraphData = [
  { label: 'Scan', confidence: 61 },
  { label: 'Trends', confidence: 68 },
  { label: 'Cycles', confidence: 73 },
  { label: 'AI Fit', confidence: 78 },
  { label: 'Risk', confidence: 74 },
  { label: 'Final', confidence: 82 },
];

const cardMotion = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const sectionMotion = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      staggerChildren: 0.07,
    },
  },
};

function SkeletonBlock({ className = '', style }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-gradient-to-r from-white/5 via-white/10 to-white/5 ${className}`}
      style={style}
    />
  );
}

const normalizeApiPayload = (payload) => {
  const source = Array.isArray(payload) ? payload : payload?.draws || payload?.results;

  if (!Array.isArray(source) || source.length === 0) {
    return {
      draws: fallbackDraws,
      history: fallbackHistory,
    };
  }

  const draws = source.slice(0, 6).map((item, index) => ({
    country: item.country || item.market || fallbackDraws[index % fallbackDraws.length].country,
    game: item.game || item.name || item.lottery || fallbackDraws[index % fallbackDraws.length].game,
    jackpot:
      item.jackpot ||
      item.estimatedJackpot ||
      item.prize ||
      fallbackDraws[index % fallbackDraws.length].jackpot,
    time: item.time || item.drawTime || item.nextDrawTime || 'Live',
    status: item.status || 'Live',
    lastNumbers:
      item.numbers ||
      item.winningNumbers ||
      fallbackDraws[index % fallbackDraws.length].lastNumbers,
  }));

  const history = source.slice(0, 10).map((item, index) => ({
    id: item.id || `${item.game || item.name || 'draw'}-${index}`,
    game: item.game || item.name || item.lottery || draws[index % draws.length].game,
    date: item.date || item.drawDate || new Date().toISOString().slice(0, 10),
    numbers: item.numbers || item.winningNumbers || draws[index % draws.length].lastNumbers,
    jackpot: item.jackpot || item.prize || draws[index % draws.length].jackpot,
  }));

  return {
    draws,
    history,
  };
};

export default function LottoVisionAI() {
  const [prediction, setPrediction] = useState([
    '04',
    '11',
    '18',
    '29',
    '33',
    '41',
  ]);

  const [selectedCountry, setSelectedCountry] = useState('South Africa');
  const [savedPredictions, setSavedPredictions] = useState([]);
  const [predictionMode, setPredictionMode] = useState('AI Smart');
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(firebaseConfigured);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(
    firebaseConfigured ? '' : 'Add your Firebase web app keys to a .env file.'
  );
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [predictionSaving, setPredictionSaving] = useState(false);
  const [predictionError, setPredictionError] = useState('');
  const [premiumStatus, setPremiumStatus] = useState('free');
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const [liveDraws, setLiveDraws] = useState(fallbackDraws);
  const [drawHistory, setDrawHistory] = useState(fallbackHistory);
  const [liveDataLoading, setLiveDataLoading] = useState(true);
  const [liveDataError, setLiveDataError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const trending = ['07', '13', '22', '31', '38', '45'];

  const stats = useMemo(
    () => [
      {
        label: 'Predictions Generated',
        value: '2.4M+',
        icon: <Brain className="w-7 h-7" />,
      },
      {
        label: 'Global Users',
        value: '128K+',
        icon: <Globe className="w-7 h-7" />,
      },
      {
        label: 'Premium Members',
        value: '18K+',
        icon: <Crown className="w-7 h-7" />,
      },
      {
        label: 'Accuracy Tracking',
        value: '84%',
        icon: <TrendingUp className="w-7 h-7" />,
      },
    ],
    []
  );

  const fetchLiveLottoData = useCallback(async () => {
    const apiUrl = import.meta.env.VITE_LOTTO_RESULTS_API_URL;
    const apiKey = import.meta.env.VITE_LOTTO_RESULTS_API_KEY;

    setLiveDataLoading(true);

    try {
      if (!apiUrl) {
        window.setTimeout(() => {
          setLiveDraws(fallbackDraws);
          setDrawHistory(fallbackHistory);
          setLiveDataError('Using demo live feed until API credentials are added.');
          setLiveDataLoading(false);
          setLastRefresh(new Date());
        }, 450);
        return;
      }

      const response = await fetch(apiUrl, {
        headers: apiKey
          ? {
              Authorization: `Bearer ${apiKey}`,
            }
          : undefined,
      });

      if (!response.ok) {
        throw new Error(`Live API returned ${response.status}`);
      }

      const payload = await response.json();
      const normalized = normalizeApiPayload(payload);

      setLiveDraws(normalized.draws);
      setDrawHistory(normalized.history);
      setLiveDataError('');
      setLastRefresh(new Date());
    } catch (error) {
      setLiveDraws(fallbackDraws);
      setDrawHistory(fallbackHistory);
      setLiveDataError(error.message || 'Live results feed unavailable.');
      setLastRefresh(new Date());
    } finally {
      if (apiUrl) {
        setLiveDataLoading(false);
      }
    }
  }, []);

  const frequencyData = useMemo(() => {
    const counts = new Map();

    drawHistory.forEach((draw) => {
      draw.numbers.forEach((number) => {
        counts.set(number, (counts.get(number) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .map(([number, count]) => ({
        number,
        count,
      }))
      .sort((a, b) => Number(a.number) - Number(b.number))
      .slice(0, 12);
  }, [drawHistory]);

  useEffect(() => {
    if (!auth || !firebaseConfigured) {
      return undefined;
    }

    let unsubscribe = () => {};
    let active = true;

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        if (!active) {
          return;
        }

        unsubscribe = onAuthStateChanged(auth, (user) => {
          setCurrentUser(user);
          if (!user) {
            setSavedPredictions([]);
            setPremiumStatus('free');
          } else {
            const storedStatus = window.localStorage.getItem(
              `lottoVisionPremium:${user.uid}`
            );
            setPremiumStatus(storedStatus === 'premium' ? 'premium' : 'free');
          }
          setAuthLoading(false);
          setFirebaseConnected(true);
        });
      })
      .catch((error) => {
        setAuthError(formatAuthError(error));
        setAuthLoading(false);
        setFirebaseConnected(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const startupRefresh = window.setTimeout(fetchLiveLottoData, 0);
    const interval = window.setInterval(fetchLiveLottoData, 60000);

    return () => {
      window.clearTimeout(startupRefresh);
      window.clearInterval(interval);
    };
  }, [fetchLiveLottoData]);

  useEffect(() => {
    if (!db || !currentUser) {
      return undefined;
    }

    const predictionsRef = collection(
      db,
      'users',
      currentUser.uid,
      'predictions'
    );
    const predictionsQuery = query(
      predictionsRef,
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      predictionsQuery,
      (snapshot) => {
        setSavedPredictions(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
        setPredictionError('');
      },
      (error) => {
        setPredictionError(formatAuthError(error));
      }
    );

    return unsubscribe;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    window.localStorage.setItem(
      `lottoVisionPremium:${currentUser.uid}`,
      premiumStatus
    );
  }, [currentUser, premiumStatus]);

  const userName =
    currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Guest User';
  const isPremium = premiumStatus === 'premium';
  const authTabs = currentUser
    ? ['Dashboard', 'Predictions', 'Analytics', 'Premium']
    : ['Dashboard', 'Login', 'Signup'];

  const updateAuthField = (field, value) => {
    setAuthForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const openAuthPage = (mode = 'login') => {
    setAuthMode(mode);
    setActiveTab(mode === 'signup' ? 'Signup' : 'Login');
    setAuthError('');
  };

  const handleNavSelect = (tab) => {
    if (tab === 'Login') {
      openAuthPage('login');
      setMobileNavOpen(false);
      return;
    }

    if (tab === 'Signup') {
      openAuthPage('signup');
      setMobileNavOpen(false);
      return;
    }

    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    if (!auth || !firebaseConfigured) {
      setAuthError('Firebase is not configured yet.');
      return;
    }

    setAuthBusy(true);

    try {
      if (authMode === 'signup') {
        const credential = await createUserWithEmailAndPassword(
          auth,
          authForm.email,
          authForm.password
        );

        if (authForm.name.trim()) {
          await updateProfile(credential.user, {
            displayName: authForm.name.trim(),
          });
          setCurrentUser({ ...credential.user, displayName: authForm.name.trim() });
        }
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
      }

      setAuthForm({
        name: '',
        email: '',
        password: '',
      });
      setActiveTab('Dashboard');
    } catch (error) {
      setAuthError(formatAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthError('');

    if (!auth) {
      return;
    }

    try {
      await signOut(auth);
      setPremiumStatus('free');
      setActiveTab('Dashboard');
    } catch (error) {
      setAuthError(formatAuthError(error));
    }
  };

  const handlePremiumSubscribe = async () => {
    setSubscriptionMessage('');

    if (!currentUser) {
      setSubscriptionMessage('Create an account or login before starting Premium.');
      openAuthPage('signup');
      return;
    }

    setSubscriptionBusy(true);

    window.setTimeout(() => {
      setPremiumStatus('premium');
      setSubscriptionBusy(false);
      setSubscriptionMessage('Premium activated for this session.');
    }, 900);
  };

  const generatePrediction = async () => {
    if (!currentUser) {
      setPredictionError('Login or create an account to save prediction history.');
      openAuthPage('login');
      return;
    }

    const numbers = [];

    while (numbers.length < 6) {
      const num = Math.floor(Math.random() * 49) + 1;
      const formatted = num.toString().padStart(2, '0');

      if (!numbers.includes(formatted)) {
        numbers.push(formatted);
      }
    }

    const generated = numbers.sort();

    const nextPrediction = {
      mode: predictionMode,
      country: selectedCountry,
      numbers: generated,
      confidence: `${70 + Math.floor(Math.random() * 20)}%`,
    };

    setPrediction(generated);
    setPredictionError('');

    if (!db || !currentUser) {
      setSavedPredictions((prev) => [
        {
          id: Date.now(),
          ...nextPrediction,
        },
        ...prev,
      ]);
      return;
    }

    setPredictionSaving(true);

    try {
      await addDoc(collection(db, 'users', currentUser.uid, 'predictions'), {
        ...nextPrediction,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      setPredictionError(formatAuthError(error));
    } finally {
      setPredictionSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050816] text-white p-4 md:p-6 font-sans antialiased">
      <div className="max-w-7xl mx-auto">
        <div className="md:hidden mb-5 flex items-center justify-between bg-white/5 backdrop-blur-xl p-4 rounded-3xl border border-white/10">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-cyan-300" />
            <span className="font-black">LottoVision AI</span>
          </div>
          <button
            onClick={() => setMobileNavOpen(true)}
            className="bg-black/20 p-3 rounded-2xl"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              className="fixed inset-0 z-50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                className="absolute inset-0 bg-black/60"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation overlay"
              />
              <motion.aside
                className="absolute right-0 top-0 h-full w-80 max-w-[88vw] bg-[#0B1020]/95 backdrop-blur-2xl border-l border-white/10 p-5"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 26, stiffness: 240 }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-gray-400 text-sm">Navigation</p>
                    <h2 className="text-2xl font-black">Live Platform</h2>
                  </div>
                  <button
                    onClick={() => setMobileNavOpen(false)}
                    className="bg-white/5 p-3 rounded-2xl"
                    aria-label="Close navigation"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid gap-3">
                  {authTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => handleNavSelect(tab)}
                      className={`text-left px-5 py-4 rounded-2xl font-bold transition ${
                        activeTab === tab
                          ? 'bg-gradient-to-r from-purple-600 to-cyan-500'
                          : 'bg-white/5'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="hidden md:flex flex-wrap gap-4 mb-8 bg-white/5 backdrop-blur-xl p-4 rounded-3xl border border-white/10 shadow-2xl shadow-cyan-500/5">
          {authTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => handleNavSelect(tab)}
              className={`px-6 py-3 rounded-2xl font-bold transition ${
                activeTab === tab
                  ? 'bg-gradient-to-r from-purple-600 to-cyan-500'
                  : 'bg-[#161F38]/80 hover:bg-[#1d2947]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <motion.div
          className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-gradient-to-r from-purple-600 to-cyan-500 p-3 rounded-2xl shadow-lg shadow-cyan-500/20">
                <Sparkles className="w-6 h-6" />
              </div>

              <div>
                <h1 className="text-4xl md:text-5xl font-black leading-tight">
                  LottoVision AI
                </h1>
                <p className="text-gray-400 mt-1">
                  Intelligence Behind Every Draw
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="bg-white/5 backdrop-blur-xl px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/10">
              <Bell className="text-cyan-400" />
              <div>
                <p className="text-xs text-gray-400">Notifications</p>
                <p className="font-semibold">3 Active Alerts</p>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/10">
              <Database
                className={
                  firebaseConnected ? 'text-green-400' : 'text-yellow-400'
                }
              />
              <div>
                <p className="text-xs text-gray-400">Firebase Status</p>
                <p className="font-semibold">
                  {firebaseConnected ? 'Connected' : 'Needs Config'}
                </p>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/10">
              {currentUser ? (
                <User className="text-cyan-400" />
              ) : (
                <LogIn className="text-cyan-400" />
              )}

              <div className="text-left">
                <p className="text-xs text-gray-400">
                  {currentUser ? 'Logged In' : 'Authentication'}
                </p>
                <p className="font-semibold">{authLoading ? 'Loading...' : userName}</p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-600 to-cyan-500 px-5 py-3 rounded-2xl font-bold shadow-lg shadow-cyan-500/20">
              GLOBAL LOTTO AI
            </div>
          </div>
        </motion.div>

        {authLoading && (
          <div className="mb-8 bg-[#161F38] rounded-[28px] p-5 border border-white/5 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-cyan-300 animate-spin" />
            <p className="font-semibold">Restoring secure Firebase session...</p>
          </div>
        )}

        {liveDataError && (
          <div className="mb-8 bg-yellow-500/10 rounded-[28px] p-5 border border-yellow-300/20 flex items-center gap-3">
            <Activity className="w-5 h-5 text-yellow-300" />
            <p className="font-semibold text-yellow-100">{liveDataError}</p>
          </div>
        )}

        {!currentUser && ['Login', 'Signup'].includes(activeTab) && (
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6 mb-8">
            <form
              onSubmit={handleAuthSubmit}
              className="bg-[#161F38] rounded-[32px] p-8 border border-white/5"
            >
              <div className="flex items-center gap-3 mb-6">
                <LogIn className="text-cyan-400" />
                <div>
                  <p className="text-gray-400 text-sm">Secure Firebase Auth</p>
                  <h2 className="text-4xl font-black">
                    {authMode === 'signup' ? 'Create Account' : 'Welcome Back'}
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-black/20 p-2 rounded-2xl mb-5">
                {[
                  ['login', 'Login'],
                  ['signup', 'Signup'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => openAuthPage(mode)}
                    className={`py-3 rounded-xl font-bold transition ${
                      authMode === mode
                        ? 'bg-gradient-to-r from-purple-600 to-cyan-500'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {authMode === 'signup' && (
                  <input
                    value={authForm.name}
                    onChange={(event) =>
                      updateAuthField('name', event.target.value)
                    }
                    className="w-full bg-[#0B1020] rounded-2xl p-4 text-white border border-white/10 outline-none focus:border-cyan-400"
                    placeholder="Display name"
                    type="text"
                  />
                )}

                <input
                  value={authForm.email}
                  onChange={(event) =>
                    updateAuthField('email', event.target.value)
                  }
                  className="w-full bg-[#0B1020] rounded-2xl p-4 text-white border border-white/10 outline-none focus:border-cyan-400"
                  placeholder="Email address"
                  type="email"
                  autoComplete="email"
                  required
                />

                <input
                  value={authForm.password}
                  onChange={(event) =>
                    updateAuthField('password', event.target.value)
                  }
                  className="w-full bg-[#0B1020] rounded-2xl p-4 text-white border border-white/10 outline-none focus:border-cyan-400"
                  placeholder="Password"
                  type="password"
                  autoComplete={
                    authMode === 'signup' ? 'new-password' : 'current-password'
                  }
                  required
                  minLength={6}
                />
              </div>

              {authError && (
                <p className="mt-4 bg-red-500/10 border border-red-400/20 text-red-200 rounded-2xl p-4 text-sm">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authBusy || authLoading || !firebaseConfigured}
                className="mt-5 w-full bg-gradient-to-r from-purple-600 to-cyan-500 py-4 rounded-2xl font-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {authBusy
                  ? 'Please wait...'
                  : authMode === 'signup'
                    ? 'Create Account'
                    : 'Login'}
              </button>
            </form>

            <div className="bg-gradient-to-r from-[#161F38] to-[#1d2947] rounded-[32px] p-8 border border-cyan-500/10">
              <p className="text-cyan-300 font-bold uppercase tracking-[0.3em] text-sm">
                SaaS Access Layer
              </p>
              <h2 className="text-5xl font-black mt-4 leading-tight">
                Your account unlocks saved predictions, history and Premium.
              </h2>
              <div className="grid md:grid-cols-2 gap-4 mt-8">
                {[
                  'Persistent Sessions',
                  'Firestore History',
                  'Premium Tools',
                  'VIP Draw Alerts',
                ].map((item) => (
                  <div
                    key={item}
                    className="bg-black/20 rounded-2xl p-5 border border-white/10"
                  >
                    <CheckCircle2 className="w-6 h-6 text-green-300 mb-4" />
                    <h4 className="font-semibold leading-snug">{item}</h4>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <motion.div
          className="grid xl:grid-cols-[1.2fr_0.8fr] gap-6 mb-8"
          variants={sectionMotion}
          initial="hidden"
          animate="show"
        >
          <motion.div
            className="bg-white/5 backdrop-blur-2xl rounded-[32px] p-6 md:p-8 border border-cyan-300/10 shadow-2xl shadow-cyan-500/10"
            variants={cardMotion}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div>
                <p className="text-cyan-300 font-bold uppercase tracking-[0.3em] text-sm">
                  Firebase Cloud Infrastructure
                </p>

                <h2 className="text-3xl md:text-5xl font-black mt-4 leading-tight">
                  Real-Time Lotto SaaS Platform
                </h2>

                <p className="text-gray-300 mt-5 text-lg max-w-3xl leading-relaxed">
                  Your platform now uses Firebase email and password
                  authentication with persistent user sessions.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 min-w-[320px]">
                {[
                  'Email Auth',
                  'Local Persistence',
                  'Premium Accounts',
                  'Real-Time Ready',
                ].map((item) => (
                  <motion.div
                    key={item}
                    className="bg-black/20 rounded-2xl p-5 border border-white/10"
                    whileHover={{ y: -3, scale: 1.01 }}
                  >
                    <p className="font-bold text-cyan-300 text-sm">ACTIVE</p>
                    <h4 className="mt-3 font-semibold leading-snug">{item}</h4>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            className="bg-white/5 backdrop-blur-2xl rounded-[32px] p-6 md:p-7 border border-white/10 shadow-2xl shadow-purple-500/10"
            variants={cardMotion}
          >
            {currentUser ? (
              <div>
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <User className="text-cyan-400" />
                    <div>
                      <p className="text-gray-400 text-sm">Current User</p>
                      <h3 className="text-2xl font-black">{userName}</h3>
                    </div>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="bg-black/20 hover:bg-black/30 p-3 rounded-2xl transition"
                    aria-label="Log out"
                    title="Log out"
                  >
                    <LogOut className="w-5 h-5 text-cyan-300" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="bg-black/20 rounded-2xl p-4">
                    <p className="text-gray-400 text-sm">Email</p>
                    <p className="font-semibold break-all">{currentUser.email}</p>
                  </div>
                  <div className="bg-black/20 rounded-2xl p-4">
                    <p className="text-gray-400 text-sm">User ID</p>
                    <p className="font-semibold text-sm break-all">
                      {currentUser.uid}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit}>
                <div className="flex items-center gap-3 mb-6">
                  <LogIn className="text-cyan-400" />
                  <div>
                    <p className="text-gray-400 text-sm">Firebase Auth</p>
                    <h3 className="text-2xl font-black">
                      {authMode === 'signup' ? 'Create Account' : 'Login'}
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-black/20 p-2 rounded-2xl mb-5">
                  {[
                    ['login', 'Login'],
                    ['signup', 'Signup'],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setAuthMode(mode);
                        setAuthError('');
                      }}
                      className={`py-3 rounded-xl font-bold transition ${
                        authMode === mode
                          ? 'bg-gradient-to-r from-purple-600 to-cyan-500'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  {authMode === 'signup' && (
                    <input
                      value={authForm.name}
                      onChange={(event) =>
                        updateAuthField('name', event.target.value)
                      }
                      className="w-full bg-[#0B1020] rounded-2xl p-4 text-white border border-white/10 outline-none focus:border-cyan-400"
                      placeholder="Display name"
                      type="text"
                    />
                  )}

                  <input
                    value={authForm.email}
                    onChange={(event) =>
                      updateAuthField('email', event.target.value)
                    }
                    className="w-full bg-[#0B1020] rounded-2xl p-4 text-white border border-white/10 outline-none focus:border-cyan-400"
                    placeholder="Email address"
                    type="email"
                    autoComplete="email"
                    required
                  />

                  <input
                    value={authForm.password}
                    onChange={(event) =>
                      updateAuthField('password', event.target.value)
                    }
                    className="w-full bg-[#0B1020] rounded-2xl p-4 text-white border border-white/10 outline-none focus:border-cyan-400"
                    placeholder="Password"
                    type="password"
                    autoComplete={
                      authMode === 'signup' ? 'new-password' : 'current-password'
                    }
                    required
                    minLength={6}
                  />
                </div>

                {authError && (
                  <p className="mt-4 bg-red-500/10 border border-red-400/20 text-red-200 rounded-2xl p-4 text-sm">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authBusy || authLoading || !firebaseConfigured}
                  className="mt-5 w-full bg-gradient-to-r from-purple-600 to-cyan-500 py-4 rounded-2xl font-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {authBusy
                    ? 'Please wait...'
                    : authMode === 'signup'
                      ? 'Create Account'
                      : 'Login'}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8"
          variants={sectionMotion}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          {stats.map((item) => (
            <motion.div
              key={item.label}
              className="bg-white/5 backdrop-blur-xl rounded-[28px] p-6 border border-white/10 shadow-xl shadow-cyan-500/5"
              variants={cardMotion}
              whileHover={{ y: -4 }}
            >
              <div className="text-cyan-400 mb-4">{item.icon}</div>
              <p className="text-gray-400 text-sm">{item.label}</p>
              <h3 className="text-3xl font-black mt-2">{item.value}</h3>
            </motion.div>
          ))}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <motion.div
            className="lg:col-span-2 bg-gradient-to-r from-purple-700 to-cyan-500 rounded-[32px] p-8 shadow-2xl shadow-cyan-500/10"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="text-yellow-300" />
              <p className="text-white/80 text-lg">
                {liveDataLoading ? 'Refreshing Jackpot' : 'Tonight Jackpot'}
              </p>
            </div>

            <h2 className="text-5xl md:text-6xl font-black">
              {liveDataLoading ? (
                <span className="inline-flex items-center gap-4">
                  <Loader2 className="w-10 h-10 animate-spin" />
                  Syncing
                </span>
              ) : (
                liveDraws[0]?.jackpot || 'R 125,000,000'
              )}
            </h2>

            <p className="mt-5 text-xl max-w-2xl text-white/90">
              {liveDraws[0]?.game || 'PowerBall'} live feed with auto-refresh,
              recent draw history and AI confidence analytics.
            </p>

            <div className="flex flex-wrap gap-4 mt-8">
              <button
                onClick={generatePrediction}
                disabled={predictionSaving}
                className="bg-black/30 px-7 py-4 rounded-2xl font-bold text-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {predictionSaving ? 'Saving Prediction...' : 'Generate AI Predictions'}
              </button>
              <button
                onClick={fetchLiveLottoData}
                disabled={liveDataLoading}
                className="bg-white/15 px-7 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-5 h-5 ${liveDataLoading ? 'animate-spin' : ''}`}
                />
                Refresh Live Data
              </button>
            </div>
          </motion.div>

          <motion.div
            className="bg-white/5 backdrop-blur-xl rounded-[32px] p-7 border border-white/10"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <Brain className="text-green-400" />
              <h3 className="text-2xl font-bold">AI Confidence</h3>
            </div>

            <div className="w-full bg-black/30 rounded-full h-6 overflow-hidden">
              <div className="bg-gradient-to-r from-green-400 to-cyan-400 h-6 w-[78%]"></div>
            </div>

            <div className="mt-5 text-5xl font-black text-green-400">78%</div>

            <div className="mt-8">
              <p className="text-gray-400 text-sm mb-3">Trending Numbers</p>
              <div className="flex flex-wrap gap-2">
                {trending.map((num) => (
                  <span
                    key={num}
                    className="w-10 h-10 rounded-full bg-black/30 flex items-center justify-center text-sm font-black text-cyan-300"
                  >
                    {num}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          className="grid xl:grid-cols-3 gap-6 mb-8"
          variants={sectionMotion}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div
            className="xl:col-span-2 bg-white/5 backdrop-blur-xl rounded-[32px] p-6 md:p-7 border border-white/10"
            variants={cardMotion}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
              <div>
                <h3 className="text-3xl font-black">AI Prediction Engine</h3>
                <p className="text-gray-400 mt-2">
                  Generate intelligent prediction packs.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {[
                  'AI Smart',
                  'Hot Numbers',
                  'Cold Numbers',
                  'Trend Hunter',
                ].map((mode) => {
                  const locked = mode !== 'AI Smart' && !isPremium;

                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        if (locked) {
                          setActiveTab('Premium');
                          setSubscriptionMessage(
                            'Upgrade to Premium to unlock advanced prediction modes.'
                          );
                          return;
                        }

                        setPredictionMode(mode);
                      }}
                      className={`px-5 py-3 rounded-2xl font-bold flex items-center gap-2 ${
                        predictionMode === mode
                          ? 'bg-gradient-to-r from-purple-600 to-cyan-500'
                          : 'bg-black/20'
                      }`}
                    >
                      {locked && <Lock className="w-4 h-4" />}
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5 mb-6">
              <div className="bg-black/20 rounded-3xl p-5">
                <p className="text-gray-400 text-sm mb-3">Selected Country</p>

                <select
                  value={selectedCountry}
                  onChange={(event) => setSelectedCountry(event.target.value)}
                  className="w-full bg-[#0B1020] rounded-2xl p-4 text-white"
                >
                  {['South Africa', 'USA', 'UK', 'Canada', 'Australia'].map(
                    (country) => (
                      <option key={country}>{country}</option>
                    )
                  )}
                </select>
              </div>

              <div className="bg-black/20 rounded-3xl p-5">
                <p className="text-gray-400 text-sm">Prediction Mode</p>
                <h3 className="text-3xl font-black mt-4">{predictionMode}</h3>
              </div>
            </div>

            <div className="flex flex-wrap gap-5 mb-8">
              {prediction.map((num) => (
                <motion.div
                  key={num}
                  className="w-20 h-20 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center text-2xl font-black"
                  initial={{ scale: 0.88, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.08, rotate: 2 }}
                >
                  {num}
                </motion.div>
              ))}
            </div>

            <button
              onClick={generatePrediction}
              disabled={predictionSaving}
              className="w-full bg-gradient-to-r from-purple-600 to-cyan-500 py-5 rounded-2xl text-xl font-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {predictionSaving ? 'Saving Prediction...' : 'Generate New Prediction'}
            </button>

            {predictionError && (
              <p className="mt-4 bg-red-500/10 border border-red-400/20 text-red-200 rounded-2xl p-4 text-sm">
                {predictionError}
              </p>
            )}
          </motion.div>

          <motion.div
            className="bg-white/5 backdrop-blur-xl rounded-[32px] p-6 md:p-7 border border-white/10"
            variants={cardMotion}
          >
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="text-cyan-400" />
              <h3 className="text-3xl font-black">Prediction History</h3>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-auto">
              {predictionSaving ? (
                <div className="space-y-4">
                  <SkeletonBlock className="h-28" />
                  <SkeletonBlock className="h-28" />
                  <SkeletonBlock className="h-28" />
                </div>
              ) : savedPredictions.length === 0 ? (
                <div className="bg-[#0B1020] rounded-2xl p-8 text-center">
                  <p className="text-xl font-bold">No Predictions Yet</p>
                </div>
              ) : (
                savedPredictions.map((item) => (
                  <motion.div
                    key={item.id}
                    className="bg-[#0B1020] rounded-2xl p-5 border border-white/5"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-bold text-lg">{item.mode}</p>
                        <p className="text-gray-400 text-sm">{item.country}</p>
                      </div>

                      <div className="bg-green-500/20 text-green-300 px-3 py-2 rounded-xl text-sm font-bold">
                        {item.confidence}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {item.numbers.map((num) => (
                        <div
                          key={num}
                          className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 flex items-center justify-center font-black"
                        >
                          {num}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>

        <div className="grid xl:grid-cols-2 gap-6 mb-8">
          <motion.div
            className="bg-white/5 backdrop-blur-xl rounded-[32px] p-7 border border-white/10"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
          >
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="text-cyan-400" />
                <h3 className="text-3xl font-black">Number Frequency</h3>
              </div>
              {liveDataLoading && <Loader2 className="w-5 h-5 animate-spin" />}
            </div>

            <div className="h-72">
              {liveDataLoading ? (
                <div className="grid h-full grid-cols-6 items-end gap-3">
                  {[48, 76, 54, 88, 64, 72].map((height) => (
                    <SkeletonBlock key={height} className="w-full" style={{ height }} />
                  ))}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={frequencyData}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="number" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#0B1020',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 16,
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="count" fill="#22d3ee" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          <motion.div
            className="bg-white/5 backdrop-blur-xl rounded-[32px] p-7 border border-white/10"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ delay: 0.08 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <LineChartIcon className="text-green-400" />
              <h3 className="text-3xl font-black">AI Confidence Graph</h3>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={confidenceGraphData}>
                  <defs>
                    <linearGradient id="confidenceFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.65} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" domain={[50, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: '#0B1020',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 16,
                      color: '#fff',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="confidence"
                    stroke="#22c55e"
                    strokeWidth={3}
                    fill="url(#confidenceFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        <div className="grid xl:grid-cols-[0.9fr_1.1fr] gap-6 mb-8">
          <div className="bg-white/5 backdrop-blur-xl rounded-[32px] p-7 border border-white/10">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <Activity className="text-cyan-400" />
                <h3 className="text-3xl font-black">Recent Draw History</h3>
              </div>
              <p className="text-xs text-gray-400">
                {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Waiting'}
              </p>
            </div>

            <div className="space-y-4 max-h-[430px] overflow-auto">
              {drawHistory.map((draw) => (
                <div
                  key={draw.id}
                  className="bg-[#0B1020]/80 rounded-2xl p-5 border border-white/5"
                >
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <p className="font-bold text-lg">{draw.game}</p>
                      <p className="text-gray-400 text-sm">{draw.date}</p>
                    </div>
                    <p className="text-yellow-300 font-black">{draw.jackpot}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {draw.numbers.map((num) => (
                      <span
                        key={`${draw.id}-${num}`}
                        className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 flex items-center justify-center text-sm font-black"
                      >
                        {num}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl rounded-[32px] p-7 border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="text-cyan-400" />
              <h3 className="text-3xl font-black">Jackpot Momentum</h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={drawHistory.map((draw, index) => ({
                    name: draw.game,
                    value: 40 + index * 9 + draw.numbers.length * 3,
                  }))}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="name" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      background: '#0B1020',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 16,
                      color: '#fff',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#a855f7"
                    strokeWidth={3}
                    dot={{ fill: '#22d3ee', strokeWidth: 0, r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <motion.div
          className="grid md:grid-cols-3 gap-6 mb-8"
          variants={sectionMotion}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          {liveDraws.map((draw) => (
            <motion.div
              key={draw.game}
              className="bg-white/5 backdrop-blur-xl rounded-[30px] p-6 border border-white/10 shadow-xl shadow-purple-500/5"
              variants={cardMotion}
              whileHover={{ y: -4 }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-gray-400 text-sm">{draw.country}</p>
                <span className="bg-green-500/15 text-green-300 px-3 py-1 rounded-full text-xs font-bold">
                  {draw.status}
                </span>
              </div>
              <h4 className="text-2xl font-bold mt-2">{draw.game}</h4>
              {liveDataLoading ? (
                <div className="mt-4 space-y-4">
                  <SkeletonBlock className="h-10 w-40" />
                  <SkeletonBlock className="h-5 w-28" />
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5, 6].map((item) => (
                      <SkeletonBlock key={item} className="h-9 w-9 rounded-full" />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-yellow-300 text-3xl font-black mt-4">
                    {draw.jackpot}
                  </p>
                  <p className="mt-3 text-gray-300">Draw Time: {draw.time}</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {draw.lastNumbers.map((num) => (
                      <span
                        key={`${draw.game}-${num}`}
                        className="w-9 h-9 rounded-full bg-black/30 flex items-center justify-center text-xs font-black text-cyan-200"
                      >
                        {num}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="grid md:grid-cols-2 xl:grid-cols-4 gap-6"
          variants={sectionMotion}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div
            className="md:col-span-2 xl:col-span-4 bg-white/5 backdrop-blur-2xl rounded-[32px] p-6 md:p-8 border border-cyan-500/20 mb-2 shadow-2xl shadow-cyan-500/10"
            variants={cardMotion}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <p className="text-cyan-300 font-bold uppercase tracking-widest text-sm">
                  Commercial Platform
                </p>
                <h2 className="text-3xl md:text-5xl font-black mt-3">
                  LottoVision AI Pro
                </h2>
                <p className="text-gray-300 mt-4 max-w-3xl text-lg">
                  Multi-country lotto analytics platform with AI prediction
                  generation, premium memberships, live jackpots and scalable
                  SaaS architecture.
                </p>
              </div>

              <div className="bg-black/20 rounded-3xl p-6 min-w-[260px] border border-white/10">
                <p className="text-gray-400">Platform Revenue Potential</p>
                <h3 className="text-5xl font-black mt-3 text-green-400">
                  R1.2M+
                </h3>
                <p className="mt-3 text-gray-300 text-sm">
                  Subscription, ads and premium analytics monetization.
                </p>
              </div>
            </div>
          </motion.div>

          {[
            {
              title: 'AI Predictions',
              icon: <Brain className="w-10 h-10" />,
              premium: false,
            },
            {
              title: 'Draw History',
              icon: <BarChart3 className="w-10 h-10" />,
              premium: false,
            },
            {
              title: 'Ticket Scanner',
              icon: <ScanLine className="w-10 h-10" />,
              premium: true,
            },
            {
              title: 'Global Results',
              icon: <Globe className="w-10 h-10" />,
              premium: true,
            },
          ].map((item) => (
            <motion.div
              key={item.title}
              className="bg-white/5 backdrop-blur-xl rounded-[30px] p-8 border border-white/10"
              variants={cardMotion}
              whileHover={{ y: -4 }}
            >
              <div className="text-cyan-400 mb-5 flex items-center justify-between">
                {item.icon}
                {item.premium && !isPremium && (
                  <Lock className="w-5 h-5 text-yellow-300" />
                )}
              </div>
              <h4 className="text-2xl font-bold">{item.title}</h4>
              {item.premium && !isPremium && (
                <button
                  onClick={() => {
                    if (currentUser) {
                      setActiveTab('Premium');
                      return;
                    }

                    openAuthPage('signup');
                  }}
                  className="mt-5 bg-black/20 hover:bg-black/30 px-4 py-3 rounded-2xl font-bold text-sm transition"
                >
                  Unlock Premium
                </button>
              )}
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="mt-10 bg-white/5 backdrop-blur-2xl rounded-[32px] p-6 md:p-8 border border-white/10 shadow-2xl shadow-purple-500/10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
        >
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="text-green-400" />
            <h3 className="text-3xl font-black">Premium Membership</h3>
          </div>

          <div className="grid lg:grid-cols-[1fr_0.8fr] gap-6">
            <div className="bg-gradient-to-r from-purple-700 to-cyan-500 rounded-3xl p-6">
              <p className="text-white/70">Monthly Plan</p>
              <h2 className="text-5xl font-black mt-2">R149</h2>
              <p className="mt-3 text-white/90">
                Unlock advanced AI predictions and VIP tools.
              </p>

              <button
                onClick={handlePremiumSubscribe}
                disabled={subscriptionBusy || isPremium}
                className="mt-6 bg-black/30 hover:bg-black/40 px-6 py-4 rounded-2xl font-black flex items-center gap-3 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {subscriptionBusy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPremium ? (
                  <CheckCircle2 className="w-5 h-5 text-green-200" />
                ) : (
                  <CreditCard className="w-5 h-5" />
                )}
                {isPremium ? 'Premium Active' : 'Start Premium'}
              </button>
            </div>

            <div className="bg-black/20 rounded-3xl p-6 border border-white/10">
              <p className="text-gray-400">Subscription Status</p>
              <h3 className="text-4xl font-black mt-3">
                {isPremium ? 'Premium' : 'Free'}
              </h3>
              <p className="mt-3 text-gray-300">
                {currentUser
                  ? currentUser.email
                  : 'Login or create an account to activate a subscription.'}
              </p>

              {subscriptionMessage && (
                <p className="mt-4 bg-cyan-500/10 border border-cyan-400/20 text-cyan-100 rounded-2xl p-4 text-sm">
                  {subscriptionMessage}
                </p>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-6">
            {[
              'Unlimited Predictions',
              'AI Trend Analysis',
              'Prediction History',
              'VIP Draw Alerts',
            ].map((feature) => (
              <div
                key={feature}
                className={`rounded-2xl p-4 flex items-center gap-3 ${
                  isPremium ? 'bg-black/20' : 'bg-black/10 text-white/60'
                }`}
              >
                {isPremium ? (
                  <Wallet className="w-5 h-5 text-cyan-400" />
                ) : (
                  <Lock className="w-5 h-5 text-yellow-300" />
                )}
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
