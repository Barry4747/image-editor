import { useNavigate } from "react-router-dom";
import LoginForm from "../components/LoginForm";
import { useAuth } from "../hooks/useAuth";
import { fetchUser } from "../api/auth";

export default function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function handleLogin() {
    const token = localStorage.getItem("access");
    if (!token) return;

    try {
      const res = await fetchUser(token);
      setUser(res);
      navigate("/");
    } catch (err) {
      console.error("Failed to fetch user after login", err);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="bg-white dark:bg-gray-800 shadow rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-xl font-bold mb-4 text-center">Login</h2>
        <LoginForm onLogin={handleLogin} />
      </div>
    </div>
  );
}
