document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-email]").forEach(el => {
    const user1 = "yu";
    const user2 = "ov";
    const domain1 = "ukr";
    const domain2 = "net";

    const email = `${user2}${user1}@${domain1}.${domain2}`;

    el.textContent = email;
    el.href = `mailto:${email}`;

    el.addEventListener("click", event => {
      event.preventDefault();
      navigator.clipboard.writeText(email);
      alert("Email copied to clipboard");
    });
  });
});

