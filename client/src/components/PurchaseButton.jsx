function PurchaseButton({ disabled, loading, onClick }) {
  return (
    <button
      type="button"
      className="btn btn-purchase"
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? 'Purchasing...' : 'Purchase'}
    </button>
  );
}

export default PurchaseButton;
