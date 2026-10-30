import type { AssignableRole, Participant, Role } from "@whiteboard/shared";
import { Avatar } from "./Avatar";
import { usePopover } from "./usePopover";

const MAX_SHOWN = 4;

const ROLE_LABELS: Record<Role, string> = { host: "Host", editor: "Can draw", viewer: "View only" };

type Props = {
  users: Participant[];
  selfId: string | null;
  /** The host can change other people's roles. */
  canManagePeople: boolean;
  onSetRole: (participantId: string, role: AssignableRole) => void;
  onRemove: (participantId: string) => void;
};

/** Overlapping avatars of everyone on the board; click for the full list (and role controls). */
export function ParticipantList({ users, selfId, canManagePeople, onSetRole, onRemove }: Props) {
  const { open, toggle, ref } = usePopover<HTMLDivElement>();
  if (users.length === 0) return null;

  // You first, then the host, then everyone else in join order.
  const rank = (u: Participant) => (u.id === selfId ? 0 : u.role === "host" ? 1 : 2);
  const ordered = [...users].sort((a, b) => rank(a) - rank(b));
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
            {ordered.map((user) => {
              const isSelf = user.id === selfId;
              const editable = canManagePeople && !isSelf && user.role !== "host";
              return (
                <li key={user.id}>
                  <Avatar name={user.name} avatarUrl={user.avatarUrl} size={26} />
                  <span className="participant-name">
                    {user.name}
                    {isSelf && <span className="participant-sub"> (you)</span>}
                    {user.isGuest && !isSelf && <span className="participant-sub"> · guest</span>}
                  </span>
                  {editable ? (
                    <select
                      className="role-select"
                      aria-label={`Role for ${user.name}`}
                      value={user.role}
                      onChange={(e) => onSetRole(user.id, e.target.value as AssignableRole)}
                    >
                      <option value="editor">{ROLE_LABELS.editor}</option>
                      <option value="viewer">{ROLE_LABELS.viewer}</option>
                    </select>
                  ) : null}
                  {editable && (
                    <button
                      type="button"
                      className="remove-button"
                      title={`Remove ${user.name} from this board`}
                      aria-label={`Remove ${user.name} from this board`}
                      onClick={() => onRemove(user.id)}
                    >
                      Remove
                    </button>
                  )}
                  {editable ? null : (
                    <span className={`participant-tag role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {canManagePeople && users.length > 1 && (
            <p className="popover-hint">Removed people can't rejoin until you allow it in board settings.</p>
          )}
        </div>
      )}
    </div>
  );
}
