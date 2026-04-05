import type { ClipboardEvent, MouseEvent, PointerEvent, RefObject, TouchEvent } from "react";

import type { SessionAttachment } from "@/lib/api/bridge";

type MobileComposerProps = {
  attachments: SessionAttachment[];
  composerValue: string;
  disabled: boolean;
  isRunning: boolean;
  onBlur: () => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveAttachment: (path: string) => void;
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
  attachments,
  composerValue,
  disabled,
  isRunning,
  onBlur,
  placeholder,
  runLabel,
  runningLabel,
  onChange,
  onFocus,
  onPaste,
  onRemoveAttachment,
  onRun,
  textareaRef,
  wrapperRef,
}: MobileComposerProps) {
  const handlePrepareFocus = (
    event:
      | MouseEvent<HTMLTextAreaElement | HTMLDivElement>
      | PointerEvent<HTMLTextAreaElement | HTMLDivElement>
      | TouchEvent<HTMLTextAreaElement | HTMLDivElement>,
  ) => {
    if (!(event.target instanceof HTMLTextAreaElement)) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  };

  return (
    <div className="mobile-composer" ref={wrapperRef}>
      <div className="mobile-composer-stack">
        <div
          className="mobile-composer-input-shell"
          onMouseDownCapture={handlePrepareFocus}
          onPointerDownCapture={(event) => {
            if (event.pointerType === "mouse") {
              return;
            }

            handlePrepareFocus(event);
          }}
          onTouchStartCapture={handlePrepareFocus}
        >
          {attachments.length > 0 ? (
            <div className="mobile-composer-attachments" role="list" aria-label="pasted images">
              {attachments.map((attachment, index) => (
                <button
                  aria-label={`remove image ${index + 1}`}
                  className="mobile-composer-attachment"
                  key={attachment.path}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onClick={() => onRemoveAttachment(attachment.path)}
                  title={attachment.name}
                  type="button"
                >
                  <span className="mobile-composer-attachment-label">{`图${index + 1}`}</span>
                  <span aria-hidden="true" className="mobile-composer-attachment-remove">×</span>
                </button>
              ))}
            </div>
          ) : null}
          <textarea
            className="mobile-composer-input"
            onBlur={onBlur}
            onChange={(event) => onChange(event.target.value)}
            onFocus={onFocus}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                onRun();
              }
            }}
            onPaste={onPaste}
            placeholder={placeholder}
            ref={textareaRef}
            rows={1}
            value={composerValue}
          />
        </div>
      </div>
      <button className="mobile-composer-send" disabled={disabled || isRunning} onClick={onRun} type="button">
        {isRunning ? runningLabel : runLabel}
      </button>
    </div>
  );
}
