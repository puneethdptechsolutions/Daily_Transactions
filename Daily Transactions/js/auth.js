import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// DOM Elements
const authModalBackdrop = document.getElementById("authModalBackdrop");
const closeAuthBtn = document.getElementById("closeAuthBtn");
const openTriggers = document.querySelectorAll("[data-open-auth]");
const switchTriggers = document.querySelectorAll("[data-switch]");

const views = {
  signInView: document.getElementById("signInView"),
  signUpView: document.getElementById("signUpView"),
  forgotPasswordView: document.getElementById("forgotPasswordView")
};

const authAlert = document.getElementById("authAlert");
const authAlertText = document.getElementById("authAlertText");
const resendVerifyBtn = document.getElementById("resendVerifyBtn");

const signInForm = document.getElementById("signInForm");
const signUpForm = document.getElementById("signUpForm");
const forgotPasswordForm = document.getElementById("forgotPasswordForm");

const signInBtn = document.getElementById("signInBtn");
const signUpBtn = document.getElementById("signUpBtn");
const resetBtn = document.getElementById("resetBtn");

let pendingUnverifiedUser = null;

// Alert Helpers
function showAlert(type, message, showResend = false) {
  authAlert.classList.remove("hidden", "error", "success", "info");
  authAlert.classList.add(type);
  authAlertText.textContent = message;
  resendVerifyBtn.classList.toggle("hidden", !showResend);
}

function clearAlert() {
  authAlert.classList.add("hidden");
  authAlert.classList.remove("error", "success", "info");
  authAlertText.textContent = "";
  resendVerifyBtn.classList.add("hidden");
}

// View & Modal Helpers
function showView(viewId) {
  Object.entries(views).forEach(([id, el]) => {
    if (el) el.classList.toggle("hidden", id !== viewId);
  });
}

function openAuthModal(viewId = "signInView") {
  clearAlert();
  showView(viewId);
  authModalBackdrop.classList.remove("hidden");
}

function closeAuthModal() {
  authModalBackdrop.classList.add("hidden");
  clearAlert();
}

openTriggers.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetView = btn.getAttribute("data-open-auth") || "signInView";
    openAuthModal(targetView);
  });
});

closeAuthBtn?.addEventListener("click", closeAuthModal);

authModalBackdrop?.addEventListener("click", (e) => {
  if (e.target === authModalBackdrop) {
    closeAuthModal();
  }
});

switchTriggers.forEach((btn) => {
  btn.addEventListener("click", () => {
    clearAlert();
    const targetView = btn.getAttribute("data-switch");
    if (targetView) showView(targetView);
  });
});

// Friendly Firebase Error Messages (includes code for clear debugging)
function getFriendlyAuthError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/weak-password":
      return "Password must be at least 6 characters long.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection and try again.";
    default:
      return `Authentication failed (${code || "unknown error"}). Please check your details and try again.`;
  }
}

