type MobileComposerProps = {
  composerValue: string;
  disabled: boolean;
  isRunning: boolean;
  placeholder: string;
  runLabel: string;
  runningLabel: string;
  onChange: (value: string) => void;
  onRun: () => void;
};

export function MobileComposer({
  composerValue,
  disabled,
  isRunning,
  placeholder,
  runLabel,
  runningLabel,
  onChange,
  onRun,
}: MobileComposerProps) {
  return (
    <div className="mobile-composer">
      <textarea
        className="mobile-composer-input"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onRun();
          }
        }}
        placeholder={placeholder}
        rows={1}
        value={composerValue}
      />
      <button className="mobile-composer-send" disabled={disabled || isRunning} onClick={onRun} type="button">
        {isRunning ? runningLabel : runLabel}
      </button>
    </div>
  );
}
