import { useState, type ReactElement } from "react";
import { useAuth, type LoginProvider } from "./auth";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 01-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 010-4.2V7.1H2.1a11 11 0 000 9.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0012 1 11 11 0 002.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1a11 11 0 00-3.5 21.4c.6.1.8-.2.8-.5v-2c-3.1.7-3.7-1.4-3.7-1.4-.5-1.3-1.2-1.6-1.2-1.6-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.4 0-1.2.4-2.2 1.1-3-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 3 1.1a10.4 10.4 0 015.5 0c2.1-1.4 3-1.1 3-1.1.6 1.5.2 2.6.1 2.9.7.8 1.1 1.8 1.1 3 0 4.2-2.6 5.1-5.1 5.4.4.3.8 1 .8 2v3c0 .3.2.6.8.5A11 11 0 0012 1z"
      />
    </svg>
  );
}

const PROVIDERS: { id: LoginProvider; label: string; Mark: () => ReactElement }[] = [
  { id: "google", label: "Continue with Google", Mark: GoogleMark },
  { id: "github", label: "Continue with GitHub", Mark: GitHubMark },
];

/** Google / GitHub sign-in buttons. Signing in leaves the page and comes back to it. */
export function SignInButtons() {
  const { signIn } = useAuth();
  const [pending, setPending] = useState<LoginProvider | null>(null);
  const [error, setError] = useState(false);

  const start = async (provider: LoginProvider) => {
    setPending(provider);
    setError(false);
    try {
      await signIn(provider);
    } catch {
      setPending(null);
      setError(true);
    }
  };

  return (
    <div className="signin-buttons">
      {PROVIDERS.map(({ id, label, Mark }) => (
        <button
          key={id}
          type="button"
          className="signin-button"
          disabled={pending !== null}
          onClick={() => void start(id)}
        >
          <Mark />
          {pending === id ? "Opening…" : label}
        </button>
      ))}
      {error && <p className="signin-error">Couldn't start sign-in. Please try again.</p>}
    </div>
  );
}
