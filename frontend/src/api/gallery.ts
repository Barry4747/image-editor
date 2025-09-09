import client from "../api/axiosClient";

const API_URL = "/api/my-gallery";

export async function fetchGallery() {
  const sessionId = localStorage.getItem("session_id");

  const res = await client.get(API_URL, {
    headers: sessionId ? { "X-Session-ID": sessionId } : {},
  });

  return res.data;
}

export async function deleteJob(id: number) {
  const sessionId = localStorage.getItem("session_id");

  return client.delete(`${API_URL}/${id}/`, {
  headers: sessionId ? { "X-Session-ID": sessionId } : {},
});
}

export async function updateJob(
  id: number,
  data: { title?: string; description?: string }
) {
  const sessionId = localStorage.getItem("session_id");

  const res = await client.patch(`${API_URL}${id}/`, data, {
    headers: sessionId ? { "X-Session-ID": sessionId } : {},
  });

  return res.data;
}