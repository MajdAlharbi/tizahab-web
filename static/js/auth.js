const signupForm = document.getElementById("signup-form");

if (signupForm) {
  const errorBox = document.getElementById("signup-error");

  function getSignupPageErrorMessage(err) {
    const fromResponse =
      typeof extractApiErrorMessage === "function"
        ? extractApiErrorMessage(err?.responseData, "")
        : "";
    const fromError = typeof err?.message === "string" ? err.message.trim() : "";

    if (fromResponse) return fromResponse;
    if (fromError && !/^API error \d+$/i.test(fromError)) return fromError;
    return "Something went wrong. Please try again.";
  }

  function setSignupLoading(loading) {
    const btn      = document.getElementById("signup-btn");
    const btnText  = document.getElementById("signup-btn-text");
    const btnSpinner = document.getElementById("signup-btn-spinner");
    if (btn) btn.disabled = loading;
    if (btnText)    btnText.classList.toggle("hidden", loading);
    if (btnSpinner) btnSpinner.classList.toggle("hidden", !loading);
  }

  signupForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    errorBox?.classList.add("hidden");
    if (errorBox) errorBox.textContent = "";

    if (typeof window.apiPost !== "function") {
      if (errorBox) {
        errorBox.textContent = "Signup is temporarily unavailable. Please reload the page.";
        errorBox.classList.remove("hidden");
      }
      return;
    }

    const fullName = (
      document.getElementById("signup-name") ??
      signupForm.querySelector("input[name='full_name']")
    )?.value ?? "";

    const email = (
      document.getElementById("signup-email") ??
      signupForm.querySelector("input[name='email']")
    )?.value ?? "";

    const password = (
      document.getElementById("signup-password") ??
      signupForm.querySelector("input[name='password']")
    )?.value ?? "";

    const password2 = (
      document.getElementById("signup-confirm") ??
      signupForm.querySelector("input[name='password2']")
    )?.value ?? "";

    setSignupLoading(true);

    try {
      const data = await window.apiPost("/api/auth/signup/", {
        full_name: fullName,
        email,
        password,
        password2,
      });

      localStorage.setItem("access", data.access);
      localStorage.setItem("refresh", data.refresh);
      window.location.href = "/onboarding/";
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = getSignupPageErrorMessage(err);
        errorBox.classList.remove("hidden");
      }
      setSignupLoading(false);
    }
  });
}
