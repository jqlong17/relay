import type { Session } from "@relay/shared-types";

type MobileSessionDrawerProps = {
  pendingSessionId: string | null;
  closeLabel: string;
  createLabel: string;
  emptyLabel: string;
  isOpen: boolean;
  sessions: Session[];
  title: string;
  activeSessionId: string | null;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (sessionId: string) => void;
};

export function MobileSessionDrawer({
  pendingSessionId,
  closeLabel,
  createLabel,
  emptyLabel,
  isOpen,
  sessions,
  title,
  activeSessionId,
  onClose,
  onCreate,
  onSelect,
}: MobileSessionDrawerProps) {
  return (
    <>
      {isOpen ? <button aria-label="close sessions" className="mobile-drawer-backdrop" onClick={onClose} type="button" /> : null}
      <aside aria-hidden={!isOpen} className={`mobile-drawer ${isOpen ? "mobile-drawer-open" : ""}`}>
        <div className="mobile-drawer-head">
          <span className="mobile-drawer-title">{title}</span>
          <button className="mobile-drawer-close" onClick={onClose} type="button">
            {closeLabel}
          </button>
        </div>
        <button className="mobile-drawer-primary" onClick={onCreate} type="button">
          {createLabel}
        </button>
        <div className="mobile-drawer-list">
          {sessions.length === 0 ? <div className="mobile-empty">{emptyLabel}</div> : null}
          {sessions.map((session) => (
            <button
              className={`mobile-drawer-item ${activeSessionId === session.id ? "mobile-drawer-item-active" : ""} ${pendingSessionId === session.id ? "mobile-drawer-item-pending" : ""}`}
              key={session.id}
              onClick={() => onSelect(session.id)}
              type="button"
            >
              {session.title}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
