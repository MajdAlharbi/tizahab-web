if (document.getElementById("signup-form")) {
  document.getElementById("signup-form").addEventListener("submit", async function(e) {
    e.preventDefault();

    const username = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;
    const password2 = e.target.password2.value;

    try {
      const res = await fetch("http://127.0.0.1:8000/api/auth/signup/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, password2})
      });

      const data = await res.json();

      if (!res.ok) {
    let errorMsg = "";

    for (const key in data) {
        if (Array.isArray(data[key])) {
            errorMsg += `${key}: ${data[key].join(", ")}\n`;
        } else {
            errorMsg += `${key}: ${data[key]}\n`;
        }
    }
        document.getElementById("signup-error").innerText = errorMsg || "Unknown error";
      } else {
        alert("Signup successful!");
        window.location.href = "/login/";
      }
    } catch (err) {
      document.getElementById("signup-error").innerText = "Network error";
    }
  });
}