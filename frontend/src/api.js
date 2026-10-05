import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const wakeServer = () =>
  axios.get(`${BASE_URL}/health`).catch(() => null);

export const analyzeHand = ({
  image_b64,
  question = '',
  session_id = '',
  is_live = false,
  last_cards = null,
  voice_engine = 'browser',
  voice_api_key = null,
  voice_id = null
}) =>
  axios
    .post(`${BASE_URL}/analyze`, {
      image_b64,
      question,
      session_id,
      is_live,
      last_cards,
      voice_engine,
      voice_api_key,
      voice_id
    })
    .then((r) => r.data);

export const synthesizeTTS = ({ text, engine = 'browser', api_key = null, voice_id = null }) =>
  axios
    .post(`${BASE_URL}/tts`, { text, engine, api_key, voice_id })
    .then((r) => r.data);

export const resetSession = (session_id) =>
  axios.post(`${BASE_URL}/reset`, { session_id }).then((r) => r.data);

export const getHistory = (session_id) =>
  axios.get(`${BASE_URL}/history/${session_id}`).then((r) => r.data);
