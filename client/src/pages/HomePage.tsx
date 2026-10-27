import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AccountMenu } from "../AccountMenu";
import { useAuth } from "../auth";
import { BoardCard } from "../BoardCard";
import { JoinForm } from "../JoinForm";
import { Logo } from "../Logo";
import { loadRecentBoards, removeRecentBoard, renameBoard } from "../recentBoards";
import { boardPath, generateRoomId } from "../room";
import { SignInButtons } from "../SignInButtons";
import "./home.css";

export function HomePage() {
  const { enabled, loading, account } = useAuth();

  useEffect(() => {
    document.title = "Whiteboard";
  }, []);

  return (
    <div className="home">
      <header className="home-header">
        <Logo />
        <AccountMenu />
      </header>
      {loading ? (
        <div className="page-loading">Loading…</div>
      ) : enabled && !account ? (
        <Landing />
      ) : (
        <Dashboard />
      )}
    </div>
  );
}

/** Signed out: what this is, sign in, or join a board from a link as a guest. */
function Landing() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <h1>Draw together, live.</h1>
        <p className="landing-pitch">
          A shared canvas for sketching ideas with friends. Share a link, and everyone sees every
          stroke as it's drawn.
        </p>
        <SignInButtons />
        <p className="landing-note">
          Sign in to create boards and find them again later. <Link to="/privacy">Privacy</Link>
        </p>
      </section>

      <section className="landing-join" aria-label="Join a board">
        <JoinForm />
        <p className="landing-note">Got a link from a friend? You can join as a guest, no account needed.</p>
      </section>
    </main>
  );
}

/** Signed in (or login not configured): start a board, join one, or reopen a recent one. */
function Dashboard() {
  const navigate = useNavigate();
  const { account } = useAuth();
  const [boards, setBoards] = useState(loadRecentBoards);
  const refresh = () => setBoards(loadRecentBoards());

  return (
    <main className="home-main">
      {account && <h1 className="home-greeting">Welcome back, {account.name.split(" ")[0]}</h1>}

      <section className="home-start" aria-label="Start">
        <button
          type="button"
          className="start-card start-new"
          onClick={() => navigate(boardPath(generateRoomId()))}
        >
          <span className="start-icon" aria-hidden="true">
            +
          </span>
          <span>
            <span className="start-title">New board</span>
            <span className="start-text">Start drawing on a blank board</span>
          </span>
        </button>
        <JoinForm />
      </section>

      <section aria-labelledby="recent-heading">
        <div className="section-head">
          <h2 id="recent-heading">Recent boards</h2>
          <span className="section-hint">Saved in this browser</span>
        </div>

        {boards.length === 0 ? (
          <div className="empty-state">
            <p>No boards yet.</p>
            <p className="empty-hint">Create a new board, or join one from a link a friend sent you.</p>
          </div>
        ) : (
          <div className="board-grid">
            {boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                onRename={(name) => {
                  renameBoard(board.id, name);
                  refresh();
                }}
                onRemove={() => {
                  removeRecentBoard(board.id);
                  refresh();
                }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
