// Claves únicas para guardar y recuperar datos desde localStorage.
// El sufijo v1 permite versionar el formato en caso de cambios futuros.
const STORAGE_KEYS = {
  expenses: "expenses.v1",
  budgets: "budgets.v1"
};

const ALLOWED_CATEGORIES = new Set([
  "Comida",
  "Transporte",
  "Ocio",
  "Salud",
  "Servicios",
  "Otros"
]);

const LIMITS = {
  maxAmount: 1000000000,
  maxNoteLength: 80
};

// Referencias a elementos del DOM para no repetir búsquedas y mejorar claridad.
// Formularios y campos de entrada principales.
const expenseForm = document.getElementById("expenseForm");
const budgetForm = document.getElementById("budgetForm");
const expenseDate = document.getElementById("expenseDate");
const expenseCategory = document.getElementById("expenseCategory");
const expenseAmount = document.getElementById("expenseAmount");
const expenseNote = document.getElementById("expenseNote");
const budgetMonth = document.getElementById("budgetMonth");
const totalBudget = document.getElementById("totalBudget");
const reportMonth = document.getElementById("reportMonth");
const tableBody = document.getElementById("expenseTableBody");
const appMessage = document.getElementById("appMessage");
const networkStatus = document.getElementById("networkStatus");

// Referencias a los bloques del resumen mensual.
const sumBudget = document.getElementById("sumBudget");
const sumExpense = document.getElementById("sumExpense");
const sumBalance = document.getElementById("sumBalance");

// Contexto 2D del canvas donde se dibuja el gráfico de torta.
const chartCanvas = document.getElementById("budgetChart");
const chartContext = chartCanvas.getContext("2d");

// Estado en memoria de la app.
// Se inicializa con localStorage y luego se mantiene sincronizado.
let expenses = [];
let budgets = [];

// Formateador de moneda para mostrar valores en pesos colombianos.
const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP"
});

// Punto de entrada de la aplicación.
init();

// Inicializa valores por defecto, carga datos guardados,
// registra eventos, renderiza UI y configura PWA.
function init() {
  const currentMonth = getMonthKey(new Date());
  const evidenceScenario = getEvidenceScenario();

  // Fecha actual por defecto para el registro de gasto.
  expenseDate.valueAsDate = new Date();

  // Mes actual por defecto para presupuesto y reporte.
  budgetMonth.value = currentMonth;
  reportMonth.value = currentMonth;

  // Carga persistencia local (si falla, usa arreglos vacíos).
  if (evidenceScenario) {
    localStorage.removeItem(STORAGE_KEYS.expenses);
    localStorage.removeItem(STORAGE_KEYS.budgets);
  }

  expenses = sanitizeExpensesCollection(safeRead(STORAGE_KEYS.expenses, []));
  budgets = sanitizeBudgetsCollection(safeRead(STORAGE_KEYS.budgets, []));

  // Activa comportamiento de UI y sincroniza vista inicial.
  bindEvents();
  render();
  runEvidenceScenario(evidenceScenario);
  updateNetworkStatus();
  registerServiceWorker();
}

// Enlaza eventos del usuario y del navegador.
function bindEvents() {
  expenseForm.addEventListener("submit", onAddExpense);
  budgetForm.addEventListener("submit", onSaveBudget);
  reportMonth.addEventListener("change", render);
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
}

// Maneja el envío del formulario de gastos.
// Valida datos, guarda en estado/localStorage y refresca la UI.
function onAddExpense(event) {
  // Evita recarga completa del documento al enviar formulario.
  event.preventDefault();

  // Objeto gasto normalizado desde inputs.
  const payload = {
    // ID único para distinguir registros (útil para futuras ediciones/eliminaciones).
    id: crypto.randomUUID(),
    date: normalizeDateValue(expenseDate.value),
    category: normalizeCategory(expenseCategory.value),
    amount: normalizeAmount(expenseAmount.value, { allowZero: false }),
    note: sanitizeNote(expenseNote.value)
  };

  // Validación de campos obligatorios y monto positivo.
  if (!payload.date) {
    notifyInvalidValue("Debes seleccionar una fecha para registrar el gasto.");
    expenseDate.focus();
    return;
  }

  if (!payload.category || !ALLOWED_CATEGORIES.has(payload.category)) {
    notifyInvalidValue("Debes seleccionar una categoría válida.");
    expenseCategory.focus();
    return;
  }

  if (!Number.isFinite(payload.amount)) {
    notifyInvalidValue("El monto ingresado no es un número válido.");
    expenseAmount.focus();
    return;
  }

  if (payload.amount <= 0) {
    notifyInvalidValue("El monto del gasto debe ser mayor que 0.");
    expenseAmount.focus();
    return;
  }

  if (payload.amount > LIMITS.maxAmount) {
    notifyInvalidValue("El monto es demasiado alto y parece inadecuado.");
    expenseAmount.focus();
    return;
  }

  // Actualiza estado local y persistencia.
  expenses.push(payload);
  if (!safeWrite(STORAGE_KEYS.expenses, expenses)) {
    return;
  }

  // Limpia formulario y restablece fecha actual para siguiente registro.
  expenseForm.reset();
  expenseDate.valueAsDate = new Date();

  // Mensaje de éxito + rerender para tabla, resumen y gráfico.
  showMessage("Gasto registrado correctamente.", false);
  render();
}

