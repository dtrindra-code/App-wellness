// Bundled table of common generic foods eaten in France, usable offline.
//
// Valeurs moyennes pour 100 g (ou 100 ml pour les boissons), proches de la table Ciqual (ANSES) :
// ce sont des ordres de grandeur réalistes, pas des valeurs de marque. Les plats sont des recettes
// « moyennes » (restaurant / traiteur) : c'est une estimation, et c'est très bien comme ça.
//
// Ids are derived from the name (slug): renaming a food changes its id, so keep names stable
// (meals store `foodId` to find recents/frequents again).

export type FoodCategory =
  | 'fruits' | 'legumes' | 'feculents' | 'legumineuses' | 'pains' | 'cereales'
  | 'viandes' | 'poissons' | 'oeufs' | 'laitiers' | 'fromages' | 'matieres-grasses'
  | 'sauces' | 'sucre' | 'snacks' | 'boissons' | 'alcool' | 'plats';

export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  fruits: 'Fruit',
  legumes: 'Légume',
  feculents: 'Féculent',
  legumineuses: 'Légumineuse',
  pains: 'Pain & viennoiserie',
  cereales: 'Céréales',
  viandes: 'Viande',
  poissons: 'Poisson',
  oeufs: 'Œufs',
  laitiers: 'Laitier',
  fromages: 'Fromage',
  'matieres-grasses': 'Matière grasse',
  sauces: 'Sauce',
  sucre: 'Sucré',
  snacks: 'Snack',
  boissons: 'Boisson',
  alcool: 'Alcool',
  plats: 'Plat',
};

export interface Portion {
  /** Shown as is, e.g. "1 pomme (150 g)", "1 verre de vin (12 cl)". */
  label: string;
  grams: number;
}

export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface Food extends Per100 {
  id: string;
  name: string;
  category: FoodCategory;
  /** Common portions, most typical first. */
  portions: Portion[];
  /** Synonyms and brand-like words that should find this food. */
  keywords: string[];
  /** True for drinks (portions in cl, values per 100 ml). */
  liquid?: boolean;
}

// Row: [name, kcal, protein, carbs, fat, fiber | null, portions "label=g|label=g", keywords "a b c"]
// A portion label without "(" gets its weight appended: "1 pomme=150" → "1 pomme (150 g)".
type Row = [string, number, number, number, number, number | null, string, string?];

