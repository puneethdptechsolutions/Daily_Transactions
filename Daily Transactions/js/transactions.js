import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// DOM Elements
const sidebarUserName = document.getElementById("sidebarUserName");
const sidebarUserEmail = document.getElementById("sidebarUserEmail");
const logoutBtn = document.getElementById("logoutBtn");

const showingMonthInput = document.getElementById("showingMonth");
const monthlyTotalText = document.getElementById("monthlyTotalText");
const txAlert = document.getElementById("txAlert");

const transactionForm = document.getElementById("transactionForm");
const txDateInput = document.getElementById("txDate");
const txDescriptionInput = document.getElementById("txDescription");
const txCostInput = document.getElementById("txCost");
const txCategoryInput = document.getElementById("txCategory");
const txModeInput = document.getElementById("txMode");
const txAccountInput = document.getElementById("txAccount");
const txRemarksInput = document.getElementById("txRemarks");
const saveTxBtn = document.getElementById("saveTxBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const txTableBody = document.getElementById("txTableBody");

// Tabs & Sidebar Navigation
const tabButtons = document.querySelectorAll(".tab-btn");
const budgetOverviewTab = document.getElementById("budgetOverviewTab");
const dailyTransactionsTab = document.getElementById("dailyTransactionsTab");
const comingSoonModuleView = document.getElementById("comingSoonModuleView");
const comingSoonTitle = document.getElementById("comingSoonTitle");
const comingSoonDesc = document.getElementById("comingSoonDesc");
const returnFinanceBtn = document.getElementById("returnFinanceBtn");
const navCards = document.querySelectorAll(".nav-card");

let currentUser = null;
let unsubscribeTransactions = null;
let editingTxId = null;
let currentMonthTransactions = [];

// Initialize Default Date & Month (YYYY-MM)
function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const todayISO = getTodayISO();
txDateInput.value = todayISO;
showingMonthInput.value = todayISO.slice(0, 7);

// Format YYYY-MM-DD -> DD - MM - YYYY for table display
function formatDisplayDate(isoDate) {
  if (!isoDate || !isoDate.includes("-")) return isoDate || "";
  const [y, m, d] = isoDate.split("-");
  return `${d} - ${m} - ${y}`;
}

function formatINR(amount) {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function showAlert(type, message) {
  txAlert.textContent = message;
  txAlert.classList.remove("hidden", "error", "success");
  txAlert.classList.add(type);
  setTimeout(() => {
    txAlert.classList.add("hidden");
  }, 3500);
}

// Sidebar & Tab Switching
navCards.forEach((card) => {
  card.addEventListener("click", () => {
    const moduleName = card.getAttribute("data-module");
    navCards.forEach((c) => c.classList.remove("active"));
    card.classList.add("active");

    if (moduleName === "finance") {
      comingSoonModuleView.classList.add("hidden");
      showActiveFinanceTab("dailyTransactionsTab");
    } else {
      budgetOverviewTab.classList.add("hidden");
      dailyTransactionsTab.classList.add("hidden");
      comingSoonModuleView.classList.remove("hidden");
      comingSoonTitle.textContent =
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
      comingSoonDesc.textContent = `${comingSoonTitle.textContent} tracking is coming soon.`;
    }
  });
});

returnFinanceBtn?.addEventListener("click", () => {
  navCards.forEach((c) =>
    c.classList.toggle("active", c.getAttribute("data-module") === "finance")
  );
  comingSoonModuleView.classList.add("hidden");
  showActiveFinanceTab("dailyTransactionsTab");
});

function showActiveFinanceTab(tabId) {
  tabButtons.forEach((btn) =>
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId)
  );
  budgetOverviewTab.classList.toggle("hidden", tabId !== "budgetOverviewTab");
  dailyTransactionsTab.classList.toggle(
    "hidden",
    tabId !== "dailyTransactionsTab"
  );
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-tab");
    navCards.forEach((c) =>
      c.classList.toggle("active", c.getAttribute("data-module") === "finance")
    );
    comingSoonModuleView.classList.add("hidden");
    if (target) showActiveFinanceTab(target);
  });
});

// Reset Form to Create Mode
function resetFormState() {
  editingTxId = null;
  transactionForm.reset();
  const selectedMonth = showingMonthInput.value || todayISO.slice(0, 7);
  txDateInput.value = todayISO.startsWith(selectedMonth)
    ? todayISO
    : `${selectedMonth}-01`;
  txCategoryInput.value = "Housing";
  txModeInput.value = "Cash";
  saveTxBtn.textContent = "Add transaction";
  cancelEditBtn.classList.add("hidden");
}

cancelEditBtn?.addEventListener("click", resetFormState);

