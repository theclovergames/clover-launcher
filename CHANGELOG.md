# Journal des versions

Ce qui a changé d'une version à l'autre du Clover Launcher. L'historique git du dépôt repart de la
0.4.4 : ce fichier garde la trace de tout ce qui précède.

## Pas encore publié

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
