// "Revenir à moi" — 60-day guided journal (5 min/day max): content only.
// 4 chapters of 15 days. Each chapter opens with a quote, a short psychoeducation
// page ("Comprendre…") and a clipped card "À relire quand ça monte". Each day holds
// 2–3 short open questions (the first one with optional quick chips, and cycle-phase
// variants that replace it). Checkpoints on day 0, 30 and 60 (scales 0–10, life wheel,
// intention, values…). A 6-day "Anxiété & apaisement" module sits in chapter 2.
// Also: life-wheel domains, emotion wheel, values list, a "what studies say" page,
// gentle daily rules and the Sunday reset steps.
// Original, generic content written for this app: no user data. French, informal "tu",
// written for women and mothers, cycle-aware, never guilt.

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

// ---------- life wheel ----------

export type LifeDomainKey = 'sante' | 'carriere' | 'finance' | 'relations' | 'contribution' | 'loisirs' | 'amour' | 'developpement';

export interface LifeDomain {
  key: LifeDomainKey;
  /** ≤ 40 chars. */
  label: string;
  /** ≤ 90 chars: what to think about when rating 0–10. */
  hint: string;
}

/** Roue de vie: 8 domains, each rated 0 (pas du tout satisfaite) … 10 (pleinement). */
export const LIFE_DOMAINS: LifeDomain[] = [
  { key: 'sante', label: 'Santé / énergie', hint: 'Sommeil, forme, douleurs, l’énergie que tu as pour tes journées.' },
  { key: 'carriere', label: 'Carrière / projets', hint: 'Ton travail, tes projets, le sens que tu y trouves.' },
  { key: 'finance', label: 'Finance', hint: 'Ta sérénité avec l’argent, ton autonomie, tes marges.' },
  { key: 'relations', label: 'Relations (amis, famille)', hint: 'Les gens qui comptent, le lien, le soutien autour de toi.' },
  { key: 'contribution', label: 'Contribution / impact', hint: 'Ce que tu apportes au monde, aux autres, à une cause.' },
  { key: 'loisirs', label: 'Loisirs / créativité', hint: 'Le jeu, le plaisir, ce que tu fais juste parce que tu aimes.' },
  { key: 'amour', label: 'Amour / couple', hint: 'La tendresse, la complicité, ou ta relation à l’amour en ce moment.' },
  { key: 'developpement', label: 'Développement personnel / spiritualité', hint: 'Grandir, apprendre, te sentir alignée, ce qui te dépasse.' },
];

// ---------- emotion wheel ----------

export type EmotionKey = 'joie' | 'confiance' | 'peur' | 'surprise' | 'tristesse' | 'degout' | 'colere' | 'anticipation';

export interface EmotionFamily {
  key: EmotionKey;
  label: string;
  /** CSS custom property name for the wedge colour (e.g. '--emo-joie'). */
  color: string;
  /** Suggested light-theme value for that token (fallback). */
  hex: string;
  /** 6–8 nuances, ≤ 24 chars each. */
  nuances: string[];
}

/** Roue des émotions: 8 families, from the gentlest to the most intense nuance. */
export const EMOTIONS: EmotionFamily[] = [
  { key: 'joie', label: 'Joie', color: '--emo-joie', hex: '#F7B9CF', nuances: ['Sérénité', 'Gaieté', 'Fierté', 'Tendresse', 'Soulagement', 'Gratitude', 'Enthousiasme', 'Émerveillement'] },
  { key: 'confiance', label: 'Confiance', color: '--emo-confiance', hex: '#A9B6E8', nuances: ['Calme', 'Sécurité', 'Acceptation', 'Apaisement', 'Assurance', 'Proximité', 'Admiration'] },
  { key: 'peur', label: 'Peur', color: '--emo-peur', hex: '#D99A9A', nuances: ['Inquiétude', 'Nervosité', 'Appréhension', 'Insécurité', 'Vulnérabilité', 'Angoisse', 'Panique'] },
  { key: 'surprise', label: 'Surprise', color: '--emo-surprise', hex: '#E7B3E3', nuances: ['Étonnement', 'Curiosité', 'Confusion', 'Fascination', 'Stupeur', 'Choc'] },
  { key: 'tristesse', label: 'Tristesse', color: '--emo-tristesse', hex: '#D8D4CC', nuances: ['Nostalgie', 'Mélancolie', 'Lassitude', 'Déception', 'Solitude', 'Découragement', 'Chagrin'] },
  { key: 'degout', label: 'Dégoût', color: '--emo-degout', hex: '#8FA7BE', nuances: ['Gêne', 'Malaise', 'Aversion', 'Rejet', 'Écœurement', 'Mépris', 'Répulsion'] },
  { key: 'colere', label: 'Colère', color: '--emo-colere', hex: '#D7896B', nuances: ['Agacement', 'Irritation', 'Frustration', 'Sentiment d’injustice', 'Exaspération', 'Ressentiment', 'Rage'] },
  { key: 'anticipation', label: 'Anticipation', color: '--emo-anticipation', hex: '#EDC08E', nuances: ['Intérêt', 'Espoir', 'Vigilance', 'Impatience', 'Hâte', 'Optimisme', 'Excitation'] },
];

// ---------- values ----------

/** Values to pick from (day 0: choose 3). */
export const VALUES: string[] = [
  'Liberté', 'Douceur', 'Famille', 'Créativité', 'Justice', 'Aventure', 'Honnêteté', 'Sécurité',
  'Bienveillance', 'Indépendance', 'Humour', 'Curiosité', 'Équilibre', 'Loyauté', 'Courage',
  'Simplicité', 'Partage', 'Authenticité', 'Sérénité', 'Apprendre', 'Beauté', 'Respect',
];

// ---------- chapters ----------

export interface JourneyQuote {
  /** ≤ 180 chars. */
  text: string;
  /** Only when the attribution is certain. */
  author?: string;
}

/** Psychoeducation page opening a chapter or module. */
export interface UnderstandPage {
  /** ≤ 60 chars, e.g. "Comprendre la charge mentale". */
  title: string;
  /** 2–4 short paragraphs, ≤ 320 chars each. */
  paragraphs: string[];
}

/** Clipped card to come back to in hard moments. */
export interface RereadCard {
  title: 'À relire quand ça monte';
  /** 3–4 lines, ≤ 90 chars each. */
  lines: string[];
}

export interface JourneyChapter {
  index: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  /** ≤ 280 chars. */
  intro: string;
  recapPrompt: string;
  quote: JourneyQuote;
  understand: UnderstandPage;
  reread: RereadCard;
}

const REREAD = 'À relire quand ça monte' as const;

