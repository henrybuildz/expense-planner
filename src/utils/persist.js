// Persistent storage: by default a browser may delete a site's data when the device runs low on space (Safari
// can also clear it after about a week without a visit). persist() asks it to keep the data. The browser decides:
// Chrome and installed apps usually say yes silently, Firefox may ask the user, Safari may decline.
const api = () => (typeof navigator !== 'undefined' ? navigator.storage : undefined);

export const persistenceSupported = () => {
  const s = api();
  return Boolean(s && typeof s.persist === 'function' && typeof s.persisted === 'function');
};

/** Asks the browser to protect the data. Returns 'protected' | 'not-protected' | 'unsupported'. Never throws. */
export async function requestPersistence() {
  if (!persistenceSupported()) return 'unsupported';
  try {
    if (await api().persisted()) return 'protected';
    return (await api().persist()) ? 'protected' : 'not-protected';
  } catch {
    return 'not-protected';
  }
}
