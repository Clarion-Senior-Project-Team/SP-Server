// The real login logic lives on the server, in auth/authentication —
// this page's only job is to collect the form and hand it off. It
// can't just submit the <form> the normal way (a full-page POST),
// because /auth/login answers with JSON, not a new page to navigate
// to — so this listens for the submit, stops the browser's default
// page-reload behavior, and sends the same data as a fetch() instead.

const form = document.getElementById("loginForm");
const errorBanner = document.getElementById("errorBanner");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBanner.hidden = true;

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorBanner.textContent = data.error || "Something went wrong.";
      errorBanner.hidden = false;
      return;
    }

    // The server just set the session cookie on this response —
    // going to "/" now sends that cookie along automatically, and
    // the server renders the home page since it sees we're logged in.
    window.location.href = "/";
  } catch (err) {
    errorBanner.textContent = "Could not reach the server.";
    errorBanner.hidden = false;
  }
});
