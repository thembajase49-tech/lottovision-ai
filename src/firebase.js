import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBEBfuWplAPQRdnr4S6MBYKsBy8AyheVuU',
  authDomain: 'lotto-vision-ai.firebaseapp.com',
  projectId: 'lotto-vision-ai',
  storageBucket: 'lotto-vision-ai.firebasestorage.app',
  messagingSenderId: '974180139375',
  appId: '1:974180139375:web:6434ad684a4c954a90a89a',
  measurementId: 'G-QMN072C82N',
};

const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

export const firebaseConfigured = requiredConfig.every(Boolean);
export const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
