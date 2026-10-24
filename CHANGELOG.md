# Journal des versions

Ce qui a changé d'une version à l'autre du Clover Launcher. L'historique git du dépôt repart de la
0.4.4 : ce fichier garde la trace de tout ce qui précède.

## 0.7.0 (24 octobre 2026)

### Simplifications

- Menu rangé par catégories, séparées d'un filet : Jouer (l'accueil, avec les actualités) ;
  Instances, Découvrir, Skins ; Classement, Boutique ; puis Messages et Profil en bas. La console s'ouvre d'un clic depuis la barre de titre (pastille verte pendant une partie), la page d'une instance ou « Voir la console » pendant la partie.
- L'accueil garde le personnage, l'activité et les actualités. Les modes et les autres serveurs
  passent dans la dalle ⇆ à côté de « Jouer » (onglets Modes et Instances).
- Derrière le personnage, l'image du lobby laisse place à un ciel animé dans la teinte choisie
  dans Apparence, qui suit l'heure de l'ordinateur et la saison (lever et coucher du jour) : le
  soleil traverse le ciel et des volées d'oiseaux passent le jour, lueur orangée à l'aube et au
  couchant, puis le ciel s'assombrit, la lune se lève et les étoiles s'allument. Nuages en blocs, collines de blocs, et
  de temps en temps un vrai joueur (un ami, sinon le haut du classement) qui passe en élytres,
  seul ou à deux ou trois en formation sans jamais se toucher, en 3D avec son skin et sa cape, au vol plané du jeu : il
  ondule, pique en accélérant, remonte en ralentissant, replie ses ailes dans les piqués. Chaque
  passage a son caractère : entrée en piqué, looping, tonneau, fusée d'artifice et ses étincelles,
  toujours à l'écart du personnage pour qu'on les voie. Chaque joueur a son allure (bras le long
  du corps ou grands ouverts, son rythme) et parfois un geste : il salue, nous regarde, frappe
  devant lui ou bat des jambes. Rien ne bouge avec les animations réduites.
- Le vote, le Discord et le site sont dans le menu du compte.
- Le fil des derniers votes de la barre du haut et son réglage sont retirés.

### Nouveautés

- Joueurs en élytres dans le ciel de l'accueil : de fins filets de vent filent le long d'eux et
  leurs ailes frémissent ; pendant le boost, on voit la fusée d'artifice dans leur main tendue.
- « Actualités » revient dans la colonne de navigation, juste sous « Jouer ».
- Le mod Clover (le trèfle des joueurs du launcher, dans la tablist et au-dessus des têtes) est
  aussi dans tes instances Fabric et Quilt, de la 1.14.4 à la 26.3, et plus seulement dans Clover
  Games. Avant la 1.16, le trèfle est le caractère ☘ en vert.
