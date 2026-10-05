import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const wakeServer = () =>
  axios.get(`${BASE_URL}/health`).catch(() => null);

export const analyzeHand = (image_b64, question = '', session_id = '') =>
  axios.post(`${BASE_URL}/analyze`, { image_b64, question, session_id })
    .then(r => r.data);

export const resetSession = (session_id) =>
  axios.post(`${BASE_URL}/reset`, { session_id })
    .then(r => r.data);

export const getHistory = (session_id) =>
  axios.get(`${BASE_URL}/history/${session_id}`)
    .then(r => r.data);
