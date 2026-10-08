// Throws on purpose while rendering, so the crash screen can be previewed (Settings > Troubleshooting).
// It touches no data.
export default function TestBomb() {
  throw new Error('Test crash (intentional). Nothing is actually wrong.');
}