- Décors de l'accueil, au choix dans Paramètres › Apparence (à la place des teintes du ciel) :
  Forêt, Village, Désert, Nether et End, avec leurs mobs dessinés d'après ceux du jeu. Village aux
  fenêtres allumées le soir, poules et villageois ; désert sans jamais de pluie, avec lapins et
  dromadaire ; Nether avec lave, ghasts et arpenteur ; End avec ses piliers d'obsidienne (bedrock,
  cristaux, cages de fer), des endermen devant et au loin qui font quelques pas ou se téléportent comme en jeu (aussi quand
  on clique dessus), et l'Ender
  Dragon articulé (tête, cou, ailes, queue qui suit sa trajectoire) qui tourne autour des piliers
  dans un sens ou dans l'autre, fait des loopings et des demi-tours, pique en crachant des boules de
  feu, se soigne au rayon des cristaux et rugit. Dans le monde normal, le jour des cochons, vaches
  et moutons, la nuit zombies (husks au désert), squelettes, araignées et creepers, chacun à sa
  vitesse du jeu (l'araignée file, la vache traîne). Zombies et squelettes bougent les bras en
  marchant ; creepers, moutons et lapins (par bonds) flânent dans leur coin, et le creeper s'arrête
  face à nous. Au Nether, l'arpenteur se promène sur la lave sans jamais en sortir, et les ghasts
  ouvrent les yeux et crachent des boules de feu qui explosent au sol.
- Le décor de l'accueil grossit avec la fenêtre : en plein écran, il garde ses proportions.
- Skins et Profil retrouvent leur fond classique ; le ciel animé reste à l'accueil. Les teintes déjà choisies passent au décor le plus proche.
- Instances : toutes les versions de Minecraft, de l'Alpha à la dernière, rangées par famille.
  Les préversions et snapshots rejoignent la version qu'ils annoncent. Chaque famille a sa carte
  illustrée ; les « Anciennes versions » (de la 1.15 à la 1.0, puis Bêta et Alpha) ont leur propre
  grille, repliable. Les plus anciennes se lancent avec leurs sons et Java 8. L'interrupteur
  « Snapshots » (gardé d'une fois sur l'autre) ajoute les snapshots, préversions et candidates.
- Météo dans le ciel de l'accueil : le temps qu'il fait chez le joueur (ciel gris, pluie, neige,
  orage avec éclairs, brouillard), relevé toutes les 30 minutes par le relais Clover pour une zone
  d'une dizaine de kilomètres, auprès de MET Norway. Aucune position n'arrive au launcher.
  Les nuages suivent le temps : aucun par grand soleil, quelques-uns par beau temps, le ciel presque plein quand il est
  couvert, et ils filent plus vite dans l'orage.
  Paramètres › Apparence › « Météo réelle » la désactive : plus aucune requête ne part.
- Ciel plus réaliste : ni oiseaux ni joueurs en élytres la nuit, dans l'orage, la neige, une forte
  pluie ou à 0 °C et moins. La nuit, la lune suit sa vraie phase (en huit étapes, comme dans le
  jeu), des chauves-souris passent par nuit calme et des lucioles brillent par nuit douce (15 °C et plus).
- Retirer un ami (« Retirer des amis », avec confirmation) depuis son profil, sa conversation ou le
  clic droit dans la liste des Messages : la conversation reste lisible, en lecture seule. Il faut
  le site à jour (`DELETE /api/launcher/friends/<uuid>`, champ `isFriend` des conversations).
- Statut dans Messages, comme sur Discord : En ligne (d'office à l'ouverture du launcher), Occupé,
  Absent ou Invisible, pour 15 minutes, 1 heure, 8 heures, 24 heures, 3 jours ou jusqu'à ce qu'on le
  change ; il reste d'un lancement à l'autre, pour chaque compte. Tes amis voient ta pastille et ton
  statut dans le launcher et sur le site ; invisible, tu leur apparais hors ligne, en jeu aussi. Occupé
  coupe le son, les bulles et les alertes des nouveaux messages.
- Le personnage réagit selon l'endroit où on le frappe : il se frotte la tête, se plie en tenant
  son ventre puis s'époussette, frotte puis secoue le bras touché, ou secoue la jambe touchée en
  équilibre sur l'autre ; au troisième coup d'affilée, il est étourdi. Après le recul, il revient à sa place à pied au lieu de glisser.
- Importer d'un autre launcher crée une instance par modpack, avec le logo du modpack ; la liste
  de l'import montre ces logos.
- « Mettre à jour en … » sur la page d'une instance installée depuis un modpack Modrinth.
- Pendant la partie, la dalle « Jouer » devient un bouton d'arrêt rouge ; « Fermer » est en rouge
  sur les instances.
- Cloche, paramètres, menu du compte et pastilles de la barre du haut en blocs du jeu.
- Le personnage revient de face quand on le lâche après l'avoir fait tourner.
- Sur l'accueil, le personnage est plus grand et se tient juste au-dessus de « Jouer », son pseudo
  au-dessus de la tête.
- « Ton activité » passe de « 30 jours » à « 3 mois », en cases comme la grille du Profil : on y
  voit d'un coup d'œil sa régularité. « 7 jours » garde ses barres.
- Carte « Vote » sous les actualités : gratuit, il fait monter tes paliers de récompenses ;
  « Voter » ouvre la page du site. Elle se replie en une ligne.
- Les actualités de l'accueil remplissent la place qu'elles ont : plus ou moins d'articles selon la
  hauteur de la fenêtre, jamais un article coupé ni de vide en bas.
- « Style » dans Paramètres › Apparence : Minecraft (blocs en relief, comme en jeu) ou Moderne
  (traits fins et fonds pleins). Le bouton « Jouer », le podium du Classement, les onglets et les
  cartes ont chacun leur version.
- Onglets et filtres (Actualités, Paramètres, activité…) : le bloc du choix retenu glisse d'une
  option à l'autre.
- Les articles du blog, les changelogs et les notes de version de Minecraft s'ouvrent dans leur
  propre page sous Actualités, au lieu d'une fenêtre : fil d'Ariane, « Retour » vers la liste (qui
  garde son filtre et sa position) et « Voir sur le site ».
- Accueil en grand : les actualités passent en grille de cartes sur deux colonnes, complétées par
  les annonces de Minecraft ; la carte Amis invite à jouer à plusieurs et mène au Classement. À
  partir de 1600 × 1000, l'activité montre les 7 derniers jours en barres et les 3 derniers mois en
  grille, ensemble.

### Corrections

- Accueil en plein écran (fenêtre de 1600 px et plus) : deux colonnes de cartes au lieu d'une, avec
  l'activité et une nouvelle carte Amis (où ils jouent, Rejoindre, Écrire), puis les actualités en
  pleine hauteur et le vote ; le ciel du personnage ne prend plus toute la largeur.
- Ciel de l'accueil : zombie, husk et squelette redessinés (cheveux, yeux, manches, côtes, arc
  courbé) ; dans l'End, les endermen pris dans le souffle de la boule de feu du dragon se téléportent
  hors du nuage, et aucun n'y revient tant qu'il dure ; la fusée des joueurs en élytres a la
  taille d'un objet tenu en main.
