# Notifications sur iPhone

Cap Maldives t’envoie de vrais petits messages de coach, **5 moments** (heure de Paris) :

| Moment | Heure | Exemple d’esprit |
| --- | --- | --- |
| matin | 8 h | ton énergie du jour, ta séance prévue, ta phase de cycle |
| midi | 12 h | un repère simple pour le déjeuner |
| aprem | 16 h | eau, pause, collation sans culpabilité |
| soir | 20 h (sauf dimanche) | noter ta journée, un mot doux si c’était dur |
| bilan | dimanche 19 h | tes victoires de la semaine |

## Comment ça marche (et pourquoi rien de personnel ne sort)

1. L’app calcule sur ton téléphone les messages d’aujourd’hui et de demain (`coachMessages`, `src/lib/coach.ts`)
   et les range dans le stockage local du téléphone (IndexedDB `cap-maldives` → `coach`). C’est refait à chaque
   ouverture de l’app et après chaque saisie.
2. Un workflow GitHub Actions (`.github/workflows/push.yml`) tourne aux heures prévues et envoie une notification
   **vide** qui ne contient que le nom du moment, par exemple `{"slot":"matin"}` (`scripts/send-push.mjs`).
3. Le service worker de l’app (`public/sw.js`) reçoit ce signal, lit le message du moment dans le téléphone et l’affiche.
   Si l’app n’a pas été ouverte depuis un moment, il affiche un message bienveillant générique.

Ni GitHub ni Apple ne voient ton poids, tes repas ou ton cycle : ils ne transportent que « matin », « midi »…
Pas de serveur à nous, rien à payer.

## Mise en place (une seule fois)

Il faut **iOS 16.4 ou plus** et l’app **installée sur l’écran d’accueil** (les notifications web ne marchent pas dans Safari).

1. Dans Safari, ouvre l’app, touche **Partager**, puis **Sur l’écran d’accueil**. Ouvre ensuite l’app depuis son icône.
2. Onglet **Plus** → **Notifications** → **Activer les notifications**, puis **Autoriser**.
3. Un texte (ton abonnement, en JSON) apparaît : touche **Copier**.
4. Sur GitHub, ouvre le dépôt → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** :
   - nom `PUSH_SUBSCRIPTION`, valeur : colle le texte copié → **Add secret**.
5. Ajoute de la même façon le secret `VAPID_PRIVATE_KEY` (la clé privée t’est donnée à part ; elle ne doit jamais
   être écrite dans le dépôt). La clé publique correspondante est dans `src/lib/notify.ts` et `scripts/send-push.mjs`.
6. Pour tester : onglet **Actions** → **Notifications push** → **Run workflow**, choisis un moment → **Run workflow**.
   Dans l’app, **Tester une notif** affiche aussi une notification locale, sans GitHub.

Plusieurs appareils : `PUSH_SUBSCRIPTION` accepte aussi une liste JSON `[{…}, {…}]`.

## Heures d’été / d’hiver

Paris est à UTC+2 jusqu’au 25 octobre 2026, puis à UTC+1. Chaque moment est programmé aux deux heures UTC possibles ;
le script regarde l’heure de Paris du créneau et n’envoie que si elle correspond. Rien à changer au fil de l’année.
GitHub lance parfois les tâches programmées avec quelques minutes de retard (au-delà de 2 h 30, le message est sauté).

## En cas de souci

- **Le workflow dit « Secrets absents »** : les deux secrets ne sont pas encore ajoutés ; il s’arrête sans erreur.
- **« Abonnement expiré (HTTP 404/410) »** : l’iPhone a renouvelé ou supprimé l’abonnement (app supprimée puis
  réinstallée, notifications désactivées…). Dans l’app : **Activer les notifications**, **Copier**, puis remplace le
  secret `PUSH_SUBSCRIPTION`.
- **Rien n’arrive** : Réglages iPhone → **Notifications** → **Cap** → autorise-les, et vérifie que le mode Concentration
  ne les masque pas.
- **Nouvelle paire de clés** : `npx web-push generate-vapid-keys`, remplace la clé publique dans `src/lib/notify.ts`
  et `scripts/send-push.mjs`, mets la privée dans le secret, puis réactive les notifications dans l’app.

## Alternative : Raccourcis iPhone

Sans GitHub, l’app **Raccourcis** peut afficher une citation le matin et un rappel le soir (messages non personnalisés).

### 0. Mettre l’app sur l’écran d’accueil

Dans Safari, ouvre l’app, touche **Partager**, puis **Sur l’écran d’accueil**.

### A. Une citation chaque matin (08:00)

1. Dans l’app, onglet **Plus** → **Notifications** → **Alternative : Raccourcis iPhone** → **Copier les citations** (la liste est copiée, une citation par ligne).
2. Ouvre **Raccourcis** → onglet **Automatisation** → **+**.
3. Choisis **Heure de la journée** : `08:00`, **Quotidienne**, puis **Exécuter immédiatement** (pas de confirmation demandée).
4. Ajoute l’action **Texte** et colle la liste des citations.
5. Ajoute **Diviser le texte**, séparateur : **Nouvelles lignes**.
6. Ajoute **Obtenir un élément de la liste** : **Élément aléatoire**.
7. Ajoute **Afficher la notification** avec l’élément obtenu.
8. Termine. Chaque matin, une citation au hasard s’affiche.

Pour mettre à jour les citations plus tard : recopie-les depuis l’app et remplace le contenu de l’action **Texte**.

### B. Un rappel le soir (20:30)

1. **Raccourcis** → **Automatisation** → **+** → **Heure de la journée** : `20:30`, **Quotidienne**, **Exécuter immédiatement**.
2. Ajoute **Afficher la notification** avec le texte : « Pense à noter ta journée ».

## Bonus : récupérer ton poids depuis Apple Santé

La balance synchronise ton poids dans Apple Santé, mais la V1 de l’app ne peut pas lire Santé directement
(pas d’accès depuis une page web). Un raccourci peut t’éviter d’ouvrir Santé :

1. Crée un raccourci (onglet **Raccourcis** → **+**), nommé par exemple « Mon poids ».
2. Ajoute **Rechercher des échantillons de santé** : Type **Poids**, trier par **Date de début**, du plus récent au plus ancien, **Limite : 1**.
3. Ajoute **Afficher le résultat** (ou **Copier dans le presse-papiers**).
4. Lance-le le matin, puis note le chiffre dans l’onglet Poids de l’app.

Tu peux l’ajouter à l’automatisation de 08:00 (juste après la citation) pour avoir les deux d’un coup.
La synchronisation automatique est prévue pour plus tard.
