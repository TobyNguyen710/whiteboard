import { useEffect } from "react";
import { Link } from "react-router";
import { Logo } from "../Logo";
import "./home.css";

const REPO_URL = "https://github.com/TobyNguyen710/whiteboard";

/** Plain-language privacy policy (required by Google / GitHub sign-in). */
export function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy · Whiteboard";
  }, []);

  return (
    <div className="home">
      <header className="home-header">
        <Logo />
      </header>
      <main className="legal">
        <h1>Privacy</h1>
        <p className="legal-updated">Last updated October 26, 2026</p>

        <p>
          Whiteboard is a small personal project: a shared canvas for drawing with friends. This
          page explains what it stores and why. It doesn't sell data, show ads, or use tracking.
        </p>

        <h2>If you sign in</h2>
        <p>
          Signing in with Google or GitHub shares your <strong>name, email address, and profile
          picture</strong> with Whiteboard. They're used to show who you are on boards you join
          and to keep track of the boards you create. Sign-in is handled by Supabase.
        </p>

        <h2>Boards</h2>
        <p>
          What you draw on a board is saved so the board is still there later, and anyone with a
          board's link can see and draw on it. Don't put anything on a board you wouldn't want
          others with the link to see.
        </p>

        <h2>Guests</h2>
        <p>
          You can join a board from a link without an account. Guests choose a display name,
          which others on the board can see. Nothing else is collected about guests.
        </p>

        <h2>Your browser</h2>
        <p>
          Your browser stores your recent boards, tool settings, guest name, and sign-in session
          locally. You can clear these any time by clearing this site's data.
        </p>

        <h2>Services used</h2>
        <p>
          Supabase (database and sign-in), Render (server), and Vercel (website). They process
          data only to run the site.
        </p>

        <h2>Questions or deletion</h2>
        <p>
          To ask a question or have your account and boards deleted, open an issue on the{" "}
          <a href={REPO_URL}>project's GitHub page</a>.
        </p>

        <p>
          <Link to="/">Back to Whiteboard</Link>
        </p>
      </main>
    </div>
  );
}
