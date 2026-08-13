import { useEffect, useState } from 'react';

export function useReservationTimer(expiresAt) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) {
      return undefined;
    }

    setNow(Date.now());
    const id = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => clearInterval(id);
  }, [expiresAt]);

  const secondsLeft = calcSecondsLeft(expiresAt, now);
  const expired = !expiresAt || secondsLeft <= 0;

  return { secondsLeft, expired };
}

function calcSecondsLeft(expiresAt, now) {
  if (!expiresAt) {
    return 0;
  }
  const ms = new Date(expiresAt).getTime() - now;
  return Math.max(0, Math.ceil(ms / 1000));
}