const DATA: Record<FoodCategory, Row[]> = {
  fruits: [
    ['Pomme', 54, 0.3, 11.6, 0.3, 1.4, '1 pomme=150|1 petite pomme=110', 'fruit golden gala granny'],
    ['Poire', 55, 0.4, 11.8, 0.3, 3.1, '1 poire=160', 'fruit'],
    ['Banane', 90, 1.1, 19.7, 0.3, 2, '1 banane=120|1 petite banane=90', 'fruit'],
    ['Orange', 46, 0.9, 8.7, 0.2, 2, '1 orange=150', 'fruit agrume'],
    ['Clémentine', 47, 0.8, 9.7, 0.2, 1.7, '1 clémentine=60|3 clémentines=180', 'mandarine agrume fruit'],
    ['Kiwi', 58, 1.1, 10.6, 0.6, 2.5, '1 kiwi=75|2 kiwis=150', 'fruit'],
    ['Fraises', 32, 0.7, 5.8, 0.3, 2, '1 bol=150|1 barquette=250', 'fraise fruit rouge'],
    ['Framboises', 45, 1.2, 5.6, 0.6, 6.7, '1 poignée=80|1 barquette=125', 'framboise fruit rouge'],
    ['Myrtilles', 57, 0.8, 11.3, 0.3, 2.4, '1 poignée=80|1 barquette=125', 'myrtille bleuet fruit rouge'],
    ['Fruits rouges mélangés', 45, 1, 7.5, 0.4, 4, '1 poignée=80|1 bol=150', 'fruits rouges surgelés'],
    ['Raisin', 72, 0.6, 16.1, 0.2, 1.2, '1 grappe=150|1 poignée=80', 'raisins fruit'],
    ['Pêche', 41, 0.8, 8.6, 0.1, 1.4, '1 pêche=150', 'peche fruit'],
    ['Nectarine', 45, 1, 9.1, 0.2, 1.4, '1 nectarine=150', 'brugnon fruit'],
    ['Abricot', 44, 0.8, 9, 0.1, 1.7, '1 abricot=45|3 abricots=135', 'fruit'],
    ['Cerises', 60, 1, 12.9, 0.3, 1.6, '1 poignée=100|1 bol=150', 'cerise fruit'],
    ['Ananas', 53, 0.5, 11.5, 0.2, 1.2, '1 tranche=80|1 bol=150', 'fruit'],
    ['Mangue', 65, 0.6, 13.7, 0.3, 1.7, '½ mangue=150|1 bol=150', 'fruit'],
    ['Melon', 36, 0.8, 7.4, 0.2, 0.9, '1 tranche=150|½ melon=300', 'fruit'],
    ['Pastèque', 35, 0.6, 7.4, 0.2, 0.3, '1 tranche=250', 'pasteque fruit'],
    ['Pamplemousse', 38, 0.6, 7.3, 0.1, 1.3, '½ pamplemousse=150', 'pomelo agrume fruit'],
    ['Prune', 50, 0.7, 10.1, 0.2, 1.6, '1 prune=35|4 prunes=140', 'mirabelle reine-claude fruit'],
    ['Figue fraîche', 69, 0.9, 13, 0.3, 2.9, '1 figue=50', 'figue fruit'],
    ['Grenade', 80, 1.4, 14, 0.9, 4, '½ grenade=100', 'fruit'],
    ['Avocat', 160, 1.9, 0.8, 15.4, 5, '½ avocat=75|1 avocat=150', 'guacamole fruit'],
    ['Compote sans sucre ajouté', 55, 0.3, 12, 0.2, 1.8, '1 pot=100|1 gourde=90', 'compote pomme'],
    ['Compote sucrée', 80, 0.3, 19, 0.2, 1.5, '1 pot=100', 'compote pomme'],
    ['Salade de fruits', 60, 0.6, 13, 0.2, 1.5, '1 bol=150', 'fruits'],
    ['Abricots secs', 241, 3.4, 56, 0.5, 7, '5 abricots secs=40', 'fruits secs'],
    ['Dattes', 282, 2.5, 65, 0.4, 8, '3 dattes=25|1 datte medjool=20', 'datte fruits secs'],
    ['Raisins secs', 300, 3, 66, 0.5, 4, '1 poignée=30', 'fruits secs'],
    ['Pruneaux', 240, 2.5, 55, 0.4, 7, '4 pruneaux=40', 'pruneau fruits secs'],
  ],
  legumes: [
    ['Tomate', 19, 0.8, 2.5, 0.3, 1.2, '1 tomate=120|1 bol=150', 'legume crudité'],
    ['Tomates cerises', 20, 0.9, 2.8, 0.3, 1.3, '1 poignée=80|1 barquette=250', 'tomate cerise'],
    ['Concombre', 12, 0.6, 1.6, 0.1, 0.6, '½ concombre=150', 'legume crudité'],
    ['Carotte crue', 36, 0.8, 6.6, 0.3, 2.7, '1 carotte=100|1 bol râpé=100', 'carottes rapees crudité'],
    ['Carottes cuites', 26, 0.6, 4.5, 0.2, 2.7, '1 portion=150', 'carotte legume'],
    ['Courgette cuite', 16, 1, 1.5, 0.4, 1.1, '1 portion=200|1 courgette=200', 'courgettes legume'],
    ['Brocoli cuit', 29, 2.4, 2.3, 0.6, 2.6, '1 portion=150', 'brocolis legume'],
    ['Chou-fleur cuit', 21, 1.9, 2, 0.3, 2.3, '1 portion=150', 'choufleur legume'],
    ['Haricots verts cuits', 29, 1.9, 3.6, 0.2, 3.6, '1 portion=150', 'haricot vert legume'],
    ['Épinards cuits', 23, 2.9, 0.8, 0.4, 2.2, '1 portion=150', 'epinard legume'],
    ['Salade verte', 15, 1.2, 1.3, 0.2, 1.3, '1 bol=50|1 assiette=80', 'laitue mache roquette mesclun batavia'],
    ['Poivron', 28, 0.9, 4.7, 0.3, 1.9, '1 poivron=150|½ poivron=75', 'poivrons legume'],
    ['Aubergine cuite', 25, 1, 3.5, 0.2, 2.5, '1 portion=150', 'aubergines legume'],
    ['Champignons cuits', 26, 3, 0.8, 0.5, 2, '1 portion=100', 'champignon de paris legume'],
    ['Oignon', 38, 1.2, 7, 0.2, 1.8, '1 oignon=100|½ oignon=50', 'oignons echalote'],
    ['Poireau cuit', 25, 1.3, 3.7, 0.3, 2.4, '1 portion=150', 'poireaux legume'],
    ['Petits pois cuits', 70, 5, 9, 0.5, 5.5, '1 portion=150', 'petit pois legume'],
    ['Maïs doux', 100, 3, 17, 1.2, 3, '1 petite boîte=140|2 c. à soupe=30', 'mais legume'],
    ['Betterave cuite', 43, 1.7, 8, 0.1, 2.5, '1 portion=100', 'betteraves'],
    ['Radis', 16, 0.9, 2, 0.1, 1.6, '1 botte=100|5 radis=50', 'legume crudité'],
    ['Endive', 17, 1, 2.5, 0.1, 1.2, '1 endive=100', 'endives chicon'],
    ['Chou cuit', 20, 1.3, 3, 0.2, 2.5, '1 portion=150', 'chou vert blanc rouge'],
    ['Asperges', 22, 2.2, 2, 0.2, 1.8, '5 asperges=100', 'asperge legume'],
    ['Courge cuite', 20, 1, 3.5, 0.1, 1.5, '1 portion=150', 'potiron butternut potimarron'],
    ['Légumes vapeur', 30, 1.5, 4, 0.3, 2.5, '1 portion=200', 'legumes melange surgelés'],
    ['Poêlée de légumes', 50, 1.8, 6, 2, 2.5, '1 portion=200', 'poelee legumes'],
    ['Ratatouille', 55, 1.2, 5, 3.3, 2, '1 portion=200', 'legumes'],
    ['Soupe de légumes', 35, 1, 5, 1.2, 1.3, '1 bol (30 cl)=300', 'soupe potage veloute legumes'],
    ['Velouté de potiron', 45, 1, 5.5, 2, 1, '1 bol (30 cl)=300', 'soupe potiron courge'],
    ['Gaspacho', 45, 0.9, 4, 2.5, 1, '1 verre (25 cl)=250', 'gaspacho soupe froide'],
  ],
  feculents: [
    ['Pâtes cuites', 150, 5.3, 29, 0.9, 1.8, '1 assiette=250|1 portion=200|1 petite portion=150', 'pates spaghetti tagliatelle penne coquillettes macaroni fusilli'],
    ['Pâtes crues', 355, 12.5, 70, 1.5, 3, '1 portion crue=80|1 grosse portion crue=100', 'pates seches spaghetti'],
    ['Pâtes complètes cuites', 145, 5.5, 26.5, 1, 4, '1 assiette=250|1 portion=200', 'pates completes'],
    ['Riz blanc cuit', 140, 2.9, 30.5, 0.5, 0.4, '1 portion=180|1 assiette=250|1 petite portion=120', 'riz basmati thai'],
    ['Riz cru', 355, 7, 78, 0.7, 1, '1 portion crue=70', 'riz sec'],
    ['Riz complet cuit', 145, 3, 29, 1, 2, '1 portion=180', 'riz brun'],
    ['Quinoa cuit', 120, 4.4, 19, 1.9, 2.8, '1 portion=150', 'quinoa'],
    ['Semoule cuite', 125, 4, 25, 0.5, 1.5, '1 portion=150', 'couscous semoule'],
    ['Boulgour cuit', 110, 3.5, 21.5, 0.5, 4, '1 portion=150', 'boulghour'],
    ['Pommes de terre cuites', 80, 2, 17, 0.1, 1.8, '1 pomme de terre=150|1 portion=200', 'patate vapeur eau'],
    ['Purée de pommes de terre', 90, 2, 13, 3, 1.3, '1 portion=200', 'puree patate'],
    ['Frites', 285, 3.5, 35, 14, 3, '1 portion moyenne=130|1 grande portion=180', 'frite fries'],
    ['Pommes de terre sautées', 170, 2.5, 22, 7.5, 2.5, '1 portion=200', 'rissolees grenailles'],
    ['Patate douce cuite', 86, 1.6, 18, 0.1, 3, '1 portion=200', 'patate douce'],
    ['Gnocchis', 150, 3.5, 32, 0.5, 1.5, '1 portion=200', 'gnocchi'],
    ['Nouilles asiatiques cuites', 140, 4.5, 27, 1.5, 1.2, '1 portion=200', 'nouilles udon soba ramen'],
  ],
  legumineuses: [
    ['Lentilles cuites', 116, 9, 16.5, 0.4, 7.9, '1 portion=150', 'lentille vertes corail'],
    ['Pois chiches cuits', 139, 8, 17.5, 2.6, 6.4, '1 portion=150|1 petite boîte égouttée=140', 'pois chiche'],
    ['Haricots rouges cuits', 104, 8.2, 12.7, 0.5, 8, '1 portion=150', 'haricot rouge'],
    ['Haricots blancs cuits', 110, 7, 13, 0.6, 8, '1 portion=150', 'haricot blanc lingot flageolets'],
    ['Edamame', 120, 11, 8, 5, 5, '1 portion=100', 'soja feves'],
    ['Tofu nature', 125, 12.5, 1.5, 7.5, 1, '1 portion=100|½ bloc=125', 'tofu soja'],
    ['Houmous', 300, 7, 12, 24, 6, '1 c. à soupe=20|1 portion=50', 'hummus pois chiche'],
    ['Dahl de lentilles', 120, 6, 16, 3.5, 4, '1 bol=300', 'dal lentilles corail curry'],
    ['Falafels', 330, 13, 32, 17, 5, '3 falafels=75|5 falafels=125', 'falafel'],
  ],
  pains: [
    ['Baguette', 270, 9, 55, 1.3, 2.8, '1 morceau (¼ de baguette, 60 g)=60|1 tranche=30|½ baguette=125', 'pain blanc tradition'],
    ['Pain complet', 245, 9, 44, 2.5, 7, '1 tranche=35|2 tranches=70', 'pain'],
    ['Pain aux céréales', 265, 10, 45, 4.5, 6, '1 tranche=35', 'pain graines'],
    ['Pain de seigle', 230, 7, 44, 1.5, 7, '1 tranche=35', 'pain seigle'],
    ['Pain de mie', 270, 8.5, 49, 4, 3, '1 tranche=25|2 tranches=50', 'harrys pain de mie'],
    ['Pain de mie complet', 250, 9.5, 42, 4, 6, '1 tranche=25|2 tranches=50', 'pain de mie'],
    ['Biscottes', 400, 11.5, 73, 6, 4, '1 biscotte=10|3 biscottes=30', 'biscotte'],
    ['Galette de riz soufflé', 385, 8, 80, 3, 3, '1 galette=8|2 galettes=16', 'galettes riz souffle'],
    ['Pain suédois (craquant)', 350, 9, 65, 2, 17, '1 tartine=10|2 tartines=20', 'wasa cracottes craquotte'],
    ['Croissant', 410, 8, 45, 21, 2, '1 croissant=55', 'viennoiserie'],
    ['Pain au chocolat', 420, 7.5, 47, 22, 2.5, '1 pain au chocolat=65', 'chocolatine viennoiserie'],
    ['Pain aux raisins', 330, 6, 46, 13, 2, '1 pain aux raisins=100', 'viennoiserie escargot'],
    ['Chausson aux pommes', 300, 4, 38, 14, 1.5, '1 chausson=100', 'viennoiserie'],
    ['Brioche', 360, 8.5, 50, 13, 2, '1 tranche=35|1 petite brioche=50', 'viennoiserie'],
    ['Pain au lait', 350, 9, 52, 11, 2, '1 pain au lait=35', 'viennoiserie'],
    ['Tortilla (wrap)', 300, 8, 50, 7, 3, '1 tortilla=60', 'wrap galette ble'],
    ['Pain burger', 280, 9, 49, 5, 2.5, '1 pain=60', 'bun burger'],
    ['Pain pita', 275, 9, 55, 1.2, 2.5, '1 pita=60', 'pita'],
    ['Pancake', 230, 6, 32, 8.5, 1, '1 pancake=40|3 pancakes=120', 'pancakes crepe epaisse'],
  ],
  cereales: [
    ['Flocons d’avoine', 370, 13, 58, 7, 10, '1 portion=40|3 c. à soupe=30', 'avoine porridge flocons'],
    ['Porridge au lait', 95, 4, 13, 2.5, 1.5, '1 bol=250', 'porridge avoine'],
    ['Muesli sans sucre ajouté', 360, 10, 60, 7, 8, '1 bol=50|1 petite portion=40', 'muesli cereales'],
    ['Granola', 450, 9, 62, 17, 6, '1 portion=45|1 petite portion=30', 'cereales croustillantes'],
    ['Corn-flakes', 380, 7, 84, 1, 3, '1 bol=30|1 grand bol=45', 'cornflakes cereales mais'],
    ['Céréales chocolatées', 390, 8, 75, 5, 5, '1 bol=30|1 grand bol=45', 'cereales chocolat choco'],
  ],
  viandes: [
    ['Blanc de poulet cuit', 145, 30, 0, 2.5, 0, '1 filet=130|1 portion=120', 'poulet volaille escalope filet'],
    ['Cuisse de poulet rôtie', 210, 25, 0, 12, 0, '1 cuisse=150', 'poulet roti pilon volaille'],
    ['Poulet rôti', 190, 27, 0, 9, 0, '1 portion=150', 'poulet roti volaille'],
    ['Escalope de dinde cuite', 140, 29, 0, 2, 0, '1 escalope=120', 'dinde volaille'],
    ['Blanc de poulet / dinde (tranche)', 105, 20, 1, 2, 0, '1 tranche=30|2 tranches=60', 'jambon de volaille blanc de dinde charcuterie'],
    ['Jambon blanc', 115, 20, 1, 3.5, 0, '1 tranche=45|2 tranches=90', 'jambon cuit paris charcuterie'],
    ['Jambon cru', 240, 27, 0.5, 14.5, 0, '1 tranche=20|3 tranches=60', 'jambon sec bayonne serrano parme charcuterie'],
    ['Lardons', 270, 16, 0.5, 23, 0, '1 portion=50|1 barquette=100', 'lardon bacon poitrine'],
    ['Bacon', 215, 20, 1, 15, 0, '2 tranches=30', 'bacon'],
    ['Steak haché 5 % cuit', 155, 26, 0, 5.5, 0, '1 steak haché=85', 'steak hache boeuf viande hachee'],
    ['Steak haché 15 % cuit', 230, 24, 0, 15, 0, '1 steak haché=85', 'steak hache boeuf viande hachee'],
    ['Steak de bœuf grillé', 165, 28, 0, 5.8, 0, '1 steak=120', 'boeuf bavette rumsteck entrecote faux-filet'],
    ['Rôti de bœuf', 170, 28, 0, 6.5, 0, '1 tranche=60|1 portion=120', 'roti boeuf roastbeef'],
    ['Côte de porc grillée', 220, 28, 0, 12, 0, '1 côte=120', 'porc cotelette'],
    ['Filet mignon de porc', 145, 27, 0, 4, 0, '1 portion=120', 'porc roti'],
    ['Escalope de veau', 135, 28, 0, 2, 0, '1 escalope=120', 'veau'],
    ['Gigot d’agneau', 200, 27, 0, 10, 0, '1 tranche=100', 'agneau mouton'],
    ['Magret de canard', 230, 24, 0, 15, 0, '½ magret=150', 'canard'],
    ['Saucisse de Toulouse', 300, 17, 1, 25, 0, '1 saucisse=100', 'saucisse grillee'],
    ['Merguez', 290, 15, 1, 25, 0, '1 merguez=50|2 merguez=100', 'saucisse'],
    ['Chipolata', 280, 14, 1, 25, 0, '1 chipolata=50|2 chipolatas=100', 'saucisse barbecue'],
    ['Saucisse de Strasbourg', 260, 12, 1.5, 23, 0, '1 saucisse=35|2 saucisses=70', 'knacki saucisse'],
    ['Saucisson sec', 420, 26, 2, 34, 0, '5 rondelles=25|1 rondelle=5', 'saucisson charcuterie apero'],
    ['Chorizo', 450, 24, 2, 38, 0, '3 tranches=15|1 portion=30', 'chorizo charcuterie'],
    ['Rillettes', 400, 15, 0.5, 38, 0, '1 tartine=30', 'rillette charcuterie'],
    ['Pâté de campagne', 300, 14, 2, 26, 0, '1 tranche=50|1 tartine=30', 'pate terrine charcuterie'],
    ['Foie gras', 460, 7, 2.5, 47, 0, '1 tranche=40', 'foie gras'],
    ['Nuggets de poulet', 260, 15, 18, 14, 1, '6 nuggets=100|4 nuggets=65', 'nugget poulet pane'],
    ['Cordon bleu', 250, 14, 15, 15, 1, '1 cordon bleu=100', 'poulet pane'],
    ['Bœuf bourguignon', 120, 13, 3, 6, 0.5, '1 assiette=300', 'boeuf bourguignon mijoté'],
  ],
  poissons: [
    ['Saumon cuit', 200, 24, 0, 11.5, 0, '1 pavé=125', 'saumon poisson'],
    ['Saumon fumé', 180, 22, 0.5, 10, 0, '1 tranche=30|2 tranches=60', 'saumon fume poisson'],
    ['Thon au naturel', 115, 26, 0, 1, 0, '1 petite boîte égouttée=100|½ boîte=50', 'thon conserve poisson'],
    ['Thon à l’huile égoutté', 190, 26, 0, 9.5, 0, '1 petite boîte égouttée=100', 'thon conserve poisson'],
    ['Steak de thon cuit', 140, 28, 0, 3, 0, '1 steak=130', 'thon frais poisson'],
    ['Cabillaud cuit', 90, 20, 0, 0.7, 0, '1 filet=150', 'cabillaud colin lieu merlu poisson blanc'],
    ['Poisson pané', 210, 12, 18, 10, 1, '1 pièce=75|2 pièces=150', 'poisson pane fish'],
    ['Truite cuite', 150, 22, 0, 6.5, 0, '1 filet=125', 'truite poisson'],
    ['Dorade ou bar cuit', 125, 22, 0, 4, 0, '1 filet=150', 'dorade bar loup poisson'],
    ['Maquereau (conserve)', 180, 16, 2, 12, 0, '1 boîte égouttée=120', 'maquereau vin blanc poisson'],
    ['Sardines à l’huile', 215, 24, 0, 13, 0, '1 boîte égouttée=90', 'sardine poisson conserve'],
    ['Crevettes cuites', 95, 21, 0, 1, 0, '1 portion=100', 'crevette gambas'],
    ['Moules cuites', 110, 18, 4, 2.5, 0, '1 portion (sans coquilles)=150', 'moules marinieres'],
    ['Huîtres', 70, 8, 3, 2, 0, '6 huîtres=90|12 huîtres=180', 'huitre fruits de mer'],
    ['Surimi', 110, 7.5, 15, 2, 0, '1 bâtonnet=17|4 bâtonnets=68', 'surimi crabe'],
  ],
  oeufs: [
    ['Œuf', 140, 12.7, 0.7, 9.8, 0, '1 œuf=55|2 œufs=110|3 œufs=165', 'oeuf oeufs dur coque poche'],
    ['Œuf au plat', 180, 13.5, 0.7, 14, 0, '1 œuf=60|2 œufs=120', 'oeuf plat'],
    ['Omelette nature', 165, 11, 0.5, 13, 0, 'omelette de 2 œufs=120|omelette de 3 œufs=180', 'omelette oeufs'],
    ['Œufs brouillés', 170, 11, 1.5, 13, 0, '2 œufs=120|3 œufs=180', 'oeufs brouilles'],
    ['Blanc d’œuf', 48, 11, 0.7, 0.2, 0, '1 blanc=33|3 blancs=100', 'blanc oeuf'],
  ],
  laitiers: [
    ['Lait demi-écrémé', 46, 3.3, 4.8, 1.6, 0, '1 verre (20 cl)=200|1 bol (25 cl)=250|1 nuage dans le café (3 cl)=30', 'lait vache'],
    ['Lait écrémé', 34, 3.4, 4.9, 0.1, 0, '1 verre (20 cl)=200|1 bol (25 cl)=250', 'lait'],
    ['Lait entier', 64, 3.3, 4.7, 3.6, 0, '1 verre (20 cl)=200|1 bol (25 cl)=250', 'lait'],
    ['Boisson amande sans sucre', 15, 0.5, 0.2, 1.2, 0.3, '1 verre (20 cl)=200', 'lait amande vegetal'],
    ['Boisson avoine', 45, 0.7, 7, 1.4, 0.8, '1 verre (20 cl)=200', 'lait avoine vegetal oatly'],
    ['Boisson soja', 38, 3.3, 1.5, 2, 0.5, '1 verre (20 cl)=200', 'lait soja vegetal'],
    ['Yaourt nature', 50, 4.2, 5, 1.5, 0, '1 pot=125', 'yaourt yogourt nature'],
    ['Yaourt 0 %', 42, 4.5, 5.5, 0.1, 0, '1 pot=125', 'yaourt yogourt allege'],
    ['Yaourt aux fruits', 90, 3.5, 14, 2, 0.2, '1 pot=125', 'yaourt yogourt fruits'],
    ['Yaourt à la grecque', 125, 5, 4, 10, 0, '1 pot=150', 'yaourt grec'],
    ['Skyr nature', 60, 10.5, 4, 0.2, 0, '1 pot=150', 'skyr yaourt islandais'],
    ['Fromage blanc 0 %', 45, 7.5, 4, 0.1, 0, '1 pot=100|1 bol=200', 'fromage blanc'],
    ['Fromage blanc 3 %', 75, 7.5, 3.8, 3.2, 0, '1 pot=100|1 bol=200', 'fromage blanc'],
    ['Faisselle', 70, 6.5, 3.5, 3.2, 0, '1 faisselle=100', 'fromage blanc'],
    ['Petit-suisse', 110, 9, 3.5, 7, 0, '1 petit-suisse=60|2 petits-suisses=120', 'petit suisse'],
    ['Crème fraîche épaisse', 290, 2.4, 3, 30, 0, '1 c. à soupe=15', 'creme fraiche'],
    ['Crème fraîche légère', 160, 3, 4, 15, 0, '1 c. à soupe=15', 'creme allegee'],
    ['Crème dessert', 125, 3, 20, 3.5, 0.5, '1 pot=125', 'creme dessert chocolat vanille danette'],
    ['Mousse au chocolat', 230, 5, 25, 12, 1.5, '1 pot=60', 'mousse chocolat'],
    ['Riz au lait', 125, 3.3, 20, 3.2, 0.2, '1 pot=125', 'riz au lait dessert'],
    ['Kéfir', 50, 3.3, 4, 2, 0, '1 verre (20 cl)=200', 'kefir lait fermente'],
    ['Whey protéine (poudre)', 380, 78, 7, 5, 0, '1 dose=30', 'whey proteine shaker poudre'],
  ],
  fromages: [
    ['Emmental', 380, 28, 0, 29.5, 0, '1 portion=30|1 poignée râpée=20', 'emmental rape gruyere'],
    ['Comté', 410, 27, 0, 34, 0, '1 portion=30', 'comte fromage'],
    ['Camembert', 270, 20, 0.5, 21, 0, '1 portion (⅛)=30', 'camembert fromage'],
    ['Brie', 330, 20, 0, 28, 0, '1 portion=30', 'brie fromage'],
    ['Chèvre (bûche)', 310, 20, 1, 25, 0, '1 portion=30|2 rondelles=40', 'chevre buche fromage'],
    ['Chèvre frais', 205, 11, 3, 16.5, 0, '1 portion=30', 'chevre frais fromage'],
    ['Mozzarella', 240, 18, 1, 18, 0, '1 boule=125|½ boule=60', 'mozzarella fromage'],
    ['Burrata', 290, 14, 1.5, 25, 0, '1 burrata=125|½ burrata=60', 'burrata fromage'],
    ['Feta', 265, 15, 1, 22, 0, '1 portion=30|1 portion salade=50', 'feta fromage'],
    ['Parmesan', 395, 33, 0, 29, 0, '1 c. à soupe râpé=6|1 portion=20', 'parmesan fromage rape'],
    ['Roquefort', 360, 19, 0, 31, 0, '1 portion=30', 'roquefort bleu fromage'],
    ['Reblochon', 330, 21, 0, 28, 0, '1 portion=30', 'reblochon fromage'],
    ['Fromage à raclette', 350, 23, 0, 28, 0, '1 part de raclette=200|1 tranche=30', 'raclette fromage'],
    ['Fromage frais à tartiner', 230, 6.5, 3, 21, 0, '1 portion=20|1 c. à soupe=15', 'kiri saint moret philadelphia fromage frais'],
    ['Mini fromage (type Babybel)', 300, 22, 0, 24, 0, '1 mini fromage=20', 'babybel fromage'],
    ['Ricotta', 140, 9, 3, 10, 0, '1 portion=50', 'ricotta'],
    ['Cottage cheese', 100, 11, 3.5, 4.5, 0, '1 portion=100|1 pot=200', 'cottage fromage'],
    ['Halloumi', 320, 22, 2, 25, 0, '1 portion=60', 'halloumi fromage grille'],
  ],
  'matieres-grasses': [
    ['Huile d’olive', 900, 0, 0, 100, 0, '1 c. à soupe=10|1 c. à café=4', 'huile olive'],
    ['Huile végétale', 900, 0, 0, 100, 0, '1 c. à soupe=10|1 c. à café=4', 'huile colza tournesol'],
    ['Beurre', 745, 0.7, 0.7, 82, 0, '1 noisette=10|1 portion (tartine)=10', 'beurre doux demi-sel'],
    ['Beurre allégé', 390, 1, 1, 41, 0, '1 noisette=10', 'beurre allege margarine'],
    ['Margarine', 540, 0.2, 0.5, 60, 0, '1 noisette=10', 'margarine'],
  ],
  sauces: [
    ['Mayonnaise', 700, 1.3, 2, 76, 0, '1 c. à soupe=15|1 c. à café=5', 'mayo sauce'],
    ['Vinaigrette maison', 500, 0.3, 2, 55, 0, '1 c. à soupe=15|2 c. à soupe=30', 'vinaigrette sauce salade'],
    ['Vinaigrette allégée', 150, 0.3, 5, 14, 0, '1 c. à soupe=15', 'vinaigrette light'],
    ['Ketchup', 110, 1.2, 25, 0.2, 0.3, '1 c. à soupe=15', 'ketchup sauce tomate'],
    ['Moutarde', 150, 7, 4, 11, 3, '1 c. à café=5', 'moutarde dijon'],
    ['Sauce soja', 60, 8, 5, 0.1, 0, '1 c. à soupe=15', 'soja salee'],
    ['Pesto', 450, 5, 5, 45, 1.5, '1 c. à soupe=15', 'pesto basilic'],
    ['Sauce tomate', 60, 1.5, 8, 2.5, 1.5, '1 portion=100', 'coulis tomate sauce'],
    ['Sauce bolognaise', 110, 7, 5, 7, 1, '1 portion=150', 'bolognaise sauce'],
    ['Béchamel', 120, 3.5, 9, 8, 0.2, '1 portion=50', 'bechamel sauce blanche'],
    ['Sauce barbecue', 150, 1, 35, 0.5, 0.5, '1 c. à soupe=15', 'bbq sauce'],
    ['Sauce blanche (kebab)', 300, 1.5, 6, 30, 0, '1 portion=30', 'sauce blanche kebab'],
    ['Guacamole', 150, 1.7, 6, 13, 4, '2 c. à soupe=40', 'avocat guacamole'],
    ['Tzatziki', 100, 4, 4, 7, 0.5, '2 c. à soupe=40', 'tzatziki concombre'],
    ['Tapenade', 350, 2, 3, 35, 3, '1 c. à soupe=15', 'olive tapenade'],
  ],
  sucre: [
    ['Sucre', 400, 0, 100, 0, 0, '1 morceau=5|1 c. à café=5', 'sucre blanc roux'],
    ['Miel', 330, 0.4, 81, 0, 0, '1 c. à café=8|1 c. à soupe=20', 'miel'],
    ['Confiture', 250, 0.4, 60, 0.1, 1, '1 c. à soupe=20', 'confiture'],
    ['Pâte à tartiner chocolat-noisette', 540, 6, 57, 31, 3, '1 c. à soupe=20|1 c. à café=8', 'nutella pate a tartiner'],
    ['Chocolat noir 70 %', 580, 8, 33, 42, 11, '1 carré=5|4 carrés=20', 'chocolat noir'],
    ['Chocolat au lait', 550, 7, 56, 32, 2, '1 carré=5|4 carrés=20', 'chocolat lait'],
    ['Barre chocolatée', 480, 6, 62, 22, 1.5, '1 barre=45', 'mars snickers twix kinder barre'],
    ['Bonbons', 350, 3, 85, 0.2, 0, '1 poignée=30', 'bonbon haribo'],
    ['Petit-beurre', 440, 7.5, 73, 12, 2.5, '1 biscuit=8|4 biscuits=32', 'biscuit sec lu'],
    ['Biscuits au chocolat', 480, 6, 65, 21, 3, '2 biscuits=25', 'biscuit chocolat prince'],
    ['Cookie', 490, 5.5, 64, 23, 2.5, '1 petit cookie=12|1 gros cookie (boulangerie)=80', 'cookies'],
    ['Madeleine', 450, 6, 55, 23, 1, '1 madeleine=25', 'madeleines'],
    ['Pain d’épices', 330, 4, 75, 1.5, 2, '1 tranche=30', 'pain epices'],
    ['Gâteau au chocolat', 420, 6, 45, 24, 2.5, '1 part=80', 'fondant moelleux chocolat gateau'],
    ['Brownie', 450, 5.5, 52, 24, 2.5, '1 part=60', 'brownie'],
    ['Tarte aux pommes', 240, 3, 33, 10, 1.5, '1 part=120', 'tarte pomme'],
    ['Tarte aux fruits', 250, 3.5, 34, 11, 1.5, '1 part=120', 'tarte fraises framboises abricots'],
    ['Éclair au chocolat', 260, 6, 33, 11, 1, '1 éclair=90', 'eclair patisserie'],
    ['Flan pâtissier', 180, 4.5, 28, 5.5, 0.3, '1 part=120', 'flan'],
    ['Tiramisu', 280, 5, 28, 16, 0.5, '1 part=120', 'tiramisu'],
    ['Crème brûlée', 260, 4, 22, 18, 0, '1 ramequin=120', 'creme brulee'],
    ['Macaron', 420, 8, 58, 17, 2, '1 macaron=15|3 macarons=45', 'macarons'],
    ['Crêpe au sucre', 250, 6, 36, 8.5, 1, '1 crêpe=70', 'crepe sucre'],
    ['Crêpe chocolat-noisette', 310, 6, 40, 13, 1.5, '1 crêpe=85', 'crepe nutella'],
    ['Gaufre', 380, 6, 50, 17, 1.5, '1 gaufre=60', 'gaufre sucre'],
    ['Glace', 210, 3.5, 26, 10, 0.5, '1 boule=50|2 boules=100', 'glace creme glacee'],
    ['Sorbet', 110, 0.3, 27, 0.2, 0.5, '1 boule=50|2 boules=100', 'sorbet glace'],
  ],
  snacks: [
    ['Chips', 540, 6, 50, 34, 4, '1 petit paquet=30|1 bol=50', 'chips pringles'],
    ['Pop-corn', 470, 9, 55, 22, 9, '1 petit sachet=30|1 cornet cinéma=90', 'popcorn'],
    ['Crackers apéritif', 490, 8, 63, 22, 3, '1 poignée=25', 'tuc biscuits aperitif'],
    ['Olives', 150, 1, 1, 15, 3, '10 olives=35', 'olive apero'],
    ['Cacahuètes grillées', 600, 25, 11, 50, 7, '1 poignée=30', 'cacahuete arachide apero'],
    ['Pistaches', 600, 21, 18, 48, 10, '1 poignée=30', 'pistache apero'],
    ['Amandes', 600, 22, 7, 52, 12, '20 amandes=24|1 poignée=30', 'amande oleagineux'],
    ['Noix', 700, 15, 7, 65, 6, '1 poignée (6 noix)=30', 'noix cerneaux oleagineux'],
    ['Noisettes', 650, 15, 7, 61, 9, '1 poignée=30', 'noisette oleagineux'],
    ['Noix de cajou', 590, 18, 27, 46, 3, '1 poignée=30', 'cajou oleagineux'],
    ['Mélange noix et fruits secs', 480, 13, 42, 30, 6, '1 poignée=30', 'melange etudiant trail mix'],
    ['Beurre de cacahuète', 620, 25, 13, 50, 6, '1 c. à soupe=15', 'beurre cacahuete peanut butter'],
    ['Graines de chia', 490, 17, 8, 31, 34, '1 c. à soupe=12', 'chia graines'],
    ['Barre de céréales', 400, 6, 67, 12, 5, '1 barre=25', 'barre cereales'],
    ['Barre protéinée', 350, 30, 30, 10, 8, '1 barre=60|1 petite barre=45', 'barre proteine'],
  ],
  boissons: [
    ['Eau', 0, 0, 0, 0, 0, '1 verre (25 cl)=250|1 bouteille (50 cl)=500', 'eau plate gazeuse'],
    ['Café noir', 2, 0.1, 0.3, 0, 0, '1 expresso (4 cl)=40|1 tasse (15 cl)=150', 'cafe expresso allonge'],
    ['Cappuccino', 40, 2.2, 3.5, 2, 0, '1 tasse (15 cl)=150', 'cafe lait cappuccino'],
    ['Café latte', 55, 3, 5, 2.5, 0, '1 grand (35 cl)=350|1 moyen (25 cl)=250', 'latte cafe au lait starbucks'],
    ['Thé ou tisane', 1, 0, 0.2, 0, 0, '1 tasse (25 cl)=250', 'the infusion tisane'],
    ['Chocolat chaud', 80, 3.3, 11, 2.5, 0.8, '1 tasse (25 cl)=250', 'chocolat chaud cacao'],
    ['Jus d’orange', 45, 0.7, 9.5, 0.1, 0.2, '1 verre (20 cl)=200', 'jus orange presse'],
    ['Jus de pomme', 45, 0.1, 10.5, 0.1, 0.1, '1 verre (20 cl)=200', 'jus pomme'],
    ['Smoothie', 55, 0.6, 12, 0.2, 1, '1 verre (25 cl)=250', 'smoothie jus fruits'],
    ['Soda', 42, 0, 10.6, 0, 0, '1 canette (33 cl)=330|1 verre (25 cl)=250', 'coca cola soda orangina fanta sprite'],
    ['Soda zéro', 0.5, 0, 0, 0, 0, '1 canette (33 cl)=330|1 verre (25 cl)=250', 'coca zero light soda sans sucre'],
    ['Limonade', 40, 0, 10, 0, 0, '1 verre (25 cl)=250', 'limonade'],
    ['Thé glacé', 30, 0, 7.5, 0, 0, '1 canette (33 cl)=330|1 verre (25 cl)=250', 'ice tea the glace'],
    ['Sirop à l’eau', 25, 0, 6, 0, 0, '1 verre (25 cl)=250', 'sirop grenadine menthe'],
    ['Boisson énergisante', 45, 0, 11, 0, 0, '1 canette (25 cl)=250', 'red bull monster energy'],
    ['Kombucha', 15, 0, 3.5, 0, 0, '1 bouteille (33 cl)=330', 'kombucha'],
  ],
  alcool: [
    ['Vin rouge', 83, 0.1, 0.2, 0, 0, '1 verre de vin (12 cl)=120|1 grand verre (15 cl)=150', 'vin rouge alcool'],
    ['Vin blanc', 80, 0.1, 0.6, 0, 0, '1 verre de vin (12 cl)=120|1 grand verre (15 cl)=150', 'vin blanc alcool'],
    ['Vin rosé', 75, 0.1, 1.5, 0, 0, '1 verre de vin (12 cl)=120|1 grand verre (15 cl)=150', 'rose alcool'],
    ['Champagne', 80, 0.2, 1.5, 0, 0, '1 coupe (10 cl)=100', 'champagne cremant prosecco bulles alcool'],
    ['Bière blonde', 42, 0.4, 3.3, 0, 0, '1 demi (25 cl)=250|1 bouteille (33 cl)=330|1 pinte (50 cl)=500', 'biere blonde pression alcool'],
    ['Bière sans alcool', 25, 0.3, 5, 0, 0, '1 bouteille (33 cl)=330', 'biere 0 sans alcool'],
    ['Cidre', 40, 0, 3.5, 0, 0, '1 bolée (20 cl)=200', 'cidre alcool'],
    ['Spritz', 85, 0, 7.5, 0, 0, '1 verre (20 cl)=200', 'spritz aperol alcool cocktail'],
    ['Mojito', 85, 0, 9, 0, 0, '1 verre (25 cl)=250', 'mojito cocktail alcool'],
    ['Gin tonic', 75, 0, 6, 0, 0, '1 verre (25 cl)=250', 'gin tonic cocktail alcool'],
    ['Pastis', 275, 0, 1, 0, 0, '1 dose (2 cl)=20', 'pastis ricard alcool'],
    ['Alcool fort (whisky, rhum, vodka)', 225, 0, 0, 0, 0, '1 dose (4 cl)=40', 'whisky rhum vodka gin alcool fort'],
  ],
  plats: [
    ['Quiche lorraine', 270, 9, 18, 18, 1, '1 part=150|1 petite part=100', 'quiche tarte salee'],
    ['Pizza margherita', 230, 10, 29, 8, 2, '1 part (¼ de pizza)=110|1 pizza entière=450', 'pizza'],
    ['Pizza reine', 240, 11, 28, 9, 2, '1 part (¼ de pizza)=110|1 pizza entière=450', 'pizza jambon champignons'],
    ['Lasagnes bolognaise', 150, 8, 13, 7.5, 1, '1 assiette=300|1 barquette=400', 'lasagne'],
    ['Pâtes bolognaise', 140, 7, 19, 4, 1.5, '1 assiette=350', 'spaghetti bolognaise pates'],
    ['Pâtes carbonara', 180, 8, 20, 8, 1, '1 assiette=300', 'carbonara pates'],
    ['Gratin dauphinois', 130, 3, 11, 8.5, 1, '1 portion=200', 'gratin pommes de terre'],
    ['Hachis parmentier', 125, 7, 10, 6, 1, '1 assiette=300', 'hachis parmentier'],
    ['Sushis et makis', 150, 6, 25, 3, 0.5, '1 pièce=30|1 plateau (12 pièces)=360', 'sushi maki japonais saumon'],
    ['California rolls', 180, 5, 26, 6, 1, '1 pièce=30|8 pièces=240', 'california maki japonais'],
    ['Burger', 250, 13, 24, 11, 1.5, '1 burger=220', 'hamburger burger restaurant'],
    ['Cheeseburger (fast-food)', 260, 14, 26, 11, 1.5, '1 cheeseburger=120', 'mcdo cheeseburger burger king'],
    ['Kebab', 220, 12, 22, 9.5, 1.5, '1 kebab=350', 'kebab doner grec sandwich'],
    ['Tacos (français)', 250, 11, 24, 12, 1.5, '1 tacos=400', 'tacos french'],
    ['Burrito', 190, 8, 24, 7, 3, '1 burrito=300', 'burrito mexicain'],
    ['Salade César', 150, 10, 7, 9.5, 1.5, '1 assiette=300', 'salade cesar poulet'],
    ['Salade niçoise', 110, 7, 4, 7.5, 1.5, '1 assiette=300', 'salade nicoise thon'],
    ['Salade de pâtes', 170, 5, 20, 7.5, 1.5, '1 portion=250', 'salade pates'],
    ['Taboulé', 170, 3.5, 23, 7, 2, '1 portion=150', 'taboule semoule'],
    ['Poke bowl', 140, 8, 18, 4, 1.5, '1 bowl=400', 'poke bowl saumon riz'],
    ['Croque-monsieur', 250, 13, 22, 12, 1.5, '1 croque=150', 'croque monsieur madame'],
    ['Galette complète', 200, 11, 15, 11, 1.5, '1 galette=200', 'galette sarrasin bretonne crepe complete jambon oeuf fromage'],
    ['Crêpe nature', 200, 6, 27, 7.5, 1, '1 crêpe=60', 'crepe'],
    ['Sandwich jambon-beurre', 260, 11, 34, 9, 2, '1 sandwich=200', 'sandwich jambon beurre baguette'],
    ['Sandwich poulet crudités', 210, 11, 26, 7, 2, '1 sandwich=220', 'sandwich poulet'],
    ['Wrap poulet', 200, 11, 22, 7.5, 2, '1 wrap=200', 'wrap poulet'],
    ['Panini', 260, 12, 28, 11, 2, '1 panini=200', 'panini'],
    ['Bagel saumon', 240, 11, 28, 9, 2, '1 bagel=180', 'bagel saumon cream cheese'],
    ['Couscous', 140, 8, 15, 5, 2, '1 assiette=400', 'couscous merguez poulet'],
    ['Paella', 150, 9, 17, 5, 1, '1 assiette=350', 'paella'],
    ['Chili con carne', 110, 8, 8, 5, 3, '1 assiette=300', 'chili'],
    ['Risotto', 140, 3.5, 19, 5.5, 0.5, '1 assiette=300', 'risotto champignons'],
    ['Blanquette de veau', 125, 11, 4, 7, 0.5, '1 assiette=300', 'blanquette'],
    ['Poulet au curry', 130, 12, 5, 7, 1, '1 portion=250', 'curry poulet coco'],
    ['Pad thaï', 170, 7, 22, 6, 1.5, '1 assiette=350', 'pad thai nouilles'],
    ['Riz cantonais', 160, 5, 24, 5, 1, '1 portion=250', 'riz cantonais chinois'],
    ['Bo bun', 130, 8, 15, 4, 1.5, '1 bol=450', 'bo bun vietnamien'],
    ['Ramen', 75, 4, 8, 3, 0.5, '1 bol=650', 'ramen soupe japonaise'],
    ['Nems', 230, 8, 22, 12, 1.5, '1 nem=50|4 nems=200', 'nem rouleau imperial'],
    ['Pot-au-feu', 90, 9, 5, 3.5, 1.5, '1 assiette=400', 'pot au feu'],
    ['Choucroute garnie', 140, 7, 3, 11, 2, '1 assiette=400', 'choucroute'],
    ['Tartiflette', 200, 8, 12, 13, 1, '1 assiette=350', 'tartiflette reblochon'],
    ['Moussaka', 130, 6, 7, 8.5, 1.5, '1 assiette=300', 'moussaka'],
  ],
};

