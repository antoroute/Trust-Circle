# Scripts SQL historiques

Ces cinq couples documentent les applications manuelles réalisées pour TC-104
à TC-106. Ils sont conservés pour l'audit, mais **ne doivent plus être exécutés
directement**.

La source de vérité est désormais `../sqitch.plan`, avec les scripts
transactionnels correspondants dans `../deploy`, `../revert` et `../verify`.
Modifier un ancien script ou une migration déjà déployée est interdit : ajouter
un nouveau changement Sqitch.
