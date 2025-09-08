import axios from "axios";

const API_URL = "/api/my-gallery";

export async function fetchGallery() {
  const token = localStorage.getItem("access");
  const sessionId = localStorage.getItem("session_id");

  return axios.get(API_URL, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sessionId ? { "X-Session-ID": sessionId } : {}),
    },
  }).then(res => res.data);
}

export async function deleteJob(id: number) {
  const token = localStorage.getItem("access");
  const sessionId = localStorage.getItem("session_id");

  return axios.delete(`${API_URL}/${id}/`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sessionId ? { "X-Session-ID": sessionId } : {}),
    },
  });
}

export async function updateJob(id: number, data: { title?: string; description?: string }) {
  const token = localStorage.getItem("access");
  const sessionId = localStorage.getItem("session_id");

  return axios.patch(`${API_URL}${id}/`, data, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sessionId ? { "X-Session-ID": sessionId } : {}),
    },
  }).then(res => res.data);
}
