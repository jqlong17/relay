import type { Workspace } from "@relay/shared-types";
import {
  MobileDrawerAdvanced,
  MobileDrawer,
  MobileDrawerEmpty,
  MobileDrawerList,
  MobileDrawerListItem,
  MobileDrawerPrimaryAction,
  MobileDrawerSection,
} from "@/components/mobile/mobile-drawer-kit";

type MobileWorkspaceDrawerProps = {
  activeWorkspaceId: string | null;
  advancedLabel: string;
  closeLabel: string;
  currentLabel: string;
  emptyLabel: string;
  favoriteLabel: string;
  isOpen: boolean;
  manualPath: string;
  manualPathLabel: string;
  manualPathPlaceholder: string;
  noFavoritesLabel: string;
  openManualLabel: string;
  pendingWorkspaceId: string | null;
  recentLabel: string;
  recentHintLabel: string;
  starredWorkspaceIds: string[];
  starredLabel: string;
  title: string;
  workspaces: Workspace[];
  onClose: () => void;
  onManualPathChange: (value: string) => void;
  onOpenManualPath: () => void;
  onSelect: (workspace: Workspace) => void;
  onToggleStar: (workspaceId: string) => void;
  unfavoriteLabel: string;
};

export function MobileWorkspaceDrawer({
  activeWorkspaceId,
  advancedLabel,
  closeLabel,
  currentLabel,
  emptyLabel,
  favoriteLabel,
  isOpen,
  manualPath,
  manualPathLabel,
  manualPathPlaceholder,
  noFavoritesLabel,
  openManualLabel,
  pendingWorkspaceId,
  recentLabel,
  recentHintLabel,
  starredWorkspaceIds,
  starredLabel,
  title,
  workspaces,
  onClose,
  onManualPathChange,
  onOpenManualPath,
  onSelect,
  onToggleStar,
  unfavoriteLabel,
}: MobileWorkspaceDrawerProps) {
  if (!isOpen) {
    return null;
  }

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const starredWorkspaces = workspaces.filter((workspace) => starredWorkspaceIds.includes(workspace.id));
  const recentWorkspaces = workspaces
    .filter((workspace) => workspace.id !== activeWorkspaceId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    <MobileDrawer closeAriaLabel="close workspaces" closeLabel={closeLabel} isOpen={isOpen} onClose={onClose} title={title}>
      <MobileDrawerList variant="compact">
        {activeWorkspace ? (
          <MobileDrawerSection title={currentLabel} variant="compact">
            <WorkspaceListItem
              activeWorkspaceId={activeWorkspaceId}
              favoriteLabel={favoriteLabel}
              pendingWorkspaceId={pendingWorkspaceId}
              workspace={activeWorkspace}
              onSelect={onSelect}
              onToggleStar={onToggleStar}
              starred={starredWorkspaceIds.includes(activeWorkspace.id)}
              unfavoriteLabel={unfavoriteLabel}
            />
          </MobileDrawerSection>
        ) : null}

        <MobileDrawerSection title={starredLabel} variant="compact">
          {starredWorkspaces.length === 0 ? <MobileDrawerEmpty label={noFavoritesLabel} /> : null}
          {starredWorkspaces.map((workspace) => (
            <WorkspaceListItem
              activeWorkspaceId={activeWorkspaceId}
              favoriteLabel={favoriteLabel}
              key={workspace.id}
              pendingWorkspaceId={pendingWorkspaceId}
              workspace={workspace}
              onSelect={onSelect}
              onToggleStar={onToggleStar}
              starred
              unfavoriteLabel={unfavoriteLabel}
            />
          ))}
        </MobileDrawerSection>

        <MobileDrawerSection note={recentHintLabel} title={recentLabel} variant="compact">
          {recentWorkspaces.length === 0 ? <MobileDrawerEmpty label={emptyLabel} /> : null}
          {recentWorkspaces.map((workspace) => (
            <WorkspaceListItem
              activeWorkspaceId={activeWorkspaceId}
              favoriteLabel={favoriteLabel}
              key={workspace.id}
              pendingWorkspaceId={pendingWorkspaceId}
              workspace={workspace}
              onSelect={onSelect}
              onToggleStar={onToggleStar}
              starred={starredWorkspaceIds.includes(workspace.id)}
              unfavoriteLabel={unfavoriteLabel}
            />
          ))}
        </MobileDrawerSection>

        <MobileDrawerAdvanced summary={advancedLabel} variant="compact">
          <div className="mobile-drawer-path-form">
            <label className="mobile-drawer-path-label">
              <span>{manualPathLabel}</span>
              <input
                className="mobile-drawer-path-input"
                onChange={(event) => onManualPathChange(event.target.value)}
                placeholder={manualPathPlaceholder}
                type="text"
                value={manualPath}
              />
            </label>
            <MobileDrawerPrimaryAction
              disabled={manualPath.trim().length === 0 || pendingWorkspaceId === "__manual__"}
              label={openManualLabel}
              onClick={onOpenManualPath}
            />
          </div>
        </MobileDrawerAdvanced>
      </MobileDrawerList>
    </MobileDrawer>
  );
}

type WorkspaceListItemProps = {
  activeWorkspaceId: string | null;
  favoriteLabel: string;
  pendingWorkspaceId: string | null;
  starred: boolean;
  unfavoriteLabel: string;
  workspace: Workspace;
  onSelect: (workspace: Workspace) => void;
  onToggleStar: (workspaceId: string) => void;
};

function WorkspaceListItem({
  activeWorkspaceId,
  favoriteLabel,
  pendingWorkspaceId,
  starred,
  unfavoriteLabel,
  workspace,
  onSelect,
  onToggleStar,
}: WorkspaceListItemProps) {
  return (
    <MobileDrawerListItem
      active={activeWorkspaceId === workspace.id}
      onClick={() => onSelect(workspace)}
      pending={pendingWorkspaceId === workspace.id}
      title={workspace.name}
      trailing={
      <button
        aria-label={starred ? unfavoriteLabel : favoriteLabel}
        className={`mobile-drawer-star ${starred ? "mobile-drawer-star-active" : ""}`}
        onClick={() => onToggleStar(workspace.id)}
        type="button"
      >
        {starred ? "★" : "☆"}
      </button>
      }
    />
  );
}
