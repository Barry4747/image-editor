import RegisterForm from "../components/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 shadow-lg rounded p-6">
        <h2 className="text-2xl font-bold mb-4 text-center">Create Account</h2>
        <RegisterForm />
      </div>
    </div>
  );
}
