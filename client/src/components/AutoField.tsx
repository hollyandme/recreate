import { useEffect, useRef, useState } from 'react';

/**
 * Fields save as you type — there is no explicit save action anywhere in the
 * product except adding an idea or a shot. These wrappers keep the keystrokes
 * local and flush to the API once typing settles, then again on unmount so a
 * half-second-old edit is never lost by navigating away.
 */
const DELAY = 450;

function useAutosave(value: string, onSave: (v: string) => void) {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Adopt a new upstream value only when nothing local is waiting to be sent,
  // so a refetch mid-sentence cannot overwrite what is being typed.
  useEffect(() => {
    if (pending.current === null) setLocal(value);
  }, [value]);

  const flush = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
    if (pending.current !== null) {
      onSaveRef.current(pending.current);
      pending.current = null;
    }
  };

  useEffect(() => flush, []);

  const change = (next: string) => {
    setLocal(next);
    pending.current = next;
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, DELAY);
  };

  return { local, change, flush };
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onSave: (v: string) => void;
};

export function AutoInput({ value, onSave, ...rest }: InputProps) {
  const { local, change, flush } = useAutosave(value, onSave);
  return <input {...rest} value={local} onChange={(e) => change(e.target.value)} onBlur={flush} />;
}

type AreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onSave: (v: string) => void;
};

export function AutoTextarea({ value, onSave, ...rest }: AreaProps) {
  const { local, change, flush } = useAutosave(value, onSave);
  return <textarea {...rest} value={local} onChange={(e) => change(e.target.value)} onBlur={flush} />;
}
