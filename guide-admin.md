# Guide — Mzali Admin

*Manuel d'utilisation du back-office (`/admin`)*

Ce guide couvre chaque section du back-office, et surtout la partie qui prête le plus à confusion : la différence entre le stock **🏭 Dépôt** et le stock **🏬 Boutique**, et d'où vient la marchandise quand une commande est passée en ligne ou vendue en magasin.

---

## Sommaire

- [Accès & rôles](#accès--rôles)
- [Tableau de bord](#tableau-de-bord--admin)
- [Rapports](#rapports--adminreports)
- [Commandes](#commandes--admincommandes)
- [Clients](#clients--adminclients)
- [Codes promo](#codes-promo--admincoupons)
- [Produits & catégories](#produits--catégories--adminproduits--admincategories)
- [Dépôt vs Boutique — les deux stocks](#dépôt-vs-boutique--les-deux-stocks)
- [Écran Stock](#écran-stock--adminstock)
- [Transferts](#transferts--admintransfers)
- [Alertes stock](#alertes-stock--adminstock-alerts)
- [Inventaires](#inventaires--adminstocktakes)
- [Flux d'une vente](#flux-dune-vente--doù-sort-la-marchandise)
- [Employés & rôles](#employés--rôles--adminemployees)
- [Journal d'audit](#journal-daudit--adminjournal)
- [Point de vente (POS)](#point-de-vente--adminpos-terminals--adminpos-sessions)
- [Achats](#achats--adminsuppliers--adminpurchase-orders--admingoods-receipts)
- [Devis & factures](#devis--factures--adminquotes--admininvoices)
- [Fidélité](#fidélité--adminloyalty)

---

## Accès & rôles

Trois espaces séparés selon qui se connecte : le back-office admin, l'espace employé, et la caisse (POS) qui est une application à part.

| Rôle | Où il se connecte | Ce qu'il voit |
|---|---|---|
| **super_admin / admin** | `/admin` | Accès total à toutes les sections de ce guide. |
| **order_manager** | `/admin` | Commandes, clients, catalogue en lecture, devis/factures, stats — pas les coûts d'achat. |
| **catalog_manager** | `/admin` | Produits, catégories, médias, ajustements de stock simples. |
| **viewer** | `/admin` | Lecture seule sur commandes, produits, clients, stats. |
| **employee** | `/employee` | Uniquement ses propres commandes assignées, changement de statut limité. |
| **cashier** | App caisse (POS) | Vente en boutique, remises simples, pas les coûts. |
| **store_manager** | App caisse + `/admin` | Tout ce que fait un caissier, plus stock, achats, transferts, fidélité, coûts. |

> Un compte inexistant ou un mauvais mot de passe renvoie une erreur générique — c'est volontaire, pour ne pas révéler quels comptes existent.

---

## Tableau de bord — `/admin`

La page d'accueil — un instantané du jour, pas un rapport détaillé (ça, c'est la section [Rapports](#rapports--adminreports)).

- **Chiffre d'affaires & commandes** — Aujourd'hui, 7 jours, 30 jours — commandes en ligne uniquement, comptées seulement à partir du statut *confirmé*.
- **Produits en rupture / stock bas** — Liste directe des articles à réapprovisionner, avec lien vers l'écran Stock filtré.
- **Suivi transporteurs** — Taux de réussite Navex / First Delivery / Axess et derniers échecs d'envoi.
- **Performance équipe** — Commandes actives par employé assigné, sur la période choisie.

---

## Rapports — `/admin/reports`

Six vues d'analyse, chacune dans son propre onglet.

| Onglet | Ce qu'il montre |
|---|---|
| **Marge** | Chiffre d'affaires et marge par produit (boutique + en ligne confondus). Un produit affiche « coût inconnu » tant qu'aucune réception fournisseur n'a été enregistrée pour lui — ce n'est pas une marge à zéro, juste une donnée manquante. |
| **Sous le coût** | Signale (sans bloquer) les ventes faites en dessous du coût d'achat — utile pour repérer une erreur de prix, ou confirmer un déstockage volontaire. |
| **Stock dormant** | Articles en stock qui n'ont pas bougé depuis longtemps, à surveiller pour une promo ou un arrêt de réassort. |
| **Prix fournisseurs** | Historique des prix d'achat par fournisseur et par article, pour repérer une hausse. |
| **Remises** | Total des remises accordées, en boutique et en ligne, par jour. |
| **Réapprovisionnement** | Suggestions de quantités à commander, calculées automatiquement (voir [Achats](#achats--adminsuppliers--adminpurchase-orders--admingoods-receipts)). |

> **Qui voit les coûts ?** Marge, Sous le coût et Prix fournisseurs contiennent des données d'achat sensibles — seuls les rôles avec accès aux coûts (admin, store_manager) les voient en entier ; les autres rôles voient un rapport allégé.

---

## Commandes — `/admin/commandes`

Toutes les commandes passées sur le site — paiement à la livraison uniquement.

- **Statuts** — En attente → confirmé → (livré/annulé). Une commande « en attente » n'a encore rien réservé en stock — voir [Flux d'une vente](#flux-dune-vente--doù-sort-la-marchandise).
- **Assignation** — Chaque commande peut être assignée à un employé, qui la voit ensuite dans son propre espace `/employee`.
- **Transporteur** — Envoi manuel ou automatique vers Navex / First Delivery / Axess selon la société de livraison choisie sur la commande.
- **Note privée, échange** — Champs internes qui n'apparaissent jamais côté client.

---

## Clients — `/admin/clients`

Fiche client automatique par numéro de téléphone (pas de compte/mot de passe côté client) — historique de commandes, total dépensé, ville. C'est cette même fiche qui porte la carte de fidélité si le client en a une.

---

## Codes promo — `/admin/coupons`

Codes en pourcentage ou montant fixe, avec dépense minimum, plage de dates, limite d'utilisation totale et par numéro de téléphone. Appliqués au panier en ligne uniquement — pas de codes promo en caisse (la caisse a ses propres remises).

---

## Produits & catégories — `/admin/produits` · `/admin/categories`

La fiche produit reste la même qu'avant — prix, images, variantes (taille/couleur), bundles.

C'est l'écran [Stock](#écran-stock--adminstock), pas la fiche produit, qui gère les quantités — un produit peut avoir 0 en Boutique et 40 au Dépôt en même temps, c'est normal.

---

## Dépôt vs Boutique — les deux stocks

Chaque article a **deux compteurs de stock indépendants**, pas un seul. C'est la base de tout le reste de cette section.

**🏭 Dépôt** — L'entrepôt. C'est le stock qui alimente le **site web**. Toute commande en ligne confirmée décrémente le Dépôt — jamais la Boutique.

**🏬 Boutique** — Le magasin physique. C'est le stock que la **caisse (POS)** vend. Toute vente en caisse décrémente la Boutique — jamais le Dépôt.

> **Les deux stocks ne se mélangent jamais tout seuls.** Vendre en ligne ne touche pas au stock du magasin, et vendre en magasin ne touche pas au stock du site. Le seul moyen de faire passer de la marchandise d'un stock à l'autre est un [transfert](#transferts--admintransfers) manuel, ou une réception fournisseur livrée directement à l'un ou l'autre.

### Comment la marchandise arrive dans chaque stock

| Action | Effet sur le stock |
|---|---|
| Réception d'un bon de commande fournisseur ([Achats → Réceptions](#achats--adminsuppliers--adminpurchase-orders--admingoods-receipts)) | Ajoute au Dépôt ou à la Boutique, selon la destination choisie sur le bon de commande. **C'est la seule vraie entrée de marchandise dans le système.** |
| Transfert Dépôt → Boutique | Retire du Dépôt, ajoute à la Boutique (réassort du magasin). |
| Transfert Boutique → Dépôt | Retire de la Boutique, ajoute au Dépôt (retour au dépôt). |
| Ajustement manuel ([écran Stock](#écran-stock--adminstock)) | Corrige une quantité à la main, avec motif obligatoire — casse, perte, erreur de comptage. |
| Inventaire physique validé | Corrige automatiquement l'écart entre le compté et le système. |

---

## Écran Stock — `/admin/stock`

Vue produit par produit avec deux colonnes de quantité disponible — une pour chaque emplacement — plus une colonne « en commande fournisseur » (achat en cours, pas encore reçu).

- **Filtrer stock bas** — Accessible directement depuis les alertes du tableau de bord.
- **Historique** — Chaque mouvement (vente, transfert, réception, ajustement) est journalisé et consultable par produit — rien ne bouge sans laisser de trace.
- **Seuils** — Seuil d'alerte et niveau cible réglables par article — ce sont eux qui alimentent les suggestions de réapprovisionnement.

---

## Transferts — `/admin/transfers`

Le seul moyen de faire passer du stock déjà existant entre le Dépôt et la Boutique.

1. **Demande** — Créer un transfert : quantités, sens (Dépôt→Boutique le plus courant, pour réassortir le magasin).
2. **Approbation** — Un responsable valide — évite qu'un employé vide le dépôt sans contrôle.
3. **Expédition / réception** — Le stock quitte l'origine à l'expédition, puis arrive à destination seulement quand quelqu'un confirme la réception — il existe un court moment où la marchandise est « en transit », ni dans l'un ni dans l'autre.

---

## Alertes stock — `/admin/stock-alerts`

Trois listes, générées automatiquement chaque heure, **par emplacement** (un article peut être en alerte au Dépôt et correct en Boutique, ou l'inverse).

- 🔴 **Stock négatif** — Signe d'une erreur de comptage ou d'un enregistrement en retard — à corriger en priorité via un ajustement ou un inventaire.
- 🟠 **Rupture** — Quantité disponible à zéro.
- 🟡 **Stock bas** — Sous le seuil réglé pour l'article, mais pas encore à zéro.

---

## Inventaires — `/admin/stocktakes`

Comptage physique périodique — on compte réellement les articles dans le magasin ou l'entrepôt, on saisit le chiffre, et le système compare au chiffre théorique. Un écart au-delà du seuil réglé demande un motif avant validation. Une fois l'inventaire posté, le stock du système est corrigé pour correspondre à la réalité.

---

## Flux d'une vente — d'où sort la marchandise

La question qui revient le plus souvent : quand une commande est passée, ça sort du Dépôt ou de la Boutique ? Réponse : **ça dépend du canal de vente, jamais du choix du client.**

### 🏭 Commande en ligne (site web)

1. **Client commande** → statut « en attente ». Aucun effet sur le stock. La commande est enregistrée même si le stock affiché venait à manquer entre-temps — c'est le fonctionnement paiement-à-la-livraison.
2. **Appel de confirmation** → un employé confirme, toujours humain, jamais automatique — c'est le vrai contrôle de disponibilité.
3. **Statut → « confirmé »** → le stock **Dépôt** baisse. C'est exactement à cet instant, et seulement à cet instant, que la quantité est retirée — toujours du Dépôt.
4. **Si annulée après** → restock automatique. Passer une commande confirmée en « annulée » remet la quantité au Dépôt.

### 🏬 Vente en magasin (caisse / POS)

1. **Vente en caisse** → ticket encaissé. Le vendeur ajoute les articles et encaisse directement au comptoir.
2. **Instantané** → le stock **Boutique** baisse. Pas d'étape « en attente » — la quantité est retirée au moment même du paiement, jamais différée.
3. **Protection** → vente impossible si stock insuffisant. Contrairement au site, la caisse refuse une vente si la quantité en Boutique ne suffit pas — deux vendeurs ne peuvent jamais vendre la dernière pièce en même temps.

> **Pourquoi les deux fonctionnent différemment** — Le site accepte les commandes même en cas d'incertitude sur le stock, car le paiement se fait à la livraison et un humain vérifie par téléphone avant de confirmer. La caisse, elle, encaisse tout de suite — il n'y a pas de deuxième chance pour vérifier, donc le système bloque la vente à la source plutôt qu'après coup.

### Et si le site devait vendre depuis la Boutique un jour ?

C'est réglable dans *Paramètres*, mais seul le mode actuel (« Dépôt uniquement ») fonctionne de bout en bout aujourd'hui — les autres options changeraient seulement l'affichage de disponibilité en ligne sans changer d'où la commande décrémente réellement. **Ne pas activer une autre option sans en parler d'abord.**

---

## Employés & rôles — `/admin/employees`

Création des comptes employés et attribution du rôle (voir le tableau en haut de ce guide). Un compte peut être désactivé sans être supprimé.

---

## Journal d'audit — `/admin/journal`

Trace de qui a fait quoi et quand : connexions, ventes en caisse, ouvertures/fermetures de session de caisse, mouvements de tiroir, approbations de bon de commande, réceptions, finalisation de factures, ajustements de fidélité, changements de rôle, changements de paramètres. Utile en cas de litige ou d'écart de caisse — on retrouve l'employé et l'heure exacte.

---

## Point de vente — `/admin/pos-terminals` · `/admin/pos-sessions`

### Terminaux

Chaque tablette/ordinateur de caisse doit être appairé une fois (code d'appairage à approuver ici) avant de pouvoir vendre. Un terminal révoqué ne peut plus se connecter.

### Sessions de caisse

Un caissier ouvre une session avec un fond de caisse déclaré, vend toute la journée, puis la ferme en comptant l'argent réellement présent. L'écart entre le montant attendu (calculé) et le montant compté est affiché et signalé si trop important. Chaque session peut être rejouée dans un rapport détaillé (ventes, espèces, carte, remises, mouvements de tiroir).

---

## Achats — `/admin/suppliers` · `/admin/purchase-orders` · `/admin/goods-receipts`

Le circuit d'achat en trois étapes, dans l'ordre où on les utilise.

1. **Fournisseurs** — Fiche fournisseur + tarifs par article (« offre ») — utile pour comparer les prix et savoir qui est le fournisseur préféré d'un article.
2. **Bons de commande** — On commande une quantité à un fournisseur, avec une destination (Dépôt ou Boutique). Le bon suit un cycle : brouillon → soumis → approuvé → reçu. **Aucune de ces étapes ne touche le stock** — c'est du papier tant que rien n'est réceptionné.
3. **Réceptions** — Quand la marchandise arrive physiquement, on l'enregistre ici (quantité reçue, endommagée, rejetée). **C'est la seule étape qui augmente réellement le stock**, à la destination prévue par le bon de commande.

> **Suggestions de réapprovisionnement** — Dans Rapports → Réapprovisionnement, le système propose déjà des quantités à commander à partir des seuils, de ce qui est déjà en commande, et de la vitesse de vente récente — pas besoin de les calculer à la main.

---

## Devis & factures — `/admin/quotes` · `/admin/invoices`

- **Devis** — Créer, envoyer, réviser (chaque révision crée une nouvelle version numérotée, l'ancienne reste consultable), puis convertir en commande ou en facture une fois accepté.
- **Factures** — Vente, boutique, web ou proforma. Modifiables tant qu'elles sont en brouillon ; une fois finalisées, seules le paiement et l'avoir peuvent encore les faire évoluer.
- **PDF** — Généré automatiquement après envoi ou finalisation, téléchargeable depuis la fiche du document.

> ⚠️ **La facturation réelle doit être activée dans Facturation avant toute finalisation.** Tant qu'elle est désactivée, les factures peuvent être créées et prévisualisées mais pas finalisées — c'est volontaire, en attendant confirmation du comptable sur le taux de TVA, le timbre fiscal et les mentions légales (matricule fiscal, RC…) à renseigner dans les paramètres de l'entreprise.

---

## Fidélité — `/admin/loyalty`

Programme à points, facultatif — un client n'a une carte que si on lui en crée une (aucune création automatique).

- **Comptes** — Recherche par carte/téléphone, solde de points, historique complet, ajustement manuel avec motif obligatoire, suspension.
- **Niveaux** — Standard / Argent / Or / VIP — seuils de dépense/points, multiplicateur de gain, bonus de passage de palier. Recalculés chaque nuit.
- **Règles** — Points gagnés par dinar dépensé, valeur d'un point à l'échange, plafond de remise, seuil d'approbation responsable pour les gros échanges.

Les points s'échangent uniquement en caisse pour l'instant, pas au panier du site. Les clients peuvent consulter leur solde eux-mêmes sur la page `/fidelite` du site, sans avoir besoin de se connecter.

---

*Ce guide reflète le fonctionnement actuel du back-office Mzali. Les libellés cités correspondent exactement à ceux affichés dans l'interface — un clic sur `/admin/…` suffit à retrouver la section.*