- Laissé sans souris ni clavier pendant 1 min 30, le personnage s'endort debout, tête sur la
  poitrine, avec des « zzZ » qui montent au-dessus de sa tête ; avant, il se balançait et
  semblait flotter. Le moindre geste le réveille : il sursaute, s'étire, se frotte les yeux ou,
  plus rarement, salue, jamais deux fois de suite le même geste.
- Quand il attend, le personnage varie : il regarde sa montre, regarde autour de lui en tapant du
  pied, croise les bras, s'étire, siffle en regardant le ciel ou shoote dans un caillou.
- Importer : chaque configuration du launcher officiel apparaît (« Dernière version », « 1.21.11 »,
  « 1.6.4 »…), même quand elles partagent `.minecraft` ; avant, une seule « Installation par
  défaut » les remplaçait toutes. « Dernière version » et « Dernière snapshot » affichent leur numéro.
- Skin animé désactivé (ou animations réduites) : le personnage ne réagit plus aux coups, sans teinte
  rouge, et se tient presque de face, un peu tourné vers la gauche au lieu de regarder à droite.
  Tourné à la souris puis lâché, il revient de face en douceur, comme le skin animé (d'un coup
  seulement avec les animations réduites).
- Faire tourner le personnage garde le curseur normal, au lieu des flèches de redimensionnement.
- La fenêtre de plantage ne déborde plus de son cadre.
- L'instance Clover Games affiche « Fabric » et la version de son loader, plus « Clover ».
- Le personnage de l'accueil suit le curseur partout dans la fenêtre (menu, barre de titre,
  actualités), et plus seulement par moments, jusqu'aux bords : au-delà de ce que permet le cou,
  tout le corps pivote, comme en jeu. Laissé sans souris, il retourne à ses gestes.
