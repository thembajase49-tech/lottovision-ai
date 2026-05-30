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
} from 'lucide-react';
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
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db, firebaseConfigured } from './firebase';

const getAuthMessage = (error) => {
  const code = error?.code?.replace('auth/', '').replaceAll('-', ' ');
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : 'Authentication failed.';
};

const getUserProfileData = (user, displayNameOverride) => ({
  email: user.email || '',
  displayName: displayNameOverride ?? user.displayName ?? '',
  isPremium: false,
  createdAt: serverTimestamp(),
});

const formatJoinDate = (createdAt) => {
  if (!createdAt) {
    return 'Pending';
  }

  const date = typeof createdAt.toDate === 'function' ? createdAt.toDate() : new Date(createdAt);

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
  const [userProfile, setUserProfile] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [firebaseConnected, setFirebaseConnected] = useState(false);

  const trending = ['07', '13', '22', '31', '38', '45'];

  const loadUserProfile = useCallback(async (user) => {
    if (!db || !user) {
      setUserProfile(null);
      setIsPremium(false);
      return;
    }

    const profileRef = doc(db, 'users', user.uid);
    const profileSnapshot = await getDoc(profileRef);

    if (!profileSnapshot.exists()) {
      const profileData = getUserProfileData(user);
      await setDoc(profileRef, profileData);
      setUserProfile({
        email: user.email || '',
        displayName: user.displayName || '',
        isPremium: false,
        createdAt: new Date(),
      });
      setIsPremium(false);
      return;
    }

    const profileData = profileSnapshot.data();
    setUserProfile(profileData);
    setIsPremium(Boolean(profileData.isPremium));
  }, []);

  const liveDraws = [
    {
      country: 'South Africa',
      game: 'PowerBall',
      jackpot: 'R 125M',
      time: '20:59',
    },
    {
      country: 'USA',
      game: 'Mega Millions',
      jackpot: '$220M',
      time: '21:00',
    },
    {
      country: 'UK',
      game: 'UK Lotto',
      jackpot: '£18M',
      time: '20:00',
    },
  ];

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

  useEffect(() => {
    if (!auth || !firebaseConfigured) {
      setFirebaseConnected(false);
      return undefined;
    }

    let unsubscribe = () => {};
    let active = true;

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        if (!active) {
          return;
        }

        unsubscribe = onAuthStateChanged(auth, async (user) => {
          setCurrentUser(user);
          if (!user) {
            setSavedPredictions([]);
          }
          // Future Stripe subscription status updates will write to this Firestore profile.
          try {
            await loadUserProfile(user);
          } catch (error) {
            setIsPremium(false);
            setAuthError(getAuthMessage(error));
          }
          setFirebaseConnected(true);
        });
      })
      .catch((error) => {
        setFirebaseConnected(false);
        window.alert(getAuthMessage(error));
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadUserProfile]);

  useEffect(() => {
    if (!db || !currentUser) {
      return undefined;
    }

    const predictionsRef = collection(db, 'users', currentUser.uid, 'predictions');
    const predictionsQuery = query(predictionsRef, orderBy('createdAt', 'desc'));

    return onSnapshot(
      predictionsQuery,
      (snapshot) => {
        setSavedPredictions(
          snapshot.docs.map((predictionDoc) => ({
            id: predictionDoc.id,
            ...predictionDoc.data(),
          }))
        );
      },
      (error) => {
        setAuthError(getAuthMessage(error));
      }
    );
  }, [currentUser]);

  const loginWithFirebase = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signupWithFirebase = async (email, password, displayName) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const trimmedDisplayName = displayName.trim();

    if (trimmedDisplayName) {
      await updateProfile(credential.user, {
        displayName: trimmedDisplayName,
      });
      await credential.user.reload();
    }

    if (db) {
      await setDoc(
        doc(db, 'users', credential.user.uid),
        getUserProfileData(credential.user, trimmedDisplayName),
        { merge: true }
      );
    }
  };

  const logoutWithFirebase = async () => {
    await signOut(auth);
  };

  const updateAuthField = (field, value) => {
    setAuthForm((prev) => ({
      ...prev,
      [field]: value,
    }));
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
        await signupWithFirebase(authForm.email, authForm.password, authForm.name);
      } else {
        await loginWithFirebase(authForm.email, authForm.password);
      }

      setAuthForm({
        name: '',
        email: '',
        password: '',
      });
    } catch (error) {
      setAuthError(getAuthMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogoutClick = async () => {
    setAuthError('');

    if (!auth || !firebaseConfigured) {
      setAuthError('Firebase is not configured yet.');
      return;
    }

    try {
      await logoutWithFirebase();
    } catch (error) {
      setAuthError(getAuthMessage(error));
    }
  };

  const generatePrediction = async () => {
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

    try {
      await addDoc(collection(db, 'users', currentUser.uid, 'predictions'), {
        ...nextPrediction,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      setAuthError(getAuthMessage(error));
    }
  };

  return (
    <div className="min-h-screen bg-[#050816] text-white p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        {currentUser && (
          <div className="flex flex-wrap gap-4 mb-8 bg-[#0B1020] p-4 rounded-3xl border border-white/5">
            {['Dashboard', 'Predictions', 'Analytics', 'Premium'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 rounded-2xl font-bold transition ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-purple-600 to-cyan-500'
                    : 'bg-[#161F38] hover:bg-[#1d2947]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-gradient-to-r from-purple-600 to-cyan-500 p-3 rounded-2xl">
                <Sparkles className="w-6 h-6" />
              </div>

              <div>
                <h1 className="text-5xl font-black">LottoVision AI</h1>
                <p className="text-gray-400 mt-1">
                  Intelligence Behind Every Draw
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {currentUser && (
              <div className="bg-[#161F38] px-5 py-3 rounded-2xl flex items-center gap-3">
                <Bell className="text-cyan-400" />
                <div>
                  <p className="text-xs text-gray-400">Notifications</p>
                  <p className="font-semibold">3 Active Alerts</p>
                </div>
              </div>
            )}

            <div className="bg-[#161F38] px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/5">
              <Database className={`${firebaseConnected ? 'text-green-400' : 'text-yellow-400'}`} />
              <div>
                <p className="text-xs text-gray-400">Firebase Status</p>
                <p className="font-semibold">
                  {firebaseConnected ? 'Connected' : 'Connecting...'}
                </p>
              </div>
            </div>

            {currentUser && (
              <button
                onClick={handleLogoutClick}
                className="bg-[#161F38] px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/5 hover:bg-[#1d2947] transition"
              >
                <User className="text-cyan-400" />

                <div className="text-left">
                  <p className="text-xs text-gray-400">Logged In</p>
                  <p className="font-semibold">
                    {currentUser.displayName || currentUser.email?.split('@')[0]}
                  </p>
                </div>
              </button>
            )}

            {currentUser && (
              <div className="bg-gradient-to-r from-purple-600 to-cyan-500 px-5 py-3 rounded-2xl font-bold">
                GLOBAL LOTTO AI
              </div>
            )}
          </div>
        </div>

        {!currentUser && (
          <form
            onSubmit={handleAuthSubmit}
            className="bg-gradient-to-r from-[#161F38] to-[#1d2947] rounded-[32px] p-8 border border-cyan-500/10 mb-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <LogIn className="text-cyan-400" />
              <div>
                <p className="text-cyan-300 font-bold uppercase tracking-[0.3em] text-sm">
                  Firebase Authentication
                </p>
                <h2 className="text-5xl font-black mt-2 leading-tight">
                  {authMode === 'signup' ? 'Create Account' : 'Login'}
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
                  onChange={(event) => updateAuthField('name', event.target.value)}
                  className="w-full bg-[#0B1020] rounded-2xl p-4 text-white border border-white/10 outline-none focus:border-cyan-400"
                  placeholder="Display name"
                  type="text"
                />
              )}

              <input
                value={authForm.email}
                onChange={(event) => updateAuthField('email', event.target.value)}
                className="w-full bg-[#0B1020] rounded-2xl p-4 text-white border border-white/10 outline-none focus:border-cyan-400"
                placeholder="Email address"
                type="email"
                autoComplete="email"
                required
              />

              <input
                value={authForm.password}
                onChange={(event) => updateAuthField('password', event.target.value)}
                className="w-full bg-[#0B1020] rounded-2xl p-4 text-white border border-white/10 outline-none focus:border-cyan-400"
                placeholder="Password"
                type="password"
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
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
              disabled={authBusy || !firebaseConfigured}
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

        {currentUser && (
        <div className="bg-gradient-to-r from-[#161F38] to-[#1d2947] rounded-[32px] p-8 border border-cyan-500/10 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div>
              <p className="text-cyan-300 font-bold uppercase tracking-[0.3em] text-sm">
                Firebase Cloud Infrastructure
              </p>

              <h2 className="text-5xl font-black mt-4 leading-tight">
                Real-Time Lotto SaaS Platform
              </h2>

              <p className="text-gray-300 mt-5 text-lg max-w-3xl leading-relaxed">
                Your platform now supports scalable cloud integration architecture for authentication, prediction storage, premium memberships and live analytics.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 min-w-[320px]">
              {[
                'Authentication Ready',
                'Cloud Database',
                'Premium Accounts',
                'Real-Time Sync',
              ].map((item) => (
                <div
                  key={item}
                  className="bg-black/20 rounded-2xl p-5 border border-white/10"
                >
                  <p className="font-bold text-cyan-300 text-sm">ACTIVE</p>
                  <h4 className="mt-3 font-semibold leading-snug">{item}</h4>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}

        {currentUser && (
          <>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
          {stats.map((item) => (
            <div
              key={item.label}
              className="bg-[#161F38] rounded-[28px] p-6"
            >
              <div className="text-cyan-400 mb-4">{item.icon}</div>
              <p className="text-gray-400 text-sm">{item.label}</p>
              <h3 className="text-3xl font-black mt-2">{item.value}</h3>
            </div>
          ))}
        </div>

        <div className="bg-[#161F38] rounded-[32px] p-7 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <User className="text-cyan-400" />
            <h3 className="text-3xl font-black">User Profile</h3>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                label: 'Display Name',
                value:
                  userProfile?.displayName ||
                  currentUser.displayName ||
                  currentUser.email?.split('@')[0] ||
                  'User',
              },
              {
                label: 'Email',
                value: userProfile?.email || currentUser.email || 'No email',
              },
              {
                label: 'Account Type',
                value: isPremium ? 'Premium Member' : 'Free Member',
              },
              {
                label: 'Join Date',
                value: formatJoinDate(userProfile?.createdAt),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-black/20 rounded-2xl p-5 border border-white/10"
              >
                <p className="text-gray-400 text-sm">{item.label}</p>
                <h4 className="mt-3 font-semibold leading-snug">{item.value}</h4>
              </div>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-gradient-to-r from-purple-700 to-cyan-500 rounded-[32px] p-8">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="text-yellow-300" />
              <p className="text-white/80 text-lg">Tonight Jackpot</p>
            </div>

            <h2 className="text-6xl font-black">R 125,000,000</h2>

            <p className="mt-5 text-xl max-w-2xl text-white/90">
              AI predicts elevated trend movement and recurring sequence patterns.
            </p>

            <div className="flex flex-wrap gap-4 mt-8">
              <button
                onClick={generatePrediction}
                className="bg-black/30 px-7 py-4 rounded-2xl font-bold text-lg"
              >
                Generate AI Predictions
              </button>
            </div>
          </div>

          <div className="bg-[#161F38] rounded-[32px] p-7">
            <div className="flex items-center gap-3 mb-6">
              <Brain className="text-green-400" />
              <h3 className="text-2xl font-bold">AI Confidence</h3>
            </div>

            <div className="w-full bg-black/30 rounded-full h-6 overflow-hidden">
              <div className="bg-gradient-to-r from-green-400 to-cyan-400 h-6 w-[78%]"></div>
            </div>

            <div className="mt-5 text-5xl font-black text-green-400">
              78%
            </div>
          </div>
        </div>

        <div className="grid xl:grid-cols-3 gap-6 mb-8">
          <div className="xl:col-span-2 bg-[#161F38] rounded-[32px] p-7">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
              <div>
                <h3 className="text-3xl font-black">AI Prediction Engine</h3>
                <p className="text-gray-400 mt-2">
                  Generate intelligent prediction packs.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {['AI Smart', 'Hot Numbers', 'Cold Numbers', 'Trend Hunter'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPredictionMode(mode)}
                    className={`px-5 py-3 rounded-2xl font-bold ${predictionMode === mode ? 'bg-gradient-to-r from-purple-600 to-cyan-500' : 'bg-black/20'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5 mb-6">
              <div className="bg-black/20 rounded-3xl p-5">
                <p className="text-gray-400 text-sm mb-3">Selected Country</p>

                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full bg-[#0B1020] rounded-2xl p-4 text-white"
                >
                  {['South Africa', 'USA', 'UK', 'Canada', 'Australia'].map((country) => (
                    <option key={country}>{country}</option>
                  ))}
                </select>
              </div>

              <div className="bg-black/20 rounded-3xl p-5">
                <p className="text-gray-400 text-sm">Prediction Mode</p>
                <h3 className="text-3xl font-black mt-4">{predictionMode}</h3>
              </div>
            </div>

            <div className="flex flex-wrap gap-5 mb-8">
              {prediction.map((num) => (
                <div
                  key={num}
                  className="w-20 h-20 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center text-2xl font-black"
                >
                  {num}
                </div>
              ))}
            </div>

            <button
              onClick={generatePrediction}
              className="w-full bg-gradient-to-r from-purple-600 to-cyan-500 py-5 rounded-2xl text-xl font-black"
            >
              Generate New Prediction
            </button>
          </div>

          <div className="bg-[#161F38] rounded-[32px] p-7">
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="text-cyan-400" />
              <h3 className="text-3xl font-black">Prediction History</h3>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-auto">
              {savedPredictions.length === 0 ? (
                <div className="bg-[#0B1020] rounded-2xl p-8 text-center">
                  <p className="text-xl font-bold">No Predictions Yet</p>
                </div>
              ) : (
                savedPredictions.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#0B1020] rounded-2xl p-5"
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
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {liveDraws.map((draw) => (
            <div
              key={draw.game}
              className="bg-[#161F38] rounded-[30px] p-6"
            >
              <p className="text-gray-400 text-sm">{draw.country}</p>
              <h4 className="text-2xl font-bold mt-1">{draw.game}</h4>
              <p className="text-yellow-300 text-3xl font-black mt-4">
                {draw.jackpot}
              </p>
              <p className="mt-3 text-gray-300">Draw Time: {draw.time}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="md:col-span-2 xl:col-span-4 bg-gradient-to-r from-[#161F38] to-[#1d2947] rounded-[32px] p-8 border border-cyan-500/20 mb-2">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <p className="text-cyan-300 font-bold uppercase tracking-widest text-sm">
                  Commercial Platform
                </p>
                <h2 className="text-5xl font-black mt-3">
                  LottoVision AI Pro
                </h2>
                <p className="text-gray-300 mt-4 max-w-3xl text-lg">
                  Multi-country lotto analytics platform with AI prediction generation, premium memberships, live jackpots and scalable SaaS architecture.
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
          </div>
          {[
            {
              title: 'AI Predictions',
              icon: <Brain className="w-10 h-10" />,
            },
            {
              title: 'Draw History',
              icon: <BarChart3 className="w-10 h-10" />,
            },
            {
              title: 'Ticket Scanner',
              icon: <ScanLine className="w-10 h-10" />,
            },
            {
              title: 'Global Results',
              icon: <Globe className="w-10 h-10" />,
            },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-[#161F38] rounded-[30px] p-8"
            >
              <div className="text-cyan-400 mb-5">{item.icon}</div>
              <h4 className="text-2xl font-bold">{item.title}</h4>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-[#161F38] rounded-[32px] p-8">
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="text-green-400" />
            <h3 className="text-3xl font-black">Premium Membership</h3>
          </div>

          {!isPremium ? (
            <p>Premium membership required.</p>
          ) : (
            <>
              <div className="bg-gradient-to-r from-purple-700 to-cyan-500 rounded-3xl p-6">
                <p className="text-white/70">Monthly Plan</p>
                <h2 className="text-5xl font-black mt-2">R149</h2>
                <p className="mt-3 text-white/90">
                  Unlock advanced AI predictions and VIP tools.
                </p>
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
                    className="bg-black/20 rounded-2xl p-4 flex items-center gap-3"
                  >
                    <Wallet className="w-5 h-5 text-cyan-400" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
