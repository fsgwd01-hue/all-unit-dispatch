function checkSession() {
  const raw = localStorage.getItem("fs_auth_session");

  if (!raw) {
    window.location.href = "login.html";
    return;
  }

  try {
    const session = JSON.parse(raw);

    if (!session?.isLoggedIn || !session?.expiresAt) {
      localStorage.removeItem("fs_auth_session");
      window.location.href = "login.html";
      return;
    }

    if (Date.now() > session.expiresAt) {
      localStorage.removeItem("fs_auth_session");
      alert("Session expired. Please login again.");
      window.location.href = "login.html";
      return;
    }

  } catch (e) {
    localStorage.removeItem("fs_auth_session");
    window.location.href = "login.html";
  }
}


const tableBody = document.getElementById("tableBody");
const entryInfo = document.getElementById("entryInfo");
const pageInfo = document.getElementById("pageInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

const yearInput = document.getElementById("yearInput");
const globalSearch = document.getElementById("globalSearch");
const productInput = document.getElementById("productSearch");
const productToggleBtn = document.getElementById("productToggleBtn");
const productDropdown = document.getElementById("productDropdown");
const resetBtn = document.getElementById("resetBtn");

let currentPage = 1;
let totalPages = 1;
let totalRows = 0;
let limit = 100;

let currentYear = parseInt(yearInput.value, 10) || 2026;
let currentSearch = "";
let currentProduct = "";

let allProducts = [];
let autoFilterTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMt(value) {
  const num = Number(value || 0);

  if (!Number.isFinite(num) || num === 0) {
    return "-";
  }

  return num.toFixed(3);
}

const MONTH_KEYS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function getMonthBadge(value, prevValue) {
  const current = Number(value || 0);
  const previous = Number(prevValue || 0);

  if (!Number.isFinite(current) || current === 0) {
    return "-";
  }

  const formatted = current.toFixed(3);

  // highlight only when current month is lower than previous month
  if (Number.isFinite(previous) && previous > 0 && current < previous) {
    return `<span class="month-badge month-badge-down">${formatted}</span>`;
  }

  return formatted;
}

function showLoading() {
  tableBody.innerHTML = `
    <tr>
      <td colspan="17" class="loading-cell">Loading data...</td>
    </tr>
  `;
}

function showNoData(message = "No data found") {
  tableBody.innerHTML = `
    <tr>
      <td colspan="17" class="loading-cell">${escapeHtml(message)}</td>
    </tr>
  `;
  entryInfo.textContent = "Showing 0 to 0 of 0 entries";
  pageInfo.textContent = "Page 1 of 1";
  prevBtn.disabled = true;
  nextBtn.disabled = true;
}

function updatePagination() {
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

function renderTable(rows) {
  if (!rows || rows.length === 0) {
    showNoData("No matching records found");
    return;
  }

  const start = (currentPage - 1) * limit + 1;
  const end = start + rows.length - 1;
  entryInfo.textContent = `Showing ${start} to ${end} of ${totalRows} entries`;

  tableBody.innerHTML = rows.map((row) => {
    const monthCells = MONTH_KEYS.map((monthKey, index) => {
      const prevMonthKey = index > 0 ? MONTH_KEYS[index - 1] : null;
      const prevValue = prevMonthKey ? row[prevMonthKey] : null;
      return `<td>${getMonthBadge(row[monthKey], prevValue)}</td>`;
    }).join("");

    return `
      <tr>
        <td>${escapeHtml(row.DISTRICT || "-")}</td>
        <td>${escapeHtml(row.TALUKA || "-")}</td>
        <td>${escapeHtml(row.AREA || "-")}</td>
        <td>${escapeHtml(row.FIRM || "-")}</td>
        <td>${escapeHtml(row.PLANT_PRODUCT || "-")}</td>
        ${monthCells}
      </tr>
    `;
  }).join("");

  updatePagination();
}

function renderProducts(products) {
  if (!products || products.length === 0) {
    productDropdown.innerHTML = `<div class="product-item">No firm found</div>`;
    return;
  }

  productDropdown.innerHTML = products
    .map(item => `<div class="product-item" data-value="${escapeHtml(item)}">${escapeHtml(item)}</div>`)
    .join("");

  const items = productDropdown.querySelectorAll(".product-item");
  items.forEach((itemEl) => {
    itemEl.addEventListener("click", () => {
      const value = itemEl.dataset.value || "";
      productInput.value = value;
      productInput.dataset.selectedValue = value;
      currentProduct = value;
      productDropdown.classList.add("hidden");
      triggerAutoRefresh();
    });
  });
}

async function loadProducts(year) {
  try {
    const res = await fetch(`/api/products?year=${encodeURIComponent(year)}`);
    const data = await res.json();

    if (!res.ok) {
      console.error("Firm API error:", data);
      allProducts = [];
      renderProducts([]);
      return;
    }

    allProducts = Array.isArray(data) ? data : [];
    filterProducts(productInput.value.trim());
  } catch (err) {
    console.error("Firm fetch error:", err);
    allProducts = [];
    renderProducts([]);
  }
}

function filterProducts(query) {
  const q = String(query || "").trim().toLowerCase();

  let filtered = allProducts;
  if (q) {
    filtered = allProducts.filter((item) => item.toLowerCase().includes(q));
  }

  renderProducts(filtered);
}

async function loadData(page = 1) {
  try {
    currentPage = page;
    showLoading();

    const url = `/api/data?page=${encodeURIComponent(currentPage)}&year=${encodeURIComponent(currentYear)}&search=${encodeURIComponent(currentSearch)}&product=${encodeURIComponent(currentProduct)}`;

    const res = await fetch(url);
    const data = await res.json();

    console.log("API RESPONSE:", data);

    if (!res.ok) {
      showNoData(data?.error || "Failed to load data");
      return;
    }

    totalRows = Number(data.totalRows || 0);
    totalPages = Number(data.totalPages || 1);
    limit = Number(data.limit || 100);

    renderTable(data.rows || []);
  } catch (err) {
    console.error("Data fetch error:", err);
    showNoData("Something went wrong while loading data");
  }
}

function syncFiltersFromInputs() {
  currentYear = parseInt(yearInput.value, 10) || 2026;
  currentSearch = globalSearch.value.trim();
  currentProduct = (productInput.dataset.selectedValue || productInput.value || "").trim();
}

function triggerAutoRefresh() {
  clearTimeout(autoFilterTimer);

  autoFilterTimer = setTimeout(async () => {
    syncFiltersFromInputs();
    await loadProducts(currentYear);
    await loadData(1);
  }, 350);
}

productInput.addEventListener("input", () => {
  const raw = productInput.value.trim();
  const exactMatch = allProducts.find(
    (item) => item.toLowerCase() === raw.toLowerCase()
  );

  productInput.dataset.selectedValue = exactMatch || raw;
  filterProducts(raw);
  productDropdown.classList.remove("hidden");
  triggerAutoRefresh();
});

productInput.addEventListener("focus", () => {
  productInput.dataset.selectedValue = "";
  renderProducts(allProducts);
  productDropdown.classList.remove("hidden");
});

productToggleBtn.addEventListener("click", () => {
  productInput.dataset.selectedValue = "";
  renderProducts(allProducts);
  productDropdown.classList.toggle("hidden");
});

globalSearch.addEventListener("input", () => {
  triggerAutoRefresh();
});

yearInput.addEventListener("input", () => {
  triggerAutoRefresh();
});

resetBtn.addEventListener("click", async () => {
  yearInput.value = "2026";
  globalSearch.value = "";
  productInput.value = "";
  productInput.dataset.selectedValue = "";

  currentYear = 2026;
  currentSearch = "";
  currentProduct = "";
  currentPage = 1;

  productDropdown.classList.add("hidden");

  await loadProducts(currentYear);
  await loadData(1);
});

prevBtn.addEventListener("click", async () => {
  if (currentPage > 1) {
    await loadData(currentPage - 1);
  }
});

nextBtn.addEventListener("click", async () => {
  if (currentPage < totalPages) {
    await loadData(currentPage + 1);
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".product-select-wrap")) {
    productDropdown.classList.add("hidden");
  }
});

(async function init() {
  checkSession();   // 👈 YE ADD KARNA HAI

  syncFiltersFromInputs();
  await loadProducts(currentYear);
  await loadData(1);
})();