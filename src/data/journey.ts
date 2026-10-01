// "Revenir à moi" — 60-day guided journey (5 min/day max): content only.
// 4 chapters of 15 days, one journal prompt per day (with optional cycle-phase
// variants), a library of gentle daily rules and the Sunday reset steps.
// Generic, fictional content: no user data. French, informal "tu", never guilt.
// Inspired by classic guided-journal practices: energy audit, needs inventory,
// values, boundaries, self-compassion, gratitude, joy list, mental-load inventory,
// identity beyond roles.

export type NeedKey = 'repos' | 'calme' | 'lien' | 'mouvement' | 'plaisir' | 'aide' | 'espace' | 'reconnaissance';

export const NEEDS: { key: NeedKey; label: string }[] = [
  { key: 'repos', label: 'Repos' },
  { key: 'calme', label: 'Calme' },
  { key: 'lien', label: 'Lien' },
  { key: 'mouvement', label: 'Mouvement' },
  { key: 'plaisir', label: 'Plaisir' },
  { key: 'aide', label: 'Aide' },
  { key: 'espace', label: 'Espace' },
  { key: 'reconnaissance', label: 'Reconnaissance' },
];

export interface JourneyChapter {
  index: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  /** ≤ 280 chars. */
  intro: string;
  recapPrompt: string;
}

export const CHAPTERS: JourneyChapter[] = [
  {
    index: 1,
    title: 'Me poser',
    subtitle: 'Où j’en suis, sans jugement',
    intro: 'Pendant 15 jours, on ne change rien : on regarde. Ta fatigue, tes humeurs, ce qui va bien aussi. Pas de bonne ou de mauvaise réponse, juste une photo honnête et tendre de là où tu es.',
    recapPrompt: 'En relisant ces 15 jours, qu’est-ce qui te frappe le plus sur l’endroit où tu en es ?',
  },
  {
    index: 2,
    title: 'Mon énergie',
    subtitle: 'Ce qui me remplit, ce qui me vide',
    intro: 'On fait l’inventaire de ta batterie : ce qui la recharge, ce qui la vide en douce, et tout ce que tu portes dans ta tête pour les autres. Le but n’est pas d’en faire plus, mais de fuir moins d’énergie.',
    recapPrompt: 'Qu’est-ce qui te recharge vraiment, et qu’est-ce que tu as envie de laisser filer ?',
  },
  {
    index: 3,
    title: 'Mes besoins',
    subtitle: 'Écouter, demander, poser mes limites',
    intro: 'Tes besoins ne sont pas des caprices. Ces 15 jours, on apprend à les entendre, à les dire simplement et à poser des limites douces. Demander de l’aide, c’est aussi prendre soin des gens qui t’aiment.',
    recapPrompt: 'Quel besoin est revenu le plus souvent, et quelle demande as-tu osé faire (ou aimerais faire) ?',
  },
  {
    index: 4,
    title: 'Moi, au-delà de maman',
    subtitle: 'Mes envies, mes rêves, qui je suis',
    intro: 'Tu es bien plus que tes rôles. Maman, future maman, pro, amie… et toi, dans tout ça ? On retrouve tes envies, tes valeurs, la fille de 15 ans et la femme que tu as envie de devenir.',
    recapPrompt: 'Qui es-tu, en dehors de tout ce que tu fais pour les autres ? Qu’est-ce que tu gardes de ces 60 jours ?',
  },
];

export type PromptPhase = 'regles' | 'folliculaire' | 'fertile' | 'luteale' | 'premenstruel' | 'retard' | 'grossesse';

export interface JourneyPrompt {
  /** 1..60 */
  day: number;
  chapter: 1 | 2 | 3 | 4;
  /** ≤ 60 chars. */
  title: string;
  /** ≤ 160 chars. */
  question: string;
  /** 3–6 quick answers, ≤ 40 chars each. */
  chips: string[];
  variants?: Partial<Record<PromptPhase, { question: string; chips?: string[] }>>;
  /** ≤ 140 chars, optional micro-action. */
  tip?: string;
}

