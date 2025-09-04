import { v4 as uuidv4 } from "uuid";

export function initSessionId() {
  let sid = localStorage.getItem("session_id");
  if (!sid) {
    sid = uuidv4();
    localStorage.setItem("session_id", sid);
  }
  return sid;
}
