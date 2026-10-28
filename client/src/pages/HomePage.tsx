import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AccountMenu } from "../AccountMenu";
import { deleteBoardRemote, leaveBoardRemote, renameBoardRemote } from "../api";
import { useAuth } from "../auth";
import { BoardCard } from "../BoardCard";
import { JoinForm } from "../JoinForm";
import { Logo } from "../Logo";
import { loadRecentBoards, removeRecentBoard, renameBoard } from "../recentBoards";
import { boardPath, generateRoomId } from "../room";
import { SignInButtons } from "../SignInButtons";
import { formatRelativeTime } from "../time";
import { useMyBoards } from "../useMyBoards";
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

/** Signed in (or login not configured): start a board, join one, or reopen one. */
function Dashboard() {
  const navigate = useNavigate();
  const { account } = useAuth();

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

      {account ? <AccountBoards accountId={account.id} /> : <BrowserBoards />}
    </main>
  );
}

type Tab = "recent" | "mine" | "shared";
const TABS: { id: Tab; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "mine", label: "My boards" },
  { id: "shared", label: "Shared with me" },
];
const EMPTY_TEXT: Record<Tab, string> = {
  recent: "Boards you create or open will show up here.",
  mine: "You haven't created any boards yet. Click New board to start one.",
  shared: "When someone shares a board link with you and you open it, it shows up here.",
};

/** Boards on your account, from the database: the same list on every device. */
function AccountBoards({ accountId }: { accountId: string }) {
  const { status, boards, update } = useMyBoards(accountId);
  const [tab, setTab] = useState<Tab>("recent");

  const shown = boards.filter((b) => (tab === "mine" ? b.isOwner : tab === "shared" ? !b.isOwner : true));

  return (
    <section aria-label="Your boards">
      <div className="board-tabs" role="tablist" aria-label="Board lists">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="board-tab"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <div className="empty-state">
          <p className="empty-hint">Loading your boards…</p>
        </div>
      ) : status === "error" ? (
        <div className="empty-state">
          <p>Couldn't load your boards.</p>
          <p className="empty-hint">Check your connection and refresh the page.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <p className="empty-hint">{EMPTY_TEXT[tab]}</p>
        </div>
      ) : (
        <div className="board-grid">
          {shown.map((board) => (
            <BoardCard
              key={board.id}
              id={board.id}
              name={board.name}
              thumbnail={board.thumbnail}
              meta={
                <>
                  {board.isOwner ? "Yours" : "Shared"} · opened {formatRelativeTime(board.lastOpened)}
                </>
              }
              onRename={
                board.isOwner
                  ? async (name) => {
                      await renameBoardRemote(board.id, name);
                      update((list) => list.map((b) => (b.id === board.id ? { ...b, name } : b)));
                    }
                  : undefined
              }
              onDelete={
                board.isOwner
                  ? async () => {
                      await deleteBoardRemote(board.id);
                      update((list) => list.filter((b) => b.id !== board.id));
                    }
                  : undefined
              }
              onRemove={
                board.isOwner
                  ? undefined
                  : async () => {
                      await leaveBoardRemote(board.id);
                      update((list) => list.filter((b) => b.id !== board.id));
                    }
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Login not configured: boards this browser has opened, as before. */
function BrowserBoards() {
  const [boards, setBoards] = useState(loadRecentBoards);
  const refresh = () => setBoards(loadRecentBoards());

  return (
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
              id={board.id}
              name={board.name}
              thumbnail={board.thumbnail ?? null}
              meta={<>Opened {formatRelativeTime(board.lastOpened)}</>}
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
  );
}
