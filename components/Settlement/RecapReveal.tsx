'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from 'react';
import { hasSeenRecap, rememberRecap } from '@/lib/recap-session';
import styles from './RecapReveal.module.css';

export interface RecapRevealHandle { finish: () => void }
interface Props { sessionKey: string; description: string; children: ReactNode; ref?: Ref<RecapRevealHandle> }
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function CardBack() {
  return <div className={styles.back} aria-hidden="true">
    <div className={styles.border}>
      <span className={styles.eyebrow}>THE FELT SOCIETY</span>
      <div className={styles.medallion}>
        <svg viewBox="0 0 100 120" width="68" height="82" fill="currentColor"><path d="M50 5C40 27 8 39 8 66c0 24 29 34 42 12C48 96 40 103 31 110h38c-9-7-17-14-19-32 13 22 42 12 42-12C92 39 60 27 50 5Z"/></svg>
      </div>
      <span className={styles.invitation}>Every night has a character.</span>
    </div>
  </div>;
}

function RevealSession({ sessionKey, description, children, ref }: Props) {
  const [done, setDone] = useState(() => hasSeenRecap(sessionKey) || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const skipRef = useRef<HTMLButtonElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const finish = useCallback(() => {
    const restoreFocus = document.activeElement === skipRef.current;
    if (restoreFocus) summaryRef.current?.focus();
    setDone(true);
  }, []);
  useImperativeHandle(ref, () => ({ finish }), [finish]);

  useEffect(() => {
    // Consume on entry, even if dismissed early; Strict Mode must not restart it.
    rememberRecap(sessionKey);
    const timer = window.setTimeout(finish, 1200);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => { if (motion.matches) finish(); };
    motion.addEventListener('change', changed);
    return () => { window.clearTimeout(timer); motion.removeEventListener('change', changed); };
  }, [sessionKey, finish]);

  return <div ref={summaryRef} tabIndex={-1} role="group" aria-label={done ? description : "Your game card"} className={styles.reveal} data-recap-reveal={done ? 'complete' : 'revealing'}>
    <div className={styles.stage}>
      <div className={done ? undefined : styles.front} aria-hidden={!done || undefined}>{children}</div>
      {!done && <CardBack/>}
    </div>
    <div className={styles.summary}>
      {!done && <button ref={skipRef} type="button" onClick={finish} className={styles.skip}>Skip reveal</button>}
      <span role="status" className="sr-only">{done ? description : 'Your game card is being revealed.'}</span>
    </div>
  </div>;
}

/** Browser-only session state is resolved before mounting any character art. */
export default function RecapReveal(props: Props) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return hydrated ? <RevealSession key={props.sessionKey} {...props}/> : <div className={styles.placeholder}><CardBack/></div>;
}
