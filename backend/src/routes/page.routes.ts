import { Router } from "express";
import { env } from "../config/env";
import { requireAuthPage } from "../middleware/auth";

const router = Router();
const ADMIN_HOME_PAGE = "visao-geral.html";
const ADMIN_HOME_PATH = `/admin/${ADMIN_HOME_PAGE}`;

function buildPageViewModel(
  req: Parameters<typeof extractCurrentUser>[0],
  activePage: string,
  extra: Record<string, unknown> = {},
) {
  return {
    currentUser: extractCurrentUser(req),
    activePage,
    ...extra,
  };
}

function buildBlankPageViewModel(
  req: Parameters<typeof extractCurrentUser>[0],
  activePage: string,
  pageTitle: string,
) {
  return buildPageViewModel(req, activePage, { pageTitle });
}

function buildFinancePageViewModel(
  req: Parameters<typeof extractCurrentUser>[0],
  activePage: string,
  financeViewMode: "expense" | "income",
) {
  return buildPageViewModel(req, activePage, { financeViewMode });
}

function extractCurrentUser(req: { user?: { sub: string; email: string; name: string; role: string } }) {
  if (!req.user) return null;

  return {
    id: Number(req.user.sub),
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
  };
}

function extractEmail(raw?: string): string | null {
  const value = raw?.trim();
  if (!value) return null;

  const angleMatch = value.match(/<([^<>]+)>/);
  const candidate = (angleMatch?.[1] || value).replace(/^mailto:/i, "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;

  return candidate;
}

function resolveSupportEmail(): string {
  const notifyFirst = env.EMAIL_NOTIFY_TO
    ?.split(/[;,]/)
    .map((item) => item.trim())
    .find(Boolean);

  const candidates = [
    env.SMTP_FROM,
    env.SMTP_USER,
    notifyFirst,
    process.env.ADMIN_EMAIL,
  ];

  for (const item of candidates) {
    const email = extractEmail(item);
    if (email) return email;
  }

  return "usecredix@gmail.com";
}

router.get(["/", "/login", "/index.html"], (req, res) => {
  if (req.user) {
    return res.redirect(ADMIN_HOME_PATH);
  }

  return res.render("index", { currentUser: null });
});

router.get(["/forgot-password", "/forgot-password.html"], (req, res) => {
  if (req.user) {
    return res.redirect(ADMIN_HOME_PATH);
  }

  return res.render("forgot-password", { currentUser: null });
});

router.get(["/reset-password", "/reset-password.html"], (req, res) => {
  if (req.user) {
    return res.redirect(ADMIN_HOME_PATH);
  }

  return res.render("reset-password", { currentUser: null });
});

router.use("/admin", requireAuthPage);

router.get("/admin", requireAuthPage, (_req, res) => {
  return res.redirect(ADMIN_HOME_PATH);
});

router.get(`/admin/${ADMIN_HOME_PAGE}`, requireAuthPage, (req, res) => {
  return res.render("visao-geral", buildPageViewModel(req, ADMIN_HOME_PAGE));
});

router.get("/admin/dashboard.html", requireAuthPage, (req, res) => {
  return res.render("dashboard", buildPageViewModel(req, "dashboard.html"));
});

router.get("/admin/debtors.html", requireAuthPage, (req, res) => {
  return res.render("debtors", buildPageViewModel(req, "debtors.html"));
});

router.get("/admin/loans.html", requireAuthPage, (req, res) => {
  return res.render("loans", buildPageViewModel(req, "loans.html"));
});

router.get("/admin/installments.html", requireAuthPage, (req, res) => {
  return res.render("installments", buildPageViewModel(req, "installments.html"));
});

router.get("/admin/reports.html", requireAuthPage, (_req, res) => {
  return res.redirect("/admin/finance-reports.html");
});

router.get("/admin/dashboard-advanced.html", requireAuthPage, (_req, res) => {
  return res.redirect("/admin/dashboard.html");
});

router.get("/admin/account.html", requireAuthPage, (req, res) => {
  return res.render("account", {
    ...buildPageViewModel(req, "account.html"),
    supportEmail: resolveSupportEmail(),
  });
});

router.get("/admin/contas-a-pagar.html", requireAuthPage, (req, res) => {
  return res.render("contas-a-pagar", buildFinancePageViewModel(req, "contas-a-pagar.html", "expense"));
});

router.get("/admin/contas-a-receber.html", requireAuthPage, (req, res) => {
  return res.render("contas-a-pagar", buildFinancePageViewModel(req, "contas-a-receber.html", "income"));
});

router.get("/admin/finance-reports.html", requireAuthPage, (req, res) => {
  return res.render("blank-admin-page", buildBlankPageViewModel(req, "finance-reports.html", "Relatorios"));
});

router.get("/admin/finance-dashboard.html", requireAuthPage, (_req, res) => {
  return res.redirect("/admin/contas-a-pagar.html");
});

router.get("/admin/finance-transactions.html", requireAuthPage, (_req, res) => {
  return res.redirect("/admin/contas-a-receber.html");
});

router.get("/dashboard", requireAuthPage, (_req, res) => res.redirect("/admin/dashboard.html"));
router.get("/dashboard.html", (_req, res) => res.redirect("/admin/dashboard.html"));
router.get("/dashboard-advanced.html", (_req, res) => res.redirect("/admin/dashboard.html"));
router.get("/debtors.html", (_req, res) => res.redirect("/admin/debtors.html"));
router.get("/loans.html", (_req, res) => res.redirect("/admin/loans.html"));
router.get("/installments.html", (_req, res) => res.redirect("/admin/installments.html"));
router.get("/reports.html", (_req, res) => res.redirect("/admin/reports.html"));
router.get("/contas-a-pagar.html", (_req, res) => res.redirect("/admin/contas-a-pagar.html"));
router.get("/contas-a-receber.html", (_req, res) => res.redirect("/admin/contas-a-receber.html"));
router.get("/finance-dashboard.html", (_req, res) => res.redirect("/admin/contas-a-pagar.html"));
router.get("/finance-transactions.html", (_req, res) => res.redirect("/admin/contas-a-receber.html"));
router.get("/finance-reports.html", (_req, res) => res.redirect("/admin/finance-reports.html"));
router.get("/visao-geral", (_req, res) => res.redirect("/admin/visao-geral.html"));
router.get("/visao-geral.html", (_req, res) => res.redirect("/admin/visao-geral.html"));
router.get("/account.html", (_req, res) => res.redirect("/admin/account.html"));

export { router as pageRoutes };
