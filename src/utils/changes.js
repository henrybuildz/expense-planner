// For an edit: only the fields whose value differs from what the form was loaded with. Saving just those means a
// field the user never touched keeps whatever another device may have changed in the meantime (the form is no
// longer reloaded on every sync), and derived data such as a subscription's anchorDay is not recomputed
// from a due date that did not change.
export function changedFields(next, baseline) {
  const patch = {};
  for (const key of Object.keys(next)) {
    if (next[key] !== baseline[key]) patch[key] = next[key];
  }
  return patch;
}