// Escape HTML before rendering user strings
function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Render Table & Monthly Total
function renderTransactions(items) {
  const total = items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
  monthlyTotalText.textContent = `${formatINR(total)} expenses`;

  if (!items.length) {
    txTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="8">No transactions for this month.</td>
      </tr>
    `;
    return;
  }

  txTableBody.innerHTML = items
    .map(
      (tx) => `
      <tr>
        <td>${escapeHTML(formatDisplayDate(tx.date))}</td>
        <td>${escapeHTML(tx.description)}</td>
        <td class="cost-cell">${escapeHTML(formatINR(tx.cost))}</td>
        <td>${escapeHTML(tx.category)}</td>
        <td>${escapeHTML(tx.mode)}</td>
        <td>${escapeHTML(tx.account)}</td>
        <td>${escapeHTML(tx.remarks || "—")}</td>
        <td class="actions-col">
          <div class="row-actions">
            <button type="button" class="action-btn edit" data-edit-id="${tx.id}">Edit</button>
            <button type="button" class="action-btn delete" data-delete-id="${tx.id}">Delete</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

// Subscribe to Selected Month Transactions for Signed-In User
function subscribeToMonthTransactions(uid, monthKey) {
  if (unsubscribeTransactions) {
    unsubscribeTransactions();
  }

  txTableBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="8">Loading transactions...</td>
    </tr>
  `;

  const txColRef = collection(db, "users", uid, "transactions");
  const q = query(txColRef, where("monthKey", "==", monthKey));

  unsubscribeTransactions = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      // Sort newest date first
      items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      currentMonthTransactions = items;
      renderTransactions(items);
    },
    (err) => {
      console.error("Error loading transactions:", err);
      showAlert("error", "Unable to load transactions. Check Firestore rules.");
    }
  );
}

// Month Picker Change
showingMonthInput?.addEventListener("change", () => {
  if (!currentUser) return;
  const monthKey = showingMonthInput.value;
  if (!monthKey) return;

  if (!editingTxId) {
    txDateInput.value = todayISO.startsWith(monthKey)
      ? todayISO
      : `${monthKey}-01`;
  }
  subscribeToMonthTransactions(currentUser.uid, monthKey);
});

// Create or Update Transaction
transactionForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const date = txDateInput.value;
  const description = txDescriptionInput.value.trim();
  const cost = parseFloat(txCostInput.value);
  const category = txCategoryInput.value.trim();
  const mode = txModeInput.value.trim();
  const account = txAccountInput.value.trim();
  const remarks = txRemarksInput.value.trim();

  if (!date || !description || isNaN(cost) || cost <= 0 || !category || !mode || !account) {
    showAlert(
      "error",
      "Please fill in Date, Description, Cost (> 0), Category, Mode, and Account."
    );
    return;
  }

  const monthKey = date.slice(0, 7);
  saveTxBtn.disabled = true;
  saveTxBtn.textContent = editingTxId ? "Updating..." : "Saving...";

  try {
    if (editingTxId) {
      const docRef = doc(db, "users", currentUser.uid, "transactions", editingTxId);
      await updateDoc(docRef, {
        date,
        monthKey,
        description,
        cost,
        category,
        mode,
        account,
        remarks,
        updatedAt: serverTimestamp()
      });
      showAlert("success", "Transaction updated.");
    } else {
      const colRef = collection(db, "users", currentUser.uid, "transactions");
      await addDoc(colRef, {
        date,
        monthKey,
        description,
        cost,
        category,
        mode,
        account,
        remarks,
        createdAt: serverTimestamp()
      });
      showAlert("success", "Transaction added.");
    }

    // If user entered a date in a different month, switch Showing month to match
    if (showingMonthInput.value !== monthKey) {
      showingMonthInput.value = monthKey;
      subscribeToMonthTransactions(currentUser.uid, monthKey);
    }

    resetFormState();
  } catch (err) {
    console.error("Save error:", err);
    showAlert("error", "Failed to save transaction. Please try again.");
  } finally {
    saveTxBtn.disabled = false;
    saveTxBtn.textContent = editingTxId ? "Update transaction" : "Add transaction";
  }
});

// Edit & Delete Row Actions (Event Delegation)
txTableBody?.addEventListener("click", async (e) => {
  if (!currentUser) return;

  const editBtn = e.target.closest("[data-edit-id]");
  const deleteBtn = e.target.closest("[data-delete-id]");

  if (editBtn) {
    const id = editBtn.getAttribute("data-edit-id");
    const tx = currentMonthTransactions.find((item) => item.id === id);
    if (!tx) return;

    editingTxId = id;
    txDateInput.value = tx.date || "";
    txDescriptionInput.value = tx.description || "";
    txCostInput.value = tx.cost ?? "";
    txCategoryInput.value = tx.category || "Housing";
    txModeInput.value = tx.mode || "Cash";
    txAccountInput.value = tx.account || "";
    txRemarksInput.value = tx.remarks || "";

    saveTxBtn.textContent = "Update transaction";
    cancelEditBtn.classList.remove("hidden");
    txDescriptionInput.focus();
    return;
  }

  if (deleteBtn) {
    const id = deleteBtn.getAttribute("data-delete-id");
    if (!id) return;

    const confirmed = window.confirm("Delete this transaction?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "transactions", id));
      if (editingTxId === id) {
        resetFormState();
      }
      showAlert("success", "Transaction deleted.");
    } catch (err) {
      console.error("Delete error:", err);
      showAlert("error", "Failed to delete transaction.");
    }
  }
});

// Logout
logoutBtn?.addEventListener("click", async () => {
  if (unsubscribeTransactions) unsubscribeTransactions();
  await signOut(auth);
  window.location.href = "index.html";
});

// Auth Route Guard & Profile Hydration
onAuthStateChanged(auth, async (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  sidebarUserEmail.textContent = user.email || "";
  sidebarUserName.textContent = user.displayName || "User";

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().fullName) {
      sidebarUserName.textContent = userDoc.data().fullName;
    }
  } catch (err) {
    console.warn("Could not fetch user profile doc:", err);
  }

  subscribeToMonthTransactions(user.uid, showingMonthInput.value);
});