// ---------- normalisation & build ----------

/** Lowercase, no accents, œ/æ unfolded, punctuation → spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/** Very light French singular: "pommes" → "pomme", "choux" → "chou". */
const stem = (w: string) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);

function slug(name: string): string {
  return normalize(name).replace(/%/g, 'pct').replace(/\s+/g, '-');
}

const LIQUID_CATS = new Set<FoodCategory>(['boissons', 'alcool']);

function parsePortions(spec: string): Portion[] {
  return spec.split('|').map((p) => {
    const i = p.lastIndexOf('=');
    const label = p.slice(0, i).trim();
    const grams = Number(p.slice(i + 1));
    return { label: label.includes('(') ? label : `${label} (${grams} g)`, grams };
  });
}

export const FOODS: Food[] = (Object.keys(DATA) as FoodCategory[]).flatMap((category) =>
  DATA[category].map(([name, kcal, protein, carbs, fat, fiber, portions, keywords]) => {
    const f: Food = {
      id: slug(name), name, category, kcal, protein, carbs, fat,
      portions: parsePortions(portions),
      keywords: keywords ? keywords.split(' ') : [],
    };
    if (fiber !== null) f.fiber = fiber;
    if (LIQUID_CATS.has(category) || (category === 'laitiers' && /^(Lait|Boisson|Kéfir)/.test(name))) f.liquid = true;
    return f;
  }));

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function getFood(id: string | undefined): Food | undefined {
  return id ? BY_ID.get(id) : undefined;
}

