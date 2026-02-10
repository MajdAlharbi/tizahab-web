function getAccessToken() {
  // Token key based on current auth implementation
  // TODO: Update key if auth storage changes
  return localStorage.getItem("access");
}

function redirectToLogin() {
  // Redirect to UI login page
  window.location.href = "/api/auth/ui/login/";
}

function requireAuth() {
  const token = getAccessToken();

  // Protect route: redirect unauthenticated users
  if (!token) {
    redirectToLogin();
    return null;
  }

  return token;
}

function handleUnauthorized() {
  // Clear tokens if API returns 401
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  redirectToLogin();
}