export const PROMPTS: JourneyPrompt[] = [
  // ---------- Chapitre 1 · Me poser ----------
  {
    day: 1, chapter: 1, title: 'Ma météo intérieure',
    question: 'Si ta journée était une météo, ce serait plutôt…',
    chips: ['Grand soleil', 'Éclaircies', 'Ciel gris', 'Orage', 'Brouillard'],
    variants: {
      regles: { question: 'Pendant les règles, la météo intérieure bouge souvent. Elle ressemble à quoi aujourd’hui ?' },
      premenstruel: { question: 'Juste avant les règles, le ciel peut s’assombrir sans raison. Ta météo du jour, c’est…', chips: ['Éclaircies', 'Ciel gris', 'Orage', 'Brouillard', 'Pluie fine'] },
      grossesse: { question: 'Avec tout ce qui se passe dans ton corps, ta météo intérieure aujourd’hui, c’est…' },
    },
    tip: 'Aucune météo n’est mauvaise : elle passe. Note-la, c’est tout.',
  },
  {
    day: 2, chapter: 1, title: 'Mon corps, là, maintenant',
    question: 'Ferme les yeux pour 3 respirations. Où sens-tu le plus de tension ?',
    chips: ['Épaules', 'Mâchoire', 'Ventre', 'Dos', 'Tête', 'Nulle part'],
    variants: {
      regles: { question: 'Trois respirations lentes. Où ton corps te parle-t-il le plus aujourd’hui ?', chips: ['Ventre', 'Bas du dos', 'Tête', 'Jambes', 'Seins', 'Nulle part'] },
      luteale: { question: 'Trois respirations. Où sens-tu que ton corps se crispe ou se fatigue cette semaine ?' },
    },
    tip: 'Pose une main là où ça serre et respire dedans 3 fois.',
  },
  {
    day: 3, chapter: 1, title: 'Mes journées en ce moment',
    question: 'Complète : en ce moment, mes journées ressemblent à…',
    chips: ['Un marathon', 'Une to-do sans fin', 'Un pilote automatique', 'Un joli chaos', 'Un rythme qui me va'],
    variants: {
      folliculaire: { question: 'L’énergie remonte souvent en ce moment. Tes journées ressemblent à…' },
      premenstruel: { question: 'Les jours avant les règles, tout peut sembler plus lourd. Tes journées ressemblent à…' },
    },
  },
  {
    day: 4, chapter: 1, title: 'Ce qui va bien',
    question: 'Trois choses qui vont plutôt bien dans ta vie en ce moment, même toutes petites ?',
    chips: ['Ma santé', 'Mon couple', 'Mes amies', 'Mon travail', 'Ma maison', 'Moi, un peu'],
    variants: {
      regles: { question: 'Même en jour de règles, il y a du bon. Trois choses qui vont plutôt bien en ce moment ?' },
      retard: { question: 'Peu importe ce qui se passe en ce moment, trois choses qui vont plutôt bien dans ta vie ?' },
    },
    tip: 'Relis-les ce soir avant de dormir.',
  },
  {
    day: 5, chapter: 1, title: 'Me sentir moi',
    question: 'De 1 à 10, à quel point te sens-tu toi-même ces temps-ci ? Qu’est-ce qui ferait +1 ?',
    chips: ['1 à 3', '4 à 5', '6 à 7', '8 à 10'],
    variants: {
      fertile: { question: 'Autour de l’ovulation, on se sent souvent plus affirmée. De 1 à 10, tu te sens toi à combien ?' },
      grossesse: { question: 'Ton corps et ta vie changent. De 1 à 10, à quel point te sens-tu toi ? Qu’est-ce qui ferait +1 ?' },
    },
  },
  {
    day: 6, chapter: 1, title: 'Ce que je porte',
    question: 'Qu’est-ce qui pèse le plus sur tes épaules cette semaine ?',
    chips: ['Le travail', 'La maison', 'L’organisation', 'Une inquiétude', 'Ma santé', 'Les autres'],
    variants: {
      premenstruel: { question: 'Avant les règles, ce qui pèse se sent plus fort. Qu’est-ce qui est le plus lourd en ce moment ?' },
      luteale: { question: 'Qu’est-ce qui prend trop de place sur tes épaules cette semaine ?' },
    },
    tip: 'Écrire ce qui pèse, c’est déjà le poser à côté de toi.',
  },
  {
    day: 7, chapter: 1, title: 'Ma petite voix',
    question: 'Quand quelque chose ne se passe pas comme prévu, ta petite voix te parle comment ?',
    chips: ['Durement', 'Avec impatience', 'Comme une coach', 'Gentiment', 'Ça dépend des jours'],
    variants: {
      premenstruel: { question: 'En ce moment, ta petite voix peut être plus sévère. Elle te dit quoi, et que lui répondrait une amie ?' },
      regles: { question: 'Quand tu es fatiguée comme aujourd’hui, ta petite voix te parle comment ?' },
    },
    tip: 'Ce soir, réponds-toi comme tu répondrais à ta meilleure amie.',
  },
  {
    day: 8, chapter: 1, title: 'Un moment rien qu’à moi',
    question: 'La dernière fois que tu as eu un vrai moment rien qu’à toi, c’était…',
    chips: ['Aujourd’hui', 'Cette semaine', 'Ce mois-ci', 'Je ne sais plus'],
    variants: {
      folliculaire: { question: 'Ton dernier vrai moment rien qu’à toi, c’était quand ? Et qu’as-tu envie d’en faire cette semaine ?' },
    },
    tip: 'Bloque 10 min dans ton agenda demain, avec ton prénom dessus.',
  },
  {
    day: 9, chapter: 1, title: 'Mes réveils',
    question: 'Comment tu te réveilles, ces jours-ci ?',
    chips: ['Reposée', 'Ça va', 'Fatiguée', 'Épuisée', 'Réveillée la nuit'],
    variants: {
      regles: { question: 'Pendant les règles, le sommeil est souvent moins réparateur. Comment tu te réveilles ces jours-ci ?' },
      premenstruel: { question: 'Avant les règles, les nuits peuvent être plus agitées. Comment tu te réveilles en ce moment ?' },
      grossesse: { question: 'Les nuits changent souvent pendant la grossesse. Comment tu te réveilles ces jours-ci ?' },
    },
  },
  {
    day: 10, chapter: 1, title: 'Le mot du jour',
    question: 'Choisis le mot qui colle le mieux à ton humeur d’aujourd’hui.',
    chips: ['Sereine', 'Fébrile', 'Lasse', 'Joyeuse', 'Agacée', 'Émue'],
    variants: {
      fertile: { question: 'Choisis le mot qui colle à ton humeur du jour.', chips: ['Pétillante', 'Sereine', 'Confiante', 'Agitée', 'Tendre', 'Lasse'] },
      premenstruel: { question: 'Choisis le mot qui colle à ton humeur du jour, sans te juger.', chips: ['À fleur de peau', 'Lasse', 'Agacée', 'Sereine', 'Émue', 'Ça va'] },
    },
  },
  {
    day: 11, chapter: 1, title: 'Tous mes rôles',
    question: 'Quels rôles tiens-tu en ce moment ? Lequel prend le plus de place ?',
    chips: ['Pro', 'Partenaire', 'Maman ou future maman', 'Fille', 'Amie', 'Organisatrice'],
    variants: {
      luteale: { question: 'Parmi tous tes rôles, lequel te demande le plus d’énergie cette semaine ?' },
    },
    tip: 'Entoure le rôle où tu te sens le plus toi.',
  },
  {
    day: 12, chapter: 1, title: 'Ce que je m’autorise',
    question: 'Complète : en ce moment, je ne m’autorise pas assez à…',
    chips: ['Me reposer', 'Dire non', 'Demander', 'M’amuser', 'Pleurer', 'Ne rien faire'],
    variants: {
      regles: { question: 'Pendant les règles, ralentir est normal. Qu’est-ce que tu ne t’autorises pas assez en ce moment ?' },
      grossesse: { question: 'Complète : en ce moment, j’aimerais m’autoriser davantage à…' },
    },
    tip: 'Choisis-en une et offre-la-toi aujourd’hui, 5 minutes.',
  },
  {
    day: 13, chapter: 1, title: 'À la femme d’il y a un an',
    question: 'Écris une phrase à la femme que tu étais il y a un an. Qu’aimerais-tu lui dire ?',
    chips: ['Tu as tenu bon', 'Tu avais raison', 'Repose-toi', 'Ça va aller', 'Je suis fière de toi'],
    variants: {
      folliculaire: { question: 'Écris une phrase à la femme que tu étais il y a un an. Qu’a-t-elle construit qui te sert aujourd’hui ?' },
      retard: { question: 'Écris une phrase douce à la femme que tu étais il y a un an.' },
    },
  },
  {
    day: 14, chapter: 1, title: 'Mes petits bonheurs',
    question: 'Qu’est-ce qui t’a fait sourire aujourd’hui, même une seconde ?',
    chips: ['Un rayon de soleil', 'Un message', 'Un rire', 'Un bon café', 'Une chanson', 'Un câlin'],
    variants: {
      regles: { question: 'Même dans une journée lente, un petit bonheur s’est glissé. Lequel ?' },
      premenstruel: { question: 'Les jours lourds aussi ont leur petite lumière. Qu’est-ce qui t’a fait sourire aujourd’hui ?' },
    },
    tip: 'Prends-le en photo dans ta tête : tu y reviendras.',
  },
  {
    day: 15, chapter: 1, title: 'Là où j’en suis',
    question: 'Après ces deux semaines, qu’as-tu découvert sur l’endroit où tu en es ?',
    chips: ['Je suis fatiguée', 'Ça va mieux que prévu', 'J’ai besoin de souffler', 'Je me retrouve un peu', 'Je porte beaucoup'],
    variants: {
      regles: { question: 'Temps de bilan, pile au bon moment. Qu’as-tu découvert sur l’endroit où tu en es ?' },
    },
    tip: 'Ce que tu as noté n’est pas une note : c’est un point de départ.',
  },

  // ---------- Chapitre 2 · Mon énergie ----------
  {
    day: 16, chapter: 2, title: 'Ma batterie',
    question: 'Ta batterie intérieure aujourd’hui, elle est à combien ?',
    chips: ['0 à 20 %', '20 à 50 %', '50 à 80 %', '80 à 100 %'],
    variants: {
      regles: { question: 'Pendant les règles, la batterie se recharge lentement. Elle est à combien aujourd’hui ?' },
      folliculaire: { question: 'L’énergie revient souvent en ce moment. Ta batterie est à combien aujourd’hui ?' },
      grossesse: { question: 'Ton corps fait un énorme travail en ce moment. Ta batterie est à combien aujourd’hui ?' },
    },
  },
  {
    day: 17, chapter: 2, title: 'Ce qui me remplit',
    question: 'Trois choses qui te rechargent vraiment (pas celles qui « devraient ») ?',
    chips: ['Dormir', 'Marcher dehors', 'Rire avec une amie', 'Lire', 'Bouger', 'Être seule'],
    variants: {
      folliculaire: { question: 'Phase d’envies : qu’est-ce qui te recharge vraiment, et que tu pourrais faire plus souvent ?' },
      luteale: { question: 'Quand l’énergie baisse, qu’est-ce qui te recharge vraiment, sans effort ?' },
    },
    tip: 'Glisse une de ces trois choses dans ta journée de demain.',
  },
  {
    day: 18, chapter: 2, title: 'Ce qui me vide',
    question: 'Qu’est-ce qui a pompé ton énergie aujourd’hui ?',
    chips: ['Les écrans', 'Une personne', 'Le bruit', 'Trop de tâches', 'Une inquiétude', 'Le manque de sommeil'],
    variants: {
      premenstruel: { question: 'Avant les règles, on a moins de réserve. Qu’est-ce qui t’a le plus vidée aujourd’hui ?' },
      luteale: { question: 'Qu’est-ce qui t’a coûté le plus d’énergie aujourd’hui ? Pourrais-tu en faire moins cette semaine ?' },
    },
  },
  {
    day: 19, chapter: 2, title: 'Mes heures d’or',
    question: 'À quel moment de la journée tu te sens le plus pleine d’énergie ?',
    chips: ['Tôt le matin', 'Fin de matinée', 'Après le déjeuner', 'En fin de journée', 'Le soir'],
    variants: {
      fertile: { question: 'Autour de l’ovulation, l’énergie est souvent au top. À quel moment de la journée tu la sens le plus ?' },
    },
    tip: 'Protège ce créneau pour ce qui compte pour toi, pas pour la vaisselle.',
  },
  {
    day: 20, chapter: 2, title: 'L’inventaire invisible',
    question: 'Note tout ce que tu as dans la tête à penser, prévoir ou retenir en ce moment. Juste le vider ici.',
    chips: ['Des RDV', 'Les courses', 'Des cadeaux', 'Des papiers', 'Le linge', 'Les repas'],
    variants: {
      premenstruel: { question: 'Avant les règles, la charge mentale paraît plus lourde. Vide ici tout ce que ta tête retient.' },
      grossesse: { question: 'Entre les RDV et les préparatifs, vide ici tout ce que ta tête retient en ce moment.' },
    },
    tip: 'Une liste écrite, c’est une liste que ta tête n’a plus à porter.',
  },
  {
    day: 21, chapter: 2, title: 'Ce qui peut sortir',
    question: 'Dans cette liste, qu’est-ce qui pourrait être fait plus tard, plus simplement, ou par quelqu’un d’autre ?',
    chips: ['Plus tard', 'Plus simple', 'Par quelqu’un d’autre', 'Pas du tout'],
    variants: {
      luteale: { question: 'Phase où l’on a besoin de limites : qu’est-ce que tu pourrais lâcher, simplifier ou confier cette semaine ?' },
      regles: { question: 'En jour de règles, on fait le minimum. Qu’est-ce qui peut attendre ou être confié ?' },
    },
    tip: 'Choisis une seule chose et barre-la. Ça suffit pour aujourd’hui.',
  },
  {
    day: 22, chapter: 2, title: 'Mes petites fuites',
    question: 'Quelles petites choses grignotent ton énergie sans que tu t’en rendes compte ?',
    chips: ['Scroller', 'Dire oui par réflexe', 'Ruminer', 'Tout vérifier deux fois', 'Viser le parfait'],
    variants: {
      folliculaire: { question: 'Tu as de l’élan en ce moment : quelle petite fuite d’énergie aimerais-tu boucher ?' },
    },
    tip: 'Repère-la une seule fois demain, sans rien changer. Juste la voir.',
  },
  {
    day: 23, chapter: 2, title: 'Ce que mon corps demande',
    question: 'Qu’est-ce que ton corps te demande cette semaine ?',
    chips: ['Dormir plus', 'Bouger', 'Manger chaud', 'Du calme', 'Du soleil', 'Des câlins'],
    variants: {
      regles: { question: 'Pendant les règles, ton corps demande souvent de la douceur. Qu’est-ce qu’il réclame aujourd’hui ?', chips: ['Une bouillotte', 'Dormir plus', 'Manger chaud', 'Du calme', 'Une balade douce', 'Des câlins'] },
      fertile: { question: 'Ton corps a souvent plus d’élan en ce moment. Qu’est-ce qu’il a envie de faire ?', chips: ['Danser', 'Courir', 'Sortir', 'Voir du monde', 'Créer', 'Bouger fort'] },
      grossesse: { question: 'Qu’est-ce que ton corps te demande cette semaine ? Écoute-le, il sait.' },
    },
  },
  {
    day: 24, chapter: 2, title: 'Les gens qui me portent',
    question: 'Avec qui te sens-tu plus légère après l’avoir vue ou appelée ?',
    chips: ['Une amie', 'Ma sœur', 'Ma mère', 'Mon ou ma partenaire', 'Une collègue', 'Je cherche encore'],
    variants: {
      fertile: { question: 'Phase où le lien fait du bien : avec qui as-tu envie de passer du temps cette semaine ?' },
      premenstruel: { question: 'Qui te fait du bien quand tu es à fleur de peau, sans rien te demander ?' },
    },
    tip: 'Envoie-lui un petit message aujourd’hui, juste pour dire que tu penses à elle.',
  },
  {
    day: 25, chapter: 2, title: 'Une journée à 80 %',
    question: 'Imagine une journée normale, mais agréable à 80 %. Qu’est-ce qui changerait ?',
    chips: ['Moins de précipitation', 'Une pause à midi', 'Un vrai repas', 'Du temps dehors', 'Une soirée calme'],
    variants: {
      folliculaire: { question: 'Phase de projets : dessine une journée normale, mais agréable à 80 %. Qu’est-ce qui change ?' },
      luteale: { question: 'Imagine une journée plus douce cette semaine. Qu’enlèverais-tu pour qu’elle soit agréable à 80 % ?' },
    },
  },
  {
    day: 26, chapter: 2, title: 'Ma liste de joies',
    question: 'Écris 5 petites joies qui prennent moins de 10 minutes.',
    chips: ['Un thé chaud', 'Une chanson fort', 'Un bain', 'Un carré de chocolat', 'Le soleil sur la peau', 'Un épisode'],
    variants: {
      regles: { question: 'Liste 5 petites joies douces, parfaites pour un jour de règles.' },
      premenstruel: { question: 'Liste 5 petites joies réconfortantes pour les jours où tout pèse un peu.' },
      folliculaire: { question: 'Liste 5 petites joies nouvelles que tu aimerais tester ce mois-ci.' },
    },
    tip: 'Garde cette liste sous la main : c’est ta trousse de secours.',
  },
  {
    day: 27, chapter: 2, title: 'Le non qui libère',
    question: 'Une chose que tu pourrais ne pas faire cette semaine, sans que rien de grave n’arrive ?',
    chips: ['Le ménage parfait', 'Une sortie de trop', 'Répondre tout de suite', 'Un plat maison', 'Une réunion'],
    variants: {
      luteale: { question: 'Phase où les limites protègent : qu’est-ce que tu choisis de ne pas faire cette semaine ?' },
      premenstruel: { question: 'Avant les règles, on a le droit d’alléger. Qu’est-ce que tu enlèves de ta semaine ?' },
    },
  },
  {
    day: 28, chapter: 2, title: 'Mes sas de transition',
    question: 'Qu’est-ce qui t’aide à passer d’un rôle à l’autre (travail, maison, toi) ?',
    chips: ['Une musique', 'Une douche', 'Un thé', 'Quelques pas dehors', 'Respirer', 'Rien encore'],
    variants: {
      grossesse: { question: 'Quel petit sas t’aide à souffler entre deux moments de ta journée ?' },
    },
    tip: 'Essaie 3 respirations lentes avant de franchir la porte ce soir.',
  },
  {
    day: 29, chapter: 2, title: 'Merci, mon corps',
    question: 'Remercie ton corps pour une chose qu’il a faite pour toi cette semaine.',
    chips: ['Il m’a portée', 'Il a dansé', 'Il a récupéré', 'Il m’a alertée', 'Il a pris soin des autres'],
    variants: {
      regles: { question: 'Ton corps travaille fort en ce moment. Pour quoi as-tu envie de le remercier ?' },
      grossesse: { question: 'Ton corps fait quelque chose d’immense. Pour quoi as-tu envie de le remercier aujourd’hui ?' },
      retard: { question: 'Sans rien attendre de lui, pour quoi as-tu envie de remercier ton corps cette semaine ?' },
    },
  },
  {
    day: 30, chapter: 2, title: 'Mon bilan énergie',
    question: 'En deux semaines, qu’as-tu appris sur ce qui te remplit et ce qui te vide ?',
    chips: ['Je me disperse', 'Je dors trop peu', 'Les gens me portent', 'Bouger me recharge', 'Je porte trop'],
    variants: {
      folliculaire: { question: 'Fin du chapitre énergie : qu’as-tu envie de garder pour la suite ?' },
    },
    tip: 'Choisis une seule source d’énergie à protéger pour le mois qui vient.',
  },

  // ---------- Chapitre 3 · Mes besoins ----------
  {
    day: 31, chapter: 3, title: 'Là, j’ai besoin de…',
    question: 'Complète sans réfléchir : là, maintenant, j’ai besoin de…',
    chips: ['Repos', 'Calme', 'Lien', 'Mouvement', 'Plaisir', 'Aide'],
    variants: {
      luteale: { question: 'Phase où les besoins se font entendre : là, maintenant, de quoi as-tu besoin ?' },
      regles: { question: 'En jour de règles, écoute-toi : là, maintenant, j’ai besoin de…' },
    },
  },
  {
    day: 32, chapter: 3, title: 'Derrière l’agacement',
    question: 'Pense à ton dernier agacement. Quel besoin n’était pas nourri à ce moment-là ?',
    chips: ['Calme', 'Respect', 'Aide', 'Temps', 'Reconnaissance', 'Repos'],
    variants: {
      premenstruel: { question: 'Avant les règles, on s’agace plus vite, et c’est normal. Derrière ton dernier agacement, quel besoin ?' },
      luteale: { question: 'Ton dernier agacement disait sûrement un besoin. Lequel ?' },
    },
    tip: 'Un agacement, c’est souvent un besoin qui frappe à la porte.',
  },
  {
    day: 33, chapter: 3, title: 'Ce que je n’ose pas demander',
    question: 'Qu’est-ce que tu aimerais demander, sans oser pour l’instant ?',
    chips: ['Un coup de main', 'Du temps seule', 'Un câlin', 'Qu’on m’écoute', 'Une soirée off', 'Un merci'],
    variants: {
      fertile: { question: 'Phase où l’on s’affirme plus facilement : qu’aimerais-tu enfin demander ?' },
      grossesse: { question: 'Qu’aimerais-tu demander à ton entourage en ce moment, sans oser encore ?' },
    },
  },
  {
    day: 34, chapter: 3, title: 'Ma façon de demander',
    question: 'Quand tu as besoin d’aide, en général, tu…',
    chips: ['Demandes clairement', 'Attends qu’on devine', 'Fais tout toute seule', 'Râles d’abord', 'Laisses tomber'],
    variants: {
      folliculaire: { question: 'Quand tu as besoin d’aide, tu fais comment ? Et comment aimerais-tu faire ?' },
    },
    tip: 'Personne ne lit dans les pensées. Dire, c’est donner une chance.',
  },
  {
    day: 35, chapter: 3, title: 'Ma demande en une phrase',
    question: 'Écris ta demande en une phrase : « J’aurais besoin que… ». Pas besoin de te justifier.',
    chips: ['…tu gères le dîner', '…tu prennes le relais', '…tu m’écoutes', '…on parte ensemble', '…j’aie une heure'],
    variants: {
      fertile: { question: 'Tu es souvent plus à l’aise pour t’affirmer en ce moment. Écris ta demande : « J’aurais besoin que… »' },
      luteale: { question: 'Pose ta demande simplement : « J’aurais besoin que… ». Tes besoins comptent.' },
    },
    tip: 'Dis-la aujourd’hui à une seule personne.',
  },
  {
    day: 36, chapter: 3, title: 'Là où ça déborde',
    question: 'Où as-tu senti, récemment, que ça débordait ?',
    chips: ['Le travail', 'La famille', 'Les sollicitations', 'Les écrans', 'Mon temps à moi', 'Ma tête'],
    variants: {
      luteale: { question: 'Phase des limites : où sens-tu que ça déborde en ce moment ?' },
      premenstruel: { question: 'Juste avant les règles, la coupe se remplit vite. Où ça déborde en ce moment ?' },
    },
  },
  {
    day: 37, chapter: 3, title: 'Mon non tout doux',
    question: 'Choisis la formule de refus qui te ressemble le plus.',
    chips: ['« Pas cette fois »', '« Je te redis »', '« Ce n’est pas possible »', '« Oui, mais plus tard »', '« Non, merci »'],
    variants: {
      fertile: { question: 'Tu as souvent plus d’aplomb en ce moment. Quelle formule de refus as-tu envie d’essayer ?' },
      luteale: { question: 'Un non doux protège ton énergie. Quelle formule te ressemble ?' },
    },
    tip: 'Entraîne-toi à la dire à voix haute, une fois, dans la voiture.',
  },
  {
    day: 38, chapter: 3, title: 'Quand je prends du temps',
    question: 'Quand tu prends du temps pour toi, quelle petite voix se lève ?',
    chips: ['« Fais autre chose »', '« Ils ont besoin de moi »', '« Pas maintenant »', '« Tu ne le mérites pas »', 'Aucune, enfin !'],
    variants: {
      regles: { question: 'Te reposer pendant les règles, c’est écouter ton corps. Quelle petite voix se lève quand tu ralentis ?' },
      grossesse: { question: 'Ralentir en ce moment, c’est prendre soin de deux. Quelle petite voix se lève quand tu t’arrêtes ?' },
    },
    tip: 'Cette petite voix ne dit pas la vérité. Souvent, elle dit juste que tu changes.',
  },
  {
    day: 39, chapter: 3, title: 'Comme une amie',
    question: 'Si tu te traitais comme une personne que tu aimes, que t’offrirais-tu cette semaine ?',
    chips: ['Une sieste', 'Un repas tranquille', 'Une sortie', 'Un livre', 'Une soirée sans rien', 'Un massage'],
    variants: {
      premenstruel: { question: 'Les jours sensibles, tu mérites la même douceur que tu donnes aux autres. Que t’offres-tu ?' },
      folliculaire: { question: 'Si tu étais ta meilleure amie, quel joli projet lui proposerais-tu cette semaine ?' },
    },
  },
  {
    day: 40, chapter: 3, title: 'Mieux récupérer',
    question: 'Qu’est-ce qui t’aiderait à mieux dormir ou mieux récupérer en ce moment ?',
    chips: ['Me coucher plus tôt', 'Moins d’écrans', 'Une pièce plus calme', 'Moins penser le soir', 'De l’aide le matin'],
    variants: {
      premenstruel: { question: 'Le sommeil est souvent plus léger avant les règles. Qu’est-ce qui t’aiderait à mieux récupérer ?' },
      grossesse: { question: 'Qu’est-ce qui t’aiderait à mieux te reposer en ce moment, de jour comme de nuit ?' },
    },
    tip: 'Ce soir, pose ton téléphone dans une autre pièce 30 min avant de dormir.',
  },
  {
    day: 41, chapter: 3, title: 'Un espace à moi',
    question: 'As-tu un coin à toi, chez toi ? Sinon, à quoi ressemblerait-il ?',
    chips: ['Un fauteuil', 'Un coin lecture', 'Ma salle de bain', 'Un bout de balcon', 'Ma voiture', 'Pas encore'],
    variants: {
      folliculaire: { question: 'Phase d’envies : à quoi ressemblerait un petit coin rien qu’à toi, chez toi ?' },
    },
    tip: 'Même une bougie et un plaid sur un coin de canapé, ça compte.',
  },
  {
    day: 42, chapter: 3, title: 'Être vue',
    question: 'Qu’aimerais-tu qu’on remarque de tout ce que tu fais, sans que tu aies à le dire ?',
    chips: ['Mon organisation', 'Ma patience', 'Mes efforts', 'Ma fatigue', 'Ma créativité', 'Mon travail'],
    variants: {
      luteale: { question: 'Phase où l’on a besoin d’être reconnue : qu’aimerais-tu qu’on voie de tout ce que tu fais ?' },
      fertile: { question: 'De quoi es-tu fière cette semaine, que tu aimerais partager à voix haute ?' },
    },
    tip: 'Et si tu te le disais toi-même, ce soir ?',
  },
  {
    day: 43, chapter: 3, title: 'Confier vraiment',
    question: 'Une tâche que tu pourrais confier entièrement, y compris le fait d’y penser ?',
    chips: ['Les RDV', 'Les courses', 'Le linge', 'Les repas', 'Les papiers', 'Les cadeaux'],
    variants: {
      luteale: { question: 'Cette semaine, quelle tâche pourrais-tu confier entièrement, y compris le fait d’y penser ?' },
      premenstruel: { question: 'Avant les règles, allège-toi : quelle tâche confier entièrement cette semaine ?' },
      grossesse: { question: 'Quelle tâche pourrais-tu confier entièrement pour te préserver en ce moment ?' },
    },
    tip: 'Confier, c’est aussi accepter que ce soit fait autrement.',
  },
  {
    day: 44, chapter: 3, title: 'Mes non-négociables',
    question: 'Les 3 choses que tu protèges coûte que coûte pour aller bien ?',
    chips: ['Mon sommeil', 'Mon sport', 'Mes amies', 'Mon moment calme', 'Mes repas', 'Ma soirée off'],
    variants: {
      fertile: { question: 'Tu es souvent plus affirmée en ce moment : quelles 3 choses décides-tu de protéger ?' },
    },
  },
  {
    day: 45, chapter: 3, title: 'Mon bilan besoins',
    question: 'Quel besoin est revenu le plus souvent ? Et qu’as-tu commencé à faire pour lui ?',
    chips: ['Repos', 'Calme', 'Lien', 'Aide', 'Espace', 'Reconnaissance'],
    variants: {
      regles: { question: 'Bilan au calme : quel besoin est revenu le plus souvent ces 15 jours ?' },
    },
    tip: 'Écris ton besoin n°1 sur un post-it et colle-le où tu le verras.',
  },

  // ---------- Chapitre 4 · Moi, au-delà de maman ----------
  {
    day: 46, chapter: 4, title: 'La fille de 15 ans',
    question: 'Qu’est-ce que tu adorais faire à 15 ans, juste pour toi ?',
    chips: ['Dessiner', 'Danser', 'Lire', 'Chanter', 'Faire du sport', 'Écrire'],
    variants: {
      folliculaire: { question: 'Phase d’envies : qu’adorais-tu faire à 15 ans, et qu’est-ce qui en reste en toi ?' },
      regles: { question: 'Bien au chaud, souviens-toi : qu’adorais-tu faire à 15 ans, juste pour toi ?' },
    },
    tip: 'Remets une chanson de cette époque aujourd’hui.',
  },
  {
    day: 47, chapter: 4, title: 'Trois mots pour moi',
    question: 'Trois mots qui te décrivent, sans parler de ce que tu fais pour les autres.',
    chips: ['Curieuse', 'Drôle', 'Sensible', 'Têtue', 'Créative', 'Libre'],
    variants: {
      fertile: { question: 'Phase où l’on se sent rayonner : trois mots qui te décrivent, rien qu’à toi ?' },
      premenstruel: { question: 'Même dans les jours plus sensibles, trois jolis mots qui te décrivent ?' },
    },
  },
  {
    day: 48, chapter: 4, title: 'Mes valeurs',
    question: 'Choisis les valeurs qui comptent le plus pour toi en ce moment.',
    chips: ['Liberté', 'Douceur', 'Créativité', 'Justice', 'Famille', 'Aventure'],
    variants: {
      luteale: { question: 'Quelles valeurs veux-tu protéger, même quand tu es fatiguée ?' },
    },
    tip: 'Regarde ta semaine : où ta valeur n°1 a-t-elle eu de la place ?',
  },
  {
    day: 49, chapter: 4, title: 'Une envie mise de côté',
    question: 'Une envie que tu as rangée dans un tiroir et qui te fait encore un peu vibrer ?',
    chips: ['Voyager', 'Reprendre une passion', 'Changer de métier', 'Apprendre', 'Créer quelque chose'],
    variants: {
      folliculaire: { question: 'C’est souvent la phase des projets : quelle envie oubliée as-tu envie de ressortir ?' },
      fertile: { question: 'Tu as de l’élan en ce moment : quelle envie mise de côté as-tu envie de dire à quelqu’un ?' },
      grossesse: { question: 'Une envie rien qu’à toi, que tu aimerais garder vivante pendant cette période ?' },
    },
  },
  {
    day: 50, chapter: 4, title: 'Ma fierté à moi',
    question: 'De quoi es-tu fière chez toi, qui n’a rien à voir avec ce que tu fais pour les autres ?',
    chips: ['Mon humour', 'Mon courage', 'Ma curiosité', 'Ma persévérance', 'Mon regard', 'Mon goût'],
    variants: {
      premenstruel: { question: 'Les jours où tu doutes, rappelle-toi : de quoi es-tu fière chez toi ?' },
      fertile: { question: 'Ose le dire : de quoi es-tu fière chez toi, rien qu’à toi ?' },
    },
    tip: 'Dis-le à voix haute. Oui, même si ça fait bizarre.',
  },
  {
    day: 51, chapter: 4, title: 'Une journée rien qu’à moi',
    question: 'Une journée entière sans obligation, rien que pour toi : tu fais quoi ?',
    chips: ['Je dors', 'Je pars seule', 'Je crée', 'Je vois mes amies', 'Je me fais chouchouter', 'Je marche'],
    variants: {
      regles: { question: 'Une journée cocon rien qu’à toi : à quoi ressemblerait-elle ?' },
      folliculaire: { question: 'Une journée d’aventure rien qu’à toi : tu fais quoi ?' },
    },
    tip: 'Et si tu en gardais une demi-journée dans le mois qui vient ?',
  },
  {
    day: 52, chapter: 4, title: 'Pleinement moi',
    question: 'Quand te sens-tu le plus pleinement toi ?',
    chips: ['En riant', 'En créant', 'Dans la nature', 'En bougeant', 'Avec mes amies', 'Seule au calme'],
    variants: {
      fertile: { question: 'Phase où l’on rayonne souvent : dans quels moments te sens-tu le plus pleinement toi ?' },
      luteale: { question: 'Phase plus intérieure : dans quels moments calmes te sens-tu le plus toi ?' },
    },
  },
  {
    day: 53, chapter: 4, title: 'Ce qui me passionne',
    question: 'Une chose qui t’a passionnée récemment : un livre, une idée, une conversation ?',
    chips: ['Un livre', 'Un podcast', 'Une série', 'Une conversation', 'Un lieu', 'Une idée'],
    variants: {
      folliculaire: { question: 'Phase curieuse : quelle idée, quel livre ou quel sujet te donne envie d’en savoir plus ?' },
    },
    tip: 'Accorde-toi 10 min pour creuser ce sujet, sans but.',
  },
  {
    day: 54, chapter: 4, title: 'Un rêve, un tout petit pas',
    question: 'Un rêve, même grand, et la plus petite étape possible vers lui ?',
    chips: ['Me renseigner', 'En parler', 'Bloquer une date', 'Mettre de côté', 'Essayer une fois'],
    variants: {
      folliculaire: { question: 'C’est le bon moment pour les projets : un rêve, et le tout premier petit pas ?' },
      fertile: { question: 'Tu as de l’aplomb en ce moment : un rêve, et à qui pourrais-tu en parler ?' },
      regles: { question: 'Sans pression : un rêve que tu gardes au chaud, et le plus petit pas possible ?' },
    },
  },
  {
    day: 55, chapter: 4, title: 'Dans un an',
    question: 'Complète : dans un an, j’aimerais qu’on dise de moi…',
    chips: ['Elle rayonne', 'Elle s’écoute', 'Elle a osé', 'Elle est sereine', 'Elle s’amuse'],
    variants: {
      grossesse: { question: 'Dans un an, au-delà de tout ce qui aura changé, qu’aimerais-tu qu’on dise de toi ?' },
      premenstruel: { question: 'Avec douceur : dans un an, j’aimerais me sentir…', chips: ['Plus légère', 'Plus sereine', 'Plus libre', 'Plus entourée', 'Plus moi'] },
    },
  },
  {
    day: 56, chapter: 4, title: 'Sans rôle à jouer',
    question: 'Avec qui peux-tu être juste toi, sans rôle à jouer ?',
    chips: ['Une amie', 'Ma sœur', 'Mon ou ma partenaire', 'Seule avec moi', 'Je cherche encore'],
    variants: {
      fertile: { question: 'Phase où le lien fait du bien : avec qui as-tu envie d’être juste toi cette semaine ?' },
      luteale: { question: 'Avec qui peux-tu poser ton masque et dire « là, je suis fatiguée » ?' },
    },
    tip: 'Propose-lui un moment rien que vous deux.',
  },
  {
    day: 57, chapter: 4, title: 'Juste pour le plaisir',
    question: 'Une activité juste pour le plaisir, sans but ni performance, à essayer ce mois-ci ?',
    chips: ['Poterie', 'Danse', 'Chant', 'Jardinage', 'Peinture', 'Photo'],
    variants: {
      folliculaire: { question: 'Phase d’envies nouvelles : quelle activité plaisir as-tu envie de tester ce mois-ci ?' },
      regles: { question: 'Une activité douce, juste pour le plaisir, à garder pour les jours cocon ?', chips: ['Lecture', 'Coloriage', 'Tricot', 'Musique', 'Écriture', 'Puzzle'] },
    },
  },
  {
    day: 58, chapter: 4, title: 'Lettre à moi dans 60 jours',
    question: 'Écris quelques lignes à la femme que tu seras dans 60 jours.',
    chips: ['Prends soin de toi', 'Continue', 'Je crois en toi', 'N’oublie pas de rire', 'Tu as le droit'],
    variants: {
      premenstruel: { question: 'Avec toute ta tendresse, écris quelques lignes à la femme que tu seras dans 60 jours.' },
      grossesse: { question: 'Écris quelques lignes à la femme que tu seras dans 60 jours, avec tout ce qui aura changé.' },
    },
    tip: 'Fais une capture : tu pourras la relire dans 60 jours.',
  },
  {
    day: 59, chapter: 4, title: 'Ce que je garde',
    question: 'De ce voyage, quelle habitude, quelle idée ou quelle phrase as-tu envie de garder ?',
    chips: ['Mon moment à moi', 'Demander de l’aide', 'Dire non', 'Écouter mes besoins', 'Ma liste de joies'],
    variants: {
      luteale: { question: 'Quelle limite ou quel besoin as-tu appris à respecter, et as-tu envie de garder ?' },
    },
  },
  {
    day: 60, chapter: 4, title: 'Revenue à moi',
    question: 'Complète : aujourd’hui, en pensant à moi, je me sens…',
    chips: ['Plus légère', 'Plus à l’écoute', 'Fière', 'Encore en chemin', 'Plus moi'],
    variants: {
      regles: { question: 'Dernier jour, tout en douceur. Complète : aujourd’hui, en pensant à moi, je me sens…' },
      retard: { question: 'Dernier jour, quoi qu’il se passe. Complète : aujourd’hui, en pensant à moi, je me sens…' },
    },
    tip: 'Tu as pris 60 rendez-vous avec toi. Bravo, vraiment.',
  },
];

