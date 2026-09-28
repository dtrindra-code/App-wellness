# Notifications sur iPhone (Raccourcis)

L’app Cap Maldives ne peut pas envoyer de notifications elle-même (page web, pas d’App Store).
C’est l’app **Raccourcis** de l’iPhone qui s’en charge, grâce à une automatisation personnelle.
Ça se règle une seule fois.

## 0. Mettre l’app sur l’écran d’accueil

Dans Safari, ouvre l’app, touche **Partager**, puis **Sur l’écran d’accueil**.

## 1. Une citation chaque matin (08:00)

1. Dans l’app, onglet **Plus** → **Copier les citations** (la liste est copiée, une citation par ligne).
2. Ouvre **Raccourcis** → onglet **Automatisation** → **+**.
3. Choisis **Heure de la journée** : `08:00`, **Quotidienne**, puis **Exécuter immédiatement** (pas de confirmation demandée).
4. Ajoute l’action **Texte** et colle la liste des citations.
5. Ajoute **Diviser le texte**, séparateur : **Nouvelles lignes**.
6. Ajoute **Obtenir un élément de la liste** : **Élément aléatoire**.
7. Ajoute **Afficher la notification** avec l’élément obtenu.
8. Termine. Chaque matin, une citation au hasard s’affiche.

Pour mettre à jour les citations plus tard : recopie-les depuis l’app et remplace le contenu de l’action **Texte**.

## 2. Un rappel le soir (20:30)

1. **Raccourcis** → **Automatisation** → **+** → **Heure de la journée** : `20:30`, **Quotidienne**, **Exécuter immédiatement**.
2. Ajoute **Afficher la notification** avec le texte : « Pense à noter ta journée ».

## 3. Idée : récupérer ton poids depuis Apple Santé

La balance synchronise ton poids dans Apple Santé, mais la V1 de l’app ne peut pas lire Santé directement
(pas d’accès depuis une page web). Un raccourci peut t’éviter d’ouvrir Santé :

1. Crée un raccourci (onglet **Raccourcis** → **+**), nommé par exemple « Mon poids ».
2. Ajoute **Rechercher des échantillons de santé** : Type **Poids**, trier par **Date de début**, du plus récent au plus ancien, **Limite : 1**.
3. Ajoute **Afficher le résultat** (ou **Copier dans le presse-papiers**).
4. Lance-le le matin, puis note le chiffre dans l’onglet Poids de l’app.

Tu peux l’ajouter à l’automatisation de 08:00 (juste après la citation) pour avoir les deux d’un coup.
La synchronisation automatique est prévue pour plus tard.
