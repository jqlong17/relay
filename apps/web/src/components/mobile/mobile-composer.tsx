import type { RefObject } from "react";

type MobileComposerProps = {
  composerValue: string;
  disabled: boolean;
  isRunning: boolean;
  placeholder: string;
  runLabel: string;
  runningLabel: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onRun: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
};

export function MobileComposer({
  composerValue,
  disabled,
  isRunning,
  placeholder,
  runLabel,
  runningLabel,
  onChange,
  onFocus,
  onRun,
  textareaRef,
  wrapperRef,
}: MobileComposerProps) {
  return (
    <div className="mobile-composer" ref={wrapperRef}>
      <textarea
        className="mobile-composer-input"
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onRun();
          }
        }}
        placeholder={placeholder}
        ref={textareaRef}
        rows={1}
        value={composerValue}
      />
      <button className="mobile-composer-send" disabled={disabled || isRunning} onClick={onRun} type="button">
        {isRunning ? runningLabel : runLabel}
      </button>
    </div>
  );
}