export interface RuleDef {
  key: string;
  /** ≤ 40 chars. */
  label: string;
  /** ≤ 80 chars. */
  detail: string;
  area: 'corps' | 'tete' | 'coeur';
  auto?: 'move' | 'water' | 'habit:me' | 'habit:screens' | 'habit:sleep' | 'habit:light' | 'habit:breakfast' | 'habit:coherence' | 'habit:walk';
}

export const RULES: RuleDef[] = [
  { key: 'move', label: 'Bouger 30 min', detail: 'Séance, marche, danse : tout compte (dès 20 min de séance ou 7 000 pas).', area: 'corps', auto: 'move' },
  { key: 'water', label: 'Eau & tisanes 2 L', detail: 'Une gourde près de toi, les tisanes comptent aussi.', area: 'corps', auto: 'water' },
  { key: 'meal-seated', label: 'Un vrai repas assis, sans écran', detail: 'Au moins un repas posé, à table, pour savourer.', area: 'corps' },
  { key: 'me-time', label: '10 min rien que pour moi', detail: 'Dix minutes sans objectif : une vraie pause, pas du temps perdu.', area: 'coeur', auto: 'habit:me' },
  { key: 'screens-off', label: 'Écrans off 30 min avant le coucher', detail: 'Un livre, une tisane, une douche : une demi-heure calme.', area: 'tete', auto: 'habit:screens' },
  { key: 'sleep', label: 'Au lit à heure régulière', detail: 'Viser 7 h ou plus, à peu près à la même heure.', area: 'corps', auto: 'habit:sleep' },
  { key: 'light', label: 'Lumière du matin, 10 min', detail: 'Dix minutes dehors le matin pour caler ton horloge.', area: 'corps', auto: 'habit:light' },
  { key: 'breakfast', label: 'Petit-déj qui tient au corps', detail: 'Des protéines le matin, pour ne pas arriver affamée à midi.', area: 'corps', auto: 'habit:breakfast' },
  { key: 'breathe', label: 'Respirer, 3 pauses', detail: 'Trois séances de cohérence cardiaque dans la journée.', area: 'tete', auto: 'habit:coherence' },
  { key: 'walk', label: 'Marcher 20 min dehors', detail: 'Une marche tranquille, seule ou accompagnée.', area: 'corps', auto: 'habit:walk' },
  { key: 'gratitude', label: '3 mercis du jour', detail: 'Trois petites choses qui t’ont fait du bien aujourd’hui.', area: 'coeur' },
  { key: 'connect', label: 'Un message à quelqu’un que j’aime', detail: 'Un vocal, un SMS, un appel : un vrai moment de lien.', area: 'coeur' },
  { key: 'ask', label: 'Demander ou déléguer une chose', detail: 'Une petite tâche confiée, pensée comprise.', area: 'tete' },
  { key: 'slow-morning', label: 'Pas d’écran au réveil', detail: 'Les 20 premières minutes de la journée sont pour toi.', area: 'tete' },
];

