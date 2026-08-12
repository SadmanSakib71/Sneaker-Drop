function ReservationTimer({ secondsLeft }) {
  return (
    <p className="reservation-timer">
      Reserved for: <strong>{secondsLeft}s</strong>
    </p>
  );
}

export default ReservationTimer;
