import client from "./axiosClient";

const API_URL = "/api";

export async function register(username: string, email: string, password: string, password2: string) {
  const res = await client.post(`${API_URL}/users/register/`, {
    username,
    email,
    password,
    password2,
  });
  return res.data;
}

export async function fetchUser(token: string) {
  const res = await client.get(`${API_URL}/users/me/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data; 
}

export async function login(username: string, password: string) {
  const resp = await client.post("/auth/token", { username, password });
  localStorage.setItem("access", resp.data.access);
  localStorage.setItem("refresh", resp.data.refresh);
  return resp.data;
}

export async function claimJobs() {
  const sessionId = localStorage.getItem("session_id");
  if (!sessionId) return;
  await client.post("/jobs/claim", { session_id: sessionId });
}
