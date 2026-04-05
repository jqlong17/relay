type MobileTopTabItem = {
  key: string;
  label: string;
};

type MobileTopTabsProps = {
  activeKey: string | null;
  items: MobileTopTabItem[];
  onChange: (key: string) => void;
};

export function MobileTopTabs({ activeKey, items, onChange }: MobileTopTabsProps) {
  return (
    <div className="mobile-top-tabs" aria-label="mobile panels">
      {items.map((item) => {
        const selected = item.key === activeKey;

        return (
          <button
            aria-pressed={selected}
            className={`mobile-top-tab ${selected ? "mobile-top-tab-active" : ""}`}
            key={item.key}
            onClick={() => onChange(item.key)}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
