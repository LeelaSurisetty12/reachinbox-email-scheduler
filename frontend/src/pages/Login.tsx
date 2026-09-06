import { Mail } from "lucide-react";

export default function Login() {
  const handleGoogleLogin = () => {
  window.location.href =
    "https://reachinbox-email-scheduler-i8re.onrender.com/auth/google";
};

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur">
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
              <Mail className="h-7 w-7 text-slate-950" />
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              ReachInbox
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Smart email scheduling and outreach
            </p>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-semibold text-slate-900 transition hover:bg-slate-100 active:scale-[0.99]"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="#4285F4"
                  d="M21.35 12.23c0-.79-.07-1.55-.2-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z"
                />
                <path
                  fill="#34A853"
                  d="M12 21.6c2.63 0 4.84-.87 6.45-2.35l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.73 9.73 0 0 0 12 21.6Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.54 13.69a5.83 5.83 0 0 1 0-3.38V7.78H3.3a9.73 9.73 0 0 0 0 8.44l3.24-2.53Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 6.28c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.83 3.42 14.63 2.4 12 2.4a9.73 9.73 0 0 0-8.7 5.38l3.24 2.53C7.31 8 9.46 6.28 12 6.28Z"
                />
              </svg>

              Continue with Google
            </button>
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Sign in to manage your scheduled and sent
            emails.
          </p>
        </div>
      </div>
    </div>
  );
}