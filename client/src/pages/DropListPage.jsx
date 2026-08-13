import { useCallback, useEffect, useState } from 'react';
import { getDrops } from '../api/drops';
import { useSocket } from '../hooks/useSocket';
import DropCard from '../components/DropCard';
import Toast from '../components/Toast';

function DropListPage({ userId }) {
  const socket = useSocket();
  const [drops, setDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const loadDrops = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDrops();
      setDrops(Array.isArray(result.data) ? result.data : []);
    } catch {
      setError('Unable to load drops.');
      setDrops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrops();
  }, [loadDrops]);

  // Real-time updates — server is the source of truth for stock and feed.
  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    function onStockUpdated(payload) {
      if (!payload || payload.dropId == null) {
        return;
      }
      setDrops((prev) =>
        prev.map((drop) =>
          drop.id === payload.dropId
            ? { ...drop, availableStock: payload.availableStock }
            : drop
        )
      );
    }

    function onPurchaseFeedUpdated(payload) {
      if (!payload || payload.dropId == null) {
        return;
      }
      setDrops((prev) =>
        prev.map((drop) =>
          drop.id === payload.dropId
            ? { ...drop, latestPurchasers: payload.purchasers || [] }
            : drop
        )
      );
    }

    socket.on('stock_updated', onStockUpdated);
    socket.on('purchase_feed_updated', onPurchaseFeedUpdated);

    return () => {
      socket.off('stock_updated', onStockUpdated);
      socket.off('purchase_feed_updated', onPurchaseFeedUpdated);
    };
  }, [socket]);

  return (
    <div className="drop-list-page">
      <header className="page-header">
        <h1>SneakerDrop</h1>
        <p className="page-subtitle">Live drops — reserve, then purchase within 60 seconds.</p>
      </header>

      <Toast toast={toast} onClose={() => setToast(null)} />

      {loading ? <p className="status-message">Loading drops...</p> : null}

      {!loading && error ? (
        <div className="status-message error-block">
          <p>{error}</p>
          <button type="button" className="btn btn-retry" onClick={loadDrops}>
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && drops.length === 0 ? (
        <p className="status-message">No drops available yet.</p>
      ) : null}

      {!loading && !error && drops.length > 0 ? (
        <div className="drop-grid">
          {drops.map((drop) => (
            <DropCard
              key={drop.id}
              drop={drop}
              userId={userId}
              socket={socket}
              onNotify={showToast}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default DropListPage;
