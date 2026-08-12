function LatestPurchasers({ purchasers }) {
  const list = Array.isArray(purchasers) ? purchasers.filter(Boolean) : [];

  return (
    <div className="latest-purchasers">
      <h3>Latest Purchasers</h3>
      {list.length === 0 ? (
        <p className="muted">No purchases yet</p>
      ) : (
        <ol>
          {list.slice(0, 3).map((buyer, index) => (
            <li key={`${buyer.userId}-${buyer.purchasedAt || index}`}>
              {buyer.username || `User ${buyer.userId}`}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default LatestPurchasers;
