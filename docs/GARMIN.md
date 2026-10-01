# Synchro Garmin Connect → Pep’s

Ton sommeil, ta Body Battery au réveil, ton stress moyen, ta fréquence cardiaque au repos, tes pas
et tes séances arrivent tout seuls dans l’app, sans rien recopier.

## Comment ça marche

1. Toutes les 3 h environ (de 6 h à 23 h), GitHub lance la synchro (`.github/workflows/garmin.yml`).
2. Le script `scripts/garmin/sync.py` se connecte à ton compte Garmin, lit les 3 derniers jours,
   **chiffre** les chiffres avec ta clé Garmin et les dépose dans l’espace privé (Gist secret) de ta
   sauvegarde automatique.
3. Quand tu ouvres l’app (puis toutes les 30 min), elle récupère ce fichier, le déchiffre sur ton
   téléphone et complète tes journées. Ce que tu as corrigé à la main n’est jamais écrasé, rien n’est
   jamais effacé.

GitHub ne voit que des données chiffrées. Les journaux du dépôt (public) n’affichent que des
nombres, du genre « 3 jours, 2 activités ».

## Mise en place (une seule fois, ~5 min)

Tout est aussi expliqué dans l’app : **Plus → Garmin Connect**.

1. **Active la sauvegarde automatique** (Plus → Tes données) si ce n’est pas déjà fait. La synchro
   Garmin utilise le même espace privé et le même code GitHub (`github_pat_…`).
2. **Génère ta clé Garmin** : Plus → Garmin Connect → « Générer ma clé Garmin », puis « Copier ».
3. **Ajoute 4 secrets** sur
   <https://github.com/dtrindra-code/App-wellness/settings/secrets/actions>
   (« New repository secret », le nom, la valeur, « Add secret ») :

   | Nom | Valeur |
   |---|---|
   | `GARMIN_EMAIL` | l’e-mail de ton compte Garmin |
   | `GARMIN_PASSWORD` | ton mot de passe Garmin |
   | `GARMIN_SYNC_KEY` | ta clé Garmin (étape 2) |
   | `GIST_TOKEN` | le même code `github_pat_…` que pour la sauvegarde (bouton « Copier le code » dans l’app) |

4. **Lance la synchro une première fois** :
   <https://github.com/dtrindra-code/App-wellness/actions/workflows/garmin.yml> → « Run workflow »
   (tu peux choisir le nombre de jours, jusqu’à 30). Une minute plus tard, dans l’app :
   « Synchroniser maintenant ».

Si tu crées une nouvelle clé Garmin dans l’app, recopie-la dans `GARMIN_SYNC_KEY`.
La clé est incluse dans ta sauvegarde chiffrée : après une restauration, la synchro continue.

## Ce qui est importé

- **Sommeil** de la nuit qui se termine ce jour-là (en heures).
- **Body Battery au réveil** : la valeur « au réveil » de Garmin ; à défaut, la première mesure après
  la fin du sommeil ; à défaut, la plus haute de la matinée.
- **Stress moyen** de la journée, **FC au repos**, **pas**.
- **Séances** : course, vélo, natation, basket, renfo, marche/rando, yoga/pilates/étirements
  (mobilité), le reste en « autre ». Chaque séance n’est importée qu’une fois ; elle coche la séance
  prévue du même sport ce jour-là. Si tu avais déjà noté la séance à la main, elle est complétée
  (distance, FC) au lieu d’être doublée. Une séance importée que tu supprimes ne revient pas.
- Les piliers **sommeil** (7 h ou plus) et **marche** (8 000 pas ou plus) se cochent tout seuls.

Le formulaire « Mes chiffres Garmin » d’Équilibre reste là : il affiche les valeurs reçues, et si tu en
corriges une, c’est ta valeur qui est gardée.

## Bon à savoir

- **Accès non officiel.** Garmin ne propose pas d’accès gratuit pour les particuliers : la synchro
  utilise la bibliothèque libre `garminconnect`, qui passe par la même porte que l’app Garmin
  Connect. Elle peut s’arrêter si Garmin change quelque chose ; il suffira souvent de mettre à jour la
  version dans `scripts/garmin/requirements.txt`.
- Choisis pour Garmin **un mot de passe que tu n’utilises nulle part ailleurs**.
- La **validation en deux étapes (2FA)** doit être désactivée sur ce compte Garmin.
- Pour ne pas se faire bloquer, le script garde ses jetons de connexion Garmin (chiffrés, dans le
  fichier `peps-garmin-auth.enc.json` du même Gist) et ne se reconnecte avec le mot de passe que
  quand ils expirent.

## Si ça ne marche pas

Ouvre le dernier passage dans l’onglet **Actions → Synchro Garmin** :

- **Croix rouge** « Garmin refuse la connexion » : e-mail ou mot de passe faux, compte bloqué, ou
  2FA activée. Corrige le secret puis relance.
- **Croix rouge** « GIST_TOKEN » : le code GitHub est expiré ou n’a pas la permission
  « Gists : Read and write ». Mets le même code que dans l’app.
- **Croix rouge** « GARMIN_SYNC_KEY » : recopie la clé depuis l’app.
- **Avertissement jaune** « Garmin limite les connexions (429) » ou « bloque la connexion » : rien
  de cassé, le prochain passage réessaie. Évite de relancer à la main plusieurs fois de suite.
- Dans l’app, « Ta clé Garmin ne correspond pas » : la clé de l’app et `GARMIN_SYNC_KEY` sont
  différentes. Recopie la clé de l’app sur GitHub et relance.

## Pour les curieux

- Format chiffré et règles de fusion : `docs/SPEC.md`, section V8.
- Test du chiffrement Python ↔ navigateur : `node scripts/garmin/crypto-test.mjs`.