- Le pseudo au-dessus du personnage grandit avec lui (jusqu'à 30 px au lieu de 18).
- Page Skins : le personnage garde l'angle où on l'a tourné (pour voir le dos) au lieu de revenir
  de face tout seul.
- Page Skins : le badge « Porté » et les boutons d'une tuile passent devant le skin au lieu d'être
  cachés derrière ; « Revenir à mon skin » devient un vrai bouton.
- Page Skins : cliquer une cape de Mes capes l'essaie sur l'aperçu au lieu d'ouvrir la confirmation.
  On choisit ainsi un skin et une cape, puis « Porter le skin et la cape » demande confirmation et
  envoie les deux d'un coup.
- Actualités : les dernières notes de version de Minecraft (la 26.3, les snapshots de la 26.4)
  manquaient, Mojang ayant changé le format de leurs identifiants.
- Cartes des Actualités : le badge indique la catégorie (Annonce, Snapshot, Changelog…), sans
  répéter la source ni la langue sous l'image.
- Messages : une icône d'avion en papier remplace la bulle, dans le menu, les profils et les alertes.
- Profil, Skins et la page d'un joueur reprennent le ciel animé de l'accueil derrière le personnage,
  dans la même teinte, avec le pseudo posé sur sa tête et son ombre sous les pieds (elle flottait
  sous le vide du rendu). Le fond flouté aux couleurs du mode ou du skin disparaît.

## 0.6.1 (21 octobre 2026)

### Corrections

- Un launcher resté ouvert plus d'un jour lance le jeu avec un jeton Minecraft renouvelé, au lieu
  d'un jeton périmé (« Invalid session ») ; le site, la messagerie et la boutique restent
  joignables.
- Une connexion qui se fige pendant un téléchargement échoue au bout de 30 secondes au lieu de
  bloquer « Jouer » jusqu'au redémarrage du launcher. Changer de skin ne bloque plus le reste du
  launcher quand le réseau est lent.
- Lancer une instance personnelle ne supprime plus les mods déposés à la main dans `mods/` : ils
  passent dans ses « Mes mods ». Avec un dossier de jeu partagé, les mods d'une instance ne passent
  plus dans « Mes mods » de Clover.
- On peut jouer hors ligne, ou quand le service Java de Mojang est en panne, avec un Java déjà
  installé.
- Deux instances d'une même version ancienne (1.18.2 et avant) se lancent ensemble sous Windows.
- Le premier lancement ne refuse plus le manifeste pendant sa publication (signature pas encore
  à jour) : le launcher réessaie deux secondes plus tard.
- Un profil Fabric ou Quilt abîmé (page d'erreur d'un portail Wi-Fi) est retéléchargé au lieu de
  bloquer l'instance.
- Un raccourci de bureau se crée pour une instance au nom avec une apostrophe typographique
  (« L’Aventure »), sans que ce nom puisse lancer une commande.
- Un lien dans la description d'un produit de la boutique s'ouvre dans le navigateur au lieu de
  remplacer le launcher.
- Les skins, l'historique des parties, le manifeste en cache et les bibliothèques de Forge sont
  écrits d'un coup : un plantage pendant l'écriture ne les abîme plus. Deux parties qui se
  ferment ensemble sont toutes les deux comptées.
- Renouveler la connexion Microsoft ne peut plus effacer l'ancienne avant d'avoir rangé la
  nouvelle.
- Un modpack `.mrpack` aux empreintes en majuscules s'installe.

### Sous le capot

- Fenêtre cachée dans la zone de notification, le launcher ne relève plus l'actualité ni le
  serveur, et la messagerie toutes les 2 minutes ; tout est relevé dès que la fenêtre revient.
  Serveur coupé, les nouveaux essais s'espacent jusqu'à 5 minutes.
- Une seule connexion au site à la fois, et pas de nouvel essai pendant une minute après un
  échec.

## 0.6.0 (20 octobre 2026)

### Nouveautés

- **Boutique** : la boutique du serveur arrive dans le launcher, la même que sur le site. Le
  produit à la une, les catégories, un tableau pour comparer les grades, l'objectif du mois et
  les derniers achats. La fiche d'un produit montre ses avantages et sa description complète.
  Achète-le pour toi ou offre-le à un autre joueur :
  - en euros, par carte : la page de paiement Stripe s'ouvre dans ton navigateur, et le
    launcher ne voit jamais ta carte ;
  - en pièces du jeu : le paiement se fait ici, après confirmation. Ton solde reste affiché en
    haut de la page.

  Les produits que tu possèdes déjà sont marqués, avec la raison. La tuile Boutique de l'accueil
  ouvre cette page.
- **Réactions aux messages** : au survol d'un message, réagis avec un des six émojis rapides ou
  avec n'importe quel émoji du sélecteur. Les réactions sont aussi dans le menu du message et au
  clic droit. Elles s'affichent sous la bulle, et un clic sur la tienne la retire. Ton ami les
  voit dans le launcher et sur le site.

## 0.5.0 (20 octobre 2026)

### Nouveautés

- **Accueil en cartes** : « Jouer », ton personnage et les modes à gauche ; à droite ton
  activité et les actualités, dans une colonne qui défile si la fenêtre manque de hauteur.
  L'activité montre le temps joué jour par jour sur 7 ou 30 jours, comparé à la période
  d'avant, avec les parties, la série en cours et la plus longue partie ; la grille de l'année
  reste sur le Profil. Le dernier article s'affiche en grand, marqué « Nouveau » sa première
  semaine. Les modes annoncés sont marqués « En développement ».
- **Profil autour des modes** : ton personnage avec son niveau et une barre d'inventaire comme en
  jeu, puis une tuile par mode (rang, chiffre clé) dont le détail s'ouvre dessous. Ton grade en
  jeu s'affiche avec son badge du chat, aussi sur la carte de profil à partager.
- **Messages entre amis** : une nouvelle page, avec ses non-lus en pastille dans la colonne. Tes
  conversations à gauche (en ligne, dernier message, archivées), la conversation ouverte à
  droite : réponses citées, « Vu », messages modifiés ou supprimés, émojis et GIF. Les messages
  arrivent aussi en jeu et sur le site, et ceux envoyés en jeu avec `/msg` apparaissent ici. Une
  notification du bureau annonce un nouveau message quand le launcher est en arrière-plan.
  « Écrire » depuis la liste d'amis du Profil ouvre la conversation, « Rejoindre » connecte à
  l'ami en jeu.
- **Classement** : une nouvelle page, avec les Actualités dans la colonne. Les mêmes
  classements que sur le site, un onglet chacun : les trois premiers sur un podium, puis les 100
  premiers triables par colonne, une recherche par pseudo et « Ma place » pour retrouver ta ligne.
- **Colonne de navigation réorganisée** : tout à la suite, en trois groupes séparés d'un trait
  (le serveur : Accueil, Actualités, Classement, Boutique ; le jeu : Instances, Découvrir, Skins,
  Console ; les joueurs : Messages, Profil). Elle se resserre dans une petite fenêtre. La
  Boutique mène pour l'instant à la boutique en ligne.
- **Profil des autres joueurs** : un pseudo du Classement, d'une conversation (ou « Voir le
  profil » dans ses options) ou de ta liste d'amis ouvre son profil : son personnage, son niveau,
  ses modes avec son rang, son temps de jeu et ses succès.
