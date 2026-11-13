import PDFDocument from "pdfkit";
import { DEFAULT_TIME_ZONE } from "../lib/date-time";

export type StatementMovement = {
  date: Date;
  createdAt: Date;
  description: string;
  accountName: string;
  type: "income" | "expense";
  amount: number;
};

type StatementPdfInput = {
  startDate: string;
  endDate: string;
  accountName: string;
  issuedAt: Date;
  movements: StatementMovement[];
};

const colors = {
  navy: "#11243D",
  blue: "#315EEB",
  paleBlue: "#EFF4FF",
  border: "#DCE4EF",
  muted: "#60718A",
  green: "#087A55",
  red: "#BD3551",
  white: "#FFFFFF",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
const issuedFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: DEFAULT_TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: DEFAULT_TIME_ZONE });
const moneyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: number) => moneyFormat.format(value);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const displayDate = (iso: string) => dateFormat.format(new Date(`${iso}T00:00:00Z`));

export function renderFinancialStatementPdf(input: StatementPdfInput): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margins: { top: 44, right: 44, bottom: 58, left: 44 }, bufferPages: true, info: { Title: "Extrato financeiro - Credix", Author: "Credix" } });
  const left = 44;
  const right = doc.page.width - 44;
  const width = right - left;
  const bottom = doc.page.height - 95;
  let y = 44;

  const drawPageHeader = (continued = false) => {
    doc.rect(left, 44, 4, 27).fill(colors.blue);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.blue).text("CREDIX", left + 13, 45, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(17).fillColor(colors.navy).text("Extrato financeiro", left + 13, 57, { lineBreak: false });
    if (continued) doc.font("Helvetica").fontSize(8).fillColor(colors.muted).text("Continuação", right - 85, 60, { width: 85, align: "right", lineBreak: false });
    doc.moveTo(left, 83).lineTo(right, 83).strokeColor(colors.border).lineWidth(1).stroke();
    y = 98;
  };
  const newPage = () => { doc.addPage(); drawPageHeader(true); };

  drawPageHeader();
  doc.font("Helvetica").fontSize(9).fillColor(colors.muted).text("PERÍODO", left, y, { lineBreak: false });
  doc.text("CONTA", left + 260, y, { lineBreak: false });
  y += 16;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.navy)
    .text(`${displayDate(input.startDate)} a ${displayDate(input.endDate)}`, left, y, { width: 250, lineBreak: false });
  doc.text(input.accountName, left + 260, y, { width: width - 260, height: 30, ellipsis: true });
  y += 43;

  const incomeCents = input.movements.filter((row) => row.type === "income").reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  const expenseCents = input.movements.filter((row) => row.type === "expense").reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  const summaries = [
    { label: "ENTRADAS", value: money(incomeCents / 100), color: colors.green },
    { label: "SAÍDAS", value: money(expenseCents / 100), color: colors.red },
    { label: "SALDO DO PERÍODO", value: money((incomeCents - expenseCents) / 100), color: incomeCents >= expenseCents ? colors.green : colors.red },
  ];
  const gap = 10;
  const cardWidth = (width - gap * 2) / 3;
  summaries.forEach((summary, index) => {
    const x = left + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 62, 9).fillAndStroke(colors.paleBlue, colors.border);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.muted).text(summary.label, x + 11, y + 12, { width: cardWidth - 22, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(summary.color).text(summary.value, x + 11, y + 31, { width: cardWidth - 22, lineBreak: false, ellipsis: true });
  });
  y += 82;

  const groups = new Map<string, StatementMovement[]>();
  input.movements.forEach((movement) => {
    const day = isoDate(movement.date);
    const group = groups.get(day) ?? [];
    group.push(movement);
    groups.set(day, group);
  });

  const drawGroupHeader = (day: string, rows: StatementMovement[], continued = false) => {
    const dailyCents = rows.reduce((sum, row) => sum + (row.type === "income" ? 1 : -1) * Math.round(row.amount * 100), 0);
    doc.roundedRect(left, y, width, 31, 6).fill(colors.paleBlue);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.navy).text(`${displayDate(day)}${continued ? " (continuação)" : ""}`, left + 10, y + 9, { width: 305, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(colors.muted).text(`${rows.length} movimentações  |  Saldo ${money(dailyCents / 100)}`, left + 315, y + 10, { width: width - 325, align: "right", lineBreak: false });
    y += 39;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.muted);
    doc.text("DESCRIÇÃO", left + 7, y, { lineBreak: false });
    doc.text("CONTA", left + 246, y, { lineBreak: false });
    doc.text("HORA", left + 345, y, { lineBreak: false });
    doc.text("VALOR", left + 399, y, { width: width - 406, align: "right", lineBreak: false });
    y += 17;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(colors.border).lineWidth(0.7).stroke();
    y += 5;
  };

  if (groups.size === 0) {
    doc.font("Helvetica").fontSize(11).fillColor(colors.muted).text("Nenhuma movimentação concluída no período selecionado.", left, y + 10, { width });
  }

  for (const [day, rows] of groups) {
    if (y + 91 > bottom) newPage();
    drawGroupHeader(day, rows);
    for (const row of rows) {
      doc.font("Helvetica").fontSize(9);
      const descriptionHeight = doc.heightOfString(row.description, { width: 229 });
      const accountHeight = doc.heightOfString(row.accountName, { width: 88 });
      const rowHeight = Math.max(29, Math.ceil(Math.max(descriptionHeight, accountHeight)) + 13);
      if (y + rowHeight > bottom) {
        newPage();
        drawGroupHeader(day, rows, true);
      }
      doc.font("Helvetica").fontSize(9).fillColor(colors.navy).text(row.description, left + 7, y + 7, { width: 229 });
      doc.fontSize(8.5).text(row.accountName, left + 246, y + 7, { width: 88 });
      doc.text(timeFormat.format(row.createdAt), left + 345, y + 7, { width: 47, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(row.type === "income" ? colors.green : colors.red)
        .text(`${row.type === "income" ? "+" : "-"}${money(row.amount)}`, left + 399, y + 7, { width: width - 406, align: "right", lineBreak: false });
      y += rowHeight;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(colors.border).lineWidth(0.5).stroke();
    }
    y += 17;
  }

  const pages = doc.bufferedPageRange();
  for (let page = 0; page < pages.count; page += 1) {
    doc.switchToPage(page);
    const footerY = doc.page.height - 74;
    doc.moveTo(left, footerY - 12).lineTo(right, footerY - 12).strokeColor(colors.border).lineWidth(0.7).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(colors.muted).text(`Credix  |  Emitido em ${issuedFormat.format(input.issuedAt)}`, left, footerY, { lineBreak: false });
    doc.text(`Página ${page + 1}/${pages.count}`, right - 90, footerY, { width: 90, align: "right", lineBreak: false });
  }
  doc.end();
  return doc;
}