// ---------- search ----------

interface Indexed { food: Food; name: string[]; kw: string[]; full: string; bias: number }

/** Small nudges so the everyday choice comes first: cooked before raw, basics before dishes. */
function biasFor(food: Food, words: string[]): number {
  let b = 0;
  if (words.some((w) => w === 'cru' || w === 'crue')) b -= 1.5;
  if (food.category === 'plats' || food.category === 'sauces') b -= 1;
  return b;
}

const INDEX: Indexed[] = FOODS.map((food) => {
  const name = normalize(food.name).split(' ').map(stem);
  return {
    food,
    name,
    kw: food.keywords.flatMap((k) => normalize(k).split(' ')).map(stem),
    full: name.join(' '),
    bias: biasFor(food, name),
  };
});

/** Levenshtein distance ≤ 1 between a and b (cheap check). */
function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** Score one query token against a list of words: 3 exact, 2 prefix, 1 typo/substring, 0 none. */
function tokenScore(t: string, words: string[]): number {
  let best = 0;
  for (const w of words) {
    if (w === t) return 3;
    if (w.startsWith(t)) best = Math.max(best, 2);
    else if (t.length >= 4 && (oneEdit(t, w.slice(0, t.length)) || oneEdit(t, w))) best = Math.max(best, 1);
    else if (t.length >= 4 && w.includes(t)) best = Math.max(best, 1);
  }
  return best;
}