export const CHAPTERS: JourneyChapter[] = [
  {
    index: 1,
    title: 'Me poser',
    subtitle: 'Où j’en suis, sans jugement',
    intro: 'Pendant 15 jours, on ne change rien : on regarde. Ta fatigue, tes humeurs, ce qui va bien aussi. Pas de bonne ou de mauvaise réponse, juste une photo honnête et tendre de là où tu es.',
    recapPrompt: 'En relisant ces 15 jours, qu’est-ce qui te frappe le plus sur l’endroit où tu en es ?',
    quote: { text: 'Le curieux paradoxe, c’est que lorsque je m’accepte telle que je suis, alors je peux changer.', author: 'Carl Rogers' },
    understand: {
      title: 'Comprendre la fatigue qui ne passe pas',
      paragraphs: [
        'Quand on porte beaucoup, le corps et la tête finissent par fonctionner en mode « tenir ». On avance, on gère, et on ne remarque plus ce qu’on ressent. Ce n’est pas un défaut : c’est une adaptation, très humaine, à une période chargée.',
        'Observer avant de changer, c’est le point de départ de tout. Mettre des mots sur ta météo, tes tensions, tes rôles, aide ton cerveau à ranger ce qu’il porte en vrac. Ce qui est nommé devient plus facile à regarder.',
        'Ton cycle colore aussi tes journées : énergie, sommeil, patience peuvent varier d’une semaine à l’autre. Les questions s’adaptent à ta phase, pour que tu puisses t’écouter sans te comparer à toi-même d’il y a dix jours.',
      ],
    },
    reread: {
      title: REREAD,
      lines: [
        'Je suis fatiguée, pas en retard sur ma vie.',
        'Regarder où j’en suis, c’est déjà prendre soin de moi.',
        'Une mauvaise journée n’efface pas tout le chemin.',
        'Je peux commencer petit : une respiration, une ligne.',
      ],
    },
  },
  {
    index: 2,
    title: 'Mon énergie',
    subtitle: 'Ce qui me remplit, ce qui me vide',
    intro: 'On fait l’inventaire de ta batterie : ce qui la recharge, ce qui la vide en douce, et tout ce que tu portes dans ta tête pour les autres. Le but n’est pas d’en faire plus, mais de fuir moins d’énergie.',
    recapPrompt: 'Qu’est-ce qui te recharge vraiment, et qu’est-ce que tu as envie de laisser filer ?',
    quote: { text: 'Presque tout se remet à fonctionner si on le débranche quelques minutes… y compris toi.', author: 'Anne Lamott' },
    understand: {
      title: 'Comprendre la charge mentale',
      paragraphs: [
        'La charge mentale, ce n’est pas seulement faire : c’est penser à faire. Prévoir le rendez-vous, se souvenir du cadeau, anticiper le goûter. Ce travail est invisible, continu, et il consomme autant d’énergie que les tâches elles-mêmes.',
        'Ton cerveau garde ouvertes toutes les « boucles » non terminées, comme des onglets. Plus il y en a, plus il fatigue, même au repos. Écrire la liste sur papier ferme une partie de ces onglets : la tête n’a plus à tout retenir.',
        'Le but n’est pas d’être plus organisée, mais de porter moins. Lâcher, simplifier, confier pensée comprise : chaque boucle fermée te rend un peu d’énergie pour toi.',
      ],
    },
    reread: {
      title: REREAD,
      lines: [
        'Je n’ai pas à tout porter seule.',
        'Ce qui est écrit n’a plus besoin d’être retenu.',
        'Fait, c’est mieux que parfait.',
        'Me recharger, c’est aussi utile que cocher une tâche.',
      ],
    },
  },
  {
    index: 3,
    title: 'Mes besoins',
    subtitle: 'Écouter, demander, poser mes limites',
    intro: 'Tes besoins ne sont pas des caprices. Ces 15 jours, on apprend à les entendre, à les dire simplement et à poser des limites douces. Demander de l’aide, c’est aussi prendre soin des gens qui t’aiment.',
    recapPrompt: 'Quel besoin est revenu le plus souvent, et quelle demande as-tu osé faire (ou aimerais faire) ?',
    quote: { text: 'Prendre soin de moi n’est pas de la complaisance, c’est de la préservation de soi.', author: 'Audre Lorde' },
    understand: {
      title: 'Comprendre la culpabilité',
      paragraphs: [
        'La culpabilité de maman arrive souvent quand on fait quelque chose pour soi : une sieste, une soirée, un non. Elle ne mesure pas si tu es une bonne mère. Elle mesure surtout l’écart entre ta vie réelle et une image impossible.',
        'Derrière chaque agacement ou chaque coup de fatigue se cache souvent un besoin : repos, calme, aide, reconnaissance. Un besoin ignoré ne disparaît pas, il parle plus fort. L’entendre tôt, c’est éviter qu’il crie.',
        'Une limite douce n’est pas un rejet. Elle dit « voilà ce que je peux donner aujourd’hui ». Les enfants qui voient leur mère prendre soin d’elle apprennent qu’on a le droit d’exister avec ses besoins.',
      ],
    },
    reread: {
      title: REREAD,
      lines: [
        'Un besoin n’est pas un caprice, c’est une information.',
        'Je peux dire non à une demande et oui à moi.',
        'Me sentir coupable ne veut pas dire que j’ai mal fait.',
        'Demander de l’aide, c’est faire confiance.',
      ],
    },
  },
  {
    index: 4,
    title: 'Moi, au-delà de maman',
    subtitle: 'Mes envies, mes rêves, qui je suis',
    intro: 'Tu es bien plus que tes rôles. Maman, future maman, pro, amie… et toi, dans tout ça ? On retrouve tes envies, tes valeurs, la fille de 15 ans et la femme que tu as envie de devenir.',
    recapPrompt: 'Qui es-tu, en dehors de tout ce que tu fais pour les autres ? Qu’est-ce que tu gardes de ces 60 jours ?',
    quote: { text: 'Une femme doit avoir de l’argent et une chambre à soi.', author: 'Virginia Woolf' },
    understand: {
      title: 'Comprendre la matrescence',
      paragraphs: [
        'Devenir mère transforme le corps, l’agenda, les relations, et l’identité. Des chercheuses parlent de « matrescence », une transition aussi profonde que l’adolescence. Se sentir un peu perdue dans ce passage est fréquent, et normal.',
        'Ta personnalité d’avant n’a pas disparu : elle attend un peu de place. Tes goûts, ta curiosité, ton humour, tes rêves font toujours partie de toi, même quand ils passent après le reste depuis longtemps.',
        'Retrouver ce qui t’anime ne retire rien à ta famille. Une femme qui se sent elle-même a souvent plus de patience, de joie et d’élan à partager.',
      ],
    },
    reread: {
      title: REREAD,
      lines: [
        'Je suis une personne entière, pas seulement un rôle.',
        'Mes envies comptent, même les toutes petites.',
        'J’ai le droit de changer et de me redécouvrir.',
        'Un petit pas vers moi suffit pour aujourd’hui.',
      ],
    },
  },
];

// ---------- modules ----------

export interface JourneyModule {
  key: 'anxiete';
  /** ≤ 60 chars. */
  title: string;
  chapter: 1 | 2 | 3 | 4;
  /** Journey days covered, in order. */
  days: number[];
  /** ≤ 280 chars. */
  intro: string;
  /** One short label per step (same order as `days`). */
  steps: string[];
  quote: JourneyQuote;
  understand: UnderstandPage;
  reread: RereadCard;
}

export const MODULES: JourneyModule[] = [
  {
    key: 'anxiete',
    title: 'Anxiété & apaisement',
    chapter: 2,
    days: [21, 22, 23, 24, 25, 26],
    intro: 'Six jours pour regarder ton anxiété avec curiosité plutôt qu’avec peur : repérer ce qui la déclenche, comprendre ce qu’elle protège, l’accueillir, et te construire une petite trousse d’apaisement qui te ressemble.',
    steps: ['Identifier mes déclencheurs', 'Comprendre mes peurs', 'Accueillir sans jugement', 'Mes outils d’apaisement', 'Renforcer ma maîtrise', 'Mon plan anti-anxiété'],
    quote: { text: 'Une vague monte, culmine, puis redescend. Toujours.' },
    understand: {
      title: 'Comprendre l’anxiété',
      paragraphs: [
        'L’anxiété est un système d’alarme : ton cerveau anticipe un danger et prépare ton corps à réagir. Cœur qui accélère, ventre noué, pensées qui tournent : c’est un mécanisme de protection, pas un défaut de caractère.',
        'Elle devient pesante quand l’alarme sonne trop souvent ou trop fort, pour des choses qui ne sont pas des dangers. Chez beaucoup de mamans, elle se nourrit de la fatigue, de la charge mentale et du « et si… ». Avant les règles, elle peut aussi monter d’un cran.',
        'Le but n’est pas de la faire disparaître, mais de la reconnaître, de comprendre ce qu’elle signale et de l’aider à redescendre. Ça s’apprend, petit à petit, avec des outils simples.',
        'Si l’anxiété t’empêche de dormir, de manger ou de vivre ta journée depuis plusieurs semaines, parles-en à ta médecin, ta sage-femme ou un·e psy. Tu mérites ce soutien.',
      ],
    },
    reread: {
      title: REREAD,
      lines: [
        'Ce que je ressens est un signal, pas un verdict.',
        'Je vérifie les faits avant de croire mes pensées.',
        'Une seule micro-action suffit, là, maintenant.',
        'Ça va redescendre : j’ai déjà traversé ces vagues.',
      ],
    },
  },
];

// ---------- science page ----------

export interface SciencePage {
  title: string;
  intro: string;
  points: { title: string; text: string; source?: string }[];
  benefits: { title: string; text: string }[];
  summary: string;
}

export const SCIENCE: SciencePage = {
  title: 'Ce que disent les études',
  intro: 'Écrire quelques minutes sur ce qu’on vit n’est pas qu’une jolie habitude. Depuis les années 1980, des chercheurs étudient ses effets. Ils sont réels, souvent modestes, et plus nets quand on écrit avec sincérité, régulièrement.',
  points: [
    {
      title: 'Écrire allège l’esprit',
      text: 'Poser ses émotions par écrit, même quelques minutes sur quelques jours, a été associé à moins de rumination, à un meilleur bien-être et, dans plusieurs études, à moins de visites chez le médecin.',
      source: 'Pennebaker, 1997, Psychological Science',
    },
    {
      title: 'Des effets confirmés sur de nombreuses études',
      text: 'En regroupant les résultats de nombreuses expériences, l’écriture expressive montre un effet positif, modéré mais réel, sur la santé psychologique et physique.',
      source: 'Smyth, 1998, Journal of Consulting and Clinical Psychology',
    },
    {
      title: 'Nommer une émotion la calme',
      text: 'Mettre un mot précis sur ce qu’on ressent diminue l’activité de l’amygdale, la zone d’alerte du cerveau. C’est tout l’intérêt de la roue des émotions.',
      source: 'Lieberman et al., 2007, Psychological Science',
    },
    {
      title: 'La gratitude nourrit le bien-être',
      text: 'Noter régulièrement ce pour quoi on est reconnaissante a été associé à plus d’optimisme, à plus d’émotions positives et, chez certaines personnes, à un meilleur sommeil.',
      source: 'Emmons & McCullough, 2003, Journal of Personality and Social Psychology',
    },
  ],
  benefits: [
    { title: 'Clarifier tes priorités', text: 'Sur le papier, ce qui compte vraiment apparaît plus vite.' },
    { title: 'Alléger ta tête', text: 'Ce qui est écrit n’a plus besoin d’être retenu.' },
    { title: 'Mieux te connaître', text: 'Tes forces, tes freins et tes besoins deviennent visibles.' },
    { title: 'Voir ton chemin', text: 'En relisant, tu mesures tout ce qui a bougé.' },
  ],
  summary: 'Écrire aide à réguler ses émotions et à prendre du recul. Pas besoin de beau style ni de longues pages : cinq minutes sincères suffisent. Ici, il n’y a ni note ni retard, seulement toi.',
};

// ---------- daily prompts ----------

export type PromptPhase = 'regles' | 'folliculaire' | 'fertile' | 'luteale' | 'premenstruel' | 'retard' | 'grossesse';

export type ThemeKey =
  | 'meteo' | 'corps' | 'modeles' | 'enfant' | 'valeurs' | 'croyances' | 'forces' | 'anxiete'
  | 'charge' | 'culpabilite' | 'besoins' | 'limites' | 'joie' | 'gratitude' | 'lien' | 'identite'
  | 'vision' | 'lettre' | 'energie' | 'emotions' | 'douceur' | 'sommeil' | 'bilan';

