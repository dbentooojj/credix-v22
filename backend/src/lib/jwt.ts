import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export type AppJwtPayload = {
  sub: string;
  email: string;
  name: string;
  role: "ADMIN";
};

const signOptions: SignOptions = {
  expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
};

export function signToken(payload: AppJwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, signOptions);
}

export function verifyToken(token: string): AppJwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as AppJwtPayload;
}

