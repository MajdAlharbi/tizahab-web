if (document.getElementById("login-form")) {
  document.getElementById("login-form").addEventListener("submit", async function(e) {
    e.preventDefault();

    const username = e.target.username.value;
    const password = e.target.password.value;

    try {
      const res = await fetch("/api/auth/login/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json"
  },
  body: JSON.stringify({ username, password })
});

const data = await res.json();
      if (!res.ok) {
        let errorMsg = "";
        for (const key in data) {
          errorMsg += `${key}: ${data[key].join(", ")}\n`;
        }
        document.getElementById("login-error").innerText = errorMsg || "Unknown error";
      } else {
        alert("Login successful!");
        localStorage.setItem("access", data.access);
        localStorage.setItem("refresh", data.refresh);
     window.location.href = "/daily-plan/";
      }
    } catch (err) {
      document.getElementById("login-error").innerText = "Network error";
    }
  });
}