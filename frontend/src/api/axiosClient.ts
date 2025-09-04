import axios from "axios";

const client = axios.create({
  baseURL: "http://localhost:8000",
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    const sessionId = localStorage.getItem("session_id");
    if (sessionId) {
      config.headers["X-Session-ID"] = sessionId;
    }
  }
  return config;
});

export default client;
