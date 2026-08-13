import { useState } from 'react';
import { DEMO_USER_ID, getDemoUserName } from './api/drops';
import DropListPage from './pages/DropListPage';

function App() {
  const [userId, setUserId] = useState(DEMO_USER_ID);
  const userName = getDemoUserName(userId);

  return (
    <div className="app">
      <div className="user-bar">
        <label htmlFor="demo-user-id">
          Demo User ID
          <input
            id="demo-user-id"
            type="number"
            min={1}
            step={1}
            value={userId}
            onChange={(e) => {
              const next = Number(e.target.value);
              setUserId(Number.isInteger(next) && next > 0 ? next : DEMO_USER_ID);
            }}
          />
        </label>
        {userName ? (
          <span className="user-bar-name">{userName}</span>
        ) : null}
        <span className="user-bar-hint">Sent as X-User-Id (no auth in this phase)</span>
      </div>
      <DropListPage userId={userId} />
    </div>
  );
}

export default App;
