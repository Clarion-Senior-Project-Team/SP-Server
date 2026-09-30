// Same fetch-based pattern as login.ejs — see the comment there.
// /auth/signup logs the new account straight in on success (its
// controller calls req.session.regenerate the same way login does),
// so this also just redirects to "/" once it succeeds.
const form = document.getElementById("signupForm");
const errorBanner = document.getElementById("errorBanner");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBanner.hidden = true;

  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorBanner.textContent = data.error || "Something went wrong.";
      errorBanner.hidden = false;
      return;
    }

    window.location.href = "/";
  } catch (err) {
    errorBanner.textContent = "Could not reach the server.";
    errorBanner.hidden = false;
  }
});
