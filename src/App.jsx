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
  RefreshCw,
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
  updateDoc,
} from 'firebase/firestore';
import { auth, db, firebaseConfigured } from './firebase';
import { getLotteryResults } from './services/lotteryResults';
import { generateAnalyzedPrediction } from './services/predictionEngine';

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

  if (Number.isNaN(date.getTime())) {
    return 'Pending';
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getPredictionDate = (createdAt) => {
  if (!createdAt) {
    return null;
  }

  const date = typeof createdAt.toDate === 'function' ? createdAt.toDate() : new Date(createdAt);

  return Number.isNaN(date.getTime()) ? null : date;
};

const formatAnalyticsDate = (date) => {
  if (!date) {
    return 'No history';
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatNotificationDate = (createdAt) => {
  const date = getPredictionDate(createdAt);

  if (!date) {
    return 'Just now';
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getMostUsedValue = (counts) => {
  const entries = Object.entries(counts);

  if (entries.length === 0) {
    return 'No history';
  }

  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
};

const getPredictionCollectionPath = (uid) => `users/${uid}/predictions`;
const getNotificationCollectionPath = (uid) => `users/${uid}/notifications`;

const getFirestoreLogError = (error) => (
  `code=${error?.code || 'unknown'} message=${error?.message || 'No message'}`
);

export default function LottoVisionAI() {
  const [prediction, setPrediction] = useState([]);
  const [predictionConfidence, setPredictionConfidence] = useState('');

  const [selectedCountry, setSelectedCountry] = useState('South Africa');
  const [savedPredictions, setSavedPredictions] = useState([]);
  const [pendingPredictions, setPendingPredictions] = useState([]);
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
  const [notifications, setNotifications] = useState([]);
  const [lotteryResults, setLotteryResults] = useState([]);
  const [lotteryResultsStatus, setLotteryResultsStatus] = useState('Loading results...');

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
      const createdProfileSnapshot = await getDoc(profileRef);
      setUserProfile(
        createdProfileSnapshot.exists()
          ? createdProfileSnapshot.data()
          : {
              email: user.email || '',
              displayName: user.displayName || '',
              isPremium: false,
              createdAt: new Date(),
            }
      );
      setIsPremium(false);
      return;
    }

    const profileData = profileSnapshot.data();
    setUserProfile(profileData);
    setIsPremium(Boolean(profileData.isPremium));
  }, []);

  const createUserNotification = useCallback(async (uid, title, message) => {
    if (!db || !uid) {
      return;
    }

    const notificationCollectionPath = getNotificationCollectionPath(uid);

    try {
      await addDoc(collection(db, notificationCollectionPath), {
        title,
        message,
        createdAt: serverTimestamp(),
        read: false,
      });
      console.log(
        `[LottoVision AI] Notification write success: path=${notificationCollectionPath} title=${title}`
      );
    } catch (error) {
      console.error(
        `[LottoVision AI] Notification write failure: path=${notificationCollectionPath} ${getFirestoreLogError(error)}`
      );
    }
  }, []);

  const predictionHistory = useMemo(
    () => [
      ...pendingPredictions,
      ...savedPredictions.filter((savedPrediction) => (
        !pendingPredictions.some((pendingPrediction) => pendingPrediction.id === savedPrediction.id)
      )),
    ],
    [pendingPredictions, savedPredictions]
  );

  const predictionAnalytics = useMemo(() => {
    const modeCounts = {};
    const countryCounts = {};
    const numberCounts = {};
    const predictionDates = [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    predictionHistory.forEach((item) => {
      if (item.mode) {
        modeCounts[item.mode] = (modeCounts[item.mode] || 0) + 1;
      }

      if (item.country) {
        countryCounts[item.country] = (countryCounts[item.country] || 0) + 1;
      }

      const predictionDate = getPredictionDate(item.createdAt);

      if (predictionDate) {
        predictionDates.push(predictionDate);
      }

      if (Array.isArray(item.numbers)) {
        item.numbers.forEach((number) => {
          numberCounts[number] = (numberCounts[number] || 0) + 1;
        });
      }
    });

    const sortedDates = [...predictionDates].sort((a, b) => a.getTime() - b.getTime());
    const predictionsThisMonth = predictionDates.filter((date) => (
      date >= monthStart && date < nextMonthStart
    )).length;
    const topNumbers = Object.entries(numberCounts)
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
      .slice(0, 10)
      .map(([number, count]) => ({ number, count }));

    return {
      totalPredictions: predictionHistory.length,
      firstPredictionDate: sortedDates[0] || null,
      lastPredictionDate: sortedDates[sortedDates.length - 1] || null,
      predictionsThisMonth,
      mostUsedPredictionMode: getMostUsedValue(modeCounts),
      mostUsedCountry: getMostUsedValue(countryCounts),
      topNumbers,
    };
  }, [predictionHistory]);

  const analyticsCards = useMemo(
    () => [
      {
        label: 'Total Predictions Generated',
        value: predictionAnalytics.totalPredictions.toLocaleString(),
        icon: <Brain className="w-7 h-7" />,
      },
      {
        label: 'First Prediction Date',
        value: formatAnalyticsDate(predictionAnalytics.firstPredictionDate),
        icon: <Database className="w-7 h-7" />,
      },
      {
        label: 'Last Prediction Date',
        value: formatAnalyticsDate(predictionAnalytics.lastPredictionDate),
        icon: <TrendingUp className="w-7 h-7" />,
      },
      {
        label: 'Predictions This Month',
        value: predictionAnalytics.predictionsThisMonth.toLocaleString(),
        icon: <BarChart3 className="w-7 h-7" />,
      },
      {
        label: 'Most-Used Prediction Mode',
        value: predictionAnalytics.mostUsedPredictionMode,
        icon: <Sparkles className="w-7 h-7" />,
      },
      {
        label: 'Most-Used Country',
        value: predictionAnalytics.mostUsedCountry,
        icon: <Globe className="w-7 h-7" />,
      },
    ],
    [predictionAnalytics]
  );

  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const loadLotteryResults = useCallback(async (forceRefresh = false) => {
    setLotteryResultsStatus(forceRefresh ? 'Refreshing results...' : 'Loading results...');

    try {
      const results = await getLotteryResults({ forceRefresh });
      setLotteryResults(results);
      setLotteryResultsStatus('Results updated');
    } catch (error) {
      setLotteryResultsStatus('Results unavailable');
      console.error(`[LottoVision AI] Lottery results load failure: ${error?.message || error}`);
    }
  }, []);

  useEffect(() => {
    loadLotteryResults();
  }, [loadLotteryResults]);

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
            setPendingPredictions([]);
            setNotifications([]);
            setPrediction([]);
            setPredictionConfidence('');
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

    const predictionCollectionPath = getPredictionCollectionPath(currentUser.uid);
    console.log('[LottoVision AI] Prediction history subscribe path:', predictionCollectionPath);

    const predictionsRef = collection(db, predictionCollectionPath);
    const predictionsQuery = query(predictionsRef, orderBy('createdAt', 'desc'));

    return onSnapshot(
      predictionsQuery,
      (snapshot) => {
        const predictions = snapshot.docs.map((predictionDoc) => ({
          id: predictionDoc.id,
          ...predictionDoc.data(),
        }));

        console.log(
          `[LottoVision AI] Prediction read success: path=${predictionCollectionPath} count=${predictions.length} ids=${predictions.map((item) => item.id).join(',') || 'none'}`
        );

        setSavedPredictions(predictions);
        if (predictions.length > 0) {
          setPrediction(predictions[0].numbers);
          setPredictionConfidence(predictions[0].confidence || '');
        }
      },
      (error) => {
        console.error(
          `[LottoVision AI] Prediction read failure: path=${predictionCollectionPath} ${getFirestoreLogError(error)}`
        );
        setAuthError(getAuthMessage(error));
      }
    );
  }, [currentUser]);

  useEffect(() => {
    if (!db || !currentUser) {
      return undefined;
    }

    const notificationCollectionPath = getNotificationCollectionPath(currentUser.uid);
    console.log('[LottoVision AI] Notifications subscribe path:', notificationCollectionPath);

    const notificationsRef = collection(db, notificationCollectionPath);
    const notificationsQuery = query(notificationsRef, orderBy('createdAt', 'desc'));

    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const nextNotifications = snapshot.docs.map((notificationDoc) => ({
          id: notificationDoc.id,
          ...notificationDoc.data(),
        }));

        console.log(
          `[LottoVision AI] Notifications read success: path=${notificationCollectionPath} count=${nextNotifications.length}`
        );

        setNotifications(nextNotifications);
      },
      (error) => {
        console.error(
          `[LottoVision AI] Notifications read failure: path=${notificationCollectionPath} ${getFirestoreLogError(error)}`
        );
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
      await createUserNotification(
        credential.user.uid,
        'New account created',
        'Welcome to LottoVision AI. Your account is ready.'
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
    const generatedPrediction = generateAnalyzedPrediction({
      country: selectedCountry,
      mode: predictionMode,
      lotteryResults,
      predictionHistory,
    });
    const optimisticPredictionId = Date.now();
    const nextPrediction = {
      mode: predictionMode,
      country: selectedCountry,
      numbers: generatedPrediction.numbers,
      confidence: generatedPrediction.confidence,
    };

    setPrediction(generatedPrediction.numbers);
    setPredictionConfidence(generatedPrediction.confidence);

    if (!db || !currentUser) {
      console.error(
        `[LottoVision AI] Prediction write failure: path=${
          currentUser ? getPredictionCollectionPath(currentUser.uid) : 'users/{uid}/predictions'
        } reason=${!db ? 'Firestore is unavailable.' : 'No authenticated user.'}`
      );
      setPendingPredictions((prev) => [
        {
          id: optimisticPredictionId,
          ...nextPrediction,
        },
        ...prev,
      ]);
      return;
    }

    const predictionCollectionPath = getPredictionCollectionPath(currentUser.uid);
    console.log('[LottoVision AI] Prediction write path:', predictionCollectionPath);

    setPendingPredictions((prev) => [
      {
        id: optimisticPredictionId,
        ...nextPrediction,
        createdAt: new Date(),
      },
      ...prev,
    ]);

    try {
      const predictionDocRef = await addDoc(collection(db, predictionCollectionPath), {
        ...nextPrediction,
        createdAt: serverTimestamp(),
      });
      console.log(
        `[LottoVision AI] Prediction write success: path=${predictionCollectionPath} docId=${predictionDocRef.id} numbers=${nextPrediction.numbers.join(',')}`
      );
      setPendingPredictions((prev) => (
        prev.filter((item) => item.id !== optimisticPredictionId)
      ));
      setSavedPredictions((prev) => [
        {
          id: predictionDocRef.id,
          ...nextPrediction,
          createdAt: new Date(),
        },
        ...prev.filter((item) => item.id !== predictionDocRef.id),
      ]);
      await createUserNotification(
        currentUser.uid,
        'Prediction generated',
        `${predictionMode} prediction created for ${selectedCountry}: ${nextPrediction.numbers.join(', ')}.`
      );
    } catch (error) {
      console.error(
        `[LottoVision AI] Prediction write failure: path=${predictionCollectionPath} ${getFirestoreLogError(error)}`
      );
      setPendingPredictions((prev) => (
        prev.filter((item) => item.id !== optimisticPredictionId)
      ));
      setAuthError(getAuthMessage(error));
    }
  };

  const markNotificationAsRead = async (notification) => {
    if (!db || !currentUser || notification.read) {
      return;
    }

    const notificationCollectionPath = getNotificationCollectionPath(currentUser.uid);

    setNotifications((prev) => (
      prev.map((item) => (
        item.id === notification.id ? { ...item, read: true } : item
      ))
    ));

    try {
      await updateDoc(doc(db, notificationCollectionPath, notification.id), {
        read: true,
      });
    } catch (error) {
      console.error(
        `[LottoVision AI] Notification update failure: path=${notificationCollectionPath}/${notification.id} ${getFirestoreLogError(error)}`
      );
      setNotifications((prev) => (
        prev.map((item) => (
          item.id === notification.id ? { ...item, read: false } : item
        ))
      ));
      setAuthError(getAuthMessage(error));
    }
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab);

    if (tab === 'Premium' && currentUser) {
      createUserNotification(
        currentUser.uid,
        'Premium feature viewed',
        'You opened the LottoVision AI Premium feature area.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#050816] text-white p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        {currentUser && (
          <div className="flex flex-wrap gap-4 mb-8 bg-[#0B1020] p-4 rounded-3xl border border-white/5">
            {['Dashboard', 'Predictions', 'Analytics', 'Premium', 'Notifications'].map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabClick(tab)}
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
              <button
                onClick={() => handleTabClick('Notifications')}
                className="bg-[#161F38] px-5 py-3 rounded-2xl flex items-center gap-3"
              >
                <Bell className="text-cyan-400" />
                <div>
                  <p className="text-xs text-gray-400">Notifications</p>
                  <p className="font-semibold">
                    {unreadNotificationCount === 0
                      ? 'All caught up'
                      : `${unreadNotificationCount} unread`}
                  </p>
                </div>
              </button>
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

        {currentUser && activeTab === 'Dashboard' && (
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

        {currentUser && ['Dashboard', 'Analytics'].includes(activeTab) && (
        <div className="bg-[#161F38] rounded-[32px] p-7 mb-8 border border-white/5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-6">
            <div className="flex items-center gap-3">
              <Trophy className="text-yellow-300" />
              <div>
                <h3 className="text-3xl font-black">Live Lottery Results</h3>
                <p className="text-gray-400 mt-1">
                  Current jackpot, last draw numbers and next draw date.
                </p>
              </div>
            </div>

            <button
              onClick={() => loadLotteryResults(true)}
              className="bg-black/20 hover:bg-black/30 border border-white/10 px-5 py-3 rounded-2xl font-bold flex items-center gap-3"
            >
              <RefreshCw className="w-5 h-5 text-cyan-400" />
              {lotteryResultsStatus}
            </button>
          </div>

          {lotteryResults.length === 0 ? (
            <div className="bg-[#0B1020] rounded-2xl p-8 text-center">
              <p className="text-xl font-bold">{lotteryResultsStatus}</p>
            </div>
          ) : (
          <div className="grid lg:grid-cols-3 gap-5">
            {lotteryResults.map((draw) => (
              <div
                key={draw.id}
                className="bg-[#0B1020] rounded-3xl p-6 border border-white/10"
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <p className="text-gray-400 text-sm">{draw.country}</p>
                    <h4 className="text-2xl font-black mt-1">{draw.game}</h4>
                  </div>

                  <span className="bg-cyan-500/15 text-cyan-200 px-3 py-2 rounded-xl text-xs font-bold">
                    {draw.status}
                  </span>
                </div>

                <div className="bg-black/20 rounded-2xl p-4 border border-white/5 mb-5">
                  <p className="text-gray-400 text-sm">Current Jackpot</p>
                  <p className="text-3xl font-black text-yellow-300 mt-2">
                    {draw.jackpot}
                  </p>
                </div>

                <div className="mb-5">
                  <p className="text-gray-400 text-sm mb-3">
                    Last Draw: {draw.lastDrawDate}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {draw.lastDrawNumbers.map((number) => (
                      <div
                        key={`${draw.id}-${number}`}
                        className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 flex items-center justify-center font-black"
                      >
                        {number}
                      </div>
                    ))}
                    {draw.bonusNumber && (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center font-black">
                        {draw.bonusNumber}
                      </div>
                    )}
                  </div>
                  {draw.bonusLabel && (
                    <p className="text-gray-400 text-xs mt-2">
                      Orange ball: {draw.bonusLabel}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 text-sm">
                  <p className="text-gray-300">
                    <span className="text-gray-500">Next draw:</span> {draw.nextDrawDate}
                  </p>
                  <a
                    href={draw.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300 font-semibold"
                  >
                    Source: {draw.sourceName}
                  </a>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
        )}

        {currentUser && (
          <>
        {activeTab === 'Analytics' && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
          {analyticsCards.map((item) => (
            <div
              key={item.label}
              className="bg-[#161F38] rounded-[28px] p-6 border border-white/5"
            >
              <div className="text-cyan-400 mb-4">{item.icon}</div>
              <p className="text-gray-400 text-sm">{item.label}</p>
              <h3 className="text-3xl font-black mt-2 break-words">{item.value}</h3>
            </div>
          ))}
        </div>
        )}

        {activeTab === 'Analytics' && (
        <div className="bg-[#161F38] rounded-[32px] p-7 mb-8 border border-white/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Trophy className="text-yellow-300" />
              <h3 className="text-3xl font-black">Top Generated Numbers</h3>
            </div>

            <p className="text-gray-400 text-sm">
              Based on saved prediction history
            </p>
          </div>

          {predictionAnalytics.topNumbers.length === 0 ? (
            <div className="bg-[#0B1020] rounded-2xl p-8 text-center">
              <p className="text-xl font-bold">No number analytics yet.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {predictionAnalytics.topNumbers.map((item, index) => (
                <div
                  key={item.number}
                  className="bg-black/20 rounded-2xl p-5 border border-white/10"
                >
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-cyan-300 font-bold text-sm">#{index + 1}</p>
                    <p className="text-gray-400 text-sm">{item.count}x</p>
                  </div>

                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center text-2xl font-black">
                    {item.number}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {activeTab === 'Dashboard' && (
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
        )}

        {activeTab === 'Dashboard' && (
        <div className="bg-[#161F38] rounded-[32px] p-7 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Database className={`${firebaseConnected ? 'text-green-400' : 'text-yellow-400'}`} />
            <h3 className="text-3xl font-black">Firebase Status</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                label: 'Connection',
                value: firebaseConnected ? 'Connected' : 'Connecting...',
              },
              {
                label: 'Cloud Data',
                value: firebaseConfigured ? 'Configured' : 'Coming Soon',
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
        )}

        {activeTab === 'Predictions' && (
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
                {predictionConfidence && (
                  <p className="text-green-300 font-bold mt-3">
                    Confidence: {predictionConfidence}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-5 mb-8">
              {prediction.length === 0 ? (
                <p className="text-gray-400">Coming Soon</p>
              ) : (
                prediction.map((num) => (
                  <div
                    key={num}
                    className="w-20 h-20 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center text-2xl font-black"
                  >
                    {num}
                  </div>
                ))
              )}
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
              {predictionHistory.length === 0 ? (
                <div className="bg-[#0B1020] rounded-2xl p-8 text-center">
                  <p className="text-xl font-bold">No Predictions Yet</p>
                </div>
              ) : (
                predictionHistory.map((item) => (
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
        )}

        {activeTab === 'Premium' && (
        <div className="bg-[#161F38] rounded-[32px] p-7 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Crown className="text-cyan-400" />
            <h3 className="text-3xl font-black">Premium Status</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                label: 'Account Type',
                value: isPremium ? 'Premium Member' : 'Free Member',
              },
              {
                label: 'Upgrade',
                value: 'Coming Soon',
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
        )}

        {activeTab === 'Premium' && (
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
                  Coming Soon
                </h3>
                <p className="mt-3 text-gray-300 text-sm">
                  Monetization analytics will appear when billing data is connected.
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
        )}

        {activeTab === 'Premium' && (
        <div className="bg-[#161F38] rounded-[32px] p-7 mt-10">
          <div className="flex items-center gap-3 mb-6">
            <Wallet className="text-cyan-400" />
            <h3 className="text-3xl font-black">Membership Benefits</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
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
        </div>
        )}

        {activeTab === 'Premium' && (
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
                <h2 className="text-5xl font-black mt-2">Coming Soon</h2>
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
        )}

        {activeTab === 'Notifications' && (
        <div className="bg-[#161F38] rounded-[32px] p-7 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Bell className="text-cyan-400" />
              <h3 className="text-3xl font-black">Notification Center</h3>
            </div>

            <div className="bg-black/20 rounded-2xl px-4 py-3 border border-white/10">
              <p className="text-gray-400 text-xs">Unread</p>
              <p className="font-black text-cyan-300">{unreadNotificationCount}</p>
            </div>
          </div>

          <div className="space-y-4">
            {notifications.length === 0 ? (
              <div className="bg-[#0B1020] rounded-2xl p-8 text-center">
                <p className="text-xl font-bold">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`bg-[#0B1020] rounded-2xl p-5 border ${
                    notification.read ? 'border-white/5 opacity-75' : 'border-cyan-400/40'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`w-3 h-3 rounded-full ${
                            notification.read ? 'bg-gray-500' : 'bg-cyan-400'
                          }`}
                        />
                        <p className="text-gray-400 text-sm">
                          {formatNotificationDate(notification.createdAt)}
                        </p>
                      </div>

                      <h4 className="text-2xl font-black">{notification.title}</h4>
                      <p className="text-gray-300 mt-2">{notification.message}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-2 rounded-xl text-sm font-bold ${
                          notification.read
                            ? 'bg-white/5 text-gray-300'
                            : 'bg-cyan-500/20 text-cyan-200'
                        }`}
                      >
                        {notification.read ? 'Read' : 'Unread'}
                      </span>

                      {!notification.read && (
                        <button
                          onClick={() => markNotificationAsRead(notification)}
                          className="bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-2 rounded-xl font-bold"
                        >
                          Mark Read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
