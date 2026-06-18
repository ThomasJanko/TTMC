window.onload = function() {
    try {
        database = DATA;
        console.log(`Base chargée : ${database.length} thèmes`);
        displayHallOfFame();
    } catch (err) {
        console.error(err);
        alert("Impossible de charger la base de données. Vérifiez que js/database.js est bien chargé.");
    }
};
