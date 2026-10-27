import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { boardPath, parseRoomInput } from "./room";

/** "Join a board" card: paste a board link or ID. */
export function JoinForm() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const join = (e: FormEvent) => {
    e.preventDefault();
    const roomId = parseRoomInput(value);
    if (roomId) navigate(boardPath(roomId));
    else setError(true);
  };

  return (
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
          aria-invalid={error}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
        />
        <button type="submit" className="join-button">
          Join
        </button>
      </div>
      {error && <span className="join-error">That isn't a valid board link or ID.</span>}
    </form>
  );
}
