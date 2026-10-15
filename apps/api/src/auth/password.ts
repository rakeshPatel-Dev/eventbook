import bcrypt from 'bcryptjs';

// Cost factor 10: same as the seed script, so hashes are interchangeable.
const SALT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

let dummyHash: string | null = null;

// Burns comparable time when the user does not exist, so login timing does
// not reveal whether an email is registered. Never throws: a timing shield
// must not break the generic invalid-credentials response.
export async function burnLoginTiming(): Promise<void> {
  try {
    dummyHash ??= await bcrypt.hash('nonexistent-user-timing-shield', SALT_ROUNDS);
    await bcrypt.compare('nonexistent-user-timing-shield', dummyHash);
  } catch {
    // ignore on purpose
  }
}