export const DEFAULT_RULES: string[] = ['move', 'water', 'meal-seated', 'me-time', 'screens-off'];

export interface ResetStep { key: string; title: string; prompt: string; chips?: string[] }

export const SUNDAY_RESET: ResetStep[] = [
  {
    key: 'review',
    title: 'Relire ta semaine',
    prompt: 'Prends une minute pour regarder ta semaine : ton énergie, tes besoins, ce que tu as écrit. Qu’est-ce qui te saute aux yeux ?',
    chips: ['Une semaine dense', 'Une jolie semaine', 'Une semaine en dents de scie', 'Une semaine fatigante', 'Je suis fière de moi'],
  },
  {
    key: 'felt',
    title: 'Ce qui m’a fait du bien, ce qui m’a vidée',
    prompt: 'Note ce qui t’a fait du bien cette semaine, puis ce qui t’a vidée. Les deux sont des infos précieuses.',
    chips: ['Dormir', 'Bouger', 'Mes amies', 'Un moment seule', 'Trop d’écrans', 'Trop de tâches', 'Une personne', 'Le manque de sommeil'],
  },
  {
    key: 'prepare',
    title: 'Préparer la semaine',
    prompt: 'Regarde ton cycle et tes séances prévues. Quelle intention douce as-tu envie de te donner pour les 7 jours à venir ?',
    chips: ['Ralentir', 'Oser', 'Me protéger', 'M’amuser', 'Dormir plus', 'Demander de l’aide'],
  },
  {
    key: 'load',
    title: 'Alléger ma charge mentale',
    prompt: 'Trois choses que tu peux lâcher, simplifier ou confier cette semaine. Écris-les, et dis à qui si besoin.',
    chips: ['Les courses', 'Les repas', 'Le linge', 'Les RDV', 'Les papiers', 'Le ménage'],
  },
  {
    key: 'pleasure',
    title: 'Un petit plaisir planifié',
    prompt: 'Choisis un petit plaisir rien qu’à toi et donne-lui un jour. Il compte autant qu’un rendez-vous.',
    chips: ['Un bain', 'Un café dehors', 'Un livre', 'Une balade', 'Un film', 'Voir une amie'],
  },
];

/** Prompt of the day (clamped to 1..60), with the phase variant when one exists. */
export function promptFor(day: number, phase: PromptPhase | null): { title: string; question: string; chips: string[]; tip?: string; chapter: JourneyChapter } {
  const d = Math.min(PROMPTS.length, Math.max(1, Math.floor(Number.isFinite(day) ? day : 1)));
  const p = PROMPTS.find((x) => x.day === d) ?? PROMPTS[0];
  const v = phase ? p.variants?.[phase] : undefined;
  const chapter = CHAPTERS.find((c) => c.index === p.chapter) ?? CHAPTERS[0];
  return {
    title: p.title,
    question: v?.question ?? p.question,
    chips: v?.chips ?? p.chips,
    ...(p.tip ? { tip: p.tip } : {}),
    chapter,
  };
}
