// Cap Maldives — widget « citation du jour » pour l'app Scriptable (iPhone).
// Écran verrouillé (rectangulaire ou en ligne) et écran d'accueil (petit, moyen).
// Même citation que l'app : même liste, même choix selon la date.
// Aucune donnée personnelle : le widget lit seulement la liste publique des citations.

const APP_URL = 'https://dtrindra-code.github.io/App-wellness/';
const QUOTES_URL = APP_URL + 'quotes.json';
const CREAM = new Color('#FFF6D3');
const PINK = new Color('#FFC8DD');
const INK = new Color('#111111');

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

// Same pick as quoteFor() in the app.
function quoteFor(date, quotes) {
  let h = 0;
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return quotes[h % quotes.length];
}

async function loadQuotes() {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.documentsDirectory(), 'cap-quotes.json');
  try {
    const data = await new Request(QUOTES_URL).loadJSON();
    if (data && Array.isArray(data.quotes) && data.quotes.length) {
      fm.writeString(cache, JSON.stringify(data));
      return data.quotes;
    }
  } catch (e) { /* offline: use the cached copy */ }
  if (fm.fileExists(cache)) return JSON.parse(fm.readString(cache)).quotes;
  return [{ text: 'Un pas après l’autre.', author: null }];
}

const q = quoteFor(today, await loadQuotes());
const family = config.widgetFamily || 'medium';
const w = new ListWidget();
w.url = APP_URL;
// Refresh after midnight so the quote changes with the day.
const midnight = new Date(now); midnight.setHours(24, 1, 0, 0);
w.refreshAfterDate = midnight;

if (family === 'accessoryInline') {
  w.addText(q.text);
} else if (family === 'accessoryRectangular') {
  // Lock screen: iOS tints it, keep it plain text.
  const t = w.addText(q.text);
  t.font = Font.semiboldSystemFont(13);
  t.minimumScaleFactor = 0.7;
  t.lineLimit = 3;
} else {
  w.backgroundColor = CREAM;
  w.setPadding(14, 14, 14, 14);
  const tag = w.addText('CITATION DU JOUR');
  tag.font = Font.boldSystemFont(9);
  tag.textColor = INK;
  tag.textOpacity = 0.6;
  w.addSpacer(6);
  const t = w.addText(q.text);
  t.font = Font.boldSystemFont(family === 'small' ? 14 : 16);
  t.textColor = INK;
  t.minimumScaleFactor = 0.6;
  w.addSpacer();
  const foot = w.addStack();
  foot.centerAlignContent();
  const dot = foot.addText('●');
  dot.font = Font.systemFont(9);
  dot.textColor = PINK;
  foot.addSpacer(5);
  const a = foot.addText(q.author || 'Cap Maldives');
  a.font = new Font('Georgia-Italic', 11);
  a.textColor = INK;
  a.textOpacity = 0.7;
}

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
