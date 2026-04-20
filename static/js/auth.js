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

    const email = signupForm.querySelector("input[name='email']").value;
    const password = signupForm.querySelector("input[name='password']").value;
    const password2 = signupForm.querySelector("input[name='password2']").value;

    try {
      const data = await window.apiPost("/api/auth/signup/", {
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
    }
  });
}
