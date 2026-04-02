import type { Workspace } from "@relay/shared-types";

type MobileWorkspaceDrawerProps = {
  closeLabel: string;
  emptyLabel: string;
  isOpen: boolean;
  title: string;
  workspaces: Workspace[];
  onClose: () => void;
  onSelect: (workspace: Workspace) => void;
};

export function MobileWorkspaceDrawer({
  closeLabel,
  emptyLabel,
  isOpen,
  title,
  workspaces,
  onClose,
  onSelect,
}: MobileWorkspaceDrawerProps) {
  return (
    <>
      {isOpen ? <button aria-label="close workspaces" className="mobile-drawer-backdrop" onClick={onClose} type="button" /> : null}
      <aside aria-hidden={!isOpen} className={`mobile-drawer ${isOpen ? "mobile-drawer-open" : ""}`}>
        <div className="mobile-drawer-head">
          <span className="mobile-drawer-title">{title}</span>
          <button className="mobile-drawer-close" onClick={onClose} type="button">
            {closeLabel}
          </button>
        </div>
        <div className="mobile-drawer-list">
          {workspaces.length === 0 ? <div className="mobile-empty">{emptyLabel}</div> : null}
          {workspaces.map((workspace) => (
            <button className="mobile-drawer-item" key={workspace.id} onClick={() => onSelect(workspace)} type="button">
              {workspace.name}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
