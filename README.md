# Cap Maldives

Petite appli web (en français) pour garder le cap vers un objectif de forme : poids et tendance, repas et calories estimées, séances de sport, cycle, et un onglet Équilibre (sommeil, stress, respiration).

- Tout reste **sur ton téléphone** (stockage local du navigateur). Aucun compte, aucun serveur, aucune donnée envoyée.
- Fonctionne **hors connexion** une fois ouverte une première fois.
- Les chiffres affichés (calories, dépense, dates) sont des **estimations**, pas un avis médical.

Adresse : https://dtrindra-code.github.io/App-wellness/

## L'installer sur iPhone

1. Ouvre l'adresse ci-dessus dans **Safari**.
2. Touche **Partager** (le carré avec une flèche).
3. Choisis **Sur l'écran d'accueil**, puis **Ajouter**.

L'appli s'ouvre alors en plein écran, comme une app classique, même sans réseau.

## Sauvegardes

Tes données sont enregistrées uniquement dans ce navigateur, sur ce téléphone. Si tu supprimes l'appli de l'écran d'accueil ou les données de Safari, elles disparaissent.

- **Exporter** : onglet Plus (roue dentée) → Sauvegarde → Exporter. Le texte de sauvegarde est copié ; colle-le dans une note ou un fichier.
- **Importer** : même endroit → Importer, puis colle le texte. Pratique pour changer de téléphone.

Pense à exporter de temps en temps.

## Mise en ligne (une seule fois)

Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

Ensuite, chaque push sur `main` (ou `claude/wellness-app-v1`) reconstruit et publie le site automatiquement (`.github/workflows/pages.yml`).

## Développement

```sh
npm install
npm run dev            # serveur local avec rechargement
npm run typecheck      # vérification TypeScript
npm run build:pages    # version PWA pour GitHub Pages -> dist-pages/
npm run preview:pages  # sert dist-pages/ sous /App-wellness/
npm run build          # fichier unique pour la page Artifact -> dist/artifact.html
```

Icônes : dessinées dans `scripts/icon.svg`, rendues en PNG dans `public/icons/` par `npm run icons` (Playwright requis : `npm i -D playwright --no-save`).

Le service worker (`public/sw.js`) ne s'active qu'en https et hors iframe. Pour forcer la mise à jour du cache après un changement de ce fichier, incrémente sa constante `VERSION`.
