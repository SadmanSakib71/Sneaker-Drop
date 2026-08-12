function ReserveButton({ disabled, loading, soldOut, onClick }) {
  if (soldOut) {
    return (
      <button type="button" className="btn btn-sold-out" disabled>
        Sold Out
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-reserve"
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? 'Reserving...' : 'Reserve'}
    </button>
  );
}

export default ReserveButton;
