import { ClientStatus, InterestType, LoanStatus, PaymentMethod } from "@prisma/client";

export const VALIDATION_TAG = "[VALIDACAO_V1]";

export function dateAtOffset(today: Date, days: number): Date {
  const result = new Date(today);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// Distribute cents exactly, including contracts that do not divide evenly.
export function splitCents(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => base + (i === count - 1 ? total % count : 0));
}

type Scenario = {
  label: string; offsets: number[]; paid: number; delay?: number; prepaid?: boolean;
  zeroInterest?: boolean; cents?: boolean; large?: boolean; pending?: boolean;
};

const scenarios: Scenario[] = [
  { label: "Quitado no prazo", offsets: [-180, -150, -120, -90], paid: 4, delay: 0 },
  { label: "Quitado com atrasos historicos", offsets: [-180, -150, -120, -90], paid: 4, delay: 10 },
  { label: "Quitacao antecipada", offsets: [-30, 0, 30, 60], paid: 4, prepaid: true },
  { label: "Em dia com historico de pagamentos", offsets: [-90, -60, -30, 15, 45, 75], paid: 3 },
  { label: "Vence hoje", offsets: [-30, 0, 30], paid: 1 },
  { label: "Vence amanha", offsets: [1, 31, 61], paid: 0 },
  { label: "Vence em 7 dias", offsets: [7, 37, 67], paid: 0 },
  { label: "Vence em 30 dias", offsets: [30, 60, 90], paid: 0 },
  { label: "Atraso de 1 dia", offsets: [-31, -1, 29], paid: 1 },
  { label: "Atraso de 7 dias", offsets: [-37, -7, 23], paid: 1 },
  { label: "Atraso de 15 dias", offsets: [-45, -15, 15], paid: 1 },
  { label: "Atraso de 30 dias", offsets: [-60, -30, 0, 30], paid: 1 },
  { label: "Atraso de 60 dias", offsets: [-90, -60, -30, 0, 30], paid: 1 },
  { label: "Atraso superior a 90 dias", offsets: [-180, -120, -90, -60, -30, 0, 30], paid: 1 },
  { label: "Nenhuma parcela paga", offsets: [-90, -60, -30], paid: 0 },
  { label: "Ultima parcela em aberto", offsets: [-150, -120, -90, -60, -30, 10], paid: 5 },
  { label: "Parcela unica quitada", offsets: [-15], paid: 1 },
  { label: "Parcela unica atrasada", offsets: [-20], paid: 0 },
  { label: "Contrato sem juros", offsets: [-30, 0, 30], paid: 1, zeroInterest: true },
  { label: "Contrato com ajuste de centavos", offsets: [-30, 0, 30], paid: 1, cents: true },
  { label: "Alta concentracao de capital", offsets: [-60, -30, 0, 30, 60, 90], paid: 1, large: true },
  { label: "Historico de 12 meses", offsets: [-360, -330, -300, -270, -240, -210, -180, -150, -120, -90, -60, -30], paid: 12 },
  { label: "Pagamento realizado hoje", offsets: [-60, -30, 0, 30], paid: 3, delay: 0 },
  { label: "Pendente de liberacao", offsets: [15, 45, 75], paid: 0, pending: true },
];

const names = [
  "Ana Clara Almeida", "Bruno Henrique Costa", "Camila Souza", "Daniel Oliveira",
  "Elisa Martins", "Felipe Rocha", "Gabriela Santos", "Hugo Pereira",
  "Isabela Lima", "Joao Pedro Nascimento", "Karina Ribeiro", "Lucas Ferreira",
  "Mariana Araujo", "Nicolas Gomes", "Olivia Carvalho", "Paulo Mendes",
  "Quiteria Duarte", "Rafael Teixeira", "Sofia Barros", "Thiago Farias",
  "Ursula Monteiro", "Vinicius Lopes", "Wesley Dias", "Yasmin Freitas",
  "Andre Melo", "Beatriz Prado", "Caio Campos", "Debora Siqueira",
  "Eduardo Mota", "Fernanda Pires", "Gustavo Nunes", "Helena Andrade",
  "Igor Tavares", "Julia Cavalcanti", "Leonardo Moreira", "Leticia Cardoso",
  "Mateus Vieira", "Natalia Batista", "Otavio Reis", "Patricia Fernandes",
  "Renato Castro", "Sara Machado", "Vitor Correia", "Vanessa Ramos",
  "William Pinto", "Zelia Moura", "Antonio da Silva", "Maria da Silva",
];

