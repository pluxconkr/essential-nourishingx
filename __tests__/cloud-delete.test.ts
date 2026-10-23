/** "Delete everything" on the server (src/services/cloud.ts): the session is kept until delete-me confirms, so a
 * failed attempt can be retried instead of leaving the server copy behind (correctness review 2026-10-24). */
const mockAuth = { getSession: jest.fn(), signOut: jest.fn(async () => ({ error: null })), signInAnonymously: jest.fn() };
const mockFunctions = { invoke: jest.fn() };
jest.mock('@/services/supabase', () => ({ getSupabase: async () => ({ auth: mockAuth, functions: mockFunctions }) }));

import { connect, deleteCloudAccount } from '@/services/cloud';

const session = { data: { session: { user: { id: 'u1' } } }, error: null };

beforeEach(() => jest.clearAllMocks());

test('a session that cannot be read (a refresh that failed offline) is not "no account"', async () => {
  mockAuth.getSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('fetch failed') });
  expect(await deleteCloudAccount()).toBe(false);
  expect(mockFunctions.invoke).not.toHaveBeenCalled();
  expect(mockAuth.signOut).not.toHaveBeenCalled();
});

test('a failed delete-me keeps the session for the retry', async () => {
  mockAuth.getSession.mockResolvedValue(session);
  mockFunctions.invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  expect(await deleteCloudAccount()).toBe(false);
  expect(mockAuth.signOut).not.toHaveBeenCalled();
  mockFunctions.invoke.mockResolvedValueOnce({ data: { status: 'deleted' }, error: null });
  expect(await deleteCloudAccount()).toBe(true);
  expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
});

test('no stored session means there is no server account to delete', async () => {
  mockAuth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
  expect(await deleteCloudAccount()).toBe(true);
  expect(mockFunctions.invoke).not.toHaveBeenCalled();
});

test('a session read that never answers (a stalled refresh) gives up after 30 s, so a sync and Delete everything can end', async () => {
  jest.useFakeTimers();
  try {
    mockAuth.getSession.mockReturnValue(new Promise(() => {}));
    const connected = connect();
    const deleted = deleteCloudAccount();
    await jest.advanceTimersByTimeAsync(29_999);
    let settled = false;
    void connected.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await connected).toBe(false);
    expect(await deleted).toBe(false);
    expect(mockAuth.signInAnonymously).not.toHaveBeenCalled();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  } finally {
    mockAuth.getSession.mockReset();
    jest.useRealTimers();
  }
});