// 1. CREATE ACCOUNT + SEND VERIFICATION LINK
signUpForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAlert();

  const firstName = document.getElementById("firstName").value.trim();
  const middleName = document.getElementById("middleName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("setPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!firstName) {
    showAlert("error", "First name is required.");
    return;
  }
  if (!lastName) {
    showAlert("error", "Last name is required.");
    return;
  }
  if (!email) {
    showAlert("error", "Email address is required.");
    return;
  }
  if (password.length < 6) {
    showAlert("error", "Password must be at least 6 characters.");
    return;
  }
  if (password !== confirmPassword) {
    showAlert("error", "Set Password and Confirm Password do not match.");
    return;
  }

  signUpBtn.disabled = true;
  signUpBtn.textContent = "Creating account...";

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    try {
      await updateProfile(user, { displayName: fullName });
    } catch (profileErr) {
      console.error("Profile displayName update error:", profileErr);
    }

    let verificationSent = false;
    try {
      await sendEmailVerification(user);
      verificationSent = true;
    } catch (verifyErr) {
      console.error("Send verification email error:", verifyErr);
    }

    let profileSaved = false;
    try {
      await setDoc(doc(db, "users", user.uid), {
        firstName,
        middleName: middleName || "",
        lastName,
        fullName,
        email: user.email,
        createdAt: serverTimestamp()
      });
      profileSaved = true;
    } catch (firestoreErr) {
      console.error("Firestore user doc save error:", firestoreErr);
    }

    pendingUnverifiedUser = user;
    await signOut(auth);

    signUpForm.reset();
    showView("signInView");
    document.getElementById("loginEmail").value = email;

    if (verificationSent && profileSaved) {
      showAlert(
        "success",
        `Account created! A verification link has been sent to ${email}. Verify your email, then sign in below.`
      );
    } else if (verificationSent && !profileSaved) {
      showAlert(
        "info",
        `Account created and verification link sent to ${email}, though saving your profile to Firestore was blocked (check ad blocker/DNS/Firestore). Verify your email, then sign in.`,
        true
      );
    } else {
      showAlert(
        "info",
        `Account created for ${email}, but sending the verification email failed (${errCodeText(
          "verification"
        )}). Sign in below and click "Resend verification link".`,
        true
      );
    }
  } catch (err) {
    console.error("Create account error:", err);
    showAlert("error", getFriendlyAuthError(err.code));
  } finally {
    signUpBtn.disabled = false;
    signUpBtn.textContent = "Create Account";
  }
});

function errCodeText(fallbackLabel) {
  return fallbackLabel;
}

// 2. SIGN IN (REQUIRES VERIFIED EMAIL)
signInForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAlert();
  pendingUnverifiedUser = null;

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showAlert("error", "Please enter both your email and password.");
    return;
  }

  signInBtn.disabled = true;
  signInBtn.textContent = "Signing in...";

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    await user.reload();

    if (!user.emailVerified) {
      pendingUnverifiedUser = user;
      await signOut(auth);
      showAlert(
        "info",
        "Your email is not verified yet. Please check your inbox (and spam folder) for the verification link before signing in.",
        true
      );
      return;
    }

    window.location.href = "dailytransactions.html";
  } catch (err) {
    console.error("Sign in error:", err);
    showAlert("error", getFriendlyAuthError(err.code));
  } finally {
    signInBtn.disabled = false;
    signInBtn.textContent = "Sign In";
  }
});

// Resend Verification Link
resendVerifyBtn?.addEventListener("click", async () => {
  if (!pendingUnverifiedUser) return;

  resendVerifyBtn.disabled = true;
  resendVerifyBtn.textContent = "Sending...";

  try {
    await sendEmailVerification(pendingUnverifiedUser);
    showAlert("success", `Verification link resent to ${pendingUnverifiedUser.email}.`);
  } catch (err) {
    console.error("Resend verification error:", err);
    showAlert("error", getFriendlyAuthError(err.code));
  } finally {
    resendVerifyBtn.disabled = false;
    resendVerifyBtn.textContent = "Resend verification link";
  }
});

// 3. FORGOT PASSWORD (SEND RESET LINK)
forgotPasswordForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAlert();

  const email = document.getElementById("resetEmail").value.trim();
  if (!email) {
    showAlert("error", "Please enter your registered email address.");
    return;
  }

  resetBtn.disabled = true;
  resetBtn.textContent = "Sending reset link...";

  try {
    await sendPasswordResetEmail(auth, email);
    forgotPasswordForm.reset();
    showView("signInView");
    document.getElementById("loginEmail").value = email;
    showAlert(
      "success",
      `Password reset link sent to ${email}. Reset your password via the link, then sign in.`
    );
  } catch (err) {
    console.error("Password reset error:", err);
    showAlert("error", getFriendlyAuthError(err.code));
  } finally {
    resetBtn.disabled = false;
    resetBtn.textContent = "Send Reset Link";
  }
});

// Auto-redirect already signed-in & verified users
onAuthStateChanged(auth, (user) => {
  if (user && user.emailVerified) {
    window.location.href = "dailytransactions.html";
  }
});