/**
 * Accent-insensitive fuzzy search. Every query word must match a word of the name or keywords
 * (exact > prefix > one typo). Name matches weigh more than keywords; shorter names first on ties.
 */
export function searchFoods(query: string, limit = 12): Food[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(' ').map(stem).filter(Boolean);
  const qs = tokens.join(' ');
  const scored: { food: Food; score: number; fuzzy: boolean }[] = [];
  for (const it of INDEX) {
    let score = 0;
    let fuzzy = false;
    let ok = true;
    for (const t of tokens) {
      const inName = tokenScore(t, it.name);
      const inKw = tokenScore(t, it.kw);
      if (!inName && !inKw) { ok = false; break; }
      if (Math.max(inName, inKw) === 1) fuzzy = true;
      score += Math.max(inName * 2, inKw);
    }
    if (!ok) continue;
    if (it.full.startsWith(qs)) score += 4;
    if (it.name[0] && tokens[0] && it.name[0].startsWith(tokens[0])) score += 2;
    score += it.bias - it.name.length * 0.15;
    scored.push({ food: it.food, score, fuzzy });
  }
  // Typo / substring matches only after the real ones.
  scored.sort((a, b) => Number(a.fuzzy) - Number(b.fuzzy) || b.score - a.score || a.food.name.length - b.food.name.length);
  return scored.slice(0, limit).map((s) => s.food);
}

// ---------- maths ----------

export interface Nutrients { kcal: number; protein: number; carbs: number; fat: number }

/** Values for `grams` of a food given per 100 g (kcal rounded, macros to 0.1 g). */
export function nutrientsFor(per100: Per100, grams: number): Nutrients {
  const k = grams / 100;
  const r1 = (n: number) => Math.round(n * k * 10) / 10;
  return { kcal: Math.round(per100.kcal * k), protein: r1(per100.protein), carbs: r1(per100.carbs), fat: r1(per100.fat) };
}
