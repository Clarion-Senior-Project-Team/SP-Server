import bcrypt from "bcrypt";

const SALT_ROUNDS = 13;

/**
 * Returns hashed password derived from plain text password
 * @param password Plain text password
 * @returns Promise<string>
 *
 */
export const getHashedPassword = async (password) => {

    return await bcrypt.hash(password, SALT_ROUNDS);

}

/**
 * Returns whether plain text password matches hashed password
 * @param password Plain text password
 * @param hashedPassword Hashed Password
 * @returns Promise<boolean>
 */
export const matchPasswords = async (password, hashedPassword) => {

    return await bcrypt.compare(password, hashedPassword);

}
