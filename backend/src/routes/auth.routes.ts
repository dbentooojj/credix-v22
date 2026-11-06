import bcrypt from "bcryptjs";
import { Router } from "express";
import { env } from "../config/env";
import { signToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { requireAuthApi } from "../middleware/auth";
import { createLoginRateLimiter } from "../middleware/login-rate-limit";
import {
  loginSchema,
  updateProfileSchema,
} from "../schemas/auth.schemas";

const router = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.COOKIE_SECURE,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const clearCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.COOKIE_SECURE,
  path: "/",
};

router.post("/auth/login", createLoginRateLimiter(), async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user) {
    return res.status(401).json({ message: "E-mail ou senha invalidos" });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ message: "E-mail ou senha invalidos" });
  }

  const token = signToken({
    sub: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
  });

  res.cookie(env.COOKIE_NAME, token, cookieOptions);

  return res.json({
    message: "Login realizado com sucesso",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(env.COOKIE_NAME, clearCookieOptions);
  return res.json({ message: "Logout realizado" });
});

router.get("/auth/me", requireAuthApi, (req, res) => {
  return res.json({ user: req.user });
});

router.patch("/auth/profile", requireAuthApi, async (req, res) => {
  const userId = Number(req.user?.sub);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const { name, email } = updateProfileSchema.parse(req.body);
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findFirst({
    where: {
      email: normalizedEmail,
      id: { not: userId },
    },
    select: { id: true },
  });

  if (existingUser) {
    return res.status(409).json({ message: "Este e-mail ja esta em uso" });
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: name.trim(),
      email: normalizedEmail,
    },
  });

  const token = signToken({
    sub: String(updatedUser.id),
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
  });
  res.cookie(env.COOKIE_NAME, token, cookieOptions);

  return res.json({
    message: "Perfil atualizado com sucesso",
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
    },
  });
});

export { router as authRoutes };
