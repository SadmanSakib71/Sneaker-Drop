function StockBadge({ availableStock }) {
  const soldOut = availableStock <= 0;

  return (
    <div className={`stock-badge ${soldOut ? 'sold-out' : ''}`}>
      {soldOut ? 'Sold Out' : `Available: ${availableStock}`}
    </div>
  );
}

export default StockBadge;
