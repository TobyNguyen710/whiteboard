import { useState, type FormEvent } from "react";
import { MAX_DISPLAY_NAME_LENGTH } from "@whiteboard/shared";
import { useAuth } from "./auth";
import { Avatar } from "./Avatar";
import { SignInButtons } from "./SignInButtons";
import { usePopover } from "./usePopover";

type Props = {
  /** Guests on a board can change their name; leave unset where that doesn't apply. */
  guestName?: string;
  onGuestRename?: (name: string) => void;
};

/**
 * Top-right account control. Signed in: avatar with name and Sign out. Guest: "Sign in" with
 * the provider buttons (and, on a board, a field to change your guest name).
 */
export function AccountMenu({ guestName, onGuestRename }: Props) {
  const { enabled, account, signOut } = useAuth();
  const { open, toggle, ref } = usePopover<HTMLDivElement>();
  const [draft, setDraft] = useState(guestName ?? "");

  if (!enabled) return null;

  const saveGuestName = (e: FormEvent) => {
    e.preventDefault();
    onGuestRename?.(draft);
  };

  return (
    <div className="account-menu" ref={ref}>
      {account ? (
        <button
          type="button"
          className="account-trigger"
          aria-expanded={open}
          aria-label={`Account: ${account.name}`}
          onClick={toggle}
        >
          <Avatar name={account.name} avatarUrl={account.avatarUrl} size={30} />
        </button>
      ) : (
        <button
          type="button"
          className="text-button"
          aria-expanded={open}
          onClick={() => {
            setDraft(guestName ?? "");
            toggle();
          }}
        >
          Sign in
        </button>
      )}

      {open && (
        <div className="popover account-popover" role="dialog" aria-label="Account">
          {account ? (
            <>
              <div className="account-who">
                <Avatar name={account.name} avatarUrl={account.avatarUrl} size={36} />
                <div>
                  <div className="account-name">{account.name}</div>
                  {account.email && <div className="account-email">{account.email}</div>}
                </div>
              </div>
              <button type="button" className="popover-item" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="popover-title">Sign in to create and keep boards</p>
              <SignInButtons />
              {onGuestRename && (
                <form className="guest-name-form" onSubmit={saveGuestName}>
                  <label htmlFor="guest-name">Or keep going as a guest named</label>
                  <div className="guest-name-row">
                    <input
                      id="guest-name"
                      value={draft}
                      maxLength={MAX_DISPLAY_NAME_LENGTH}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button type="submit" className="text-button">
                      Save
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
