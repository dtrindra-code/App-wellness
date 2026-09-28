export interface Quote { text: string; author?: string }

// Kind, grounded, sometimes funny. No "no pain no gain", no body talk.
// Authors only when the attribution is solid; otherwise left undefined.
export const QUOTES: Quote[] = [
  // --- attribuées ---
  { text: 'Un voyage de mille lieues commence toujours par un premier pas.', author: 'Lao Tseu' },
  { text: 'Rien ne sert de courir ; il faut partir à point.', author: 'Jean de La Fontaine' },
  { text: 'Patience et longueur de temps font plus que force ni que rage.', author: 'Jean de La Fontaine' },
  { text: 'Le mieux est l’ennemi du bien.', author: 'Voltaire' },
  { text: 'Ce n’est pas parce que les choses sont difficiles que nous n’osons pas, c’est parce que nous n’osons pas qu’elles sont difficiles.', author: 'Sénèque' },
  { text: 'La vie, c’est comme une bicyclette : il faut avancer pour ne pas perdre l’équilibre.', author: 'Albert Einstein' },
  { text: 'Toutes les pensées vraiment grandes sont conçues en marchant.', author: 'Friedrich Nietzsche' },
  { text: 'Nous sommes ce que nous faisons de manière répétée.', author: 'Will Durant, d’après Aristote' },
  { text: 'Commence là où tu es. Utilise ce que tu as. Fais ce que tu peux.', author: 'Arthur Ashe' },
  { text: 'Le miracle, ce n’est pas d’avoir fini. Le miracle, c’est d’avoir eu le courage de commencer.', author: 'John Bingham' },
  { text: 'Si tu as un corps, tu es un athlète.', author: 'Bill Bowerman' },
  { text: 'On rate 100 % des tirs qu’on ne tente pas.', author: 'Wayne Gretzky' },
  { text: 'J’ai raté plus de 9 000 tirs dans ma carrière. J’ai échoué encore et encore. C’est pour ça que je réussis.', author: 'Michael Jordan' },
  { text: 'Aucun humain n’est limité.', author: 'Eliud Kipchoge' },
  { text: 'Seuls les disciplinés sont vraiment libres.', author: 'Eliud Kipchoge' },
  { text: 'Cours quand tu peux, marche s’il le faut, rampe si tu dois. Mais n’abandonne pas.', author: 'Dean Karnazes' },
  { text: 'Si tu perds foi en l’humanité, va regarder un marathon.', author: 'Kathrine Switzer' },
  { text: 'Si tu veux courir, cours un kilomètre. Si tu veux changer ta vie, cours un marathon.', author: 'Emil Zátopek' },
  { text: 'La plupart des coureurs ne courent pas pour vivre plus longtemps, mais pour vivre plus pleinement.', author: 'Haruki Murakami' },
  { text: 'L’important dans la vie, ce n’est point le triomphe mais le combat ; l’essentiel, c’est de s’être bien battu.', author: 'Pierre de Coubertin' },
  { text: 'Continue de nager.', author: 'Dory, Le Monde de Nemo' },

  // --- reprise, douceur ---
  { text: 'Un pas après l’autre.' },
  { text: 'La version mini compte. Toujours.' },
  { text: 'Quinze minutes, c’est quinze minutes de plus que zéro.' },
  { text: 'Tu ne repars pas de zéro. Tu repars d’aujourd’hui.' },
  { text: 'Pas besoin d’envie pour commencer. L’envie arrive souvent en route.' },
  { text: 'Mets tes chaussures. Le reste suivra, ou pas, et c’est déjà bien.' },
  { text: 'Le plus dur, c’est la porte. Après, c’est juste dehors.' },
  { text: 'Doucement, c’est encore avancer.' },
  { text: 'Ton corps n’est pas en retard. Il est en train de revenir.' },
  { text: 'Personne ne te chronomètre aujourd’hui.' },
  { text: 'Une séance facile, c’est une séance réussie.' },
  { text: 'Finir en ayant envie de recommencer : c’est ça, le bon dosage.' },
  { text: 'Tu as le droit d’y aller tranquille. C’est même recommandé.' },
  { text: 'La régularité bat l’intensité, tous les jours de la semaine.' },
  { text: 'Pas parfait, mais fait.' },
  { text: 'Une mauvaise journée n’annule pas une bonne semaine.' },
  { text: 'Rater une séance, c’est normal. En rater deux, c’est le signal pour faire la mini.' },
  { text: 'On construit l’habitude d’abord. La forme viendra la chercher.' },
  { text: 'Le repos fait partie de l’entraînement.' },
  { text: 'Écoute ton corps, pas ton ego.' },
  { text: 'Tu fais du sport parce que tu aimes ça. Garde ça en tête.' },
  { text: 'Si ce n’est pas un plaisir, raccourcis. Pas besoin de forcer.' },
  { text: 'Petit à petit, l’oiseau fait son nid.' },
  { text: 'Aujourd’hui compte, même si ça ne se voit pas encore.' },
  { text: 'Le progrès est lent, puis soudain il est là.' },
  { text: 'Tu n’as pas à tout faire. Juste la prochaine petite chose.' },
  { text: 'Être là, c’est déjà la moitié du chemin.' },
  { text: 'La motivation va et vient. Les petites habitudes restent.' },
  { text: 'Sois aussi gentil·le avec toi qu’avec une amie qui reprend.' },

  // --- poids, alimentation, sans culpabilité ---
  { text: 'La balance donne une météo, pas un verdict.' },
  { text: 'Regarde la tendance sur sept jours, pas le chiffre du matin.' },
  { text: 'Un repas ne définit rien. Le suivant est une nouvelle chance.' },
  { text: 'Un verre d’eau, des protéines, et on avance.' },
  { text: 'Manger assez, c’est aussi s’entraîner.' },
  { text: 'Tu ne te prives pas : tu choisis ce qui te fait du bien.' },
  { text: 'Le chiffre bouge quand il veut. Toi, tu continues quand même.' },
  { text: 'Un écart, c’est un souvenir, pas une faute.' },
  { text: 'Noter, ce n’est pas se juger. C’est juste regarder.' },
  { text: 'Un plateau, ça arrive à tout le monde. Même aux montagnes.' },
  { text: 'Dors bien, bois de l’eau, bouge un peu. Le reste suit.' },
  { text: 'On ne compte pas les calories pour se punir, on les compte pour y voir clair.' },

  // --- Maldives ---
  { text: 'Chaque petite séance te rapproche du lagon.' },
  { text: 'Le lagon t’attend. Il n’est pas pressé, et toi non plus.' },
  { text: 'Tu ne t’entraînes pas pour la plage. Tu t’entraînes pour en profiter.' },
  { text: 'Décembre se prépare en octobre, tranquillement.' },
  { text: 'Imagine la première brasse dans l’eau turquoise. Voilà pourquoi.' },
  { text: 'Les poissons des Maldives ne jugeront pas ton crawl.' },
  { text: 'La meilleure crème solaire, c’est d’arriver en forme et reposé·e.' },

  // --- triathlon, half ---
  { text: 'Un half, c’est juste beaucoup de petites séances mises bout à bout.' },
  { text: 'Nager, pédaler, courir : trois façons de dire « je suis vivant·e ».' },
  { text: 'La technique d’abord, la vitesse plus tard. Beaucoup plus tard.' },
  { text: 'Marcher pendant une course, c’est une stratégie, pas un échec.' },
  { text: 'Le vélo pardonne tout, sauf de ne pas monter dessus.' },
  { text: 'Dans l’eau, souffle. Tout le reste est du détail.' },
  { text: 'La ligne d’arrivée de juin commence par la séance d’aujourd’hui.' },
  { text: 'Le basket compte. Courir après un ballon, c’est courir.' },
  { text: 'Lent aujourd’hui, régulier demain, solide en juin.' },
  { text: 'L’endurance, c’est surtout de la patience avec des baskets.' },
  { text: 'Tu n’as pas besoin d’aimer chaque séance. Juste de revenir.' },

  // --- un peu d’humour ---
  { text: 'Le canapé sera toujours là après. Promis.' },
  { text: 'Transpirer un peu, c’est ton corps qui applaudit.' },
  { text: 'Tes baskets ne vont pas se lacer toutes seules. Par contre, elles attendent.' },
  { text: 'Aucune séance ne s’est jamais plainte d’être trop courte.' },
  { text: 'Si tu hésites, fais les cinq premières minutes. Tu négocieras ensuite.' },
  { text: 'Les courbatures, c’est juste ton corps qui prend des notes.' },
  { text: 'Le plus rapide des sprinteurs a commencé par ne pas savoir marcher.' },
  { text: 'Tu as déjà survécu à tous tes lundis. Celui-ci aussi.' },
  { text: 'Aller doucement, c’est aller loin avec le sourire.' },
  { text: 'Fier·e d’hier, curieux·se de demain, présent·e aujourd’hui.' },
];

/** All quotes, one per line ("texte — auteur"), to paste into an iOS Shortcut. */
export const QUOTES_FOR_SHORTCUT: string = QUOTES.map((q) => (q.author ? `${q.text} — ${q.author}` : q.text)).join('\n');

/** Deterministic quote of the day (same all day, changes at midnight). */
export function quoteFor(date: string): Quote {
  let hsh = 0;
  for (const c of date) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  return QUOTES[hsh % QUOTES.length];
}
