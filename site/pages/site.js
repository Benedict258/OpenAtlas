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
