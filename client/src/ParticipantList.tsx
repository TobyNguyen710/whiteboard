import type { Participant } from "@whiteboard/shared";
import { Avatar } from "./Avatar";
import { usePopover } from "./usePopover";

const MAX_SHOWN = 4;

type Props = { users: Participant[]; selfId: string | null };

/** Overlapping avatars of everyone on the board; click for the full list. */
export function ParticipantList({ users, selfId }: Props) {
  const { open, toggle, ref } = usePopover<HTMLDivElement>();
  if (users.length === 0) return null;

  // You first, then everyone else in join order.
  const ordered = [...users].sort((a, b) => Number(b.id === selfId) - Number(a.id === selfId));
  const shown = ordered.slice(0, MAX_SHOWN);
  const extra = ordered.length - shown.length;
  const label = `${users.length} ${users.length === 1 ? "person" : "people"} on this board`;

  return (
    <div className="participants" ref={ref}>
      <button type="button" className="participant-stack" aria-label={label} title={label} onClick={toggle}>
        {shown.map((user) => (
          <Avatar key={user.id} name={user.name} avatarUrl={user.avatarUrl} size={28} ring />
        ))}
        {extra > 0 && <span className="avatar avatar-ring avatar-more">+{extra}</span>}
      </button>

      {open && (
        <div className="popover participant-popover" role="dialog" aria-label="People on this board">
          <p className="popover-title">{label}</p>
          <ul className="participant-list">
            {ordered.map((user) => (
              <li key={user.id}>
                <Avatar name={user.name} avatarUrl={user.avatarUrl} size={26} />
                <span className="participant-name">{user.name}</span>
                {user.id === selfId && <span className="participant-tag">you</span>}
                {user.isGuest && user.id !== selfId && <span className="participant-tag">guest</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