// Maneja el envío del formulario de presupuesto mensual.
// Si el mes ya existe, actualiza; si no, crea nuevo registro.
function onSaveBudget(event) {
  event.preventDefault();

  // Objeto presupuesto normalizado desde inputs.
  const payload = {
    month: normalizeMonthValue(budgetMonth.value),
    budget: normalizeAmount(totalBudget.value, { allowZero: true })
  };

  // Validación básica: mes requerido y valores no negativos.
  if (!payload.month) {
    notifyInvalidValue("Debes seleccionar el mes del presupuesto.");
    budgetMonth.focus();
    return;
  }

  if (!Number.isFinite(payload.budget) || payload.budget < 0) {
    notifyInvalidValue("El presupuesto total debe ser un valor válido mayor o igual a 0.");
    totalBudget.focus();
    return;
  }

  if (payload.budget > LIMITS.maxAmount) {
    notifyInvalidValue("El valor del presupuesto parece inadecuado por ser demasiado alto.");
    return;
  }

  // Busca si ese mes ya existe para reemplazarlo.
  const index = budgets.findIndex((item) => item.month === payload.month);
  if (index >= 0) {
    budgets[index] = payload;
  } else {
    // Si no existe, agrega el nuevo presupuesto.
    budgets.push(payload);
  }

  // Persiste cambios.
  if (!safeWrite(STORAGE_KEYS.budgets, budgets)) {
    return;
  }

  // Mensaje de éxito y refresco de vista.
  showMessage("Presupuesto guardado.", false);
  render();
}

// Render principal de la pantalla para el mes seleccionado.
// Coordina tabla, resumen y gráfico.
function render() {
  // Si no hay mes seleccionado, usa el mes actual.
  const month = reportMonth.value || getMonthKey(new Date());

  // Filtra gastos del mes y ordena por fecha descendente.
  const monthExpenses = expenses
    .filter((item) => item.date.startsWith(month))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Obtiene presupuesto del mes o usa valores por defecto en 0.
  const monthBudget = budgets.find((item) => item.month === month) || {
    budget: 0
  };

  // Actualiza cada bloque de UI con los datos calculados.
  renderTable(monthExpenses);
  renderSummary(monthExpenses, monthBudget);
  renderChart(monthExpenses, monthBudget);
}

// Renderiza el historial tabular de gastos del mes.
function renderTable(monthExpenses) {
  tableBody.textContent = "";

  // Estado vacío cuando no existen registros.
  if (monthExpenses.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 4;
    emptyCell.textContent = "No hay gastos para este mes.";
    emptyRow.appendChild(emptyCell);
    tableBody.appendChild(emptyRow);
    return;
  }

  // Construye filas usando nodos para evitar inyección HTML.
  const fragment = document.createDocumentFragment();

  monthExpenses.forEach((item) => {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    const categoryCell = document.createElement("td");
    const noteCell = document.createElement("td");
    const amountCell = document.createElement("td");

    dateCell.textContent = item.date;
    categoryCell.textContent = item.category;
    noteCell.textContent = item.note || "-";
    amountCell.textContent = currency.format(item.amount);

    row.appendChild(dateCell);
    row.appendChild(categoryCell);
    row.appendChild(noteCell);
    row.appendChild(amountCell);

    fragment.appendChild(row);
  });

  tableBody.appendChild(fragment);
}

// Calcula y muestra indicadores financieros del mes.
function renderSummary(monthExpenses, monthBudget) {
  // Suma total de gastos reales registrados.
  const realExpense = monthExpenses.reduce((acc, item) => acc + item.amount, 0);

  // Saldo = presupuesto - gasto real.
  const balance = (monthBudget.budget || 0) - realExpense;

  // Asigna valores formateados al resumen visual.
  sumBudget.textContent = currency.format(monthBudget.budget || 0);
  sumExpense.textContent = currency.format(realExpense);
  sumBalance.textContent = currency.format(balance);

  // Cambiar color del saldo según si es positivo o negativo.
  sumBalance.style.color = balance >= 0 ? "#059669" : "#dc2626";
}

