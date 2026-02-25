function getAccessToken() {
  return localStorage.getItem("access");
}

function redirectToLogin() {
  console.warn("Redirect blocked for debugging. Should go to /api/auth/ui/login/");
  //window.location.href = "/api/auth/ui/login/";
}

function handleUnauthorized() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  redirectToLogin();
}