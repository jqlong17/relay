import type { Session } from "@relay/shared-types";
import {
  MobileDrawer,
  MobileDrawerList,
  MobileDrawerListItem,
  MobileDrawerHeaderAction,
  MobileDrawerEmpty,
} from "@/components/mobile/mobile-drawer-kit";

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
    <MobileDrawer
      closeAriaLabel="close sessions"
      closeLabel={closeLabel}
      headerAction={<MobileDrawerHeaderAction label={createLabel} onClick={onCreate} />}
      isOpen={isOpen}
      onClose={onClose}
      title={title}
    >
      <MobileDrawerList variant="compact">
        {sessions.length === 0 ? <MobileDrawerEmpty label={emptyLabel} /> : null}
        {sessions.map((session) => (
          <MobileDrawerListItem
            active={activeSessionId === session.id}
            key={session.id}
            meta={formatSessionTime(session.updatedAt)}
            onClick={() => onSelect(session.id)}
            pending={pendingSessionId === session.id}
            title={session.title}
          />
        ))}
      </MobileDrawerList>
    </MobileDrawer>
  );
}

function formatSessionTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
