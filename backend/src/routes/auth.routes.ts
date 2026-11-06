import bcrypt from "bcryptjs";
import type { Request } from "express";
import { Router } from "express";
import { env } from "../config/env";
import { signPasswordResetToken, signToken, verifyPasswordResetToken } from "../lib/jwt";
import { createPasswordResetVersion } from "../lib/password-reset";
import { prisma } from "../lib/prisma";
import { requireAuthApi } from "../middleware/auth";
import { createLoginRateLimiter } from "../middleware/login-rate-limit";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  updateProfileSchema,
} from "../schemas/auth.schemas";
import {
  isPasswordRecoveryEmailConfigured,
  sendPasswordRecoveryEmail,
} from "../services/password-recovery.service";

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

const PASSWORD_RECOVERY_RESPONSE_MESSAGE =
  "Se o e-mail informado estiver cadastrado, enviaremos instrucoes para redefinir sua senha.";

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function resolvePublicBaseUrl(req: Request): string {
  if (env.APP_BASE_URL) return normalizeBaseUrl(env.APP_BASE_URL);

  const forwardedProtoRaw = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoRaw)
    ? forwardedProtoRaw[0]
    : forwardedProtoRaw?.split(",")[0];
  const protocol = (forwardedProto || req.protocol || "http").trim();
  const host = (req.headers["x-forwarded-host"] as string | undefined)
    || req.get("host")
    || "localhost:4000";

  return `${protocol}://${host}`;
}

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

router.post("/auth/forgot-password", async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return res.json({ message: PASSWORD_RECOVERY_RESPONSE_MESSAGE });
  }

  if (!isPasswordRecoveryEmailConfigured()) {
    console.warn("[auth] Recuperacao de senha solicitada sem SMTP configurado.");
    return res.json({ message: PASSWORD_RECOVERY_RESPONSE_MESSAGE });
  }

  const token = signPasswordResetToken({
    sub: String(user.id),
    email: user.email,
    purpose: "password-reset",
    phv: createPasswordResetVersion(user.passwordHash),
  });

  const baseUrl = resolvePublicBaseUrl(req);
  const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await sendPasswordRecoveryEmail({
      recipientName: user.name,
      recipientEmail: user.email,
      resetLink,
    });
  } catch (error) {
    console.error("[auth] Falha ao enviar e-mail de recuperacao:", error);
  }

  return res.json({ message: PASSWORD_RECOVERY_RESPONSE_MESSAGE });
});

router.post("/auth/reset-password", async (req, res) => {
  const { token, newPassword } = resetPasswordSchema.parse(req.body);

  let payload: ReturnType<typeof verifyPasswordResetToken>;
  try {
    payload = verifyPasswordResetToken(token);
  } catch {
    return res.status(400).json({ message: "Link de recuperacao invalido ou expirado" });
  }

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ message: "Link de recuperacao invalido ou expirado" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!user || user.email.toLowerCase() !== payload.email.toLowerCase()) {
    return res.status(400).json({ message: "Link de recuperacao invalido ou expirado" });
  }

  const expectedVersion = createPasswordResetVersion(user.passwordHash);
  if (expectedVersion !== payload.phv) {
    return res.status(400).json({ message: "Link de recuperacao invalido ou expirado" });
  }

  const samePassword = await bcrypt.compare(newPassword, user.passwordHash);
  if (samePassword) {
    return res.status(400).json({ message: "A nova senha deve ser diferente da atual" });
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newPasswordHash },
  });

  return res.json({ message: "Senha redefinida com sucesso. Faca login novamente." });
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

router.patch("/auth/password", requireAuthApi, async (req, res) => {
  const userId = Number(req.user?.sub);
  if (!Number.isFinite(userId)) {
    return res.status(401).json({ message: "Nao autenticado" });
  }

  const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return res.status(404).json({ message: "Usuario nao encontrado" });
  }

  const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!validPassword) {
    return res.status(400).json({ message: "Senha atual incorreta" });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ message: "A nova senha deve ser diferente da atual" });
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newPasswordHash },
  });

  return res.json({ message: "Senha alterada com sucesso" });
});

export { router as authRoutes };