- **Demandes d'amis** : ajoute un joueur depuis son profil ou par son pseudo dans les Messages,
  accepte ou refuse celles que tu reçois. Elles arrivent aussi en jeu et sur le site, et la
  pastille des Messages les compte.
- **Alerte des messages** : un nouveau message s'affiche dans le launcher quand il est au premier
  plan (un clic ouvre la conversation). Il arrive en quelques secondes, même écrit depuis le site
  à côté (15 secondes au plus hors de la page Messages, au lieu d'une minute, et 5 minutes
  fenêtre cachée), avec le petit son du site (réglable dans Paramètres ›
  Générales). Clic droit sur une conversation, un message ou une demande d'ami pour ses actions,
  « Vider la conversation » compris.

### Corrections

- **« Clover Games » en tête du menu Multijoueur** : le serveur principal y manquait, et un
  joueur qui avait ajouté l'adresse d'un mode arrivait sur ce mode au lieu du Lobby.

## 0.4.7 (13 octobre 2026)

### Nouveautés

- **Fenêtre de chargement** à l'ouverture : le launcher cherche sa mise à jour, puis s'affiche
  une fois prêt, sans écran vide. Les mises à jour s'y téléchargent avec leur avancement, et
  l'installeur Windows ne montre plus sa propre fenêtre.
- **Découvrir** remplace Mods dans le menu : mods, shaders, packs de ressources, datapacks,
  mondes et modpacks à installer, avec tri et catégories pour chaque type. Chaque projet a sa
  vraie page (galerie, description, liens), et ce qui est déjà installé est marqué. « Pour »
  choisit l'instance où installer, sans changer celle que « Jouer » lance.
- **Retour et fil d'Ariane** sur toutes les sous-pages (Instances › Survie 1.21 › Shaders,
  Découvrir › Mods › Sodium) : « Retour » ramène exactement d'où l'on vient, page d'instance et
  onglet compris.
- **Mods dans la page de chaque instance**, plus seulement l'instance choisie : catalogue Clover
  (pour Clover Games) et tes mods dans une seule liste, avec « Ajouter des mods ». Un mod supprimé
  va à la corbeille.
- **Accueil refait**, à la manière du launcher officiel : le lobby de Clover Games en grand, ton
  joueur debout devant avec son pseudo au-dessus de la tête comme en jeu, à côté de l'instance à
  lancer et de « Jouer ». L'état du serveur et les liens (vote, Discord, boutique, site) sont posés
  sur l'image ; dessous, les modes de jeu sur une ligne et les dernières actualités.
  La teinte du bandeau (Paramètres › Apparence) colore le dégradé sur l'image.
