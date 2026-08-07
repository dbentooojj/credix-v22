import "dotenv/config";
import { env } from "../config/env";
import { getIsoTodayInTimeZone, normalizeTimeZone } from "../lib/date-time";
import {
  buildDueReceivablesEmailHtml,
  buildDueReceivablesEmailText,
  type DueInstallmentGroup,
} from "../services/email-reminder.service";
import { getSmtpConfigError, sendEmail } from "../services/email.service";

async function main() {
  if (env.NODE_ENV === "production") {
    throw new Error("O preview de e-mail e permitido somente fora de producao");
  }

  const recipient = process.argv[2]?.trim();
  if (!recipient) {
    throw new Error("Informe o destinatario de teste. Ex.: npm run notify:due-today:preview -- dev@exemplo.com");
  }

  const smtpError = getSmtpConfigError();
  if (smtpError) throw new Error(smtpError);

  const targetDateIso = getIsoTodayInTimeZone(normalizeTimeZone(env.EMAIL_NOTIFY_TZ));
  const groups: DueInstallmentGroup[] = [
    {
      clientId: 0,
      clientName: "Joao da Silva",
      clientPhone: "(47) 99999-8888",
      totalAmount: 950,
      installments: [
        { ownerUserId: 0, installmentId: 0, installmentNumber: 2, installmentTotal: 4, clientId: 0, clientName: "Joao da Silva", clientPhone: "(47) 99999-8888", amount: 350 },
        { ownerUserId: 0, installmentId: 0, installmentNumber: 1, installmentTotal: 3, clientId: 0, clientName: "Joao da Silva", clientPhone: "(47) 99999-8888", amount: 600 },
      ],
    },
    {
      clientId: 0,
      clientName: "Maria Souza",
      clientPhone: "47988887777",
      totalAmount: 500,
      installments: [
        { ownerUserId: 0, installmentId: 0, installmentNumber: 3, installmentTotal: 5, clientId: 0, clientName: "Maria Souza", clientPhone: "47988887777", amount: 500 },
      ],
    },
  ];
  const totalAmount = 1_450;

  await sendEmail({
    to: recipient,
    subject: `[Credix][PREVIEW] Recebimentos previstos hoje (${targetDateIso})`,
    text: buildDueReceivablesEmailText(groups, targetDateIso, totalAmount),
    html: buildDueReceivablesEmailHtml(groups, targetDateIso, totalAmount),
  });

  console.log(`[due-today-email-preview] Preview enviado para ${recipient}. Nenhum dado foi consultado ou alterado.`);
}

void main().catch((error) => {
  console.error(`[due-today-email-preview] Falha: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
