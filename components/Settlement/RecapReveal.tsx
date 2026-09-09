'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from 'react';
import { hasSeenRecap, rememberRecap } from '@/lib/recap-session';
import styles from './RecapReveal.module.css';

export type RecapRevealState = 'ready' | 'revealing' | 'complete';
export interface RecapRevealHandle {
  finish: () => void;
  /** Returns true when the card was already revealed and its next action can run. */
  reveal: () => boolean;
}
interface Props {
  sessionKey: string;
  description: string;
  children: ReactNode;
  activation?: 'automatic' | 'manual';
  onStateChange?: (state: RecapRevealState) => void;
  ref?: Ref<RecapRevealHandle>;
}
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function CardBack() {
  return <div className={styles.back} aria-hidden="true">
    <div className={styles.border}>
      <span className={styles.eyebrow}>MAINPOT · YOUR GAME NIGHT</span>
      <div className={styles.medallion}>
        <svg viewBox="0 0 100 120" width="68" height="82" fill="currentColor"><path d="M50 5C40 27 8 39 8 66c0 24 29 34 42 12C48 96 40 103 31 110h38c-9-7-17-14-19-32 13 22 42 12 42-12C92 39 60 27 50 5Z"/></svg>
      </div>
      <span className={styles.invitation}>Every night has a character.</span>
    </div>
  </div>;
}

function RevealSession({ sessionKey, description, children, activation = 'automatic', onStateChange, ref }: Props) {
  const [state, setState] = useState<RecapRevealState>(() => {
    if (hasSeenRecap(sessionKey) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'complete';
    return activation === 'manual' ? 'ready' : 'revealing';
  });
  const skipRef = useRef<HTMLButtonElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const finish = useCallback(() => {
    const restoreFocus = document.activeElement === skipRef.current;
    rememberRecap(sessionKey);
    if (restoreFocus) summaryRef.current?.focus();
    setState('complete');
  }, [sessionKey]);
  const reveal = useCallback(() => {
    if (state === 'complete') return true;
    if (state === 'revealing') return false;
    rememberRecap(sessionKey);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else setState('revealing');
    return false;
  }, [finish, sessionKey, state]);
  useImperativeHandle(ref, () => ({ finish, reveal }), [finish, reveal]);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  useEffect(() => {
    if (state !== 'revealing') return;
    // Consume once the reveal begins, even if dismissed early; Strict Mode must not restart it.
    rememberRecap(sessionKey);
    const timer = window.setTimeout(finish, 1200);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => { if (motion.matches) finish(); };
    motion.addEventListener('change', changed);
    return () => { window.clearTimeout(timer); motion.removeEventListener('change', changed); };
  }, [sessionKey, finish, state]);

  const status = state === 'complete'
    ? description
    : state === 'ready'
      ? 'Your game card is ready to reveal.'
      : 'Your game card is being revealed.';

  return <div ref={summaryRef} tabIndex={-1} role="group" aria-label={state === 'complete' ? description : 'Your game card'} className={styles.reveal} data-recap-reveal={state}>
    <div className={styles.stage}>
      <div className={styles.front} aria-hidden={state !== 'complete' || undefined}>{children}</div>
      {state !== 'complete' && <CardBack/>}
    </div>
    <div className={styles.summary}>
      {activation === 'automatic' && state === 'revealing' && <button ref={skipRef} type="button" onClick={finish} className={styles.skip}>Skip reveal</button>}
      <span role="status" className="sr-only">{status}</span>
    </div>
  </div>;
}

/** Browser-only session state is resolved before mounting any character art. */
export default function RecapReveal(props: Props) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return hydrated ? <RevealSession key={props.sessionKey} {...props}/> : <div className={styles.placeholder}><CardBack/></div>;
}