- **Arguments Java optimisés**, activés d'office : le ramasse-miettes G1 réglé comme le launcher
  officiel, pour moins de saccades. Ils se coupent dans Paramètres › Jeu, ou pour une seule
  instance dans ses réglages. Un ramasse-miettes tapé à la main (`-XX:+UseZGC`…) les remplace.
- **Page d'une instance** : « Ouvrir le dossier » pour son dossier de jeu, et « Supprimer » pour
  une instance personnelle.
- **Clic droit sur une capture** : agrandir, copier l'image, l'ouvrir avec l'application
  d'images, l'afficher dans le dossier ou la supprimer.
- **Mondes** : cartes et mondes de CurseForge pour la version de l'instance, téléchargés,
  vérifiés et posés dans ses mondes, prêts à jouer. Ceux que leur auteur réserve à CurseForge
  s'ouvrent sur son site. Chaque monde affiche sa seed, avec « Copier ».
- **Survie** apparaît dans les modes de jeu, en « Bientôt ».
- **Chargeurs affichés** dans Découvrir : Fabric, Forge, NeoForge, Quilt (Iris, OptiFine pour un
  shader) sur chaque résultat, et sur la page d'un projet avec ses versions de Minecraft.
- **Instances Quilt**, à côté de Vanilla, Fabric, Forge et NeoForge : elles chargent les mods Quilt
  et ceux de Fabric, que Découvrir propose ensemble. L'import depuis un autre launcher reprend
  aussi les instances Quilt, avec leurs mods.
- **Modpacks Quilt, Forge et NeoForge**, en plus de Fabric : depuis Découvrir, avec une liste
  « Chargeur » à côté du tri, ou depuis un fichier. Pour les mods, Découvrir rappelle le chargeur de l'instance
  visée, le seul qui s'y installe. La page d'un modpack choisit la version à installer, avec son loader et sa version de
  Minecraft ; la dernière stable d'office.
- Modpacks CurseForge importés depuis un fichier : leurs mods, packs de ressources et shaders se
  téléchargent depuis CurseForge. Seuls ceux que leur auteur y réserve restent à ajouter à la main.
- « Créer l'instance » sur un modpack de la liste fait d'abord choisir sa version. Depuis
  « Nouvelle instance », « Partir d'un modpack » ne montre que ceux de la version de Minecraft
  choisie (filtre retirable) et propose la version du pack qui lui correspond.
- Installer un modpack qu'on a déjà le rappelle avant : une seconde instance se crée à côté de la
  première, sans y toucher.
- Depuis l'accueil, la flèche d'une instance dans le choix d'instance ouvre directement sa page.
- L'instance Clover Games a pour image le logo officiel du serveur ; la bannière de version reste
  en fond de sa page.
- Onglet Mods : un mod qui a une version plus récente sur Modrinth le signale, et « Tout mettre à
  jour » remplace d'un coup tous ceux qui en ont une. Une version stable n'est remplacée que par
  une version stable.

### Simplifications

- Les mêmes mots partout : « Ajouter des … » ouvre Découvrir, « Installer » installe,
  « Supprimer » envoie à la corbeille après confirmation (instances, mods, packs, mondes,
  captures), « Retirer » enlève une entrée sans toucher aux fichiers (compte, Steam),
  « Réglages » pour une instance et « Paramètres » pour le launcher, « Compte actif ».
- Supprimer une instance met son dossier à la corbeille, au lieu de laisser ses fichiers sur le
  disque. Avec un dossier de jeu commun, ses mondes et réglages restent : ils sont aussi ceux de
  Clover Games.
- Instances : vues « Par version » et « Toutes les instances ». Une carte de version choisit
  l'instance à lancer sans ouvrir le panneau de création, et son « + » crée une autre instance de
  la même version. Ouvrir la page d'une instance ne change plus celle que « Jouer » lance.
- « Ta semaine » quitte l'accueil : ton temps de jeu reste sur la page Profil.
- Skins : onglets « Mes skins » et « Galerie », tri dans un menu.
- Profil : statistiques en français (éliminations, éliminations finales).
- Mêmes onglets, champs de recherche, listes vides, confirmations et marges sur tous les écrans.

