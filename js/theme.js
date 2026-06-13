/* NOVA ARCADE — gestor de temas. Extensible: añade un objeto a THEMES + bloque CSS en theme.css */
(function () {
  const KEY = "nova-theme";
  const THEMES = [
    { id: "dark",  name: "Neón",   swatch: "#22d3ee" },
    { id: "light", name: "Póster", swatch: "#e8431f" },
    // Futuro: { id: "synthwave", name: "Synthwave", swatch: "#ff2e88" }, etc.
  ];
  function get() { return localStorage.getItem(KEY) || "dark"; }
  function apply(id) {
    document.documentElement.setAttribute("data-theme", id);
    localStorage.setItem(KEY, id);
    document.dispatchEvent(new CustomEvent("nova-theme-change", { detail: id }));
  }
  // aplicar antes del primer render (se llama también inline en <head>)
  apply(get());
  window.NovaTheme = { list: () => THEMES.slice(), get, set: apply };
})();