function syntheticCpf(index: number): string {
  const digits = String(870_000_000 + index).split("").map(Number);
  for (const factor of [10, 11]) {
    const remainder = digits.reduce((sum, digit, i) => sum + digit * (factor - i), 0) % 11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits.join("");
}

export function buildValidationLoan(today: Date, scenarioIndex: number, variant = 0) {
  const scenario = scenarios[scenarioIndex % scenarios.length];
  const count = scenario.offsets.length;
  const principalCents = scenario.large ? 25_000_000 : scenario.cents ? 100_001 : 100_000 + variant * 37_500;
  const interestRate = scenario.zeroInterest ? 0 : 2.5;
  const interestType = variant % 2 === 0 ? InterestType.SIMPLES : InterestType.COMPOSTO;
  const totalCents = Math.round(principalCents * (interestType === InterestType.COMPOSTO
    ? (1 + interestRate / 100) ** count : 1 + interestRate / 100 * count));
  const amounts = splitCents(totalCents, count);
  const principals = splitCents(principalCents, count);
  const method = Object.values(PaymentMethod)[variant % 4];
  const firstDate = dateAtOffset(today, scenario.offsets[0]);
  const startDate = dateAtOffset(firstDate > today ? today : firstDate, -30);
  const installments = scenario.offsets.map((offset, i) => {
    const dueDate = dateAtOffset(today, offset);
    const paid = i < scenario.paid;
    const paymentDate = paid ? (scenario.prepaid
      ? dateAtOffset(today, -2)
      : dateAtOffset(dueDate, scenario.delay ?? 0)) : null;
    return {
      installmentNumber: i + 1, dueDate, paymentDate,
      amount: amounts[i] / 100, principalAmount: principals[i] / 100,
      interestAmount: (amounts[i] - principals[i]) / 100,
      status: paid ? "PAGO" as const : offset < 0 ? "ATRASADO" as const : "PENDENTE" as const,
      paymentMethod: paid ? method : null,
    };
  });
  const status = scenario.pending ? LoanStatus.PENDENTE
    : installments.every((i) => i.status === "PAGO") ? LoanStatus.QUITADO
    : installments.some((i) => i.status === "ATRASADO") ? LoanStatus.ATRASADO : LoanStatus.EM_DIA;
  return {
    label: scenario.label, principalAmount: principalCents / 100, totalAmount: totalCents / 100,
    interestRate, interestType, paymentMethod: method, installmentsCount: count,
    installmentAmount: amounts[0] / 100, startDate, firstDueDate: firstDate,
    dueDate: dateAtOffset(today, scenario.offsets[count - 1]), status,
    // A proposal awaiting release has no installments or cash outflow yet.
    installments: scenario.pending ? [] : installments,
  };
}

export function buildValidationClients(today: Date) {
  let loanIndex = 0;
  return names.map((name, i) => {
    const loanCount = i < 3 ? 0 : i === 3 ? 25 : 1 + i % 3;
    return {
      name: `[Teste] ${name}`,
      cpf: i === 1 || i === 7 ? null : syntheticCpf(i + 1),
      phone: `1190000${String(i + 1).padStart(4, "0")}`,
      email: i % 7 === 0 ? null : `cliente.${i + 1}@validacao.invalid`,
      address: i % 5 === 0 ? null : `Rua Ficticia ${i + 1}, ${100 + i} - Sao Paulo/SP`,
      status: i === 1 || i % 11 === 10 ? ClientStatus.INATIVO : ClientStatus.ATIVO,
      createdAt: dateAtOffset(today, -730),
      loans: Array.from({ length: loanCount }, () => {
        const index = loanIndex++;
        return buildValidationLoan(today, index, index % 12);
      }),
    };
  });
}
