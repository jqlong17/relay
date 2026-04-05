import type { ReactNode } from "react";

type MobileHeaderProps = {
  brand: string;
  sessionName: string;
  workspaceName: string;
  statusDetail: string;
  statusLabel: string;
  actions?: ReactNode;
};

export function MobileHeader({
  brand,
  sessionName,
  workspaceName,
  statusDetail,
  statusLabel,
  actions,
}: MobileHeaderProps) {
  const hasStatusDetail = statusDetail.trim().length > 0;

  return (
    <header className="mobile-header">
      <div className="mobile-header-top">
        <div className="mobile-header-brand">
          <span className="mobile-brand-mark">{brand}</span>
          <span className="mobile-status-pill">{statusLabel}</span>
        </div>
        {actions ? <div className="mobile-header-actions">{actions}</div> : null}
      </div>
      <div className="mobile-header-meta">
        <span className="mobile-header-workspace">{workspaceName}</span>
        <span className="mobile-header-separator" aria-hidden="true">
          /
        </span>
        <span className="mobile-header-session">{sessionName}</span>
      </div>
      {hasStatusDetail ? <div className="mobile-header-status-detail">{statusDetail}</div> : null}
    </header>
  );
}