export const THEMES: Record<ThemeKey, string> = {
  meteo: 'Météo intérieure',
  corps: 'Corps & tensions',
  modeles: 'Héros & modèles',
  enfant: 'Enfant intérieur',
  valeurs: 'Valeurs',
  croyances: 'Croyances limitantes',
  forces: 'Forces',
  anxiete: 'Anxiété & apaisement',
  charge: 'Charge mentale',
  culpabilite: 'Culpabilité',
  besoins: 'Besoins',
  limites: 'Limites',
  joie: 'Joie & plaisirs simples',
  gratitude: 'Gratitude',
  lien: 'Couple & lien',
  identite: 'Identité au-delà de maman',
  vision: 'Vision 5–10 ans',
  lettre: 'Lettre à moi',
  energie: 'Énergie',
  emotions: 'Émotions',
  douceur: 'Douceur envers moi',
  sommeil: 'Sommeil & récupération',
  bilan: 'Bilan',
};

export interface JourneyQuestion {
  /** ≤ 160 chars. */
  q: string;
  /** Optional quick answers: 3–6 chips, ≤ 40 chars each. */
  chips?: string[];
}

export interface JourneyPrompt {
  /** 1..60 */
  day: number;
  chapter: 1 | 2 | 3 | 4;
  /** ≤ 60 chars. */
  title: string;
  theme: ThemeKey;
  /** 2–3 short open questions; the first one carries the chips. */
  questions: JourneyQuestion[];
  /** = questions[0].q (backward compat). */
  question: string;
  /** = questions[0].chips (backward compat). */
  chips: string[];
  /** Phase variants replace the first question (and its chips when given). */
  variants?: Partial<Record<PromptPhase, { question: string; chips?: string[] }>>;
  /** ≤ 140 chars, optional micro-action. */
  tip?: string;
  /** Set on the anxiety module days. */
  module?: { key: JourneyModule['key']; step: number };
}

type PromptInput = Omit<JourneyPrompt, 'chapter' | 'question' | 'chips' | 'questions'> & {
  questions: [JourneyQuestion & { chips: string[] }, ...JourneyQuestion[]];
};

const P = (x: PromptInput): JourneyPrompt => ({
  ...x,
  chapter: Math.min(4, Math.max(1, Math.ceil(x.day / 15))) as 1 | 2 | 3 | 4,
  question: x.questions[0].q,
  chips: x.questions[0].chips,
});

const anx = (step: number) => ({ key: 'anxiete' as const, step });

