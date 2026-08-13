import { useState } from "react";
import { DEMO_USER_ID, getDemoUserName } from "./api/drops";
import DropListPage from "./pages/DropListPage";

function App() {
  const [userId, setUserId] = useState(DEMO_USER_ID);
  const userName = getDemoUserName(userId);

  const setValidUserId = (next) => {
    setUserId(Number.isInteger(next) && next > 0 ? next : DEMO_USER_ID);
  };

  return (
    <div className="app">
      <div className="user-bar">
        <label htmlFor="demo-user-id">
          Demo User ID
          <span className="user-id-stepper">
            <button
              type="button"
              className="user-id-step"
              aria-label="Decrease user ID"
              disabled={userId <= 1}
              onClick={() => setValidUserId(userId - 1)}
            >
              −
            </button>
            <input
              id="demo-user-id"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={userId}
              onChange={(e) => {
                const next = Number(e.target.value);
                setValidUserId(next);
              }}
            />
            <button
              type="button"
              className="user-id-step"
              aria-label="Increase user ID"
              onClick={() => setValidUserId(userId + 1)}
            >
              +
            </button>
          </span>
        </label>
        {userName ? (
          <span className="user-bar-name">{userName}</span>
        ) : (
          <span className="user-bar-hint">No User Found</span>
        )}
      </div>
      <DropListPage userId={userId} />
    </div>
  );
}

export default App;
