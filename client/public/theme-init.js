// Aplica o tema antes da primeira pintura (o ThemeProvider repete isso depois):
// a escolha salva no botão vence; sem escolha, segue o modo do sistema.
// Arquivo externo (e não <script> inline) para a Content-Security-Policy aceitar.
try {
  var saved = localStorage.getItem("theme");
  var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