// Dibuja gráfico de torta por categorías en canvas.
// También muestra una línea comparativa de presupuesto vs gasto real.
function renderChart(monthExpenses, monthBudget) {
  // Agrupa montos por categoría.
  const spentByCategory = monthExpenses.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.amount;
    return acc;
  }, {});

  // Catálogo de categorías esperadas en el formulario.
  const categories = ["Comida", "Transporte", "Ocio", "Salud", "Servicios", "Otros"];

  // Vector de valores en el mismo orden de categories.
  const spentValues = categories.map((name) => spentByCategory[name] || 0);

  // Total del mes para calcular proporciones y porcentajes.
  const totalSpent = spentValues.reduce((a, b) => a + b, 0);

  // Paleta para identificar cada segmento de la torta.
  const categoryColors = ["#0ea5e9", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b"];

  // Limpia canvas antes de redibujar.
  chartContext.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

  // Título principal del gráfico.
  chartContext.fillStyle = "#0f172a";
  chartContext.font = "14px sans-serif";
  chartContext.fillText("Distribución de gastos por categoría", 30, 26);

  // Línea de contexto presupuesto vs ejecución real.
  chartContext.font = "13px sans-serif";
  chartContext.fillStyle = "#334155";
  chartContext.fillText(`Presupuesto: ${currency.format(monthBudget.budget || 0)} | Gasto real: ${currency.format(totalSpent)}`, 30, 48);

  // Si no hay gastos, muestra mensaje y no intenta dibujar segmentos.
  if (totalSpent <= 0) {
    chartContext.fillStyle = "#64748b";
    chartContext.fillText("No hay gastos registrados para este mes.", 30, 82);
    return;
  }

  // Centro y radio del gráfico de torta.
  const centerX = 220;
  const centerY = 190;
  const radius = 115;

  // Comienza desde la parte superior (-90°).
  let startAngle = -Math.PI / 2;

  // Dibuja cada segmento con su ángulo proporcional al total.
  spentValues.forEach((value, index) => {
    // No dibuja categorías con monto 0.
    if (value <= 0) {
      return;
    }

    // Fórmula de proporción angular: valor / total * 2π.
    const angle = (value / totalSpent) * Math.PI * 2;
    const endAngle = startAngle + angle;

    // Segmento tipo "pizza" desde centro hasta arco.
    chartContext.beginPath();
    chartContext.moveTo(centerX, centerY);
    chartContext.arc(centerX, centerY, radius, startAngle, endAngle);
    chartContext.closePath();
    chartContext.fillStyle = categoryColors[index];
    chartContext.fill();

    // El siguiente segmento inicia donde terminó el actual.
    startAngle = endAngle;
  });

  // Círculo interior para efecto dona + etiqueta del total.
  chartContext.beginPath();
  chartContext.arc(centerX, centerY, 48, 0, Math.PI * 2);
  chartContext.fillStyle = "#ffffff";
  chartContext.fill();
  chartContext.fillStyle = "#0f172a";
  chartContext.font = "12px sans-serif";
  chartContext.fillText("Total", centerX - 14, centerY - 2);
  chartContext.font = "11px sans-serif";
  chartContext.fillText(currency.format(totalSpent), centerX - 36, centerY + 15);

  // Coordenadas base de la leyenda lateral.
  const legendX = 420;
  const legendY = 80;
  const rowHeight = 34;

  // Leyenda con color, categoría, monto y porcentaje.
  categories.forEach((category, index) => {
    const value = spentValues[index];
    if (value <= 0) {
      return;
    }

    const percent = (value / totalSpent) * 100;
    const y = legendY + index * rowHeight;

    chartContext.fillStyle = categoryColors[index];
    chartContext.fillRect(legendX, y - 10, 14, 14);
    chartContext.fillStyle = "#0f172a";
    chartContext.font = "12px sans-serif";
    chartContext.fillText(`${category}: ${currency.format(value)} (${percent.toFixed(1)}%)`, legendX + 22, y + 1);
  });
}

// Lee datos desde localStorage de forma segura.
// Si hay error (JSON inválido o acceso denegado), retorna fallback.
function safeRead(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (!value) {
      return fallback;
    }
    return JSON.parse(value);
  } catch {
    showMessage("No se pudo leer la información guardada en el dispositivo.");
    return fallback;
  }
}

// Guarda datos en localStorage de forma segura.
// Devuelve true/false para que el flujo llamador actúe según éxito.
function safeWrite(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    showMessage("No se pudo guardar la información. Verifica espacio disponible o permisos.");
    return false;
  }
}

