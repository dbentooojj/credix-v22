import { Router } from "express";
import { requireAuthApi } from "../middleware/auth";
import { replaceTableSchema, tableNameSchema } from "../schemas/tables.schemas";
import { getTableData, replaceTableData } from "../services/table-sync.service";
import { z } from "zod";
import { getClientsOverview, getClientFinancialSummary, getClientLoansPage } from "../services/client-financials.service";
import { AppError } from "../middleware/error-handler";

const router = Router();

router.use(requireAuthApi);

function readUserId(req: { user?: { sub?: string } }): number {
  const parsed = Number(req.user?.sub);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return parsed;
}

router.get("/debtors/overview", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) return res.status(401).json({ message: "Nao autenticado" });
  res.setHeader("Cache-Control", "no-store");
  return res.json({ data: await getClientsOverview(userId) });
});

router.get("/debtors/:clientId/financial-summary", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) return res.status(401).json({ message: "Nao autenticado" });
  const clientId = z.coerce.number().int().positive().parse(req.params.clientId);
  res.setHeader("Cache-Control", "no-store");
  return res.json({ data: await getClientFinancialSummary(userId, clientId) });
});

router.get("/debtors/:clientId/loans", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) return res.status(401).json({ message: "Nao autenticado" });
  const clientId = z.coerce.number().int().positive().parse(req.params.clientId);
  const { page, pageSize } = z.object({
    page: z.coerce.number().int().positive().max(2147483647).default(1),
    pageSize: z.coerce.number().refine((size) => size === 5 || size === 10, "Use 5 ou 10 registros.").default(5),
  }).parse(req.query);
  res.setHeader("Cache-Control", "no-store");
  return res.json(await getClientLoansPage(userId, clientId, page, pageSize));
});

router.get("/:tableName", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) return res.status(401).json({ message: "Nao autenticado" });
  const tableName = tableNameSchema.parse(req.params.tableName);
  const data = await getTableData(tableName, userId);
  return res.json({ data });
});

router.put("/:tableName", async (req, res) => {
  const userId = readUserId(req);
  if (!Number.isFinite(userId)) return res.status(401).json({ message: "Nao autenticado" });
  const tableName = tableNameSchema.parse(req.params.tableName);
  const { rows } = replaceTableSchema.parse(req.body);
  if (tableName !== "debtors") throw new AppError("A sincronização em massa de empréstimos e parcelas está indisponível; use as operações individuais com conta financeira.", 409);

  const data = await replaceTableData(tableName, rows, userId);
  return res.json({ message: "Tabela atualizada", data });
});

export { router as tablesRoutes };
