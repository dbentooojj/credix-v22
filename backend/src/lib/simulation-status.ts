export type SimulationDisplayStatus = "SIMULATED" | "CONVERTED" | "DISCARDED";

export function resolveSimulationDisplayStatus(status: string, loanId: number | null): SimulationDisplayStatus {
  if (loanId !== null) return "CONVERTED";
  if (status === "CANCELED") return "DISCARDED";
  return "SIMULATED";
}

export function getSimulationDisplayStatusLabel(status: SimulationDisplayStatus): string {
  if (status === "CONVERTED") return "Convertida";
  if (status === "DISCARDED") return "Descartada";
  return "Simulada";
}