export const PROMPTS: JourneyPrompt[] = [
  // ---------- Chapitre 1 · Me poser ----------
  P({
    day: 1, title: 'Ma météo intérieure', theme: 'meteo',
    questions: [
      { q: 'Si ta journée était une météo, ce serait plutôt…', chips: ['Grand soleil', 'Éclaircies', 'Ciel gris', 'Orage', 'Brouillard'] },
      { q: 'Qu’est-ce qui a fait passer un nuage, ou un rayon, aujourd’hui ?' },
      { q: 'De quoi aurais-tu besoin pour que demain soit un peu plus doux ?' },
    ],
    variants: {
      regles: { question: 'Pendant les règles, la météo intérieure bouge souvent. Elle ressemble à quoi aujourd’hui ?' },
      premenstruel: { question: 'Juste avant les règles, le ciel peut s’assombrir sans raison. Ta météo du jour, c’est…', chips: ['Éclaircies', 'Ciel gris', 'Orage', 'Brouillard', 'Pluie fine'] },
      grossesse: { question: 'Avec tout ce qui se passe dans ton corps, ta météo intérieure aujourd’hui, c’est…' },
    },
    tip: 'Aucune météo n’est mauvaise : elle passe. Note-la, c’est tout.',
  }),
  P({
    day: 2, title: 'Mon corps, là, maintenant', theme: 'corps',
    questions: [
      { q: 'Ferme les yeux pour 3 respirations. Où sens-tu le plus de tension ?', chips: ['Épaules', 'Mâchoire', 'Ventre', 'Dos', 'Tête', 'Nulle part'] },
      { q: 'Si cette tension pouvait parler, que te dirait-elle ?' },
      { q: 'Quel petit geste pourrait la soulager ce soir ?' },
    ],
    variants: {
      regles: { question: 'Trois respirations lentes. Où ton corps te parle-t-il le plus aujourd’hui ?', chips: ['Ventre', 'Bas du dos', 'Tête', 'Jambes', 'Seins', 'Nulle part'] },
      luteale: { question: 'Trois respirations. Où sens-tu que ton corps se crispe ou se fatigue cette semaine ?' },
    },
    tip: 'Pose une main là où ça serre et respire dedans 3 fois.',
  }),
  P({
    day: 3, title: 'Héros & modèles', theme: 'modeles',
    questions: [
      { q: 'Petite, qui admirais-tu ? Une femme de ta famille, une héroïne, une maîtresse…', chips: ['Ma mère', 'Ma grand-mère', 'Une héroïne de livre', 'Une maîtresse', 'Une artiste', 'Une amie'] },
      { q: 'Quelles qualités voyais-tu en elle ?' },
      { q: 'Laquelle de ces qualités as-tu envie de laisser grandir en toi ?' },
    ],
    variants: {
      folliculaire: { question: 'Phase pleine d’élan : quelle femme t’inspirait petite, et pourquoi ?' },
      luteale: { question: 'Pense à une femme qui t’a rassurée quand tu étais petite. Qui était-elle ?' },
    },
    tip: 'Ces qualités que tu admires, tu les portes déjà un peu : c’est pour ça qu’elles te parlent.',
  }),
  P({
    day: 4, title: 'Ce qui va bien', theme: 'gratitude',
    questions: [
      { q: 'Trois choses qui vont plutôt bien dans ta vie en ce moment, même toutes petites ?', chips: ['Ma santé', 'Mon couple', 'Mes amies', 'Mon travail', 'Ma maison', 'Moi, un peu'] },
      { q: 'Laquelle te doit quelque chose, à toi, à tes efforts ?' },
    ],
    variants: {
      regles: { question: 'Même en jour de règles, il y a du bon. Trois choses qui vont plutôt bien en ce moment ?' },
      retard: { question: 'Peu importe ce qui se passe en ce moment, trois choses qui vont plutôt bien dans ta vie ?' },
    },
    tip: 'Relis-les ce soir avant de dormir.',
  }),
  P({
    day: 5, title: 'Ma roue des émotions', theme: 'emotions',
    questions: [
      { q: 'Quelle famille d’émotions a pris le plus de place aujourd’hui ?', chips: ['Joie', 'Confiance', 'Peur', 'Surprise', 'Tristesse', 'Colère'] },
      { q: 'Cherche la nuance exacte dans la roue. Quel mot est le plus juste ?' },
      { q: 'Qu’est-ce que cette émotion essayait de te dire ?' },
    ],
    variants: {
      premenstruel: { question: 'Avant les règles, les émotions sont souvent plus intenses. Laquelle a pris le plus de place aujourd’hui ?' },
      fertile: { question: 'Phase souvent plus lumineuse : quelle émotion t’a le plus accompagnée aujourd’hui ?' },
      grossesse: { question: 'Les émotions vont et viennent fort en ce moment. Laquelle a dominé aujourd’hui ?' },
    },
    tip: 'Nommer une émotion avec précision aide à la calmer. Un mot suffit.',
  }),
  P({
    day: 6, title: 'Retrouver mon enfant intérieur', theme: 'enfant',
    questions: [
      { q: 'Quel plaisir simple te rendait heureuse quand tu étais enfant ?', chips: ['Jouer dehors', 'Dessiner', 'Les cabanes', 'Danser', 'Les histoires', 'Les goûters'] },
      { q: 'Comment pourrais-tu en glisser un petit bout dans ta semaine ?' },
      { q: 'De quoi la petite fille que tu étais aurait-elle besoin d’entendre de toi ?' },
    ],
    variants: {
      regles: { question: 'Bien au chaud, souviens-toi : quel plaisir simple te rendait heureuse enfant ?' },
      folliculaire: { question: 'Phase curieuse : quel jeu d’enfant as-tu envie de retrouver, même cinq minutes ?' },
    },
    tip: 'Joue avec tes enfants à un jeu que TU aimais, pour toi aussi.',
  }),
  P({
    day: 7, title: 'Ma petite voix', theme: 'douceur',
    questions: [
      { q: 'Quand quelque chose ne se passe pas comme prévu, ta petite voix te parle comment ?', chips: ['Durement', 'Avec impatience', 'Comme une coach', 'Gentiment', 'Ça dépend des jours'] },
      { q: 'Qu’est-ce qu’une amie bienveillante te dirait à la place ?' },
    ],
    variants: {
      premenstruel: { question: 'En ce moment, ta petite voix peut être plus sévère. Elle te dit quoi, et que lui répondrait une amie ?' },
      regles: { question: 'Quand tu es fatiguée comme aujourd’hui, ta petite voix te parle comment ?' },
    },
    tip: 'Ce soir, réponds-toi comme tu répondrais à ta meilleure amie.',
  }),
  P({
    day: 8, title: 'Un moment rien qu’à moi', theme: 'besoins',
    questions: [
      { q: 'La dernière fois que tu as eu un vrai moment rien qu’à toi, c’était…', chips: ['Aujourd’hui', 'Cette semaine', 'Ce mois-ci', 'Je ne sais plus'] },
      { q: 'Qu’est-ce que tu y as fait, ou qu’aimerais-tu y faire ?' },
    ],
    variants: {
      folliculaire: { question: 'Ton dernier vrai moment rien qu’à toi, c’était quand ? Et qu’as-tu envie d’en faire cette semaine ?' },
      grossesse: { question: 'Ton dernier vrai moment rien qu’à toi, rien que pour te reposer, c’était quand ?' },
    },
    tip: 'Bloque 10 min dans ton agenda demain, avec ton prénom dessus.',
  }),
  P({
    day: 9, title: 'Mes réveils', theme: 'sommeil',
    questions: [
      { q: 'Comment tu te réveilles, ces jours-ci ?', chips: ['Reposée', 'Ça va', 'Fatiguée', 'Épuisée', 'Réveillée la nuit'] },
      { q: 'Qu’est-ce qui occupe ta tête au moment de t’endormir ?' },
    ],
    variants: {
      regles: { question: 'Pendant les règles, le sommeil est souvent moins réparateur. Comment tu te réveilles ces jours-ci ?' },
      premenstruel: { question: 'Avant les règles, les nuits peuvent être plus agitées. Comment tu te réveilles en ce moment ?' },
      grossesse: { question: 'Les nuits changent souvent pendant la grossesse. Comment tu te réveilles ces jours-ci ?' },
    },
    tip: 'Note la pensée qui tourne sur un papier près du lit : elle peut attendre demain.',
  }),
  P({
    day: 10, title: 'Tous mes rôles', theme: 'identite',
    questions: [
      { q: 'Quels rôles tiens-tu en ce moment ?', chips: ['Pro', 'Partenaire', 'Maman ou future maman', 'Fille', 'Amie', 'Organisatrice'] },
      { q: 'Lequel prend le plus de place ? Et lequel aimerais-tu nourrir davantage ?' },
      { q: 'Dans lequel te sens-tu le plus toi ?' },
    ],
    variants: {
      luteale: { question: 'Parmi tous tes rôles, lequel te demande le plus d’énergie cette semaine ?' },
      fertile: { question: 'Parmi tous tes rôles, dans lequel te sens-tu rayonner en ce moment ?' },
    },
  }),
  P({
    day: 11, title: 'Ce que je m’autorise', theme: 'besoins',
    questions: [
      { q: 'Complète : en ce moment, je ne m’autorise pas assez à…', chips: ['Me reposer', 'Dire non', 'Demander', 'M’amuser', 'Pleurer', 'Ne rien faire'] },
      { q: 'Qu’est-ce qui se passerait de bien si tu te l’autorisais un peu ?' },
    ],
    variants: {
      regles: { question: 'Pendant les règles, ralentir est normal. Qu’est-ce que tu ne t’autorises pas assez en ce moment ?' },
      grossesse: { question: 'Complète : en ce moment, j’aimerais m’autoriser davantage à…' },
    },
    tip: 'Choisis-en une et offre-la-toi aujourd’hui, 5 minutes.',
  }),
  P({
    day: 12, title: 'À la femme d’il y a un an', theme: 'lettre',
    questions: [
      { q: 'Écris une phrase à la femme que tu étais il y a un an.', chips: ['Tu as tenu bon', 'Tu avais raison', 'Repose-toi', 'Ça va aller', 'Je suis fière de toi'] },
      { q: 'Qu’a-t-elle traversé que tu reconnais aujourd’hui ?' },
    ],
    variants: {
      folliculaire: { question: 'Écris une phrase à la femme que tu étais il y a un an. Qu’a-t-elle construit qui te sert aujourd’hui ?' },
      retard: { question: 'Écris une phrase douce à la femme que tu étais il y a un an.' },
    },
  }),
  P({
    day: 13, title: 'Mes petits bonheurs', theme: 'joie',
    questions: [
      { q: 'Qu’est-ce qui t’a fait sourire aujourd’hui, même une seconde ?', chips: ['Un rayon de soleil', 'Un message', 'Un rire', 'Un bon café', 'Une chanson', 'Un câlin'] },
      { q: 'Décris ce moment en une phrase, avec un détail : une couleur, un son, une odeur.' },
    ],
    variants: {
      regles: { question: 'Même dans une journée lente, un petit bonheur s’est glissé. Lequel ?' },
      premenstruel: { question: 'Les jours lourds aussi ont leur petite lumière. Qu’est-ce qui t’a fait sourire aujourd’hui ?' },
    },
    tip: 'Prends-le en photo dans ta tête : tu y reviendras.',
  }),
  P({
    day: 14, title: 'Ma roue de vie', theme: 'bilan',
    questions: [
      { q: 'Regarde ta roue de vie du jour 0. Quel domaine te fait du bien en ce moment ?', chips: ['Santé', 'Travail', 'Finance', 'Relations', 'Loisirs', 'Amour'] },
      { q: 'Quel domaine appelle un peu d’attention ?' },
      { q: 'Quel tout petit geste pourrait le faire monter d’un point ?' },
    ],
    variants: {
      luteale: { question: 'Phase plus intérieure : en regardant ta roue de vie, quel domaine te porte en ce moment ?' },
      folliculaire: { question: 'Phase de projets : dans ta roue de vie, quel domaine te donne le plus envie d’avancer ?' },
    },
    tip: 'Un point de plus, pas dix. Les petits gestes tiennent dans la durée.',
  }),
  P({
    day: 15, title: 'Là où j’en suis', theme: 'bilan',
    questions: [
      { q: 'Après ces deux semaines, qu’as-tu découvert sur l’endroit où tu en es ?', chips: ['Je suis fatiguée', 'Ça va mieux que prévu', 'J’ai besoin de souffler', 'Je me retrouve un peu', 'Je porte beaucoup'] },
      { q: 'Qu’as-tu envie d’emporter dans le chapitre suivant ?' },
    ],
    variants: {
      regles: { question: 'Temps de bilan, pile au bon moment. Qu’as-tu découvert sur l’endroit où tu en es ?' },
    },
    tip: 'Ce que tu as noté n’est pas une note : c’est un point de départ.',
  }),

  // ---------- Chapitre 2 · Mon énergie ----------
  P({
    day: 16, title: 'Ma batterie', theme: 'energie',
    questions: [
      { q: 'Ta batterie intérieure aujourd’hui, elle est à combien ?', chips: ['0 à 20 %', '20 à 50 %', '50 à 80 %', '80 à 100 %'] },
      { q: 'Qu’est-ce qui l’a le plus fait bouger aujourd’hui, dans un sens ou dans l’autre ?' },
    ],
    variants: {
      regles: { question: 'Pendant les règles, la batterie se recharge lentement. Elle est à combien aujourd’hui ?' },
      folliculaire: { question: 'L’énergie revient souvent en ce moment. Ta batterie est à combien aujourd’hui ?' },
      grossesse: { question: 'Ton corps fait un énorme travail en ce moment. Ta batterie est à combien aujourd’hui ?' },
    },
  }),
  P({
    day: 17, title: 'Ce qui me remplit', theme: 'energie',
    questions: [
      { q: 'Trois choses qui te rechargent vraiment (pas celles qui « devraient ») ?', chips: ['Dormir', 'Marcher dehors', 'Rire avec une amie', 'Lire', 'Bouger', 'Être seule'] },
      { q: 'Laquelle pourrait trouver une petite place demain ?' },
    ],
    variants: {
      folliculaire: { question: 'Phase d’envies : qu’est-ce qui te recharge vraiment, et que tu pourrais faire plus souvent ?' },
      luteale: { question: 'Quand l’énergie baisse, qu’est-ce qui te recharge vraiment, sans effort ?' },
    },
    tip: 'Glisse une de ces trois choses dans ta journée de demain.',
  }),
  P({
    day: 18, title: 'Ce qui me vide', theme: 'energie',
    questions: [
      { q: 'Qu’est-ce qui a pompé ton énergie aujourd’hui ?', chips: ['Les écrans', 'Une personne', 'Le bruit', 'Trop de tâches', 'Une inquiétude', 'Le manque de sommeil'] },
      { q: 'Sur quoi as-tu un tout petit peu de prise, cette semaine ?' },
    ],
    variants: {
      premenstruel: { question: 'Avant les règles, on a moins de réserve. Qu’est-ce qui t’a le plus vidée aujourd’hui ?' },
      luteale: { question: 'Qu’est-ce qui t’a coûté le plus d’énergie aujourd’hui ? Pourrais-tu en faire moins cette semaine ?' },
    },
  }),
  P({
    day: 19, title: 'L’inventaire invisible', theme: 'charge',
    questions: [
      { q: 'Vide ici tout ce que tu as dans la tête à penser, prévoir ou retenir en ce moment.', chips: ['Des RDV', 'Les courses', 'Des cadeaux', 'Des papiers', 'Le linge', 'Les repas'] },
      { q: 'Quelle pensée de cette liste revient le plus souvent ?' },
    ],
    variants: {
      premenstruel: { question: 'Avant les règles, la charge mentale paraît plus lourde. Vide ici tout ce que ta tête retient.' },
      grossesse: { question: 'Entre les RDV et les préparatifs, vide ici tout ce que ta tête retient en ce moment.' },
    },
    tip: 'Une liste écrite, c’est une liste que ta tête n’a plus à porter.',
  }),
  P({
    day: 20, title: 'Ce qui peut sortir', theme: 'charge',
    questions: [
      { q: 'Dans ta liste d’hier, qu’est-ce qui pourrait être fait plus tard, plus simplement, ou par quelqu’un d’autre ?', chips: ['Plus tard', 'Plus simple', 'Par quelqu’un d’autre', 'Pas du tout'] },
      { q: 'À qui pourrais-tu confier une chose, y compris le fait d’y penser ?' },
    ],
    variants: {
      luteale: { question: 'Phase où l’on a besoin de limites : qu’est-ce que tu pourrais lâcher, simplifier ou confier cette semaine ?' },
      regles: { question: 'En jour de règles, on fait le minimum. Qu’est-ce qui peut attendre ou être confié ?' },
    },
    tip: 'Choisis une seule chose et barre-la. Ça suffit pour aujourd’hui.',
  }),
  // Module · Anxiété & apaisement (jours 21–26)
  P({
    day: 21, title: 'Identifier mes déclencheurs', theme: 'anxiete', module: anx(1),
    questions: [
      { q: 'Dans quelles situations ton anxiété se manifeste-t-elle le plus ?', chips: ['Le soir', 'Au travail', 'La santé des enfants', 'L’argent', 'Le regard des autres', 'Sans raison claire'] },
      { q: 'Comment la sens-tu arriver dans ton corps ?' },
      { q: 'Qu’est-ce qui s’est passé juste avant, la dernière fois ?' },
    ],
    variants: {
      premenstruel: { question: 'Avant les règles, l’anxiété peut monter d’un cran. Dans quelles situations la sens-tu le plus en ce moment ?' },
      grossesse: { question: 'La grossesse amène son lot d’inquiétudes. Dans quelles situations l’anxiété se manifeste-t-elle le plus ?' },
    },
    tip: 'Repérer un déclencheur, c’est déjà reprendre un peu la main.',
  }),
  P({
    day: 22, title: 'Comprendre mes peurs', theme: 'anxiete', module: anx(2),
    questions: [
      { q: 'Quand tu t’inquiètes, quel « et si… » revient le plus ?', chips: ['Et s’il arrivait quelque chose', 'Et si je n’y arrivais pas', 'Et si on me jugeait', 'Et si je tombais malade', 'Et si ça empirait'] },
      { q: 'Qu’est-ce que cette peur essaie de protéger ?' },
      { q: 'Quels faits, aujourd’hui, la confirment ou la nuancent ?' },
    ],
    variants: {
      luteale: { question: 'En ce moment, quelle inquiétude revient le plus quand tu ralentis ?' },
      fertile: { question: 'Avec un peu plus d’aplomb ces jours-ci, regarde une peur en face : quel « et si… » revient ?' },
    },
    tip: 'Une peur qui protège quelque chose de précieux mérite d’être écoutée, pas obéie.',
  }),
  P({
    day: 23, title: 'Accueillir sans jugement', theme: 'anxiete', module: anx(3),
    questions: [
      { q: 'Si tu pouvais dire une phrase douce à ton anxiété, ce serait…', chips: ['Je te vois', 'Tu peux rester un peu', 'Merci de vouloir me protéger', 'On va y arriver', 'Je respire avec toi'] },
      { q: 'Comment réagis-tu d’habitude quand elle arrive ?' },
      { q: 'Qu’est-ce qui changerait si tu la laissais passer, comme une vague ?' },
    ],
    variants: {
      regles: { question: 'Les jours de règles, tout peut paraître plus fragile. Quelle phrase douce dirais-tu à ton anxiété ?' },
      premenstruel: { question: 'Ce qui monte avant les règles est réel, et passager. Quelle phrase douce dirais-tu à ton anxiété ?' },
    },
    tip: 'Résister à une émotion la fait souvent grossir. L’accueillir l’aide à passer.',
  }),
  P({
    day: 24, title: 'Mes outils d’apaisement', theme: 'anxiete', module: anx(4),
    questions: [
      { q: 'Qu’est-ce qui t’a déjà aidée à redescendre ?', chips: ['Respirer lentement', 'Marcher', 'Appeler quelqu’un', 'L’eau froide', 'Écrire', 'Une musique'] },
      { q: 'Lequel peux-tu faire en moins de 2 minutes, n’importe où ?' },
    ],
    variants: {
      luteale: { question: 'Phase où l’on a besoin de calme : qu’est-ce qui t’aide le mieux à redescendre ?' },
      grossesse: { question: 'Qu’est-ce qui t’apaise doucement, toi et ton corps, en ce moment ?' },
    },
    tip: 'Essaie maintenant : inspire 4 temps, expire 6 temps, cinq fois.',
  }),
  P({
    day: 25, title: 'Renforcer ma maîtrise', theme: 'anxiete', module: anx(5),
    questions: [
      { q: 'Une situation où tu as déjà traversé ton anxiété, et tenu bon ?', chips: ['Un entretien', 'Un accouchement', 'Une prise de parole', 'Une nuit difficile', 'Un rendez-vous médical'] },
      { q: 'Qu’est-ce qui t’a aidée, ce jour-là ?' },
      { q: 'Quelle petite chose redoutée pourrais-tu oser cette semaine, à ton rythme ?' },
    ],
    variants: {
      fertile: { question: 'Tu as souvent plus d’aplomb en ce moment. Raconte une fois où tu as traversé ton anxiété.' },
      folliculaire: { question: 'Phase d’élan : souviens-toi d’une fois où tu as traversé ton anxiété. Qu’est-ce qui t’a aidée ?' },
    },
    tip: 'Chaque vague traversée apprend à ton cerveau que tu en es capable.',
  }),
  P({
    day: 26, title: 'Mon plan anti-anxiété', theme: 'anxiete', module: anx(6),
    questions: [
      { q: 'Mon premier signal d’alerte, c’est…', chips: ['Le cœur qui s’emballe', 'Le ventre noué', 'Les pensées qui tournent', 'L’irritabilité', 'Le souffle court'] },
      { q: 'Quand il arrive, je fais d’abord… puis…' },
      { q: 'La personne que je peux appeler, et la phrase que je me répète :' },
    ],
    variants: {
      premenstruel: { question: 'Avant les règles, l’alarme peut sonner plus vite. Ton premier signal d’alerte, c’est…' },
    },
    tip: 'Fais une capture de ton plan : il sera là les jours où ça monte.',
  }),
  P({
    day: 27, title: 'Le non qui libère', theme: 'limites',
    questions: [
      { q: 'Une chose que tu pourrais ne pas faire cette semaine, sans que rien de grave n’arrive ?', chips: ['Le ménage parfait', 'Une sortie de trop', 'Répondre tout de suite', 'Un plat maison', 'Une réunion'] },
      { q: 'Que ferais-tu du temps ou de l’énergie libérés ?' },
    ],
    variants: {
      luteale: { question: 'Phase où les limites protègent : qu’est-ce que tu choisis de ne pas faire cette semaine ?' },
      premenstruel: { question: 'Avant les règles, on a le droit d’alléger. Qu’est-ce que tu enlèves de ta semaine ?' },
    },
  }),
  P({
    day: 28, title: 'Merci, mon corps', theme: 'corps',
    questions: [
      { q: 'Remercie ton corps pour une chose qu’il a faite pour toi cette semaine.', chips: ['Il m’a portée', 'Il a dansé', 'Il a récupéré', 'Il m’a alertée', 'Il a pris soin des autres'] },
      { q: 'Qu’est-ce qu’il te demande en retour, en ce moment ?' },
    ],
    variants: {
      regles: { question: 'Ton corps travaille fort en ce moment. Pour quoi as-tu envie de le remercier ?' },
      grossesse: { question: 'Ton corps fait quelque chose d’immense. Pour quoi as-tu envie de le remercier aujourd’hui ?' },
      retard: { question: 'Sans rien attendre de lui, pour quoi as-tu envie de remercier ton corps cette semaine ?' },
    },
  }),
  P({
    day: 29, title: 'Ma liste de joies', theme: 'joie',
    questions: [
      { q: 'Écris 5 petites joies qui prennent moins de 10 minutes.', chips: ['Un thé chaud', 'Une chanson fort', 'Un bain', 'Un carré de chocolat', 'Le soleil sur la peau', 'Un épisode'] },
      { q: 'Laquelle t’offres-tu avant la fin de la journée ?' },
    ],
    variants: {
      regles: { question: 'Liste 5 petites joies douces, parfaites pour un jour de règles.' },
      premenstruel: { question: 'Liste 5 petites joies réconfortantes pour les jours où tout pèse un peu.' },
      folliculaire: { question: 'Liste 5 petites joies nouvelles que tu aimerais tester ce mois-ci.' },
    },
    tip: 'Garde cette liste sous la main : c’est ta trousse de secours.',
  }),
  P({
    day: 30, title: 'Mon bilan énergie', theme: 'bilan',
    questions: [
      { q: 'En deux semaines, qu’as-tu appris sur ce qui te remplit et ce qui te vide ?', chips: ['Je me disperse', 'Je dors trop peu', 'Les gens me portent', 'Bouger me recharge', 'Je porte trop'] },
      { q: 'Quelle source d’énergie as-tu envie de protéger le mois prochain ?' },
    ],
    variants: {
      folliculaire: { question: 'Fin du chapitre énergie : qu’as-tu envie de garder pour la suite ?' },
    },
    tip: 'Choisis une seule source d’énergie à protéger pour le mois qui vient.',
  }),

  // ---------- Chapitre 3 · Mes besoins ----------
  P({
    day: 31, title: 'Là, j’ai besoin de…', theme: 'besoins',
    questions: [
      { q: 'Complète sans réfléchir : là, maintenant, j’ai besoin de…', chips: ['Repos', 'Calme', 'Lien', 'Mouvement', 'Plaisir', 'Aide'] },
      { q: 'À quoi ressemblerait la version « 5 minutes » de ce besoin ?' },
    ],
    variants: {
      luteale: { question: 'Phase où les besoins se font entendre : là, maintenant, de quoi as-tu besoin ?' },
      regles: { question: 'En jour de règles, écoute-toi : là, maintenant, j’ai besoin de…' },
    },
  }),
  P({
    day: 32, title: 'Derrière l’agacement', theme: 'besoins',
    questions: [
      { q: 'Pense à ton dernier agacement. Quel besoin n’était pas nourri à ce moment-là ?', chips: ['Calme', 'Respect', 'Aide', 'Temps', 'Reconnaissance', 'Repos'] },
      { q: 'Comment aurais-tu pu exprimer ce besoin, en une phrase ?' },
    ],
    variants: {
      premenstruel: { question: 'Avant les règles, on s’agace plus vite, et c’est normal. Derrière ton dernier agacement, quel besoin ?' },
      luteale: { question: 'Ton dernier agacement disait sûrement un besoin. Lequel ?' },
    },
    tip: 'Un agacement, c’est souvent un besoin qui frappe à la porte.',
  }),
  P({
    day: 33, title: 'La culpabilité de maman', theme: 'culpabilite',
    questions: [
      { q: 'Quand t’es-tu sentie coupable cette semaine ?', chips: ['En pensant à moi', 'En travaillant', 'En m’énervant', 'Devant les écrans', 'En disant non', 'Pas cette semaine'] },
      { q: 'Quelle règle invisible cette culpabilité défendait-elle ?' },
      { q: 'Que dirais-tu à une amie qui vivrait exactement la même chose ?' },
    ],
    variants: {
      premenstruel: { question: 'Avant les règles, la culpabilité crie plus fort. Quand l’as-tu sentie cette semaine ?' },
      grossesse: { question: 'Enceinte, la culpabilité peut se glisser partout. Quand l’as-tu sentie cette semaine ?' },
      regles: { question: 'Te reposer pendant les règles a pu réveiller de la culpabilité. Quand l’as-tu sentie cette semaine ?' },
    },
    tip: 'Une mère suffisamment bonne, c’est déjà beaucoup. Parfaite n’existe pas.',
  }),
  P({
    day: 34, title: 'Ce que je n’ose pas demander', theme: 'besoins',
    questions: [
      { q: 'Qu’est-ce que tu aimerais demander, sans oser pour l’instant ?', chips: ['Un coup de main', 'Du temps seule', 'Un câlin', 'Qu’on m’écoute', 'Une soirée off', 'Un merci'] },
      { q: 'Qu’est-ce qui te retient ?' },
      { q: 'Écris ta demande en une phrase : « J’aurais besoin que… »' },
    ],
    variants: {
      fertile: { question: 'Phase où l’on s’affirme plus facilement : qu’aimerais-tu enfin demander ?' },
      grossesse: { question: 'Qu’aimerais-tu demander à ton entourage en ce moment, sans oser encore ?' },
    },
    tip: 'Dis ta demande aujourd’hui à une seule personne. Pas besoin de te justifier.',
  }),
  P({
    day: 35, title: 'Mes croyances limitantes', theme: 'croyances',
    questions: [
      { q: 'Quelle phrase te freine le plus souvent ?', chips: ['« Je dois tout gérer »', '« Je ne suis pas capable »', '« Ce n’est pas pour moi »', '« Je n’ai pas le temps »', '« On va me juger »'] },
      { q: 'D’où vient-elle ? De qui l’as-tu entendue ?' },
      { q: 'Réécris-la en version plus juste et plus douce.' },
    ],
    variants: {
      premenstruel: { question: 'Avant les règles, les vieilles phrases reviennent fort. Laquelle te freine en ce moment ?' },
      folliculaire: { question: 'Phase d’élan : quelle phrase intérieure t’empêche d’avancer vers ce qui te tente ?' },
    },
    tip: 'Une croyance n’est pas un fait. C’est une vieille habitude de pensée.',
  }),
  P({
    day: 36, title: 'Là où ça déborde', theme: 'limites',
    questions: [
      { q: 'Où as-tu senti, récemment, que ça débordait ?', chips: ['Le travail', 'La famille', 'Les sollicitations', 'Les écrans', 'Mon temps à moi', 'Ma tête'] },
      { q: 'Quelle limite, même petite, protégerait cet endroit ?' },
    ],
    variants: {
      luteale: { question: 'Phase des limites : où sens-tu que ça déborde en ce moment ?' },
      premenstruel: { question: 'Juste avant les règles, la coupe se remplit vite. Où ça déborde en ce moment ?' },
    },
  }),
  P({
    day: 37, title: 'Mon non tout doux', theme: 'limites',
    questions: [
      { q: 'Choisis la formule de refus qui te ressemble le plus.', chips: ['« Pas cette fois »', '« Je te redis »', '« Ce n’est pas possible »', '« Oui, mais plus tard »', '« Non, merci »'] },
      { q: 'À qui, ou à quoi, aimerais-tu la dire cette semaine ?' },
    ],
    variants: {
      fertile: { question: 'Tu as souvent plus d’aplomb en ce moment. Quelle formule de refus as-tu envie d’essayer ?' },
      luteale: { question: 'Un non doux protège ton énergie. Quelle formule te ressemble ?' },
    },
    tip: 'Entraîne-toi à la dire à voix haute, une fois, dans la voiture.',
  }),
  P({
    day: 38, title: 'Quand je prends du temps', theme: 'culpabilite',
    questions: [
      { q: 'Quand tu prends du temps pour toi, quelle petite voix se lève ?', chips: ['« Fais autre chose »', '« Ils ont besoin de moi »', '« Pas maintenant »', '« Tu ne le mérites pas »', 'Aucune, enfin !'] },
      { q: 'Qu’as-tu envie de lui répondre, gentiment mais fermement ?' },
    ],
    variants: {
      regles: { question: 'Te reposer pendant les règles, c’est écouter ton corps. Quelle petite voix se lève quand tu ralentis ?' },
      grossesse: { question: 'Ralentir en ce moment, c’est prendre soin de deux. Quelle petite voix se lève quand tu t’arrêtes ?' },
    },
    tip: 'Cette petite voix ne dit pas la vérité. Souvent, elle dit juste que tu changes.',
  }),
  P({
    day: 39, title: 'Comme une amie', theme: 'douceur',
    questions: [
      { q: 'Si tu te traitais comme une personne que tu aimes, que t’offrirais-tu cette semaine ?', chips: ['Une sieste', 'Un repas tranquille', 'Une sortie', 'Un livre', 'Une soirée sans rien', 'Un massage'] },
      { q: 'Quel jour, et à quelle heure ?' },
    ],
    variants: {
      premenstruel: { question: 'Les jours sensibles, tu mérites la même douceur que tu donnes aux autres. Que t’offres-tu ?' },
      folliculaire: { question: 'Si tu étais ta meilleure amie, quel joli projet lui proposerais-tu cette semaine ?' },
    },
  }),
  P({
    day: 40, title: 'Mieux récupérer', theme: 'sommeil',
    questions: [
      { q: 'Qu’est-ce qui t’aiderait à mieux dormir ou mieux récupérer en ce moment ?', chips: ['Me coucher plus tôt', 'Moins d’écrans', 'Une pièce plus calme', 'Moins penser le soir', 'De l’aide le matin'] },
      { q: 'Qui pourrait t’aider à le mettre en place ?' },
    ],
    variants: {
      premenstruel: { question: 'Le sommeil est souvent plus léger avant les règles. Qu’est-ce qui t’aiderait à mieux récupérer ?' },
      grossesse: { question: 'Qu’est-ce qui t’aiderait à mieux te reposer en ce moment, de jour comme de nuit ?' },
    },
    tip: 'Ce soir, pose ton téléphone dans une autre pièce 30 min avant de dormir.',
  }),
  P({
    day: 41, title: 'Nous deux', theme: 'lien',
    questions: [
      { q: 'En ce moment, le lien avec ton ou ta partenaire (ou avec l’amour) ressemble à…', chips: ['Une équipe', 'Des colocs fatigués', 'Une complicité', 'Un peu de distance', 'Je suis seule et ça va', 'En reconstruction'] },
      { q: 'Quel petit moment à deux te manque ?' },
      { q: 'De quoi aurais-tu besoin de sa part, cette semaine ?' },
    ],
    variants: {
      fertile: { question: 'Phase où l’envie de lien est souvent plus forte : le couple, en ce moment, ressemble à…' },
      grossesse: { question: 'La grossesse transforme aussi le couple. Votre lien, en ce moment, ressemble à…' },
      luteale: { question: 'Phase plus intérieure : de quoi aurais-tu besoin dans ton couple, ou en amour, en ce moment ?' },
    },
    tip: 'Dix minutes à deux, sans écran ni logistique, ça compte.',
  }),
  P({
    day: 42, title: 'Être vue', theme: 'besoins',
    questions: [
      { q: 'Qu’aimerais-tu qu’on remarque de tout ce que tu fais, sans que tu aies à le dire ?', chips: ['Mon organisation', 'Ma patience', 'Mes efforts', 'Ma fatigue', 'Ma créativité', 'Mon travail'] },
      { q: 'Et si tu te le disais toi-même ? Écris-le ici.' },
    ],
    variants: {
      luteale: { question: 'Phase où l’on a besoin d’être reconnue : qu’aimerais-tu qu’on voie de tout ce que tu fais ?' },
      fertile: { question: 'De quoi es-tu fière cette semaine, que tu aimerais partager à voix haute ?' },
    },
  }),
  P({
    day: 43, title: 'Confier vraiment', theme: 'charge',
    questions: [
      { q: 'Une tâche que tu pourrais confier entièrement, y compris le fait d’y penser ?', chips: ['Les RDV', 'Les courses', 'Le linge', 'Les repas', 'Les papiers', 'Les cadeaux'] },
      { q: 'Qu’est-ce qui te rendrait la passation plus facile ?' },
    ],
    variants: {
      luteale: { question: 'Cette semaine, quelle tâche pourrais-tu confier entièrement, y compris le fait d’y penser ?' },
      premenstruel: { question: 'Avant les règles, allège-toi : quelle tâche confier entièrement cette semaine ?' },
      grossesse: { question: 'Quelle tâche pourrais-tu confier entièrement pour te préserver en ce moment ?' },
    },
    tip: 'Confier, c’est aussi accepter que ce soit fait autrement.',
  }),
  P({
    day: 44, title: 'Mes non-négociables', theme: 'besoins',
    questions: [
      { q: 'Les 3 choses que tu protèges coûte que coûte pour aller bien ?', chips: ['Mon sommeil', 'Mon sport', 'Mes amies', 'Mon moment calme', 'Mes repas', 'Ma soirée off'] },
      { q: 'Qui doit être au courant pour t’aider à les protéger ?' },
    ],
    variants: {
      fertile: { question: 'Tu es souvent plus affirmée en ce moment : quelles 3 choses décides-tu de protéger ?' },
    },
  }),
  P({
    day: 45, title: 'Mon bilan besoins', theme: 'bilan',
    questions: [
      { q: 'Quel besoin est revenu le plus souvent ces 15 jours ?', chips: ['Repos', 'Calme', 'Lien', 'Aide', 'Espace', 'Reconnaissance'] },
      { q: 'Qu’as-tu commencé à faire pour lui ?' },
    ],
    variants: {
      regles: { question: 'Bilan au calme : quel besoin est revenu le plus souvent ces 15 jours ?' },
    },
    tip: 'Écris ton besoin n°1 sur un post-it et colle-le où tu le verras.',
  }),

  // ---------- Chapitre 4 · Moi, au-delà de maman ----------
  P({
    day: 46, title: 'La fille de 15 ans', theme: 'enfant',
    questions: [
      { q: 'Qu’est-ce que tu adorais faire à 15 ans, juste pour toi ?', chips: ['Dessiner', 'Danser', 'Lire', 'Chanter', 'Faire du sport', 'Écrire'] },
      { q: 'Qu’est-ce que cette ado penserait de la femme que tu es devenue ?' },
    ],
    variants: {
      folliculaire: { question: 'Phase d’envies : qu’adorais-tu faire à 15 ans, et qu’est-ce qui en reste en toi ?' },
      regles: { question: 'Bien au chaud, souviens-toi : qu’adorais-tu faire à 15 ans, juste pour toi ?' },
    },
    tip: 'Remets une chanson de cette époque aujourd’hui.',
  }),
  P({
    day: 47, title: 'Trois mots pour moi', theme: 'identite',
    questions: [
      { q: 'Trois mots qui te décrivent, sans parler de ce que tu fais pour les autres.', chips: ['Curieuse', 'Drôle', 'Sensible', 'Têtue', 'Créative', 'Libre'] },
      { q: 'Lequel aimerais-tu montrer davantage ?' },
    ],
    variants: {
      fertile: { question: 'Phase où l’on se sent rayonner : trois mots qui te décrivent, rien qu’à toi ?' },
      premenstruel: { question: 'Même dans les jours plus sensibles, trois jolis mots qui te décrivent ?' },
    },
  }),
  P({
    day: 48, title: 'Mes valeurs', theme: 'valeurs',
    questions: [
      { q: 'Quelle valeur compte le plus pour toi en ce moment ?', chips: ['Liberté', 'Douceur', 'Créativité', 'Justice', 'Famille', 'Aventure'] },
      { q: 'Où a-t-elle eu de la place cette semaine ?' },
      { q: 'Un petit choix de demain qui l’honorerait ?' },
    ],
    variants: {
      luteale: { question: 'Quelle valeur veux-tu protéger, même quand tu es fatiguée ?' },
      folliculaire: { question: 'Phase de projets : quelle valeur as-tu envie de mettre au centre de ce mois-ci ?' },
    },
    tip: 'Compare avec les 3 valeurs choisies au jour 0 : ont-elles bougé ?',
  }),
  P({
    day: 49, title: 'Mes forces', theme: 'forces',
    questions: [
      { q: 'Quelle force t’a portée ces derniers mois ?', chips: ['Ma patience', 'Mon humour', 'Ma ténacité', 'Mon organisation', 'Mon écoute', 'Mon courage'] },
      { q: 'Raconte un moment où elle t’a vraiment servi.' },
      { q: 'Comment pourrais-tu l’utiliser pour toi, et pas seulement pour les autres ?' },
    ],
    variants: {
      premenstruel: { question: 'Les jours où tu doutes, rappelle-toi : quelle force t’a portée ces derniers mois ?' },
      fertile: { question: 'Ose le dire : quelle est ta plus grande force en ce moment ?' },
    },
    tip: 'Demande à une amie quelle est ta plus grande force. Sa réponse pourrait te surprendre.',
  }),
  P({
    day: 50, title: 'Une envie mise de côté', theme: 'identite',
    questions: [
      { q: 'Une envie que tu as rangée dans un tiroir et qui te fait encore un peu vibrer ?', chips: ['Voyager', 'Reprendre une passion', 'Changer de métier', 'Apprendre', 'Créer quelque chose'] },
      { q: 'Qu’est-ce qu’elle dit de toi ?' },
    ],
    variants: {
      folliculaire: { question: 'C’est souvent la phase des projets : quelle envie oubliée as-tu envie de ressortir ?' },
      fertile: { question: 'Tu as de l’élan en ce moment : quelle envie mise de côté as-tu envie de dire à quelqu’un ?' },
      grossesse: { question: 'Une envie rien qu’à toi, que tu aimerais garder vivante pendant cette période ?' },
    },
  }),
  P({
    day: 51, title: 'Une journée rien qu’à moi', theme: 'joie',
    questions: [
      { q: 'Une journée entière sans obligation, rien que pour toi : tu fais quoi ?', chips: ['Je dors', 'Je pars seule', 'Je crée', 'Je vois mes amies', 'Je me fais chouchouter', 'Je marche'] },
      { q: 'Quelle heure de cette journée pourrais-tu t’offrir ce mois-ci ?' },
    ],
    variants: {
      regles: { question: 'Une journée cocon rien qu’à toi : à quoi ressemblerait-elle ?' },
      folliculaire: { question: 'Une journée d’aventure rien qu’à toi : tu fais quoi ?' },
    },
    tip: 'Et si tu en gardais une demi-journée dans le mois qui vient ?',
  }),
  P({
    day: 52, title: 'Pleinement moi', theme: 'identite',
    questions: [
      { q: 'Quand te sens-tu le plus pleinement toi ?', chips: ['En riant', 'En créant', 'Dans la nature', 'En bougeant', 'Avec mes amies', 'Seule au calme'] },
      { q: 'Qu’est-ce que ces moments ont en commun ?' },
    ],
    variants: {
      fertile: { question: 'Phase où l’on rayonne souvent : dans quels moments te sens-tu le plus pleinement toi ?' },
      luteale: { question: 'Phase plus intérieure : dans quels moments calmes te sens-tu le plus toi ?' },
    },
  }),
  P({
    day: 53, title: 'Juste pour le plaisir', theme: 'joie',
    questions: [
      { q: 'Une activité juste pour le plaisir, sans but ni performance, à essayer ce mois-ci ?', chips: ['Poterie', 'Danse', 'Chant', 'Jardinage', 'Peinture', 'Photo'] },
      { q: 'Quelle est la toute première étape pour t’y mettre ?' },
    ],
    variants: {
      folliculaire: { question: 'Phase d’envies nouvelles : quelle activité plaisir as-tu envie de tester ce mois-ci ?' },
      regles: { question: 'Une activité douce, juste pour le plaisir, à garder pour les jours cocon ?', chips: ['Lecture', 'Coloriage', 'Tricot', 'Musique', 'Écriture', 'Puzzle'] },
    },
  }),
  P({
    day: 54, title: 'Ma vision à 5–10 ans', theme: 'vision',
    questions: [
      { q: 'Dans 5 ou 10 ans, comment aimerais-tu te sentir au quotidien ?', chips: ['Sereine', 'Libre', 'Entourée', 'Épanouie au travail', 'En forme', 'Créative'] },
      { q: 'Décris une journée ordinaire de cette vie-là, en quelques lignes.' },
      { q: 'Qu’est-ce qui, aujourd’hui déjà, va dans ce sens ?' },
    ],
    variants: {
      folliculaire: { question: 'Phase de projets, parfaite pour rêver loin : dans 5 ou 10 ans, comment aimerais-tu te sentir ?' },
      grossesse: { question: 'Au-delà des mois qui viennent, dans 5 ou 10 ans, comment aimerais-tu te sentir ?' },
      luteale: { question: 'Sans pression, juste pour rêver : dans 5 ou 10 ans, comment aimerais-tu te sentir ?' },
    },
    tip: 'Une vision n’est pas un objectif à atteindre : c’est une boussole.',
  }),
  P({
    day: 55, title: 'Un rêve, un tout petit pas', theme: 'vision',
    questions: [
      { q: 'Un rêve, même grand : quelle est la plus petite étape possible vers lui ?', chips: ['Me renseigner', 'En parler', 'Bloquer une date', 'Mettre de côté', 'Essayer une fois'] },
      { q: 'Quand pourrais-tu la faire, concrètement ?' },
    ],
    variants: {
      folliculaire: { question: 'C’est le bon moment pour les projets : un rêve, et le tout premier petit pas ?' },
      fertile: { question: 'Tu as de l’aplomb en ce moment : un rêve, et à qui pourrais-tu en parler ?' },
      regles: { question: 'Sans pression : un rêve que tu gardes au chaud, et le plus petit pas possible ?' },
    },
  }),
  P({
    day: 56, title: 'Sans rôle à jouer', theme: 'lien',
    questions: [
      { q: 'Avec qui peux-tu être juste toi, sans rôle à jouer ?', chips: ['Une amie', 'Ma sœur', 'Mon ou ma partenaire', 'Seule avec moi', 'Je cherche encore'] },
      { q: 'Qu’est-ce que tu ressens après l’avoir vue ?' },
    ],
    variants: {
      fertile: { question: 'Phase où le lien fait du bien : avec qui as-tu envie d’être juste toi cette semaine ?' },
      luteale: { question: 'Avec qui peux-tu poser ton masque et dire « là, je suis fatiguée » ?' },
    },
    tip: 'Propose-lui un moment rien que vous deux.',
  }),
  P({
    day: 57, title: 'Gratitude envers moi', theme: 'gratitude',
    questions: [
      { q: 'Pour quoi as-tu envie de te dire merci, à toi ?', chips: ['D’avoir tenu', 'De m’être écoutée', 'D’avoir osé', 'D’avoir ralenti', 'D’avoir demandé'] },
      { q: 'Et à qui as-tu envie de dire merci autour de toi ?' },
    ],
    variants: {
      regles: { question: 'En douceur : pour quoi as-tu envie de te dire merci, à toi, aujourd’hui ?' },
      premenstruel: { question: 'Même les jours sensibles, tu fais beaucoup. Pour quoi as-tu envie de te dire merci ?' },
    },
    tip: 'Envoie un message de remerciement à quelqu’un aujourd’hui.',
  }),
  P({
    day: 58, title: 'Lettre à moi dans 60 jours', theme: 'lettre',
    questions: [
      { q: 'Écris quelques lignes à la femme que tu seras dans 60 jours.', chips: ['Prends soin de toi', 'Continue', 'Je crois en toi', 'N’oublie pas de rire', 'Tu as le droit'] },
      { q: 'Qu’espères-tu qu’elle aura gardé de ce chemin ?' },
    ],
    variants: {
      premenstruel: { question: 'Avec toute ta tendresse, écris quelques lignes à la femme que tu seras dans 60 jours.' },
      grossesse: { question: 'Écris quelques lignes à la femme que tu seras dans 60 jours, avec tout ce qui aura changé.' },
    },
    tip: 'Fais une capture : tu pourras la relire dans 60 jours.',
  }),
  P({
    day: 59, title: 'Ce que je garde', theme: 'bilan',
    questions: [
      { q: 'De ce voyage, quelle habitude ou quelle idée as-tu envie de garder ?', chips: ['Mon moment à moi', 'Demander de l’aide', 'Dire non', 'Écouter mes besoins', 'Ma liste de joies'] },
      { q: 'Quelle phrase de ce journal aimerais-tu relire souvent ?' },
    ],
    variants: {
      luteale: { question: 'Quelle limite ou quel besoin as-tu appris à respecter, et as-tu envie de garder ?' },
    },
  }),
  P({
    day: 60, title: 'Revenue à moi', theme: 'bilan',
    questions: [
      { q: 'Complète : aujourd’hui, en pensant à moi, je me sens…', chips: ['Plus légère', 'Plus à l’écoute', 'Fière', 'Encore en chemin', 'Plus moi'] },
      { q: 'Qu’est-ce qui a le plus changé depuis le jour 0 ?' },
    ],
    variants: {
      regles: { question: 'Dernier jour, tout en douceur. Complète : aujourd’hui, en pensant à moi, je me sens…' },
      retard: { question: 'Dernier jour, quoi qu’il se passe. Complète : aujourd’hui, en pensant à moi, je me sens…' },
    },
    tip: 'Tu as pris 60 rendez-vous avec toi. Bravo, vraiment.',
  }),
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


// ---------- checkpoints (day 0, 30, 60) ----------

export type CheckpointDay = 0 | 30 | 60;

export type CheckpointField =
  /** 0–10 slider. */
  | { kind: 'scale'; key: 'energy' | 'stress' | 'satisfaction'; label: string; low: string; high: string }
  /** Life wheel: one 0–10 rating per LIFE_DOMAINS key. */
  | { kind: 'wheel'; key: 'wheel'; label: string; hint: string }
  /** Pick `pick` items from VALUES. */
  | { kind: 'values'; key: 'values'; label: string; q: string; pick: number }
  /** Single choice (+ optional free text under it). */
  | { kind: 'choice'; key: string; label: string; q: string; options: string[]; followUp?: string }
  /** Free text (short lines). */
  | { kind: 'text'; key: string; label: string; q: string; chips?: string[] };

export interface Checkpoint {
  day: CheckpointDay;
  /** ≤ 60 chars. */
  title: string;
  /** ≤ 280 chars. */
  intro: string;
  quote: JourneyQuote;
  fields: CheckpointField[];
}

const SCALES: CheckpointField[] = [
  { kind: 'scale', key: 'energy', label: 'Mon niveau d’énergie', low: 'À plat', high: 'Pleine d’élan' },
  { kind: 'scale', key: 'stress', label: 'Mon niveau de stress', low: 'Détendue', high: 'Sous pression' },
  { kind: 'scale', key: 'satisfaction', label: 'Ma satisfaction dans ma vie', low: 'Pas du tout', high: 'Pleinement' },
];

const WHEEL: CheckpointField = {
  kind: 'wheel', key: 'wheel', label: 'Ma roue de vie',
  hint: 'Note chaque domaine de 0 (pas satisfaite) à 10 (pleinement). Regarde où ta roue est ronde, et où elle cabosse.',
};

const INTENTION_BACK: CheckpointField = {
  kind: 'choice', key: 'intentionBack', label: 'Retour à mon intention',
  q: 'Te sens-tu toujours alignée avec ton intention du jour 0 ?',
  options: ['Oui', 'Non', 'En chemin'],
  followUp: 'Où en suis-je ?',
};

export const CHECKPOINTS: Checkpoint[] = [
  {
    day: 0,
    title: 'Mon point de départ',
    intro: 'Avant de commencer, une photo de là où tu es aujourd’hui. Rien à réussir : ces chiffres sont juste un repère, pour voir le chemin parcouru au jour 30 et au jour 60.',
    quote: { text: 'Tout voyage commence là où l’on est, pas là où l’on voudrait être.' },
    fields: [
      ...SCALES,
      WHEEL,
      { kind: 'text', key: 'intention', label: 'Mon intention', q: 'Qu’est-ce que tu viens chercher dans ces 60 jours ?', chips: ['Souffler', 'Me retrouver', 'Moins d’anxiété', 'Poser mes limites', 'Retrouver de la joie'] },
      { kind: 'values', key: 'values', label: 'Mes valeurs', q: 'Choisis les 3 valeurs qui comptent le plus pour toi aujourd’hui.', pick: 3 },
    ],
  },
  {
    day: 30,
    title: 'Premier regard en arrière',
    intro: 'Trente jours déjà. C’est le moment de regarder ce qui a bougé, de te féliciter pour ce que tu as tenu, et d’ajuster en douceur ce qui ne te convient pas.',
    quote: { text: 'Ce n’est pas la vitesse qui compte, c’est de continuer à marcher vers soi.' },
    fields: [
      ...SCALES,
      WHEEL,
      INTENTION_BACK,
      { kind: 'text', key: 'innerChild', label: 'Mon enfant intérieur', q: 'Quel plaisir simple as-tu retrouvé, et peux-tu garder dans ta vie ?' },
      { kind: 'text', key: 'values', label: 'Mes valeurs', q: 'Quelle valeur as-tu envie d’honorer davantage à partir de maintenant ?' },
      { kind: 'text', key: 'beliefs', label: 'Mes croyances limitantes', q: 'Quelle phrase intérieure as-tu commencé à remettre en question ?' },
      { kind: 'text', key: 'strengths', label: 'Mes forces', q: 'Quelle force as-tu découverte ou retrouvée, et comment comptes-tu t’en servir ?' },
      { kind: 'text', key: 'learning', label: 'Mon plus grand apprentissage du mois', q: 'Ce que je retiens de ces 30 jours :' },
    ],
  },
  {
    day: 60,
    title: 'Ajustements et découvertes',
    intro: 'Soixante jours avec toi. Regarde le chemin parcouru, garde ce qui t’a fait du bien, laisse tomber ce qui ne te ressemble pas. Ce n’est pas une fin, c’est un nouveau point de départ.',
    quote: { text: 'Hier m’a appris, aujourd’hui me construit, demain m’attend.' },
    fields: [
      ...SCALES,
      WHEEL,
      INTENTION_BACK,
      { kind: 'text', key: 'vision', label: 'Ma vision', q: 'En quoi ta vision à 5 ou 10 ans est-elle plus claire aujourd’hui ?' },
      { kind: 'text', key: 'gratitude', label: 'Gratitude', q: 'Quelle gratitude, envers toi ou envers les autres, compte le plus ?' },
      { kind: 'text', key: 'resilience', label: 'Résilience', q: 'Quel moment difficile vois-tu maintenant comme un apprentissage ?' },
      { kind: 'text', key: 'calm', label: 'Apaisement', q: 'Quelle action concrète t’aide le plus à apaiser ton anxiété ?' },
      { kind: 'text', key: 'learning', label: 'Mon plus grand apprentissage', q: 'Ce que je retiens de ces 60 jours :' },
    ],
  },
];

export function checkpointFor(day: number): Checkpoint | undefined {
  return CHECKPOINTS.find((c) => c.day === day);
}

// ---------- prompt of the day ----------

export interface DailyPrompt {
  title: string;
  theme: ThemeKey;
  themeLabel: string;
  /** 2–3 questions; the first one is the phase variant when one exists. */
  questions: JourneyQuestion[];
  /** = questions[0].q (backward compat). */
  question: string;
  /** = questions[0].chips (backward compat). */
  chips: string[];
  tip?: string;
  chapter: JourneyChapter;
  /** Anxiety module step, with the module (to show its intro on step 1). */
  module?: { key: JourneyModule['key']; step: number; of: number; title: string; stepTitle: string };
}

/** Prompt of the day (clamped to 1..60), with the phase variant when one exists. */
export function promptFor(day: number, phase: PromptPhase | null): DailyPrompt {
  const d = Math.min(PROMPTS.length, Math.max(1, Math.floor(Number.isFinite(day) ? day : 1)));
  const p = PROMPTS.find((x) => x.day === d) ?? PROMPTS[0];
  const v = phase ? p.variants?.[phase] : undefined;
  const chapter = CHAPTERS.find((c) => c.index === p.chapter) ?? CHAPTERS[0];
  const first: JourneyQuestion = { q: v?.question ?? p.question, chips: v?.chips ?? p.chips };
  const questions = [first, ...p.questions.slice(1)];
  const mod = p.module ? MODULES.find((m) => m.key === p.module!.key) : undefined;
  return {
    title: p.title,
    theme: p.theme,
    themeLabel: THEMES[p.theme],
    questions,
    question: first.q,
    chips: first.chips ?? [],
    ...(p.tip ? { tip: p.tip } : {}),
    chapter,
    ...(mod && p.module
      ? { module: { key: mod.key, step: p.module.step, of: mod.days.length, title: mod.title, stepTitle: mod.steps[p.module.step - 1] ?? p.title } }
      : {}),
  };
}
