type MobileHeaderProps = {
  brand: string;
  sessionName: string;
  workspaceName: string;
  statusDetail: string;
  statusLabel: string;
  sessionsLabel: string;
  workspacesLabel: string;
  isSessionsOpen: boolean;
  isWorkspacesOpen: boolean;
  onOpenSessions: () => void;
  onOpenWorkspaces: () => void;
};

export function MobileHeader({
  brand,
  sessionName,
  workspaceName,
  statusDetail,
  statusLabel,
  sessionsLabel,
  workspacesLabel,
  isSessionsOpen,
  isWorkspacesOpen,
  onOpenSessions,
  onOpenWorkspaces,
}: MobileHeaderProps) {
  return (
    <header className="mobile-header">
      <div className="mobile-header-top">
        <div className="mobile-header-brand">
          <span className="mobile-brand-mark">{brand}</span>
          <span className="mobile-status-pill">{statusLabel}</span>
        </div>
        <div className="mobile-header-actions">
          <button
            aria-expanded={isWorkspacesOpen}
            className={`mobile-header-button ${isWorkspacesOpen ? "mobile-header-button-active" : ""}`}
            onClick={onOpenWorkspaces}
            type="button"
          >
            {workspacesLabel}
          </button>
          <button
            aria-expanded={isSessionsOpen}
            className={`mobile-header-button ${isSessionsOpen ? "mobile-header-button-active" : ""}`}
            onClick={onOpenSessions}
            type="button"
          >
            {sessionsLabel}
          </button>
        </div>
      </div>
      <div className="mobile-header-meta">
        <span className="mobile-header-workspace">{workspaceName}</span>
        <span className="mobile-header-separator" aria-hidden="true">
          /
        </span>
        <span className="mobile-header-session">{sessionName}</span>
      </div>
      <div className="mobile-header-status-detail">{statusDetail}</div>
    </header>
  );
}
