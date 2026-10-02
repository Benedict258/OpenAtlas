// Mobile navigation (hamburger menu, shown at 900px and below by responsive.css).
(() => {
  const btn = document.querySelector(".menu-btn");
  const menu = document.getElementById("mnav");
  if (!btn || !menu) return;
  const setOpen = (open) => {
    menu.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  btn.addEventListener("click", () => setOpen(btn.getAttribute("aria-expanded") !== "true"));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") { setOpen(false); btn.focus(); }
  });
  document.addEventListener("click", (e) => {
    if (btn.getAttribute("aria-expanded") === "true" && !e.target.closest(".nav")) setOpen(false);
  });
  matchMedia("(min-width: 901px)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });
})();

// Product page tabs ("What OpenAtlas is"). The only page behaviour the design itself had.
document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const n = tab.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((t) => {
      const on = t.dataset.tab === n;
      t.classList.toggle("on", on);
      t.setAttribute("aria-pressed", String(on));
    });
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== n));
  });
});
