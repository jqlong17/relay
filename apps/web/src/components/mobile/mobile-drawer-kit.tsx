import type { PropsWithChildren, ReactNode } from "react";

type MobileDrawerVariant = "default" | "compact";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type MobileDrawerProps = {
  closeAriaLabel: string;
  closeLabel: string;
  isOpen: boolean;
  title: string;
  onClose: () => void;
  headerAction?: ReactNode;
  children: ReactNode;
};

export function MobileDrawer({
  closeAriaLabel,
  closeLabel,
  isOpen,
  title,
  onClose,
  headerAction,
  children,
}: MobileDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button aria-label={closeAriaLabel} className="mobile-drawer-backdrop" onClick={onClose} type="button" />
      <aside className="mobile-drawer mobile-drawer-open">
        <div className="mobile-drawer-head">
          <span className="mobile-drawer-title">{title}</span>
          <div className="mobile-drawer-head-actions">
            {headerAction}
            <button className="mobile-drawer-close" onClick={onClose} type="button">
              {closeLabel}
            </button>
          </div>
        </div>
        {children}
      </aside>
    </>
  );
}

type MobileDrawerPrimaryActionProps = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
};

export function MobileDrawerPrimaryAction({ disabled, label, onClick }: MobileDrawerPrimaryActionProps) {
  return (
    <button className="mobile-drawer-primary" disabled={disabled} onClick={onClick} type="button">
      {label}
    </button>
  );
}

type MobileDrawerHeaderActionProps = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
};

export function MobileDrawerHeaderAction({ disabled, label, onClick }: MobileDrawerHeaderActionProps) {
  return (
    <button className="mobile-drawer-head-button" disabled={disabled} onClick={onClick} type="button">
      {label}
    </button>
  );
}

type MobileDrawerSectionProps = PropsWithChildren<{
  title: string;
  note?: string;
  className?: string;
  variant?: MobileDrawerVariant;
}>;

export function MobileDrawerSection({ title, note, className, variant = "default", children }: MobileDrawerSectionProps) {
  return (
    <section
      className={joinClasses(
        "mobile-drawer-section",
        variant === "compact" ? "mobile-drawer-section-compact" : undefined,
        className,
      )}
    >
      <div className="mobile-drawer-section-head">
        <span className="mobile-drawer-section-title">{title}</span>
        {note ? <div className="mobile-drawer-note">{note}</div> : null}
      </div>
      <div className="mobile-drawer-section-body">{children}</div>
    </section>
  );
}

type MobileDrawerListProps = PropsWithChildren<{
  className?: string;
  variant?: MobileDrawerVariant;
}>;

export function MobileDrawerList({ className, variant = "default", children }: MobileDrawerListProps) {
  return (
    <div
      className={joinClasses(
        "mobile-drawer-list",
        variant === "compact" ? "mobile-drawer-list-compact" : undefined,
        className,
      )}
    >
      {children}
    </div>
  );
}

type MobileDrawerAdvancedProps = PropsWithChildren<{
  summary: string;
  className?: string;
  variant?: MobileDrawerVariant;
}>;

export function MobileDrawerAdvanced({
  summary,
  className,
  variant = "default",
  children,
}: MobileDrawerAdvancedProps) {
  return (
    <details
      className={joinClasses(
        "mobile-drawer-advanced",
        variant === "compact" ? "mobile-drawer-advanced-compact" : undefined,
        className,
      )}
    >
      <summary className="mobile-drawer-section-title">{summary}</summary>
      {children}
    </details>
  );
}

type MobileDrawerEmptyProps = {
  label: string;
};

export function MobileDrawerEmpty({ label }: MobileDrawerEmptyProps) {
  return <div className="mobile-empty">{label}</div>;
}

type MobileDrawerRowProps = PropsWithChildren<{
  className?: string;
}>;

export function MobileDrawerRow({ className, children }: MobileDrawerRowProps) {
  return <div className={className ? `mobile-drawer-row ${className}` : "mobile-drawer-row"}>{children}</div>;
}

type MobileDrawerListItemProps = {
  active?: boolean;
  pending?: boolean;
  title: string;
  meta?: string;
  trailing?: ReactNode;
  onClick: () => void;
};

export function MobileDrawerListItem({
  active = false,
  pending = false,
  title,
  meta,
  trailing,
  onClick,
}: MobileDrawerListItemProps) {
  return (
    <MobileDrawerRow className={trailing ? "mobile-drawer-row-split" : undefined}>
      <button
        className={`mobile-drawer-item ${active ? "mobile-drawer-item-active" : ""} ${pending ? "mobile-drawer-item-pending" : ""}`}
        onClick={onClick}
        type="button"
      >
        <span className="mobile-drawer-item-title">{title}</span>
        {meta ? <span className="mobile-drawer-item-meta">{meta}</span> : null}
      </button>
      {trailing}
    </MobileDrawerRow>
  );
}
