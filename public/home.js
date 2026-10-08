// /auth/logout is POST-only (that's the more correct way to do a
// logout — a plain link would make it a GET, which means anything
// that ever pre-fetches links, like a browser or a scanner, could
// accidentally log someone out). So this is a button with a click
// handler instead of an <a href="...">.
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" });
  window.location.href = "/auth/login";
});

