import axios from "axios";

const client = axios.create({
  baseURL: `http://${process.env.REACT_APP_API_URL}`,
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

client.interceptors.response.use(
  (response) => response, 
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true; 
      try {
        const refreshToken = localStorage.getItem("refresh");
        if (refreshToken) {
          const res = await axios.post("/auth/token/refresh", {
            refresh: refreshToken,
          });
          const newAccess = res.data.access;
          localStorage.setItem("access", newAccess);

          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return axios(originalRequest);
        }
      } catch (err) {
        console.error("Refresh token failed:", err);
        // tutaj możesz np. przekierować na login
        
      }
    }

    return Promise.reject(error);
  }
);

export default client;