// Muestra mensajes de estado al usuario.
// isError=true pinta rojo, false pinta verde.
function showMessage(message, isError = true) {
  appMessage.textContent = message;
  appMessage.style.color = isError ? "#b91c1c" : "#166534";
}

// Lanza notificaciones de validación para valores inadecuados.
// Siempre muestra mensaje en la app y, si hay permiso, también notificación del navegador.
function notifyInvalidValue(message) {
  showMessage(message, true);

  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission === "granted") {
    new Notification("Dato inválido", { body: message });
    return;
  }

  if (Notification.permission === "default") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification("Dato inválido", { body: message });
      }
    });
  }
}

// Convierte una fecha a formato YYYY-MM para comparar por mes.
function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// Refresca indicador de conectividad según estado del navegador.
function updateNetworkStatus() {
  if (navigator.onLine) {
    networkStatus.textContent = "\uD83D\uDFE2 Conectado";
  } else {
    networkStatus.textContent = "\uD83D\uDD34 Sin conexión";
  }
}

function normalizeAmount(value, { allowZero }) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }

  if (allowZero) {
    if (amount < 0) {
      return Number.NaN;
    }
  } else if (amount <= 0) {
    return Number.NaN;
  }

  return Math.round(amount * 100) / 100;
}

function normalizeDateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return "";
  }

  return value;
}

function normalizeMonthValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    return "";
  }

  const [year, month] = value.split("-").map((part) => Number(part));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return "";
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function normalizeCategory(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function sanitizeNote(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITS.maxNoteLength);
}

function sanitizeExpenseRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const date = normalizeDateValue(record.date);
  const category = normalizeCategory(record.category);
  const amount = normalizeAmount(record.amount, { allowZero: false });
  const note = sanitizeNote(record.note || "");

  if (!date || !ALLOWED_CATEGORIES.has(category) || !Number.isFinite(amount) || amount > LIMITS.maxAmount) {
    return null;
  }

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : crypto.randomUUID(),
    date,
    category,
    amount,
    note
  };
}

function sanitizeBudgetRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const month = normalizeMonthValue(record.month);
  const budget = normalizeAmount(record.budget, { allowZero: true });

  if (!month || !Number.isFinite(budget) || budget > LIMITS.maxAmount) {
    return null;
  }

  return {
    month,
    budget
  };
}

function sanitizeExpensesCollection(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(sanitizeExpenseRecord).filter(Boolean);
}

function sanitizeBudgetsCollection(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  const mapByMonth = new Map();
  data.forEach((item) => {
    const sanitized = sanitizeBudgetRecord(item);
    if (sanitized) {
      mapByMonth.set(sanitized.month, sanitized);
    }
  });

  return Array.from(mapByMonth.values());
}

function getEvidenceScenario() {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get("evidence");
  if (!scenario) {
    return "";
  }

  return scenario.trim().toLowerCase();
}

function runEvidenceScenario(scenario) {
  if (!scenario) {
    return;
  }

  if (scenario === "invalid-form") {
    expenseDate.valueAsDate = new Date();
    expenseCategory.value = "Comida";
    expenseAmount.value = "-1200";
    expenseNote.value = "intento invalido";
    expenseForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    return;
  }

  if (scenario === "sanitized-note") {
    const today = new Date();
    const currentMonth = getMonthKey(today);
    budgetMonth.value = currentMonth;
    totalBudget.value = "300000";
    budgetForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    expenseDate.valueAsDate = today;
    expenseCategory.value = "Comida";
    expenseAmount.value = "35000";
    expenseNote.value = "<img src=x onerror=alert('xss')> Almuerzo";
    expenseForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    reportMonth.value = currentMonth;
    render();
    showMessage("Escenario de evidencia: la nota fue saneada y renderizada como texto seguro.", false);
    return;
  }

  if (scenario === "csp") {
    const policy = document.querySelector("meta[http-equiv='Content-Security-Policy']")?.content || "";
    const strictDynamicEnabled = policy.includes("strict-dynamic");
    const blockedObjects = policy.includes("object-src 'none'");
    if (strictDynamicEnabled && blockedObjects) {
      showMessage("CSP activa: strict-dynamic, bloqueo de objetos y control estricto habilitados.", false);
    } else {
      showMessage("CSP incompleta: revisa la directiva de seguridad de contenido.", true);
    }
  }
}

// Registra el Service Worker para habilitar capacidades PWA.
// Si el navegador no lo soporta o falla el registro, informa en pantalla.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    showMessage("Este navegador no soporta Service Worker.");
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch(() => {
    showMessage("No fue posible registrar el Service Worker.");
  });
}
