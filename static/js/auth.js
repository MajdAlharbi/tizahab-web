if (document.getElementById("signup-form")) {
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

  document.getElementById("signup-form").addEventListener("submit", async function(e) {
    e.preventDefault();

    const username = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;
    const password2 = e.target.password2.value;

    try {
      await apiPost("/api/auth/signup/", { username, email, password, password2});
      alert("Signup successful!");
      window.location.href = "/login/";
    } catch (err) {
      document.getElementById("signup-error").innerText =
        getSignupPageErrorMessage(err);
    }
  });
}
