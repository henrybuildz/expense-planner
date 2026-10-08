import { useEffect } from 'react';
import { requestPersistence } from '../utils/persist';

let asked = false; // once per page load; the browser remembers its answer anyway

// Ask the browser to protect the data as soon as there is something worth protecting.
export function useRequestPersistence(hasData) {
  useEffect(() => {
    if (!hasData || asked) return;
    asked = true;
    requestPersistence();
  }, [hasData]);
}

export const resetPersistenceAskedForTests = () => {
  asked = false;
};
