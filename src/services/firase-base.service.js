const admin = require('firebase-admin');

class FirebaseService {
    static instance;

    constructor() {
        if (FirebaseService.instance) {
            return FirebaseService.instance;
        }

        this.initializeFirebase();
        FirebaseService.instance = this;
    }

    initializeFirebase() {
        try {
            // Intentar cargar el archivo de configuración
            const serviceAccount = require(`../path/certificates/${process.env.FIREBASE_FILE_ACCOUNT_NAME}`);

            // Inicializar Firebase
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                storageBucket: process.env.FIREBASE_BUCKET
            });

            this.bucket = admin.storage().bucket();
        } catch (error) {
            if (process.env.ENVIRONMENT === 'development') {
                console.error('Firebase no se inicializo correctamente.')
            }

            this.bucket = null;  // Asegurarse de que bucket esté null si falla
        }
    }

    getBucket() {
        // Intentar inicializar de nuevo si no se ha hecho
        if (!this.bucket) {
            this.initializeFirebase();
        }

        return this.bucket;
    }
}

module.exports = FirebaseService;