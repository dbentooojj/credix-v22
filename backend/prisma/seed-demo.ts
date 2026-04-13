import bcrypt from "bcryptjs";
import {
  ClientStatus,
  FinanceTransactionStatus,
  FinanceTransactionType,
  InstallmentStatus,
  InterestType,
  LoanStatus,
  PaymentMethod,
  PrismaClient,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

type EnsureFinanceCategoryCatalogFn = (db: PrismaClient, ownerUserId: number) => Promise<void>;

let ensureFinanceCategoryCatalogForUserRuntime: EnsureFinanceCategoryCatalogFn | null = null;

async function ensureFinanceCategoryCatalogForUserSafe(db: PrismaClient, ownerUserId: number) {
  if (!ensureFinanceCategoryCatalogForUserRuntime) {
    try {
      const module = await import("../src/lib/finance-categories");
      ensureFinanceCategoryCatalogForUserRuntime = module.ensureFinanceCategoryCatalogForUser as EnsureFinanceCategoryCatalogFn;
    } catch (_srcError) {
      try {
        const module = await import("../dist/lib/finance-categories.js");
        ensureFinanceCategoryCatalogForUserRuntime = module.ensureFinanceCategoryCatalogForUser as EnsureFinanceCategoryCatalogFn;
      } catch (_distError) {
        console.warn("Aviso: catalogo de categorias nao foi atualizado automaticamente no seed demo.");
        return;
      }
    }
  }

  await ensureFinanceCategoryCatalogForUserRuntime(db, ownerUserId);
}

function getIsoTodayInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((item) => item.type === "year")?.value ?? "1970";
  const month = parts.find((item) => item.type === "month")?.value ?? "01";
  const day = parts.find((item) => item.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function isoToUtcDateOnly(isoDate: string): Date {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsDateOnlyUtc(date: Date, monthsToAdd: number): Date {
  const sourceYear = date.getUTCFullYear();
  const sourceMonth = date.getUTCMonth();
  const sourceDay = date.getUTCDate();
  const firstTargetMonth = new Date(Date.UTC(sourceYear, sourceMonth + monthsToAdd, 1));
  const targetYear = firstTargetMonth.getUTCFullYear();
  const targetMonth = firstTargetMonth.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(sourceDay, lastDay);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

function toDateOnlyIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function splitAmount(total: number, parts: number): number[] {
  const safeParts = Math.max(1, Math.trunc(parts || 0));
  const cents = Math.round(round2(total) * 100);
  const base = Math.floor(cents / safeParts);
  const remainder = cents - (base * safeParts);

  return Array.from({ length: safeParts }, (_item, index) => {
    const current = base + (index === safeParts - 1 ? remainder : 0);
    return round2(current / 100);
  });
}

function buildInstallmentIncomeDescription(installmentId: number, loanId: number): string {
  return `Recebimento da parcela #${installmentId} do emprestimo #${loanId}`;
}

function buildLoanDisbursementDescription(loanId: number): string {
  return `Desembolso do emprestimo #${loanId}`;
}

function computeCpfCheckDigit(digits: number[], factorStart: number): number {
  const sum = digits.reduce((acc, digit, index) => acc + digit * (factorStart - index), 0);
  const mod = sum % 11;
  const check = 11 - mod;
  return check >= 10 ? 0 : check;
}

function generateCpf(seed: number): string {
  const base9 = String(900_000_000 + seed).padStart(9, "0").slice(0, 9);
  const baseDigits = base9.split("").map((c) => Number(c));
  const d1 = computeCpfCheckDigit(baseDigits, 10);
  const d2 = computeCpfCheckDigit([...baseDigits, d1], 11);
  return `${base9}${d1}${d2}`;
}

function generatePhone(seed: number, dd = "11"): string {
  const suffix = String(900_000_000 + seed).padStart(9, "0").slice(0, 9);
  return `${dd}${suffix}`;
}

type DemoClientProfile = {
  name: string;
  dd: string;
  address: string | null;
};

const DEMO_CLIENT_PROFILES: DemoClientProfile[] = [
  { name: "Joao Pedro Almeida", dd: "11", address: "Rua Domingos de Morais, 1184 - Vila Mariana - Sao Paulo/SP" },
  { name: "Mariana Costa Ribeiro", dd: "21", address: "Rua Barata Ribeiro, 572 - Copacabana - Rio de Janeiro/RJ" },
  { name: "Carlos Henrique Souza", dd: "31", address: "Avenida Afonso Pena, 2400 - Centro - Belo Horizonte/MG" },
  { name: "Fernanda Lima Martins", dd: "41", address: "Rua Visconde de Guarapuava, 950 - Centro - Curitiba/PR" },
  { name: "Rafael Gomes Silva", dd: "51", address: "Rua Mostardeiro, 430 - Moinhos de Vento - Porto Alegre/RS" },
  { name: "Aline Rocha Nascimento", dd: "71", address: "Rua Chile, 98 - Centro Historico - Salvador/BA" },
  { name: "Bruno Oliveira Pires", dd: "85", address: "Avenida Beira Mar, 1240 - Meireles - Fortaleza/CE" },
  { name: "Patricia Ferreira Campos", dd: "61", address: "SQS 307 Bloco C - Asa Sul - Brasilia/DF" },
  { name: "Gabriel Santos Araujo", dd: "62", address: "Avenida T-63, 820 - Setor Bueno - Goiania/GO" },
  { name: "Larissa Mendes Duarte", dd: "48", address: "Rua Bocaiuva, 315 - Centro - Florianopolis/SC" },
  { name: "Thiago Barros Teixeira", dd: "27", address: "Avenida Dante Michelini, 540 - Jardim da Penha - Vitoria/ES" },
  { name: "Juliana Prado Farias", dd: "81", address: "Rua da Aurora, 1200 - Boa Vista - Recife/PE" },
  { name: "Mateus Carvalho Nunes", dd: "91", address: "Avenida Presidente Vargas, 412 - Campina - Belem/PA" },
  { name: "Camila Andrade Mota", dd: "98", address: "Avenida Litoranea, 210 - Ponta Dareia - Sao Luis/MA" },
  { name: "Ricardo Tavares Lopes", dd: "92", address: "Avenida Djalma Batista, 830 - Chapada - Manaus/AM" },
  { name: "Vanessa Monteiro Dias", dd: "65", address: "Avenida Isaac Povoas, 560 - Centro Norte - Cuiaba/MT" },
  { name: "Eduardo Cavalcanti Melo", dd: "67", address: "Rua 14 de Julho, 1400 - Centro - Campo Grande/MS" },
  { name: "Debora Siqueira Freitas", dd: "86", address: "Avenida Frei Serafim, 890 - Centro - Teresina/PI" },
];

function toEmailLocalPart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

type InstallmentPlan = {
  dueOffsetDays: number;
  paid?: boolean;
  paymentDelayDays?: number;
  status?: InstallmentStatus;
};

type LoanPlan = {
  label: string;
  principalAmount: number;
  totalAmount: number;
  installmentsCount: number;
  installmentAmount: number;
  interestRate: number;
  interestType: InterestType;
  paymentMethod: PaymentMethod;
  installments: InstallmentPlan[];
};

type FinanceCreationMode = "single" | "installments" | "recurring_monthly";
type FinanceInstallmentAmountMode = "total" | "per_installment";

type FinanceSeedPlan = {
  mode: FinanceCreationMode;
  type: FinanceTransactionType;
  category: string;
  description: string;
  amount: number;
  status: FinanceTransactionStatus;
  baseDateOffsetDays: number;
  notes: string;
  installmentCount?: number;
  installmentAmountMode?: FinanceInstallmentAmountMode;
  recurringMonths?: number;
};

type FinanceSeedTransactionInput = {
  type: FinanceTransactionType;
  amount: number;
  category: string;
  date: Date;
  description: string;
  notes: string;
  status: FinanceTransactionStatus;
};

const FINANCE_DEMO_TAG = "[SEED_DEMO_FINANCE]";

const FINANCE_SEED_PLANS: FinanceSeedPlan[] = [
  {
    mode: "single",
    type: FinanceTransactionType.EXPENSE,
    category: "Moradia",
    description: "Condominio escritorio central",
    amount: 1850,
    status: FinanceTransactionStatus.PENDING,
    baseDateOffsetDays: -5,
    notes: "conta mensal vencida",
  },
  {
    mode: "single",
    type: FinanceTransactionType.EXPENSE,
    category: "Energia",
    description: "Conta de energia unidade centro",
    amount: 980,
    status: FinanceTransactionStatus.PENDING,
    baseDateOffsetDays: 0,
    notes: "conta que vence hoje",
  },
  {
    mode: "single",
    type: FinanceTransactionType.EXPENSE,
    category: "Marketing",
    description: "Campanha digital de captacao",
    amount: 1450,
    status: FinanceTransactionStatus.SCHEDULED,
    baseDateOffsetDays: 4,
    notes: "saida prevista em alguns dias",
  },
  {
    mode: "single",
    type: FinanceTransactionType.EXPENSE,
    category: "Impostos",
    description: "DAS e taxas operacionais",
    amount: 620,
    status: FinanceTransactionStatus.COMPLETED,
    baseDateOffsetDays: -12,
    notes: "despesa ja paga",
  },
  {
    mode: "installments",
    type: FinanceTransactionType.EXPENSE,
    category: "Educacao",
    description: "Treinamento comercial da equipe",
    amount: 9600,
    status: FinanceTransactionStatus.PENDING,
    baseDateOffsetDays: -90,
    installmentCount: 8,
    installmentAmountMode: "total",
    notes: "despesa parcelada por valor total",
  },
  {
    mode: "installments",
    type: FinanceTransactionType.EXPENSE,
    category: "Saude",
    description: "Seguro corporativo anual",
    amount: 450,
    status: FinanceTransactionStatus.SCHEDULED,
    baseDateOffsetDays: 5,
    installmentCount: 6,
    installmentAmountMode: "per_installment",
    notes: "despesa parcelada por valor da parcela",
  },
  {
    mode: "recurring_monthly",
    type: FinanceTransactionType.EXPENSE,
    category: "Moradia",
    description: "Aluguel escritorio matriz",
    amount: 3200,
    status: FinanceTransactionStatus.PENDING,
    baseDateOffsetDays: -90,
    recurringMonths: 6,
    notes: "despesa recorrente principal",
  },
  {
    mode: "recurring_monthly",
    type: FinanceTransactionType.EXPENSE,
    category: "Internet",
    description: "Link dedicado de internet",
    amount: 389,
    status: FinanceTransactionStatus.COMPLETED,
    baseDateOffsetDays: -150,
    recurringMonths: 5,
    notes: "historico recorrente ja pago",
  },
  {
    mode: "recurring_monthly",
    type: FinanceTransactionType.EXPENSE,
    category: "Telefone",
    description: "Telefonia equipe de cobranca",
    amount: 740,
    status: FinanceTransactionStatus.SCHEDULED,
    baseDateOffsetDays: -25,
    recurringMonths: 4,
    notes: "despesa recorrente agendada",
  },
  {
    mode: "single",
    type: FinanceTransactionType.INCOME,
    category: "Servicos",
    description: "Consultoria avulsa fintech",
    amount: 2600,
    status: FinanceTransactionStatus.COMPLETED,
    baseDateOffsetDays: -8,
    notes: "receita ja recebida",
  },
  {
    mode: "single",
    type: FinanceTransactionType.INCOME,
    category: "Comissao",
    description: "Comissao parceria regional",
    amount: 980,
    status: FinanceTransactionStatus.PENDING,
    baseDateOffsetDays: -3,
    notes: "receita vencida",
  },
  {
    mode: "single",
    type: FinanceTransactionType.INCOME,
    category: "Vendas",
    description: "Venda de pacote de analise",
    amount: 1450,
    status: FinanceTransactionStatus.PENDING,
    baseDateOffsetDays: 0,
    notes: "receita prevista para hoje",
  },
  {
    mode: "single",
    type: FinanceTransactionType.INCOME,
    category: "Reembolso",
    description: "Reembolso de fornecedor cloud",
    amount: 520,
    status: FinanceTransactionStatus.SCHEDULED,
    baseDateOffsetDays: 2,
    notes: "receita agendada em curto prazo",
  },
  {
    mode: "single",
    type: FinanceTransactionType.INCOME,
    category: "Freelance",
    description: "Projeto BI sprint 3",
    amount: 3100,
    status: FinanceTransactionStatus.PENDING,
    baseDateOffsetDays: 9,
    notes: "receita futura no mes",
  },
  {
    mode: "installments",
    type: FinanceTransactionType.INCOME,
    category: "Servicos",
    description: "Contrato de implantacao ERP",
    amount: 15000,
    status: FinanceTransactionStatus.PENDING,
    baseDateOffsetDays: -120,
    installmentCount: 10,
    installmentAmountMode: "total",
    notes: "receita parcelada por valor total",
  },
  {
    mode: "installments",
    type: FinanceTransactionType.INCOME,
    category: "Vendas",
    description: "Venda de equipamento usado",
    amount: 700,
    status: FinanceTransactionStatus.SCHEDULED,
    baseDateOffsetDays: 3,
    installmentCount: 5,
    installmentAmountMode: "per_installment",
    notes: "receita parcelada por valor da parcela",
  },
  {
    mode: "recurring_monthly",
    type: FinanceTransactionType.INCOME,
    category: "Servicos",
    description: "Mensalidade suporte premium",
    amount: 2400,
    status: FinanceTransactionStatus.PENDING,
    baseDateOffsetDays: -75,
    recurringMonths: 6,
    notes: "receita recorrente principal",
  },
  {
    mode: "recurring_monthly",
    type: FinanceTransactionType.INCOME,
    category: "Juros",
    description: "Rendimento aplicado em caixa",
    amount: 520,
    status: FinanceTransactionStatus.COMPLETED,
    baseDateOffsetDays: -120,
    recurringMonths: 5,
    notes: "historico recorrente recebido",
  },
  {
    mode: "recurring_monthly",
    type: FinanceTransactionType.INCOME,
    category: "Outros recebimentos",
    description: "Royalties white label",
    amount: 1100,
    status: FinanceTransactionStatus.SCHEDULED,
    baseDateOffsetDays: -10,
    recurringMonths: 4,
    notes: "receita recorrente agendada",
  },
];

function buildFinanceInstallmentDescription(
  baseDescription: string,
  installmentIndex: number,
  installmentCount: number,
): string {
  const suffix = ` (${installmentIndex}/${installmentCount})`;
  if (baseDescription.length + suffix.length <= 300) {
    return `${baseDescription}${suffix}`;
  }
  const maxBaseLength = Math.max(1, 300 - suffix.length);
  return `${baseDescription.slice(0, maxBaseLength).trimEnd()}${suffix}`;
}

function buildFinanceSeedNotes(mode: FinanceCreationMode, notes: string): string {
  return `${FINANCE_DEMO_TAG} ${mode} | ${notes}`.trim();
}

function expandFinanceSeedPlan(today: Date, plan: FinanceSeedPlan): FinanceSeedTransactionInput[] {
  const baseDate = addDaysUtc(today, plan.baseDateOffsetDays);
  const baseNotes = buildFinanceSeedNotes(plan.mode, plan.notes);

  if (plan.mode === "single") {
    return [
      {
        type: plan.type,
        amount: round2(plan.amount),
        category: plan.category,
        date: baseDate,
        description: plan.description,
        notes: `${baseNotes} | item unico`,
        status: plan.status,
      },
    ];
  }

  if (plan.mode === "installments") {
    const installmentCount = Math.max(2, Math.trunc(plan.installmentCount ?? 2));
    const installmentAmountMode = plan.installmentAmountMode ?? "total";
    const installmentAmounts = installmentAmountMode === "per_installment"
      ? Array.from({ length: installmentCount }, () => round2(plan.amount))
      : splitAmount(plan.amount, installmentCount);

    return Array.from({ length: installmentCount }, (_item, index) => ({
      type: plan.type,
      amount: installmentAmounts[index] ?? 0,
      category: plan.category,
      date: addMonthsDateOnlyUtc(baseDate, index),
      description: buildFinanceInstallmentDescription(plan.description, index + 1, installmentCount),
      notes: `${baseNotes} | parcela ${index + 1}/${installmentCount}`,
      status: plan.status,
    }));
  }

  const recurringMonths = Math.max(2, Math.trunc(plan.recurringMonths ?? 2));
  const recurringAmount = round2(plan.amount);

  return Array.from({ length: recurringMonths }, (_item, index) => ({
    type: plan.type,
    amount: recurringAmount,
    category: plan.category,
    date: addMonthsDateOnlyUtc(baseDate, index),
    description: plan.description,
    notes: `${baseNotes} | recorrencia ${index + 1}/${recurringMonths}`,
    status: plan.status,
  }));
}

function computeLoanStatus(today: Date, installments: InstallmentPlan[]): LoanStatus {
  const allPaid = installments.every((i) => Boolean(i.paid) || i.status === InstallmentStatus.PAGO);
  if (allPaid) return LoanStatus.QUITADO;

  const hasOverdue = installments.some((i) => {
    const dueDate = addDaysUtc(today, i.dueOffsetDays);
    const status = i.status;
    if (status === InstallmentStatus.ATRASADO) return true;
    if (status === InstallmentStatus.PAGO || i.paid) return false;
    return dueDate < today;
  });

  return hasOverdue ? LoanStatus.ATRASADO : LoanStatus.EM_DIA;
}

async function seedAdminUser() {
  const name = process.env.ADMIN_NAME || "Administrador";
  const email = (process.env.ADMIN_EMAIL || "admin@credix.app.br").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "123456";

  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: UserRole.ADMIN,
    },
    create: {
      name,
      email,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

}

async function main() {
  const adminUser = await seedAdminUser();
  const timeZone = process.env.SEED_TZ || "America/Sao_Paulo";
  const todayIso = getIsoTodayInTimeZone(timeZone);
  const today = isoToUtcDateOnly(todayIso);

  const demoCount = 18;
  const demoCpfs = Array.from({ length: demoCount }, (_, index) => generateCpf(index + 1));

  await prisma.$transaction(async (tx) => {
    const existingDemoLoans = await tx.loan.findMany({
      where: {
        ownerUserId: adminUser.id,
        client: {
          ownerUserId: adminUser.id,
          cpf: { in: demoCpfs },
        },
      },
      select: {
        id: true,
        installments: {
          select: {
            id: true,
          },
        },
      },
    });

    const staleFinanceDescriptions = existingDemoLoans.flatMap((loan) => [
      buildLoanDisbursementDescription(loan.id),
      ...loan.installments.map((installment) => buildInstallmentIncomeDescription(installment.id, loan.id)),
    ]);

    if (staleFinanceDescriptions.length > 0) {
      await tx.financeTransaction.deleteMany({
        where: {
          ownerUserId: adminUser.id,
          description: { in: staleFinanceDescriptions },
        },
      });
    }

    await tx.financeTransaction.deleteMany({
      where: {
        ownerUserId: adminUser.id,
        notes: { contains: FINANCE_DEMO_TAG },
      },
    });

    // Remove o dataset demo anterior (somente os CPFs gerados aqui).
    await tx.client.deleteMany({
      where: {
        ownerUserId: adminUser.id,
        cpf: { in: demoCpfs },
      },
    });

    let nextClientId = ((await tx.client.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1;

    const clients = [];
    for (let index = 0; index < demoCount; index += 1) {
      const id = index + 1;
      const cpf = demoCpfs[index];
      const profile = DEMO_CLIENT_PROFILES[index];
      const name = profile?.name || `Cliente ${String(id).padStart(2, "0")}`;
      const emailLocalPart = toEmailLocalPart(name);

      const created = await tx.client.create({
        data: {
          id: nextClientId++,
          ownerUserId: adminUser.id,
          name,
          cpf,
          phone: generatePhone(id, profile?.dd || "11"),
          email: id === 5 ? null : `${emailLocalPart}.${id}@maildemo.local`,
          status: id % 9 === 0 ? ClientStatus.INATIVO : ClientStatus.ATIVO,
          address: profile?.address ?? null,
          notes: "Base de validacao de telas",
          createdAt: addDaysUtc(today, -240 + id * 7),
        },
      });
      clients.push(created);
    }

    const byIndex = (n: number) => clients[n - 1];

    const plans: Array<{ clientId: number; loans: LoanPlan[] }> = [
      {
        clientId: byIndex(1).id,
        loans: [
          {
            label: "Credito pessoal (misto com atraso)",
            principalAmount: 8000,
            totalAmount: 10400,
            installmentsCount: 8,
            installmentAmount: 1300,
            interestRate: 30,
            interestType: InterestType.SIMPLES,
            paymentMethod: PaymentMethod.PIX,
            installments: [
              { dueOffsetDays: -180, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -150, paid: true, paymentDelayDays: 1 },
              { dueOffsetDays: -120, paid: true, paymentDelayDays: 2 },
              { dueOffsetDays: -90, status: InstallmentStatus.ATRASADO },
              { dueOffsetDays: -60, status: InstallmentStatus.ATRASADO },
              { dueOffsetDays: -30, status: InstallmentStatus.ATRASADO },
              { dueOffsetDays: 5 },
              { dueOffsetDays: 35 },
            ],
          },
        ],
      },
      {
        clientId: byIndex(2).id,
        loans: [
          {
            label: "Credito pessoal (carteira em dia)",
            principalAmount: 3000,
            totalAmount: 3600,
            installmentsCount: 6,
            installmentAmount: 600,
            interestRate: 20,
            interestType: InterestType.SIMPLES,
            paymentMethod: PaymentMethod.DINHEIRO,
            installments: [
              { dueOffsetDays: -150, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -120, paid: true, paymentDelayDays: 1 },
              { dueOffsetDays: -90, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -60, paid: true, paymentDelayDays: 2 },
              { dueOffsetDays: -6, paid: true, paymentDelayDays: 1 },
              { dueOffsetDays: 24 },
            ],
          },
        ],
      },
      {
        clientId: byIndex(3).id,
        loans: [
          {
            label: "Credito pessoal (quitado)",
            principalAmount: 5000,
            totalAmount: 6000,
            installmentsCount: 6,
            installmentAmount: 1000,
            interestRate: 20,
            interestType: InterestType.COMPOSTO,
            paymentMethod: PaymentMethod.TRANSFERENCIA,
            installments: [
              { dueOffsetDays: -210, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -180, paid: true, paymentDelayDays: 1 },
              { dueOffsetDays: -150, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -120, paid: true, paymentDelayDays: 2 },
              { dueOffsetDays: -90, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -60, paid: true, paymentDelayDays: 3 },
            ],
          },
        ],
      },
      {
        clientId: byIndex(4).id,
        loans: [
          {
            label: "Credito pessoal (vence hoje e proximas semanas)",
            principalAmount: 2000,
            totalAmount: 2400,
            installmentsCount: 4,
            installmentAmount: 600,
            interestRate: 20,
            interestType: InterestType.SIMPLES,
            paymentMethod: PaymentMethod.PIX,
            installments: [
              { dueOffsetDays: -30, paid: true, paymentDelayDays: 1 },
              { dueOffsetDays: 0 },
              { dueOffsetDays: 3 },
              { dueOffsetDays: 30 },
            ],
          },
        ],
      },
      {
        clientId: byIndex(5).id,
        loans: [
          {
            label: "Credito pessoal (fluxo no mes)",
            principalAmount: 1500,
            totalAmount: 1800,
            installmentsCount: 3,
            installmentAmount: 600,
            interestRate: 20,
            interestType: InterestType.SIMPLES,
            paymentMethod: PaymentMethod.CARTAO,
            installments: [
              { dueOffsetDays: -2, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: 28 },
              { dueOffsetDays: 58 },
            ],
          },
        ],
      },
      {
        clientId: byIndex(8).id,
        loans: [
          {
            label: "Capital de giro (atraso alto)",
            principalAmount: 10000,
            totalAmount: 14000,
            installmentsCount: 10,
            installmentAmount: 1400,
            interestRate: 40,
            interestType: InterestType.SIMPLES,
            paymentMethod: PaymentMethod.PIX,
            installments: [
              { dueOffsetDays: -120, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -90, paid: true, paymentDelayDays: 1 },
              { dueOffsetDays: -60, status: InstallmentStatus.ATRASADO },
              { dueOffsetDays: -30, status: InstallmentStatus.ATRASADO },
              { dueOffsetDays: -15, status: InstallmentStatus.ATRASADO },
              { dueOffsetDays: -5, status: InstallmentStatus.ATRASADO },
              { dueOffsetDays: 5 },
              { dueOffsetDays: 35 },
              { dueOffsetDays: 65 },
              { dueOffsetDays: 95 },
            ],
          },
        ],
      },
      {
        clientId: byIndex(9).id,
        loans: [
          {
            label: "Capital de giro (atraso medio)",
            principalAmount: 3600,
            totalAmount: 4500,
            installmentsCount: 9,
            installmentAmount: 500,
            interestRate: 25,
            interestType: InterestType.COMPOSTO,
            paymentMethod: PaymentMethod.TRANSFERENCIA,
            installments: [
              { dueOffsetDays: -240, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -210, paid: true, paymentDelayDays: 1 },
              { dueOffsetDays: -180, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -150, status: InstallmentStatus.ATRASADO },
              { dueOffsetDays: -120, status: InstallmentStatus.ATRASADO },
              { dueOffsetDays: -90 },
              { dueOffsetDays: -60 },
              { dueOffsetDays: -30 },
              { dueOffsetDays: 10 },
            ],
          },
        ],
      },
      {
        clientId: byIndex(12).id,
        loans: [
          {
            label: "Credito pessoal (ticket pequeno)",
            principalAmount: 1200,
            totalAmount: 1500,
            installmentsCount: 3,
            installmentAmount: 500,
            interestRate: 25,
            interestType: InterestType.SIMPLES,
            paymentMethod: PaymentMethod.DINHEIRO,
            installments: [
              { dueOffsetDays: -20, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: -1, paid: true, paymentDelayDays: 0 },
              { dueOffsetDays: 29 },
            ],
          },
        ],
      },
    ];

    // Alguns ambientes podem ter sequencias desalinhadas por inserts com ID manual.
    // Aqui usamos IDs explicitos (max+1) para evitar colisao.
    let nextLoanId = ((await tx.loan.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1;
    let nextInstallmentId = ((await tx.installment.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1;
    let nextPaymentId = ((await tx.payment.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1;

    for (const item of plans) {
      const client = clients.find((c) => c.id === item.clientId);
      if (!client) continue;

      for (const plan of item.loans) {
        const loanStatus = computeLoanStatus(today, plan.installments);
        const dueDates = plan.installments.map((inst) => addDaysUtc(today, inst.dueOffsetDays));
        const firstDueDate = dueDates.reduce((min, current) => (current < min ? current : min), dueDates[0]);
        const lastDueDate = dueDates.reduce((max, current) => (current > max ? current : max), dueDates[0]);
        const startDate = addDaysUtc(firstDueDate, -20);
        const principalValues = splitAmount(plan.principalAmount, plan.installmentsCount);
        const interestValues = splitAmount(
          Math.max(round2(plan.totalAmount - plan.principalAmount), 0),
          plan.installmentsCount,
        );

        const loan = await tx.loan.create({
          data: {
            id: nextLoanId++,
            ownerUserId: adminUser.id,
            clientId: client.id,
            principalAmount: plan.principalAmount,
            interestRate: plan.interestRate,
            interestType: plan.interestType,
            installmentsCount: plan.installmentsCount,
            installmentAmount: plan.installmentAmount,
            totalAmount: plan.totalAmount,
            paymentMethod: plan.paymentMethod,
            startDate,
            firstDueDate,
            dueDate: lastDueDate,
            status: loanStatus,
            observations: plan.label,
          },
        });

        for (let index = 0; index < plan.installments.length; index += 1) {
          const instPlan = plan.installments[index];
          const dueDate = addDaysUtc(today, instPlan.dueOffsetDays);
          const paid = Boolean(instPlan.paid) || instPlan.status === InstallmentStatus.PAGO;
          const status = paid
            ? InstallmentStatus.PAGO
            : instPlan.status ?? InstallmentStatus.PENDENTE;

          const paymentDate = paid ? addDaysUtc(dueDate, instPlan.paymentDelayDays ?? 0) : null;

          const installment = await tx.installment.create({
            data: {
              id: nextInstallmentId++,
              ownerUserId: adminUser.id,
              loanId: loan.id,
              clientId: client.id,
              installmentNumber: index + 1,
              dueDate,
              paymentDate,
              amount: plan.installmentAmount,
              principalAmount: principalValues[index] ?? null,
              interestAmount: interestValues[index] ?? null,
              status,
              paymentMethod: paid ? plan.paymentMethod : null,
              notes: "Seed demo",
            },
          });

          if (paid && paymentDate) {
            await tx.payment.create({
              data: {
                id: nextPaymentId++,
                ownerUserId: adminUser.id,
                loanId: loan.id,
                installmentId: installment.id,
                amount: plan.installmentAmount,
                paymentDate,
                method: plan.paymentMethod,
                notes: "Seed demo",
              },
            });
          }
        }
      }
    }

    const financeSeedRows = FINANCE_SEED_PLANS
      .flatMap((plan) => expandFinanceSeedPlan(today, plan))
      .map((row) => ({
        ownerUserId: adminUser.id,
        type: row.type,
        amount: row.amount,
        category: row.category,
        date: row.date,
        description: row.description,
        notes: row.notes,
        status: row.status,
      }));

    if (financeSeedRows.length > 0) {
      await tx.financeTransaction.createMany({
        data: financeSeedRows,
      });
    }
  });

  await ensureFinanceCategoryCatalogForUserSafe(prisma, adminUser.id);

  const [clientsCount, loansCount, installmentsCount, paymentsCount, demoInstallments, demoFinanceTransactions] = await Promise.all([
    prisma.client.count({
      where: {
        ownerUserId: adminUser.id,
        cpf: { in: demoCpfs },
      },
    }),
    prisma.loan.count({
      where: {
        ownerUserId: adminUser.id,
        client: {
          ownerUserId: adminUser.id,
          cpf: { in: demoCpfs },
        },
      },
    }),
    prisma.installment.count({
      where: {
        ownerUserId: adminUser.id,
        client: {
          ownerUserId: adminUser.id,
          cpf: { in: demoCpfs },
        },
      },
    }),
    prisma.payment.count({
      where: {
        ownerUserId: adminUser.id,
        loan: {
          ownerUserId: adminUser.id,
          client: {
            ownerUserId: adminUser.id,
            cpf: { in: demoCpfs },
          },
        },
      },
    }),
    prisma.installment.findMany({
      where: {
        ownerUserId: adminUser.id,
        client: {
          ownerUserId: adminUser.id,
          cpf: { in: demoCpfs },
        },
      },
      select: {
        status: true,
        dueDate: true,
      },
    }),
    prisma.financeTransaction.findMany({
      where: {
        ownerUserId: adminUser.id,
        notes: { contains: FINANCE_DEMO_TAG },
      },
      select: {
        type: true,
        status: true,
        date: true,
      },
    }),
  ]);

  const todayDateIso = toDateOnlyIso(today);
  const next7DateIso = toDateOnlyIso(addDaysUtc(today, 7));

  const installmentsSummary = demoInstallments.reduce((acc, installment) => {
    const dueDateIso = toDateOnlyIso(installment.dueDate);
    const isOpen = installment.status !== InstallmentStatus.PAGO;

    if (!isOpen) {
      acc.paid += 1;
      return acc;
    }

    if (dueDateIso < todayDateIso || installment.status === InstallmentStatus.ATRASADO) {
      acc.overdue += 1;
    } else if (dueDateIso === todayDateIso) {
      acc.dueToday += 1;
    } else if (dueDateIso <= next7DateIso) {
      acc.next7 += 1;
    } else {
      acc.upcoming += 1;
    }

    return acc;
  }, {
    paid: 0,
    overdue: 0,
    dueToday: 0,
    next7: 0,
    upcoming: 0,
  });

  const financeSummary = demoFinanceTransactions.reduce((acc, transaction) => {
    const dueDateIso = toDateOnlyIso(transaction.date);
    const isOpen = transaction.status !== FinanceTransactionStatus.COMPLETED;

    if (transaction.type === FinanceTransactionType.INCOME) {
      acc.receivable += 1;
    } else {
      acc.payable += 1;
    }

    if (!isOpen) {
      acc.completed += 1;
      return acc;
    }

    acc.open += 1;

    if (dueDateIso < todayDateIso) {
      acc.overdue += 1;
    } else if (dueDateIso === todayDateIso) {
      acc.dueToday += 1;
    } else if (dueDateIso <= next7DateIso) {
      acc.next7 += 1;
    }

    return acc;
  }, {
    receivable: 0,
    payable: 0,
    completed: 0,
    open: 0,
    overdue: 0,
    dueToday: 0,
    next7: 0,
  });

  console.log("Seed demo concluido.");
  console.log(`Admin: ${adminUser.email}`);
  console.log(`Clientes demo: ${clientsCount}`);
  console.log(`Emprestimos demo: ${loansCount}`);
  console.log(`Parcelas demo: ${installmentsCount}`);
  console.log(`Pagamentos demo: ${paymentsCount}`);
  console.log(
    `Parcelas em aberto -> vencidas: ${installmentsSummary.overdue}, vencem hoje: ${installmentsSummary.dueToday}, proximos 7 dias: ${installmentsSummary.next7}, futuras: ${installmentsSummary.upcoming}, pagas: ${installmentsSummary.paid}`,
  );
  console.log(
    `Financeiro demo: ${demoFinanceTransactions.length} lancamentos (receber: ${financeSummary.receivable}, pagar: ${financeSummary.payable})`,
  );
  console.log(
    `Financeiro aberto -> em aberto: ${financeSummary.open}, vencidos: ${financeSummary.overdue}, vencem hoje: ${financeSummary.dueToday}, proximos 7 dias: ${financeSummary.next7}, concluidos: ${financeSummary.completed}`,
  );
}

main()
  .catch((error) => {
    console.error("Erro no seed demo:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
