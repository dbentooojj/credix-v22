import { type Request, type Response, Router } from "express";
import { env } from "../config/env";
import { requireAuthApi } from "../middleware/auth";
import { AppError } from "../middleware/error-handler";
import { validateBody } from "../middleware/validate";
import { whatsappBatchSchema, type WhatsAppBatchInput } from "../schemas/whatsapp.schemas";
import { sendDueTodayInstallmentsEmail } from "../services/email-reminder.service";
import { sendWeeklyBackupEmail } from "../services/weekly-backup-email.service";
import { normalizePhoneForWhatsApp, sendWhatsAppTextMessage } from "../services/whatsapp.service";

const router = Router();

router.use(requireAuthApi);

router.post("/whatsapp/batch", validateBody(whatsappBatchSchema), async (req, res) => {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new AppError(
      "WhatsApp API nao configurada. Defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env",
      503,
    );
  }

  const payload = req.body as WhatsAppBatchInput;

  const results: Array<{
    phone: string;
    ok: boolean;
    messageId: string | null;
    error: string | null;
    debtorId: number | null;
    installmentIds: number[];
  }> = [];

  for (const recipient of payload.recipients) {
    const normalizedPhone = normalizePhoneForWhatsApp(recipient.phone);

    if (!normalizedPhone) {
      results.push({
        phone: recipient.phone,
        ok: false,
        messageId: null,
        error: "Telefone invalido para WhatsApp",
        debtorId: recipient.debtorId ?? null,
        installmentIds: recipient.installmentIds ?? [],
      });
      continue;
    }

    try {
      const sent = await sendWhatsAppTextMessage({
        to: normalizedPhone,
        message: recipient.message,
      });

      results.push({
        phone: normalizedPhone,
        ok: true,
        messageId: sent.messageId,
        error: null,
        debtorId: recipient.debtorId ?? null,
        installmentIds: recipient.installmentIds ?? [],
      });
    } catch (error) {
      results.push({
        phone: normalizedPhone,
        ok: false,
        messageId: null,
        error: error instanceof Error ? error.message : "Falha ao enviar mensagem",
        debtorId: recipient.debtorId ?? null,
        installmentIds: recipient.installmentIds ?? [],
      });
    }
  }

  const sent = results.filter((item) => item.ok).length;
  const failed = results.length - sent;

  return res.json({
    message: failed === 0 ? "Envio concluido" : "Envio concluido com falhas",
    summary: {
      total: results.length,
      sent,
      failed,
    },
    results,
  });
});

async function handleDueEmail(req: Request, res: Response) {
  const ownerUserId = Number(req.user?.sub);
  if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) {
    throw new AppError("Sessao invalida para envio de notificacao", 401);
  }

  const targetDateRaw = typeof req.body?.targetDate === "string" ? req.body.targetDate.trim() : undefined;
  if (targetDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(targetDateRaw)) {
    throw new AppError("targetDate invalido. Use YYYY-MM-DD", 400);
  }

  const result = await sendDueTodayInstallmentsEmail({
    force: true,
    targetDateIso: targetDateRaw,
    ownerUserId,
  });

  if (!result.ok) {
    throw new AppError(result.message, 503);
  }

  return res.json({
    message: result.message,
    result,
  });
}

router.post("/email/due-today", handleDueEmail);

// Mantido por compatibilidade com integracoes anteriores.
router.post("/email/due-tomorrow", handleDueEmail);

async function handleWeeklyBackupEmail(req: Request, res: Response) {
  const ownerUserId = Number(req.user?.sub);
  if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) {
    throw new AppError("Sessao invalida para envio de backup", 401);
  }

  const targetDateRaw = typeof req.body?.targetDate === "string" ? req.body.targetDate.trim() : undefined;
  if (targetDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(targetDateRaw)) {
    throw new AppError("targetDate invalido. Use YYYY-MM-DD", 400);
  }

  const result = await sendWeeklyBackupEmail({
    force: true,
    referenceDateIso: targetDateRaw,
    ownerUserId,
  });

  if (!result.ok) {
    throw new AppError(result.message, 503);
  }

  return res.json({
    message: result.message,
    result,
  });
}

router.post("/email/weekly-backup", handleWeeklyBackupEmail);

export { router as notificationsRoutes };
