(function () {
  if (typeof window === "undefined") return;

  const newLoanButton = document.getElementById("newLoanBtn");
  const loanModal = document.getElementById("loanModal");
  const loanForm = document.getElementById("loanForm");
  const saveLoanButton = document.getElementById("saveLoanBtn");
  const loanModalTitle = document.getElementById("loanModalTitle");

  if (!newLoanButton || !loanModal || !loanForm || !saveLoanButton || !loanModalTitle) {
    return;
  }

  if (typeof openLoanModal !== "function" || typeof calculateLoanFromForm !== "function") {
    return;
  }

  const simulationState = {
    mode: "loan",
    currentSimulationId: null,
    pendingRows: [],
    actionLocks: new Set(),
  };

  const actionRefs = {
    container: null,
    saveDraftBtn: null,
    whatsappBtn: null,
  };

  const pendingRefs = {
    section: null,
    statusFilter: null,
    searchFilter: null,
    mobileList: null,
    tbody: null,
    emptyState: null,
  };

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function round2(value) {
    return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(toNumber(value));
  }

  function formatDate(value) {
    if (!value) return "-";
    const raw = String(value).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "-";
    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  }

  function showToast(message, type) {
    if (typeof showMessage === "function") {
      showMessage(message, type || "success");
      return;
    }
    window.alert(message);
  }

  function setActionButtonLoading(button, isLoading) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = Boolean(isLoading);
    button.classList.toggle("opacity-60", Boolean(isLoading));
    button.classList.toggle("pointer-events-none", Boolean(isLoading));
  }

  async function runSimulationAction(action, simulationId, button, handler) {
    const lockKey = `${String(action || "")}:${String(simulationId || "")}`;
    if (!lockKey || simulationState.actionLocks.has(lockKey)) return;

    simulationState.actionLocks.add(lockKey);
    setActionButtonLoading(button, true);

    try {
      await handler();
    } finally {
      simulationState.actionLocks.delete(lockKey);
      setActionButtonLoading(button, false);
    }
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function updateSimulationModeUi() {
    const modalDescription = loanModal.querySelector(".modal-base__description");

    if (simulationState.mode === "simulation") {
      saveLoanButton.classList.add("hidden");
      saveLoanButton.setAttribute("aria-hidden", "true");

      if (actionRefs.container) {
        actionRefs.container.classList.remove("hidden");
      }

      loanModalTitle.textContent = simulationState.currentSimulationId
        ? `Simulacao #${simulationState.currentSimulationId.slice(0, 8)}`
        : "Nova simulacao";

      if (modalDescription) {
        modalDescription.textContent = "Monte a proposta, envie no WhatsApp e aprove para criar o emprestimo real.";
      }
      return;
    }

    saveLoanButton.classList.remove("hidden");
    saveLoanButton.removeAttribute("aria-hidden");
    if (actionRefs.container) {
      actionRefs.container.classList.add("hidden");
    }
  }

  function setLoanMode() {
    simulationState.mode = "loan";
    simulationState.currentSimulationId = null;
    updateSimulationModeUi();
  }

  function setSimulationMode(simulationId) {
    simulationState.mode = "simulation";
    simulationState.currentSimulationId = simulationId || null;
    updateSimulationModeUi();
  }

  function injectNewSimulationButton() {
    const existingSimulationButton = document.getElementById("newLoanSimulationBtn");
    if (existingSimulationButton instanceof HTMLButtonElement) {
      if (!existingSimulationButton.dataset.simBound) {
        existingSimulationButton.dataset.simBound = "true";
        existingSimulationButton.addEventListener("click", function () {
          if (!Array.isArray(loansState?.debtors) || loansState.debtors.length === 0) {
            showToast("Cadastre um cliente antes de criar simulacoes.", "error");
            return;
          }

          openLoanModal("create");
          setSimulationMode(null);
        });
      }

      if (!newLoanButton.dataset.simLoanBound) {
        newLoanButton.dataset.simLoanBound = "true";
        newLoanButton.addEventListener("click", function () {
          setLoanMode();
        }, true);
      }
      return;
    }

    const toolbar = newLoanButton.parentElement;
    if (!toolbar) return;

    let actionsContainer = toolbar.querySelector("[data-loan-header-actions]");
    if (!(actionsContainer instanceof HTMLElement)) {
      actionsContainer = document.createElement("div");
      actionsContainer.setAttribute("data-loan-header-actions", "true");
      actionsContainer.className = "flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end";
      toolbar.appendChild(actionsContainer);
    }

    if (newLoanButton.parentElement !== actionsContainer) {
      actionsContainer.appendChild(newLoanButton);
    }

    newLoanButton.classList.add("min-h-[44px]", "px-5");

    const simulationButton = document.createElement("button");
    simulationButton.id = "newLoanSimulationBtn";
    simulationButton.type = "button";
    simulationButton.className = newLoanButton.className;
    simulationButton.innerHTML = '<i class="fas fa-flask mr-2"></i>Nova simulacao';
    actionsContainer.insertBefore(simulationButton, newLoanButton);

    simulationButton.addEventListener("click", function () {
      if (!Array.isArray(loansState?.debtors) || loansState.debtors.length === 0) {
        showToast("Cadastre um cliente antes de criar simulacoes.", "error");
        return;
      }

      openLoanModal("create");
      setSimulationMode(null);
    });

    newLoanButton.addEventListener("click", function () {
      setLoanMode();
    }, true);
  }

  function injectSimulationActionButtons() {
    const footerActions = loanModal.querySelector(".modal-base__footer-actions");
    if (!footerActions) return;

    let wrapper = document.getElementById("loanSimulationActionRow");
    if (!(wrapper instanceof HTMLElement)) {
      wrapper = document.createElement("div");
      wrapper.id = "loanSimulationActionRow";
      wrapper.className = "hidden flex flex-wrap items-center justify-end gap-2";
      wrapper.innerHTML = `
        <button id="saveSimulationDraftBtn" type="button" class="modal-btn modal-btn--secondary">Salvar simulacao</button>
        <button id="loanSimulationWhatsappBtn" type="button" class="modal-btn modal-btn--secondary">Enviar WhatsApp</button>
      `;
      footerActions.insertBefore(wrapper, saveLoanButton);
    }

    actionRefs.container = wrapper;
    actionRefs.saveDraftBtn = wrapper.querySelector("#saveSimulationDraftBtn");
    actionRefs.whatsappBtn = wrapper.querySelector("#loanSimulationWhatsappBtn");

    if (actionRefs.saveDraftBtn && !actionRefs.saveDraftBtn.dataset.simBound) {
      actionRefs.saveDraftBtn.dataset.simBound = "true";
      actionRefs.saveDraftBtn.addEventListener("click", async function () {
        const simulation = await saveSimulationDraft(true);
        if (!simulation) return;
        if (typeof closeLoanModal === "function") {
          closeLoanModal();
        }
      });
    }

    if (actionRefs.whatsappBtn && !actionRefs.whatsappBtn.dataset.simBound) {
      actionRefs.whatsappBtn.dataset.simBound = "true";
      actionRefs.whatsappBtn.addEventListener("click", async function () {
        const simulation = await saveSimulationDraft(false);
        if (!simulation) return;
        const sent = await sendSimulationToWhatsApp(simulation.id, true);
        if (!sent) return;
        if (typeof closeLoanModal === "function") {
          closeLoanModal();
        }
      });
    }
  }

  function bindPendingSectionRefs(section) {
    pendingRefs.section = section;
    pendingRefs.statusFilter = section.querySelector("#simulationStatusFilter");
    pendingRefs.searchFilter = section.querySelector("#simulationSearchFilter");
    pendingRefs.mobileList = section.querySelector("#loanSimulationsMobileList");
    pendingRefs.tbody = section.querySelector("#loanSimulationsPendingBody");
    pendingRefs.emptyState = section.querySelector("#loanSimulationsEmptyState");
  }

  function bindPendingSectionListeners() {
    if (!(pendingRefs.section instanceof HTMLElement)) return;
    if (pendingRefs.section.dataset.simBound === "true") return;
    pendingRefs.section.dataset.simBound = "true";

    pendingRefs.statusFilter?.addEventListener("change", function () {
      void refreshPendingSimulations();
    });

    pendingRefs.searchFilter?.addEventListener("input", function () {
      renderPendingSimulationsRows();
    });

    pendingRefs.section.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest("button[data-simulation-action]");
      if (!button) return;

      const action = button.getAttribute("data-simulation-action");
      const simulationId = button.getAttribute("data-id");
      if (!simulationId) return;

      if (action === "open") {
        const simulation = simulationState.pendingRows.find((item) => String(item.id) === String(simulationId));
        if (simulation) {
          applySimulationToForm(simulation);
        }
        return;
      }

      if (action === "send") {
        void runSimulationAction(action, simulationId, button, async function () {
          await sendSimulationToWhatsApp(simulationId, true);
        });
        return;
      }

      if (action === "approve") {
        void runSimulationAction(action, simulationId, button, async function () {
          await approveSimulation(simulationId, true);
        });
        return;
      }

      if (action === "cancel") {
        void runSimulationAction(action, simulationId, button, async function () {
          await cancelSimulation(simulationId, true);
        });
      }
    });
  }

  function injectPendingSection() {
    const existingSection = document.getElementById("loanSimulationsPendingSection");
    if (existingSection instanceof HTMLElement) {
      bindPendingSectionRefs(existingSection);
      bindPendingSectionListeners();
      return;
    }

    const anchor = document.querySelector("main > .rounded-2xl.border");
    if (!anchor || !anchor.parentElement) return;

    const section = document.createElement("section");
    section.id = "loanSimulationsPendingSection";
    section.className = "mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm";
    section.innerHTML = `
      <div class="mb-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-800">Simula&ccedil;&otilde;es pendentes</h3>
        </div>
      </div>

      <div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div class="md:col-span-2">
          <label class="mb-1 block text-sm text-gray-600">Buscar</label>
          <input id="simulationSearchFilter" type="text" class="filter-control" placeholder="Cliente ou ID da simulacao">
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-600">Status</label>
          <select id="simulationStatusFilter" class="filter-control">
            <option value="SIMULATED">Simulada</option>
            <option value="CONVERTED">Convertida</option>
            <option value="DISCARDED">Descartada</option>
            <option value="">Todos</option>
          </select>
        </div>
      </div>

      <div id="loanSimulationsMobileList" class="sm:hidden space-y-3">
        <div class="rounded-2xl border border-gray-200 bg-slate-50 p-4 text-center text-sm text-gray-500">
          Carregando simulacoes...
        </div>
      </div>

      <div class="hidden sm:block">
        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Principal</th>
                <th>Total</th>
                <th>Parcelas</th>
                <th>Juros</th>
                <th>Situa&ccedil;&atilde;o</th>
                <th>Validade</th>
                <th>A&ccedil;&otilde;es</th>
              </tr>
            </thead>
            <tbody id="loanSimulationsPendingBody">
              <tr>
                <td colspan="9" class="px-3 py-4 text-center text-xs text-slate-500">Carregando simulacoes...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p id="loanSimulationsEmptyState" class="mt-3 hidden rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">Nenhuma simulacao encontrada para os filtros aplicados.</p>
    `;

    anchor.parentElement.insertBefore(section, anchor.nextSibling);

    bindPendingSectionRefs(section);
    bindPendingSectionListeners();
  }

  function getStatusBadgeClass(status) {
    const value = String(status || "").toUpperCase();
    if (value === "CONVERTED") return "badge badge-sim-accepted";
    if (value === "DISCARDED") return "badge badge-sim-canceled";
    if (value === "SIMULATED") return "badge badge-sim-draft";
    return "badge badge-sim-draft";
  }

  function getStatusLabel(status) {
    const value = String(status || "").toUpperCase();
    if (value === "SIMULATED") return "Simulada";
    if (value === "CONVERTED") return "Convertida";
    if (value === "DISCARDED") return "Descartada";
    return value || "-";
  }

  function resolveStatusLabel(row) {
    const statusCode = String(row?.status || "").trim();
    if (statusCode) return getStatusLabel(statusCode);

    const fallbackLabel = String(row?.statusLabel || "").trim();
    if (fallbackLabel) return getStatusLabel(fallbackLabel);

    return "-";
  }

  function formatInterestTypeLabel(value) {
    const type = String(value || "").toLowerCase();
    if (type === "simples") return "Simples";
    if (type === "fixo") return "Fixo";
    return "Composto";
  }

  function formatSimulationInterestPrimary(row) {
    const type = String(row?.interestType || "").toLowerCase();
    if (type === "fixo") {
      const fixedValue = row?.fixedFeeAmount ?? row?.interestRate ?? 0;
      return formatCurrency(fixedValue);
    }

    const rate = round2(row?.interestRate ?? 0);
    return `${rate}%`;
  }

  function getFilteredPendingRows() {
    const rows = Array.isArray(simulationState.pendingRows) ? simulationState.pendingRows : [];
    const term = normalizeSearchText(pendingRefs.searchFilter?.value || "");
    if (!term) return rows;

    return rows.filter((row) => {
      const displayId = String(row.displayId ?? "");
      const rawId = String(row.id ?? "");
      const shortId = rawId.slice(0, 8);
      const clientName = String(row.client?.name || "");
      const clientId = String(row.clientId ?? "");
      const haystack = normalizeSearchText(`${displayId} ${rawId} ${shortId} ${clientName} ${clientId}`);
      return haystack.includes(term);
    });
  }

  function buildSimulationActionButtons(row) {
    const actions = [];
    if (row.status === "SIMULATED") {
      actions.push(`<button type="button" class="action-btn action-btn-edit rounded-md p-2 transition-colors duration-150 hover:bg-slate-100" data-simulation-action="open" data-id="${row.id}" title="Editar"><i class="fas fa-pen-to-square"></i></button>`);
    }

    if (row.status === "SIMULATED") {
      actions.push(`<button type="button" class="action-btn action-btn-edit rounded-md p-2 transition-colors duration-150 hover:bg-slate-100" data-simulation-action="send" data-id="${row.id}" title="Reenviar WhatsApp"><i class="fab fa-whatsapp"></i></button>`);
      actions.push(`<button type="button" class="action-btn action-btn-edit rounded-md p-2 transition-colors duration-150 hover:bg-slate-100" data-simulation-action="approve" data-id="${row.id}" title="Aprovar"><i class="fas fa-check"></i></button>`);
      actions.push(`<button type="button" class="action-btn action-btn-delete rounded-md p-2 transition-colors duration-150 hover:bg-slate-100" data-simulation-action="cancel" data-id="${row.id}" title="Descartar"><i class="fas fa-ban"></i></button>`);
    }

    return actions;
  }

  function renderPendingSimulationsMobileList(rows) {
    if (!pendingRefs.mobileList) return;

    pendingRefs.mobileList.innerHTML = rows.map((row) => {
      const actions = buildSimulationActionButtons(row);
      return `
        <div class="rounded-2xl border border-gray-200 bg-slate-50 p-4 shadow-sm" data-simulation-id="${row.id}">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[11px] uppercase tracking-wide text-gray-500">Simulacao #${row.displayId || "-"}</div>
              <div class="mt-1 truncate text-base font-semibold text-gray-900">${row.client?.name || `Cliente #${row.clientId}`}</div>
            </div>
            <div class="text-right">
              <div class="text-[11px] uppercase tracking-wide text-gray-500">Total</div>
              <div class="mt-1 text-base font-extrabold text-gray-900">${formatCurrency(row.totals?.totalAmount)}</div>
            </div>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700">
            <div><span class="text-[11px] uppercase tracking-wide text-gray-500">Principal:</span> <span class="font-semibold text-gray-800">${formatCurrency(row.principalAmount)}</span></div>
            <div><span class="text-[11px] uppercase tracking-wide text-gray-500">Parcelas:</span> <span class="font-semibold text-gray-800">${row.installmentsCount}x</span></div>
            <div><span class="text-[11px] uppercase tracking-wide text-gray-500">Juros:</span> <span class="font-semibold text-gray-800">${formatSimulationInterestPrimary(row)}</span></div>
            <div><span class="text-[11px] uppercase tracking-wide text-gray-500">Validade:</span> <span class="font-semibold text-gray-800">${formatDate((row.expiresAt || "").slice(0, 10))}</span></div>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span class="${getStatusBadgeClass(row.status)}">${resolveStatusLabel(row)}</span>
          </div>

          <div class="mt-3 flex items-center justify-end gap-1">
            ${actions.length ? actions.join("") : '<span class="text-xs text-slate-500">-</span>'}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPendingSimulationsRows() {
    if (!pendingRefs.tbody) return;
    const rows = getFilteredPendingRows();

    if (!Array.isArray(rows) || rows.length === 0) {
      pendingRefs.tbody.innerHTML = "";
      if (pendingRefs.mobileList) {
        pendingRefs.mobileList.innerHTML = "";
      }
      if (pendingRefs.emptyState) {
        pendingRefs.emptyState.classList.remove("hidden");
      }
      return;
    }

    if (pendingRefs.emptyState) {
      pendingRefs.emptyState.classList.add("hidden");
    }

    renderPendingSimulationsMobileList(rows);

    pendingRefs.tbody.innerHTML = rows.map((row) => {
      const actions = buildSimulationActionButtons(row);

      return `
        <tr>
          <td class="font-mono text-xs">${row.displayId ? `#${row.displayId}` : "-"}</td>
          <td>${row.client?.name || `Cliente #${row.clientId}`}</td>
          <td>${formatCurrency(row.principalAmount)}</td>
          <td>${formatCurrency(row.totals?.totalAmount)}</td>
          <td>${row.installmentsCount}x</td>
          <td>
            <div class="leading-tight">
              <div class="font-semibold text-slate-800">${formatSimulationInterestPrimary(row)}</div>
              <div class="mt-0.5 text-xs text-slate-500">${formatInterestTypeLabel(row.interestType)}</div>
            </div>
          </td>
          <td><span class="${getStatusBadgeClass(row.status)}">${resolveStatusLabel(row)}</span></td>
          <td>${formatDate((row.expiresAt || "").slice(0, 10))}</td>
          <td>
            ${actions.length ? `<div class="flex items-center gap-1">${actions.join("")}</div>` : '<span class="text-xs text-slate-500">-</span>'}
          </td>
        </tr>
      `;
    }).join("");
  }

  async function requestJson(url, options) {
    const response = await fetch(url, Object.assign({ credentials: "include" }, options || {}));
    const payload = await response.json().catch(function () { return null; });

    if (!response.ok) {
      const message = payload && payload.message ? payload.message : `Falha HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  function buildPendingQueryString() {
    const params = new URLSearchParams();

    const status = pendingRefs.statusFilter?.value || "";
    if (status) params.set("status", status);

    const query = params.toString();
    return query ? `?${query}` : "";
  }

  async function refreshPendingSimulations() {
    if (!pendingRefs.tbody) return;

    pendingRefs.tbody.innerHTML = '<tr><td colspan="9" class="px-3 py-4 text-center text-xs text-slate-500">Carregando simulacoes...</td></tr>';
    if (pendingRefs.mobileList) {
      pendingRefs.mobileList.innerHTML = `
        <div class="rounded-2xl border border-gray-200 bg-slate-50 p-4 text-center text-sm text-gray-500">
          Carregando simulacoes...
        </div>
      `;
    }

    try {
      const payload = await requestJson(`/api/loan-simulations${buildPendingQueryString()}`);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      simulationState.pendingRows = rows.map((row, index) => ({
        ...row,
        displayId: index + 1,
      }));
      renderPendingSimulationsRows();
    } catch (error) {
      console.error("Erro ao carregar simulacoes:", error);
      pendingRefs.tbody.innerHTML = '<tr><td colspan="9" class="px-3 py-4 text-center text-xs text-red-600">Erro ao carregar simulacoes.</td></tr>';
      if (pendingRefs.mobileList) {
        pendingRefs.mobileList.innerHTML = `
          <div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
            Erro ao carregar simulacoes.
          </div>
        `;
      }
      if (pendingRefs.emptyState) pendingRefs.emptyState.classList.add("hidden");
      showToast(error instanceof Error ? error.message : "Erro ao carregar simulacoes.", "error");
    }
  }

  function buildSimulationPayloadFromForm(result) {
    const values = result.values;
    const calcResult = result.calcResult;
    const plan = Array.isArray(result.plan) ? result.plan : [];

    return {
      ...(simulationState.currentSimulationId ? { id: simulationState.currentSimulationId } : {}),
      clientId: Number(values.debtorId),
      principalAmount: round2(values.principal),
      interestType: values.interestType,
      interestRate: values.interestType === "fixo" ? 0 : round2(values.interestRate),
      fixedFeeAmount: values.interestType === "fixo" ? round2(values.fixedAddition) : 0,
      installmentsCount: Math.max(1, Math.trunc(toNumber(values.installments))),
      startDate: values.startDate,
      firstDueDate: plan[0]?.due_date || values.firstDueDate,
      dueDates: plan.map((item) => item.due_date),
      observations: values.observations || "",
      _preview: {
        totalAmount: calcResult.totalAmount,
        installmentAmount: calcResult.installmentAmount,
      },
    };
  }

  function applySimulationToForm(simulation) {
    if (!simulation) return;

    openLoanModal("create");
    setSimulationMode(simulation.id);

    const debtorInput = document.getElementById("loanDebtor");
    const principalInput = document.getElementById("loanPrincipal");
    const interestTypeInput = document.getElementById("loanInterestType");
    const interestRateInput = document.getElementById("loanInterestRate");
    const fixedAdditionInput = document.getElementById("loanFixedAddition");
    const installmentsInput = document.getElementById("loanInstallments");
    const observationsInput = document.getElementById("loanObservations");

    if (debtorInput) debtorInput.value = String(simulation.clientId);
    if (principalInput) principalInput.value = typeof formatCurrencyInput === "function"
      ? formatCurrencyInput(simulation.principalAmount)
      : String(round2(simulation.principalAmount));
    if (interestTypeInput) interestTypeInput.value = simulation.interestType;

    if (interestRateInput) {
      interestRateInput.value = simulation.interestType === "fixo"
        ? "0"
        : String(round2(simulation.interestRate));
    }

    if (fixedAdditionInput) {
      fixedAdditionInput.value = simulation.interestType === "fixo"
        ? String(round2(simulation.fixedFeeAmount || 0))
        : "0";
    }

    if (installmentsInput) installmentsInput.value = String(simulation.installmentsCount || 1);
    if (observationsInput) observationsInput.value = simulation.observations || "";

    if (typeof setDateInputValue === "function") {
      setDateInputValue(document.getElementById("loanStartDate"), simulation.startDate || simulation.firstDueDate);
      setDateInputValue(document.getElementById("loanFirstDueDate"), simulation.firstDueDate);
    }

    if (loanFormState && Array.isArray(simulation.schedule)) {
      loanFormState.schedule = simulation.schedule.map((row, index) => ({
        installment_number: index + 1,
        due_date: row.dueDate,
      }));
    }

    if (typeof updateInterestTypeVisibility === "function") {
      updateInterestTypeVisibility();
    }
    if (typeof syncInstallmentsInputMode === "function") {
      syncInstallmentsInputMode();
    }

    calculateLoanFromForm(false);
  }

  async function saveSimulationDraft(showSuccess) {
    if (simulationState.mode !== "simulation") return null;

    const result = calculateLoanFromForm(true);
    if (!result) return null;

    try {
      const payload = buildSimulationPayloadFromForm(result);
      const response = await requestJson("/api/loan-simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const simulation = response?.data;
      simulationState.currentSimulationId = simulation?.id || null;
      updateSimulationModeUi();

      if (showSuccess) {
        showToast("Simulacao salva no banco com sucesso.", "success");
      }

      await refreshPendingSimulations();
      return simulation;
    } catch (error) {
      console.error("Erro ao salvar simulacao:", error);
      showToast(error instanceof Error ? error.message : "Falha ao salvar simulacao.", "error");
      return null;
    }
  }

  async function sendSimulationToWhatsApp(simulationId, showFeedback) {
    try {
      const response = await requestJson(`/api/loan-simulations/${encodeURIComponent(simulationId)}/send`, {
        method: "POST",
      });

      const message = response?.data?.whatsappMessage || "";
      const whatsappUrl = response?.data?.whatsappUrl || "";

      if (whatsappUrl) {
        window.open(whatsappUrl, "_blank", "noopener");
      }

      if (message && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(message);
          if (showFeedback) {
            showToast("WhatsApp aberto e mensagem copiada.", "success");
          }
        } catch (_error) {
          if (showFeedback) {
            showToast("WhatsApp aberto. Copie e cole a mensagem na conversa.", "success");
          }
        }
      } else if (showFeedback) {
        showToast("Simulacao marcada como enviada.", "success");
      }

      await refreshPendingSimulations();
      return response?.data;
    } catch (error) {
      console.error("Erro ao enviar simulacao por WhatsApp:", error);
      showToast(error instanceof Error ? error.message : "Falha no envio da simulacao.", "error");
      return null;
    }
  }

  async function approveSimulation(simulationId, showFeedback) {
    try {
      const response = await requestJson(`/api/loan-simulations/${encodeURIComponent(simulationId)}/approve`, {
        method: "POST",
      });

      if (showFeedback) {
        const loanId = response?.data?.loanId;
        if (!loanId || response?.data?.status !== "CONVERTED") {
          throw new Error("A simulacao ainda nao possui um emprestimo vinculado.");
        }
        showToast(`Simulacao aprovada. Emprestimo #${loanId} criado.`, "success");
      }

      if (simulationState.currentSimulationId === simulationId) {
        simulationState.currentSimulationId = null;
        setLoanMode();

        const cancelButton = document.getElementById("cancelLoanModalBtn");
        if (cancelButton) {
          cancelButton.click();
        }
      }

      if (typeof loadLoansData === "function") {
        await loadLoansData();
      }
      await refreshPendingSimulations();
      return response?.data;
    } catch (error) {
      console.error("Erro ao aprovar simulacao:", error);
      showToast(error instanceof Error ? error.message : "Falha ao aprovar simulacao.", "error");
      return null;
    }
  }

  async function cancelSimulation(simulationId, showFeedback) {
    try {
      await requestJson(`/api/loan-simulations/${encodeURIComponent(simulationId)}/cancel`, {
        method: "POST",
      });

      if (showFeedback) {
        showToast("Simulacao descartada.", "success");
      }

      if (simulationState.currentSimulationId === simulationId) {
        simulationState.currentSimulationId = null;
        setLoanMode();
      }

      await refreshPendingSimulations();
      return true;
    } catch (error) {
      console.error("Erro ao descartar simulacao:", error);
      showToast(error instanceof Error ? error.message : "Falha ao descartar simulacao.", "error");
      return false;
    }
  }

  function interceptLoanFormSubmitForSimulation() {
    loanForm.addEventListener("submit", function (event) {
      if (simulationState.mode !== "simulation") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void saveSimulationDraft(true);
    }, true);
  }

  function patchModalLifecycleToResetMode() {
    const originalCloseLoanModal = closeLoanModal;
    if (typeof originalCloseLoanModal === "function") {
      closeLoanModal = function patchedCloseLoanModal() {
        const result = originalCloseLoanModal.apply(this, arguments);
        setLoanMode();
        return result;
      };
    }
  }

  function initialize() {
    injectNewSimulationButton();
    injectSimulationActionButtons();
    injectPendingSection();
    interceptLoanFormSubmitForSimulation();
    patchModalLifecycleToResetMode();
    void refreshPendingSimulations();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
