import { useEffect, useRef, useState } from 'react';
import {
  reserveDrop,
  purchaseDrop,
  friendlyErrorMessage,
} from '../api/drops';
import { useReservationTimer } from '../hooks/useReservationTimer';
import StockBadge from './StockBadge';
import ReserveButton from './ReserveButton';
import PurchaseButton from './PurchaseButton';
import ReservationTimer from './ReservationTimer';
import LatestPurchasers from './LatestPurchasers';

/**
 * One drop card: stock, reserve/purchase actions, timer, latest purchasers.
 * Reservation state lives here — stock/purchasers come from parent (REST + sockets).
 */
function DropCard({ drop, userId, socket, onNotify }) {
  const [reservation, setReservation] = useState(null);
  const [reserving, setReserving] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const expiredToastFor = useRef(null);

  const { secondsLeft, expired } = useReservationTimer(
    reservation?.expiresAt ?? null
  );

  const hasActiveReservation = Boolean(reservation) && !expired;
  const soldOut = drop.availableStock <= 0;

  // Join / leave this drop's Socket.io room while mounted.
  useEffect(() => {
    if (!socket || drop?.id == null) {
      return undefined;
    }

    const dropId = drop.id;
    socket.emit('join_drop', { dropId });

    return () => {
      socket.emit('leave_drop', { dropId });
    };
  }, [socket, drop.id]);

  // Local timer reached 0 — clear reservation UI (backend remains authoritative).
  useEffect(() => {
    if (!reservation || !expired) {
      return;
    }

    const id = reservation.reservationId;
    setReservation(null);

    if (expiredToastFor.current !== id) {
      expiredToastFor.current = id;
      onNotify?.('Your reservation has expired.', 'error');
    }
  }, [reservation, expired, onNotify]);

  async function handleReserve() {
    if (reserving || hasActiveReservation || soldOut) {
      return;
    }

    setReserving(true);
    try {
      const result = await reserveDrop(drop.id, userId, 1);
      const data = result.data;

      // Use server expiresAt — never Date.now() + 60000 on the client.
      setReservation({
        reservationId: data.reservationId,
        expiresAt: data.expiresAt,
      });

      onNotify?.('Reservation successful.', 'success');
      // Stock is updated via stock_updated.
      // Do NOT set availableStock - 1 here.
    } catch (error) {
      onNotify?.(friendlyErrorMessage(error, 'reserve'), 'error');
    } finally {
      setReserving(false);
    }
  }

  async function handlePurchase() {
    if (purchasing || !hasActiveReservation) {
      return;
    }

    setPurchasing(true);
    try {
      await purchaseDrop(drop.id, userId);
      setReservation(null);
      onNotify?.('Purchase completed.', 'success');
    } catch (error) {
      onNotify?.(friendlyErrorMessage(error, 'purchase'), 'error');

      // If backend says expired / no reservation, clear local reservation UI.
      if (error.status === 410 || error.status === 400) {
        setReservation(null);
      }
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <article className="drop-card">
      <header className="drop-card-header">
        <h2>{drop.name}</h2>
        {drop.description ? <p className="drop-desc">{drop.description}</p> : null}
      </header>

      <p className="drop-price">Price: ${Number(drop.price).toFixed(2)}</p>

      <StockBadge availableStock={drop.availableStock} />

      {hasActiveReservation ? (
        <ReservationTimer secondsLeft={secondsLeft} />
      ) : null}

      <div className="drop-actions">
        <ReserveButton
          soldOut={soldOut}
          loading={reserving}
          disabled={hasActiveReservation || reserving || purchasing}
          onClick={handleReserve}
        />
        <PurchaseButton
          loading={purchasing}
          disabled={!hasActiveReservation || purchasing || reserving}
          onClick={handlePurchase}
        />
      </div>

      <LatestPurchasers purchasers={drop.latestPurchasers} />
    </article>
  );
}

export default DropCard;
