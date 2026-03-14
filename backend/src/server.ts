import "dotenv/config";
import "express-async-errors";
import cookieParser from "cookie-parser";
import express from "express";
import morgan from "morgan";
import path from "path";
import { env } from "./config/env";
import { startDueTodayEmailJob } from "./jobs/due-today-email.job";
import { errorHandler } from "./middleware/error-handler";
import { optionalAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { financeRoutes } from "./routes/finance.routes";
import { loanSimulationsRoutes } from "./routes/loan-simulations.routes";
import { notificationsRoutes } from "./routes/notifications.routes";
import { paymentsRoutes } from "./routes/payments.routes";
import { tablesRoutes } from "./routes/tables.routes";

const app = express();

app.disable("x-powered-by");

app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(optionalAuth);
app.use(express.static(path.join(process.cwd(), "src", "public")));
app.use((_req, res, next) => {
  res.locals.sessionIdleMinutes = env.SESSION_IDLE_MINUTES;
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/loan-simulations", loanSimulationsRoutes);
app.use("/api/tables", tablesRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/notifications", notificationsRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: "Rota nao encontrada" });
});

app.use(errorHandler);

startDueTodayEmailJob();

app.listen(env.PORT, () => {
  console.log(`Servidor iniciado na porta ${env.PORT}`);
});