## 0.4.6 (11 octobre 2026)

### Nouveautés

- Journaux : durée de conservation réglable dans Paramètres › Stockage (7, 14, 30, 90 jours ou
  toujours), appliquée au démarrage à toutes les instances, personnelles comprises. Chaque
  instance affiche ses journaux dans ses paramètres, avec « Ouvrir le dossier » et « Supprimer
  les journaux ». Les boutons « Ouvrir » de la console et de l'écran de plantage ouvrent les
  journaux de Minecraft de l'instance concernée.
- Skin 3D : glisser de côté le fait tourner, même sur le personnage ; glisser vers le haut ou le
  bas l'attrape.
- Plus de fenêtre « Modifier le skin » : les bras se choisissent sous l'aperçu de la page Skins,
  appliqués au skin porté après confirmation (annulable) ou au skin essayé, et gardés pour un skin
  de « Mes skins ».
- Bouton « Partager » dans la console et sur l'écran de plantage : le journal est publié sur
  mclo.gs après confirmation, et le lien est copié pour le support. Le jeton Minecraft en est
  retiré.
- Liens `clover://play` (ouvre le jeu avec l'instance Clover Games) et `clover://play/<mode>`
  (rejoint directement un mode), pour lancer une partie depuis le site.
- « Jouer dans ce monde » dans l'onglet Mondes d'une instance, à partir de Minecraft 1.20.
- Export d'une instance personnelle en modpack `.mrpack`, par clic droit ou depuis l'en-tête de
  sa page. Les mods publiés sur Modrinth seront téléchargés à l'import, les autres fichiers sont
  inclus dans l'archive. On choisit d'ajouter ou non les réglages des mods, les packs de
  ressources, les shaders et les réglages du jeu.

### Corrections

- La barre de titre du jeu affiche de nouveau « Minecraft <version> | Clover <version> » en 26.x,
  dont la fenêtre n'est plus créée par GLFW mais par SDL.

## 0.4.4 (9 octobre 2026)

### Nouveautés

- Les instances Forge et NeoForge des autres launchers s'importent avec leurs mods et leurs
  dépendances. La version du loader est gardée si elle est encore publiée.
- « Partager ma carte » sur la page Profil : le personnage avec sa cape, un fond au choix (Forêt,
  Nuit, Nether), le mode favori, l'ancienneté, l'XP et le lien du profil.
- Paramètres : une recherche qui parcourt tous les onglets, la taille de la fenêtre du jeu, et le
  choix de l'API graphique (OpenGL ou Vulkan) à partir de Minecraft 26.2.
- Skins : bascule entre cape et élytres, avec le vol et le plané dans l'aperçu.
- Accueil : chaque mode a son illustration. Le Lobby n'a plus de carte, et « Jouer » ouvre le
  menu du jeu.
- Instances : vue Simple revue avec les versions affichées sur les cartes, et import d'un modpack
  depuis « Nouvelle instance ».

### Corrections

- Les mods dont le `fabric.mod.json` contient des retours à la ligne bruts sont lus comme le fait
  Fabric Loader (import, Mes mods et lancement).

## 0.4.3 (7 octobre 2026)

- Le mod Clover s'installe avec l'instance Clover Games, sans apparaître dans la liste des mods.
  Il signale la partie au site et place un trèfle devant le nom des joueurs qui utilisent le
  launcher, dans la tablist et au-dessus des têtes.
- Instances Forge et NeoForge : installation par l'installateur officiel, recherche Modrinth,
  mises à jour et dépendances selon le loader. Shaders avec Iris, ou Oculus sous Forge.
- Page Profil : niveau, pièces, votes, série de jours, modes de jeu et classements, temps de jeu,
  amis, capes et succès.
- Skins : essayer un skin avant de le porter, l'exporter, le renommer. Nouveaux onglets Mes capes
  et Découverte (skins de la communauté, catalogue des capes et leurs porteurs). Aperçu 3D animé.
- Accueil : les articles s'ouvrent aussi dans le launcher, et un résumé « Ta semaine » apparaît.
- Import des modpacks CurseForge depuis leur fichier `.zip`.

## 0.4.2 (6 octobre 2026)

- Nouvelle page Actualités : le blog de Clover Games et les annonces officielles de Minecraft,
  avec les filtres Tout, Clover Games et Minecraft.
- Les articles du blog et les notes de version de Minecraft se lisent dans le launcher.
- Les annonces Minecraft restent en anglais, comme Mojang les publie, et sont marquées « EN ».
- Changement de pseudo Minecraft depuis le menu du compte : disponibilité vérifiée en direct, et
  date du prochain changement possible (Mojang impose 30 jours entre deux).

## 0.4.1 (6 octobre 2026)

### Nouveautés

- Paramètres propres à chaque instance : nom, mémoire et arguments Java.
- Les parties sont enregistrées dès le lancement : l'Aperçu d'une instance montre le temps de jeu
  et une grille d'activité, avec la série de jours et le record.
- Console : les anciens journaux et les rapports de plantage de chaque instance sont consultables.
- On peut renommer ses mondes solo et les serveurs déjà rejoints.
- Apparence : couleur principale, bandeau de l'accueil et coins carrés.
- « Fermer le jeu », puis « Forcer la fermeture » si le jeu ne répond plus. Plusieurs instances
  peuvent tourner en même temps.
- « Importer » dans les Instances : une installation d'un autre launcher devient une nouvelle
  instance.
- Clic droit sur une instance : jouer, paramètres, dossier, épingler, dupliquer, raccourci sur le
  bureau, retirer.
- Les évènements du jeu (niveaux, succès, récompenses) remontent dans les notifications du site.

### Corrections

- Le message de l'ajout à Steam tient compte d'un raccourci déjà chargé par Steam.
- La cloche des notifications explique ses erreurs au lieu de rester vide.

## 0.4.0 (6 octobre 2026)

### Nouveautés

- Nouveau logo en trèfle et nouvelles icônes sur toutes les plateformes.
- Instances Clover, Vanilla et Fabric : création, page détaillée (aperçu, mods, mondes,
  datapacks, packs de ressources, shaders, captures) et versions regroupées par famille.
- Reprise des installations du launcher officiel, de Modrinth App, de Prism Launcher, de MultiMC
  et de CurseForge, sans jamais lire leurs comptes.
- Les dépendances obligatoires d'un mod ajouté à la main s'installent avec lui.
- Menu de la zone de notification, et titre de la fenêtre de Minecraft sous Windows.
- Canal bêta pour les testeurs, et bandeau de maintenance sur l'accueil.
- Réglages recommandés selon la puissance de l'ordinateur.
- Ajout du launcher à la bibliothèque Steam, et déplacement de son dossier depuis les paramètres.
- Notifications du site (achats, votes, annonces, succès) dans le launcher.
- Taille du téléchargement annoncée avant de créer une instance, et changement de version du
  serveur signalé au joueur.
- Rapports de plantage, envoyés seulement avec l'accord du joueur.
- Fiche de chaque monde solo (mode, difficulté, version, dernière partie, datapacks).
- Nettoyage des versions de Minecraft et des Java qui ne servent plus.

### Corrections

- Le statut Discord se rétablit tout seul s'il se perd.
- Les mises à jour du launcher sont revérifiées toutes les 6 heures.
- Sous GNOME sans AppIndicator, fermer la fenêtre quitte le launcher au lieu de le cacher.
- Les dossiers synchronisés sont reconnus aussi pour un chemin Windows ouvert sous Linux.

## 0.3.0 (3 octobre 2026)

- Version Microsoft Store : les mises à jour passent alors par le Store.
- « Démarrer avec l'ordinateur » fonctionne aussi dans la version Microsoft Store.

## 0.2.0 (3 octobre 2026)

Première version publiée.

- Connexion avec un compte Microsoft, plusieurs comptes, et un premier lancement guidé.
- Installation de Java, de Minecraft 26.2 et de Fabric, avec des téléchargements vérifiés.
- Manifeste signé : la version de Minecraft, les mods et les modes suivent le serveur.
- Catalogue de mods à activer au choix, et « Mes mods » pour ses propres fichiers.
- Accueil : aperçu 3D du skin, cartes des modes avec les joueurs connectés, connexion directe à un
  mode, actualités, derniers votes et statut du serveur.
- Skins : bibliothèque et éditeur.
- Choix de la version de Minecraft sous le bouton « Jouer ».
- Paramètres en six onglets, et statut Discord.
- Console du jeu, et accès direct aux autres serveurs déjà rejoints.
- Mise à jour automatique du launcher.
