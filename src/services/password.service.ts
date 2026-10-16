import argon2, { type HashOptions } from 'argon2';

export const minimumPasswordLength = 8;
export const maximumPasswordLength = 1024;

const argon2Options: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function assertPasswordInput(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < minimumPasswordLength || password.length > maximumPasswordLength) {
    throw new Error(`A senha deve possuir entre ${minimumPasswordLength} e ${maximumPasswordLength} caracteres.`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordInput(password);
  return argon2.hash(password, argon2Options);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (typeof hash !== 'string' || typeof password !== 'string' || password.length > maximumPasswordLength) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
