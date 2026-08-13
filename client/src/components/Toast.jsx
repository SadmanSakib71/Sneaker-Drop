import { useEffect } from 'react';

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const id = setTimeout(() => {
      onClose();
    }, 3500);

    return () => clearTimeout(id);
  }, [toast, onClose]);

  if (!toast) {
    return null;
  }

  return (
    <div className={`toast toast-${toast.type || 'info'}`} role="status">
      {toast.message}
    </div>
  );
}

export default Toast;
