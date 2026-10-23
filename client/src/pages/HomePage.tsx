import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { BoardCard } from "../BoardCard";
import { Logo } from "../Logo";
import { loadRecentBoards, removeRecentBoard, renameBoard } from "../recentBoards";
import { boardPath, generateRoomId, parseRoomInput } from "../room";
import "./home.css";

export function HomePage() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState(loadRecentBoards);
  const [joinValue, setJoinValue] = useState("");
  const [joinError, setJoinError] = useState(false);

  useEffect(() => {
    document.title = "Whiteboard";
  }, []);

  const refresh = () => setBoards(loadRecentBoards());

  const newBoard = () => navigate(boardPath(generateRoomId()));

  const join = (e: FormEvent) => {
    e.preventDefault();
    const roomId = parseRoomInput(joinValue);
    if (roomId) navigate(boardPath(roomId));
    else setJoinError(true);
  };

  return (
    <div className="home">
      <header className="home-header">
        <Logo />
      </header>

      <main className="home-main">
        <section className="home-start" aria-label="Start">
          <button type="button" className="start-card start-new" onClick={newBoard}>
            <span className="start-icon" aria-hidden="true">
              +
            </span>
            <span>
              <span className="start-title">New board</span>
              <span className="start-text">Start drawing on a blank board</span>
            </span>
          </button>

          <form className="start-card start-join" onSubmit={join}>
            <label className="start-title" htmlFor="join-input">
              Join a board
            </label>
            <span className="start-text">Paste a board link or ID</span>
            <div className="join-row">
              <input
                id="join-input"
                className="join-input"
                placeholder="e.g. k7m2x9qa4h"
                aria-invalid={joinError}
                value={joinValue}
                onChange={(e) => {
                  setJoinValue(e.target.value);
                  setJoinError(false);
                }}
              />
              <button type="submit" className="join-button">
                Join
              </button>
            </div>
            {joinError && <span className="join-error">That isn't a valid board link or ID.</span>}
          </form>
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
    </div>
  );
}
